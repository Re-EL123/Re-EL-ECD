'use strict';

const { validate } = require('../../../../packages/contracts/validate');
const { AppError, fail } = require('../../../../packages/contracts/errors');
const { recordAudit } = require('../services/audit-service');
const { rateLimit } = require('../middleware/rate-limit');
const { createNotification } = require('../services/notification-service');
const { sendTemplate } = require('../services/email-service');
const { parsePagination } = require('../utils/http');
const { has } = require('./helpers');

function register(router) {
  router.get('/public/daycares/:slug', async (ctx) => {
    const org = await ctx.db.one("SELECT * FROM organisations WHERE slug = $1 AND status IN ('active','onboarding')", [ctx.params.slug]);
    if (!org) throw new AppError('NOT_FOUND');
    const website = await ctx.db.one(
      `SELECT * FROM website_configs WHERE organisation_id = $1 AND status = 'published' ORDER BY published_at DESC LIMIT 1`,
      [org.id]
    );
    if (!website) return { organisation: { name: org.name, slug: org.slug }, published: false, content: null };
    const branches = await ctx.db.many("SELECT id, name, address, contact_email, contact_phone FROM branches WHERE organisation_id = $1 AND status = 'active'", [org.id]);
    return {
      organisation: { name: org.name, slug: org.slug, logoUrl: org.logo_url, currency: org.currency },
      published: true,
      theme: website.theme,
      content: website.published_content,
      branches
    };
  }, { public: true });

  router.post('/public/enquiries', async (ctx) => {
    const limit = rateLimit(`enquiry:${ctx.ip}`, 5, 10 * 60 * 1000);
    if (!limit.allowed) throw new AppError('RATE_LIMITED');
    const body = validate(ctx.body, {
      organisationSlug: { type: 'string', min: 2, max: 120 },
      branchId: { type: 'string', uuid: true, optional: true },
      guardianName: { type: 'string', min: 2, max: 200 },
      guardianEmail: { type: 'string', email: true },
      guardianPhone: { type: 'string', max: 50, optional: true },
      childName: { type: 'string', max: 200, optional: true },
      childDateOfBirth: { type: 'string', date: true, optional: true },
      requestedAgeGroup: { type: 'string', max: 60, optional: true },
      preferredStartDate: { type: 'string', date: true, optional: true },
      message: { type: 'string', max: 2000, optional: true },
      website: { type: 'string', max: 200, optional: true }
    });
    const org = await ctx.db.one("SELECT * FROM organisations WHERE slug = $1 AND status = 'active'", [body.organisationSlug]);
    if (!org) throw new AppError('NOT_FOUND');
    let branchId = body.branchId;
    if (branchId) {
      const branch = await ctx.db.one('SELECT id FROM branches WHERE id = $1 AND organisation_id = $2 AND status = $3',
        [branchId, org.id, 'active']);
      if (!branch) fail('VALIDATION', [{ field: 'branchId', message: 'Unknown branch.' }]);
    } else {
      const first = await ctx.db.one('SELECT id FROM branches WHERE organisation_id = $1 AND status = $2 ORDER BY created_at LIMIT 1',
        [org.id, 'active']);
      branchId = first ? first.id : null;
    }
    if (!branchId) throw new AppError('VALIDATION', null, 'The organisation has no active branch.');
    const spam = Boolean(body.website && body.website.trim());
    const enquiry = await ctx.db.one(
      `INSERT INTO admission_enquiries (organisation_id, branch_id, guardian_name, guardian_email, guardian_phone,
        child_name, child_date_of_birth, requested_age_group, preferred_start_date, message, source, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'website',$11) RETURNING id, created_at`,
      [org.id, branchId, body.guardianName, body.guardianEmail, body.guardianPhone || null, body.childName || null,
        body.childDateOfBirth || null, body.requestedAgeGroup || null, body.preferredStartDate || null,
        body.message || null, spam ? 'spam' : 'new']
    );
    if (!spam) {
      const officers = await ctx.db.many(
        `SELECT DISTINCT m.user_id, u.email FROM memberships m
         JOIN users u ON u.id = m.user_id
         JOIN membership_roles mr ON mr.membership_id = m.id
         JOIN roles r ON r.id = mr.role_id
         WHERE m.organisation_id = $1 AND m.status = 'active'
           AND r.role_key IN ('admissions_officer','principal','daycare_administrator')`,
        [org.id]
      );
      if (officers.length) {
        await createNotification(ctx.db, ctx, {
          recipientUserIds: officers.map((o) => o.user_id), organisationId: org.id,
          type: 'enquiry_received', title: 'New website enquiry',
          body: `${body.guardianName} submitted an enquiry${body.childName ? ` for ${body.childName}` : ''}.`,
          resourceType: 'admission_enquiry', resourceId: enquiry.id
        });
      }
      for (const officer of officers) {
        await sendTemplate(ctx.db, 'enquiryReceived', {
          to: officer.email,
          organisationId: org.id,
          metadata: { enquiryId: enquiry.id },
          data: {
            guardianName: body.guardianName,
            childName: body.childName,
            email: body.guardianEmail,
            phone: body.guardianPhone,
            preferredStartDate: body.preferredStartDate,
            message: body.message
          }
        });
      }
      await sendTemplate(ctx.db, 'enquiryAcknowledgement', {
        to: body.guardianEmail,
        organisationId: org.id,
        metadata: { enquiryId: enquiry.id },
        data: {
          guardianName: body.guardianName,
          organisationName: org.name,
          childName: body.childName,
          preferredStartDate: body.preferredStartDate,
          slug: org.slug
        }
      });
    }
    // Identical response for spam to avoid tipping off automated submissions.
    return { received: true, enquiryId: spam ? null : enquiry.id };
  }, { public: true });

  router.get('/public/daycares/:slug/enquiry-form', async (ctx) => {
    const org = await ctx.db.one("SELECT * FROM organisations WHERE slug = $1 AND status = 'active'", [ctx.params.slug]);
    if (!org) throw new AppError('NOT_FOUND');
    const branches = await ctx.db.many("SELECT id, name FROM branches WHERE organisation_id = $1 AND status = 'active'", [org.id]);
    return {
      organisation: { name: org.name, slug: org.slug },
      branches,
      ageGroups: ['18 months - 2 years', '2 - 3 years', '3 - 4 years', '4 - 5 years', '5 - 6 years']
    };
  }, { public: true });

  router.get('/admissions/enquiries', async (ctx) => {
    const { page, pageSize, offset } = parsePagination(ctx.query);
    const status = ctx.query.status || null;
    const term = ctx.query.q ? `%${ctx.query.q}%` : null;
    const total = await ctx.db.one(
      `SELECT COUNT(*)::int AS total FROM admission_enquiries
       WHERE organisation_id = $1 AND ($2::text IS NULL OR status = $2)
         AND ($3::text IS NULL OR guardian_name ILIKE $3 OR guardian_email ILIKE $3 OR child_name ILIKE $3)`,
      [ctx.organisationId, status, term]
    );
    const rows = await ctx.db.many(
      `SELECT e.*, b.name AS branch_name, u.display_name AS assigned_to_name
       FROM admission_enquiries e LEFT JOIN branches b ON b.id = e.branch_id
       LEFT JOIN users u ON u.id = e.assigned_to
       WHERE e.organisation_id = $1 AND ($2::text IS NULL OR e.status = $2)
         AND ($3::text IS NULL OR e.guardian_name ILIKE $3 OR e.guardian_email ILIKE $3 OR e.child_name ILIKE $3)
       ORDER BY e.created_at DESC LIMIT $4 OFFSET $5`,
      [ctx.organisationId, status, term, pageSize, offset]
    );
    ctx.meta.page = page;
    ctx.meta.pageSize = pageSize;
    ctx.meta.total = total.total;
    return rows;
  }, { permission: 'admissions.read.daycare' });

  router.post('/admissions/enquiries', async (ctx) => {
    const body = validate(ctx.body, {
      branchId: { type: 'string', uuid: true },
      guardianName: { type: 'string', min: 2, max: 200 },
      guardianEmail: { type: 'string', email: true },
      guardianPhone: { type: 'string', max: 50, optional: true },
      childName: { type: 'string', max: 200, optional: true },
      childDateOfBirth: { type: 'string', date: true, optional: true },
      requestedAgeGroup: { type: 'string', max: 60, optional: true },
      preferredStartDate: { type: 'string', date: true, optional: true },
      message: { type: 'string', max: 2000, optional: true },
      source: { type: 'string', max: 40, optional: true }
    });
    const branch = await ctx.db.one('SELECT id FROM branches WHERE id = $1 AND organisation_id = $2',
      [body.branchId, ctx.organisationId]);
    if (!branch) throw new AppError('NOT_FOUND');
    const row = await ctx.db.one(
      `INSERT INTO admission_enquiries (organisation_id, branch_id, guardian_name, guardian_email, guardian_phone,
        child_name, child_date_of_birth, requested_age_group, preferred_start_date, message, source, status, assigned_to)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'new',$12) RETURNING *`,
      [ctx.organisationId, body.branchId, body.guardianName, body.guardianEmail, body.guardianPhone || null,
        body.childName || null, body.childDateOfBirth || null, body.requestedAgeGroup || null,
        body.preferredStartDate || null, body.message || null, body.source || 'phone', ctx.user.id]
    );
    ctx.status = 201;
    return row;
  }, { permission: 'admissions.manage.daycare' });

  router.get('/admissions/enquiries/:id', async (ctx) => {
    const enquiry = await ctx.db.one('SELECT * FROM admission_enquiries WHERE id = $1 AND organisation_id = $2',
      [ctx.params.id, ctx.organisationId]);
    if (!enquiry) throw new AppError('NOT_FOUND');
    const applications = await ctx.db.many('SELECT * FROM admission_applications WHERE enquiry_id = $1', [enquiry.id]);
    return { ...enquiry, applications };
  }, { permission: 'admissions.read.daycare' });

  router.patch('/admissions/enquiries/:id', async (ctx) => {
    const body = validate(ctx.body, {
      status: { type: 'string', enum: ['new', 'contacted', 'converted', 'closed', 'spam'], optional: true },
      assignedTo: { type: 'string', uuid: true, optional: true },
      requestedAgeGroup: { type: 'string', max: 60, optional: true },
      preferredStartDate: { type: 'string', date: true, optional: true },
      message: { type: 'string', max: 2000, optional: true }
    });
    const enquiry = await ctx.db.one('SELECT * FROM admission_enquiries WHERE id = $1 AND organisation_id = $2',
      [ctx.params.id, ctx.organisationId]);
    if (!enquiry) throw new AppError('NOT_FOUND');
    await ctx.db.query(
      `UPDATE admission_enquiries SET status = COALESCE($1,status), assigned_to = COALESCE($2,assigned_to),
        requested_age_group = COALESCE($3,requested_age_group), preferred_start_date = COALESCE($4,preferred_start_date),
        message = COALESCE($5,message), updated_at = now() WHERE id = $6`,
      [body.status || null, body.assignedTo || null, body.requestedAgeGroup || null,
        body.preferredStartDate || null, body.message || null, enquiry.id]
    );
    await recordAudit(ctx.db, ctx, { action: 'admission.enquiry_updated', resourceType: 'admission_enquiry', resourceId: enquiry.id });
    return ctx.db.one('SELECT * FROM admission_enquiries WHERE id = $1', [enquiry.id]);
  }, { permission: 'admissions.manage.daycare' });

  router.post('/admissions/enquiries/:id/convert', async (ctx) => {
    const enquiry = await ctx.db.one('SELECT * FROM admission_enquiries WHERE id = $1 AND organisation_id = $2',
      [ctx.params.id, ctx.organisationId]);
    if (!enquiry) throw new AppError('NOT_FOUND');
    const body = validate(ctx.body, {
      childFirstName: { type: 'string', min: 1, max: 100, optional: true },
      childLastName: { type: 'string', min: 1, max: 100, optional: true },
      childDateOfBirth: { type: 'string', date: true, optional: true },
      requestedClassroomId: { type: 'string', uuid: true, optional: true },
      notes: { type: 'string', max: 2000, optional: true }
    });
    const nameParts = (enquiry.child_name || '').trim().split(/\s+/);
    const firstName = body.childFirstName || nameParts[0] || 'Unknown';
    const lastName = body.childLastName || nameParts.slice(1).join(' ') || 'Unknown';
    const dob = body.childDateOfBirth || enquiry.child_date_of_birth;
    if (!dob) fail('VALIDATION', [{ field: 'childDateOfBirth', message: 'The child date of birth is required.' }]);
    const reference = `APP-${new Date().getFullYear()}-${Math.floor(Math.random() * 9000 + 1000)}`;
    const application = await ctx.db.withTransaction(async (client) => {
      const row = (await client.query(
        `INSERT INTO admission_applications (organisation_id, branch_id, enquiry_id, application_reference,
          child_first_name, child_last_name, child_date_of_birth, guardian_name, guardian_email, guardian_phone,
          requested_classroom_id, preferred_start_date, notes, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'submitted') RETURNING *`,
        [ctx.organisationId, enquiry.branch_id, enquiry.id, reference, firstName, lastName, dob,
          enquiry.guardian_name, enquiry.guardian_email, enquiry.guardian_phone,
          body.requestedClassroomId || null, enquiry.preferred_start_date, body.notes || null]
      )).rows[0];
      await client.query("UPDATE admission_enquiries SET status = 'converted', updated_at = now() WHERE id = $1", [enquiry.id]);
      return row;
    });
    await recordAudit(ctx.db, ctx, {
      action: 'admission.application_created', resourceType: 'admission_application', resourceId: application.id
    });
    ctx.status = 201;
    return application;
  }, { permission: 'admissions.manage.daycare' });

  router.get('/admissions/applications', async (ctx) => {
    const { page, pageSize, offset } = parsePagination(ctx.query);
    const status = ctx.query.status || null;
    const total = await ctx.db.one(
      `SELECT COUNT(*)::int AS total FROM admission_applications WHERE organisation_id = $1 AND ($2::text IS NULL OR status = $2)`,
      [ctx.organisationId, status]
    );
    const rows = await ctx.db.many(
      `SELECT a.*, c.name AS requested_classroom_name, b.name AS branch_name
       FROM admission_applications a
       LEFT JOIN classrooms c ON c.id = a.requested_classroom_id
       LEFT JOIN branches b ON b.id = a.branch_id
       WHERE a.organisation_id = $1 AND ($2::text IS NULL OR a.status = $2)
       ORDER BY a.submitted_at DESC LIMIT $3 OFFSET $4`,
      [ctx.organisationId, status, pageSize, offset]
    );
    ctx.meta.page = page;
    ctx.meta.pageSize = pageSize;
    ctx.meta.total = total.total;
    return rows;
  }, { permission: 'admissions.read.daycare' });

  router.post('/admissions/applications', async (ctx) => {
    const body = validate(ctx.body, {
      branchId: { type: 'string', uuid: true },
      childFirstName: { type: 'string', min: 1, max: 100 },
      childLastName: { type: 'string', min: 1, max: 100 },
      childDateOfBirth: { type: 'string', date: true },
      guardianName: { type: 'string', min: 2, max: 200 },
      guardianEmail: { type: 'string', email: true },
      guardianPhone: { type: 'string', max: 50, optional: true },
      requestedClassroomId: { type: 'string', uuid: true, optional: true },
      preferredStartDate: { type: 'string', date: true, optional: true },
      notes: { type: 'string', max: 2000, optional: true }
    });
    const branch = await ctx.db.one('SELECT id FROM branches WHERE id = $1 AND organisation_id = $2',
      [body.branchId, ctx.organisationId]);
    if (!branch) throw new AppError('NOT_FOUND');
    const reference = `APP-${new Date().getFullYear()}-${Math.floor(Math.random() * 9000 + 1000)}`;
    const application = await ctx.db.one(
      `INSERT INTO admission_applications (organisation_id, branch_id, application_reference, child_first_name,
        child_last_name, child_date_of_birth, guardian_name, guardian_email, guardian_phone,
        requested_classroom_id, preferred_start_date, notes, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'submitted') RETURNING *`,
      [ctx.organisationId, body.branchId, reference, body.childFirstName, body.childLastName, body.childDateOfBirth,
        body.guardianName, body.guardianEmail, body.guardianPhone || null, body.requestedClassroomId || null,
        body.preferredStartDate || null, body.notes || null]
    );
    ctx.status = 201;
    return application;
  }, { permission: 'admissions.manage.daycare' });

  router.get('/admissions/applications/:id', async (ctx) => {
    const application = await ctx.db.one('SELECT * FROM admission_applications WHERE id = $1 AND organisation_id = $2',
      [ctx.params.id, ctx.organisationId]);
    if (!application) throw new AppError('NOT_FOUND');
    const enquiry = application.enquiry_id
      ? await ctx.db.one('SELECT * FROM admission_enquiries WHERE id = $1', [application.enquiry_id])
      : null;
    return { ...application, enquiry };
  }, { permission: 'admissions.read.daycare' });

  router.post('/admissions/applications/:id/review', async (ctx) => {
    const body = validate(ctx.body, {
      decision: { type: 'string', enum: ['under_review', 'approved', 'waitlisted', 'rejected'] },
      reason: { type: 'string', max: 1000, optional: true }
    });
    const application = await ctx.db.one('SELECT * FROM admission_applications WHERE id = $1 AND organisation_id = $2',
      [ctx.params.id, ctx.organisationId]);
    if (!application) throw new AppError('NOT_FOUND');
    if (application.status === 'enrolled') fail('CONFLICT', null, 'This application has already been enrolled.');
    await ctx.db.query(
      `UPDATE admission_applications SET status = $1, reviewed_by = $2, reviewed_at = now(), decision_reason = $3
       WHERE id = $4`, [body.decision, ctx.user.id, body.reason || null, application.id]
    );
    await recordAudit(ctx.db, ctx, {
      action: `admission.application_${body.decision}`, resourceType: 'admission_application', resourceId: application.id,
      metadata: { reason: body.reason || null }
    });
    const recipient = await ctx.db.one('SELECT id FROM users WHERE email_normalized = $1', [application.guardian_email.toLowerCase()]);
    if (recipient) {
      await createNotification(ctx.db, ctx, {
        recipientUserIds: [recipient.id], type: 'admission_decision',
        title: `Application ${body.decision}`,
        body: `Your application for ${application.child_first_name} has been marked ${body.decision}.`,
        resourceType: 'admission_application', resourceId: application.id
      });
    }
    return ctx.db.one('SELECT * FROM admission_applications WHERE id = $1', [application.id]);
  }, { permission: 'admissions.manage.daycare' });

  router.post('/admissions/applications/:id/enrol', async (ctx) => {
    const body = validate(ctx.body, {
      classroomId: { type: 'string', uuid: true, optional: true },
      startDate: { type: 'string', date: true, optional: true },
      learnerReference: { type: 'string', max: 50, optional: true },
      feePlanId: { type: 'string', uuid: true, optional: true }
    });
    const application = await ctx.db.one('SELECT * FROM admission_applications WHERE id = $1 AND organisation_id = $2',
      [ctx.params.id, ctx.organisationId]);
    if (!application) throw new AppError('NOT_FOUND');
    if (application.status !== 'approved') fail('CONFLICT', null, 'Only approved applications can be enrolled.');
    const classroomId = body.classroomId || application.requested_classroom_id;
    if (classroomId) {
      const classroom = await ctx.db.one('SELECT * FROM classrooms WHERE id = $1 AND organisation_id = $2',
        [classroomId, ctx.organisationId]);
      if (!classroom) fail('VALIDATION', [{ field: 'classroomId', message: 'Unknown classroom.' }]);
      if (classroom.configured_capacity) {
        const enrolled = await ctx.db.one(
          "SELECT COUNT(*)::int AS total FROM learners WHERE classroom_id = $1 AND status = 'enrolled'", [classroomId]
        );
        if (enrolled.total >= classroom.configured_capacity) {
          fail('CONFLICT', null, 'The classroom has reached its configured capacity.');
        }
      }
    }
    const startDate = body.startDate || new Date().toISOString().slice(0, 10);
    const reference = body.learnerReference || `LS-${new Date().getFullYear()}-${Math.floor(Math.random() * 90000 + 10000)}`;
    const result = await ctx.db.withTransaction(async (client) => {
      const learner = (await client.query(
        `INSERT INTO learners (organisation_id, branch_id, classroom_id, learner_reference, first_name, last_name,
          date_of_birth, status, enrolment_date, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'enrolled',$8,$9) RETURNING *`,
        [ctx.organisationId, application.branch_id, classroomId || null, reference, application.child_first_name,
          application.child_last_name, application.child_date_of_birth, startDate, ctx.user.id]
      )).rows[0];
      const guardian = (await client.query(
        `INSERT INTO guardians (organisation_id, first_name, last_name, email, phone)
         VALUES ($1,$2,$3,$4,$5) RETURNING *`,
        [ctx.organisationId, application.guardian_name.split(' ')[0],
          application.guardian_name.split(' ').slice(1).join(' ') || application.guardian_name,
          application.guardian_email, application.guardian_phone]
      )).rows[0];
      await client.query(
        `INSERT INTO learner_guardians (organisation_id, learner_id, guardian_id, relationship_type, is_primary_contact,
          portal_access_status) VALUES ($1,$2,$3,'Guardian',true,'pending')`,
        [ctx.organisationId, learner.id, guardian.id]
      );
      await client.query(
        `INSERT INTO enrolments (organisation_id, branch_id, learner_id, classroom_id, start_date, status, fee_plan_id)
         VALUES ($1,$2,$3,$4,$5,'active',$6)`,
        [ctx.organisationId, application.branch_id, learner.id, classroomId || null, startDate, body.feePlanId || null]
      );
      if (classroomId) {
        await client.query(
          `INSERT INTO learner_classroom_history (organisation_id, learner_id, classroom_id, started_on, reason, created_by)
           VALUES ($1,$2,$3,$4,'Enrolment',$5)`,
          [ctx.organisationId, learner.id, classroomId, startDate, ctx.user.id]
        );
      }
      await client.query("UPDATE admission_applications SET status = 'enrolled', reviewed_at = now() WHERE id = $1", [application.id]);
      return { learner, guardian };
    });
    await recordAudit(ctx.db, ctx, {
      action: 'admission.application_enrolled', resourceType: 'admission_application', resourceId: application.id,
      metadata: { learnerId: result.learner.id }
    });
    ctx.status = 201;
    return result.learner;
  }, { permission: 'admissions.enrol.daycare' });

  router.get('/admissions/overview', async (ctx) => {
    const counts = await ctx.db.one(
      `SELECT
        (SELECT COUNT(*)::int FROM admission_enquiries WHERE organisation_id = $1 AND status = 'new') AS new_enquiries,
        (SELECT COUNT(*)::int FROM admission_applications WHERE organisation_id = $1 AND status IN ('submitted','under_review')) AS pending_applications,
        (SELECT COUNT(*)::int FROM admission_applications WHERE organisation_id = $1 AND status = 'approved') AS approved_applications,
        (SELECT COUNT(*)::int FROM admission_applications WHERE organisation_id = $1 AND status = 'waitlisted') AS waitlisted,
        (SELECT COUNT(*)::int FROM admission_applications WHERE organisation_id = $1 AND status = 'enrolled') AS enrolled`,
      [ctx.organisationId]
    );
    const capacity = await ctx.db.many(
      `SELECT c.id, c.name, c.configured_capacity,
        (SELECT COUNT(*)::int FROM learners l WHERE l.classroom_id = c.id AND l.status = 'enrolled') AS enrolled
       FROM classrooms c WHERE c.organisation_id = $1 AND c.status = 'active' ORDER BY c.name`,
      [ctx.organisationId]
    );
    return { ...counts, capacity: capacity.map((c) => ({ ...c, available: Math.max(0, c.configured_capacity - c.enrolled) })) };
  }, { permission: 'admissions.read.daycare' });
}

module.exports = { register };
