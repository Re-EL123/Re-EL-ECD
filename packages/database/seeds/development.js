'use strict';

const { getPool, query } = require('../index');
const { hashPassword } = require('../../auth/password');
const { PERMISSION_KEYS, PERMISSIONS } = require('../../auth/permissions');
const { ROLE_DEFINITIONS, ROLE_PERMISSIONS, ROLES } = require('../../auth/roles');

const DEMO_PASSWORD = process.env.DEMO_PASSWORD || 'Re-EL-Demo-2026!';

const USERS = [
  ['platform@re-el-ecd.local', 'Naledi Mokoena', ROLES.PLATFORM_SUPER_ADMIN],
  ['support@re-el-ecd.local', 'Thabo Dlamini', ROLES.PLATFORM_SUPPORT_ADMIN],
  ['platformfinance@re-el-ecd.local', 'Aisha Patel', ROLES.PLATFORM_FINANCE_ADMIN],
  ['owner@littlesprouts.local', 'Lerato Nkosi', ROLES.ORGANISATION_OWNER],
  ['principal@littlesprouts.local', 'Sipho Mthembu', ROLES.PRINCIPAL],
  ['admin@littlesprouts.local', 'Zanele Khumalo', ROLES.DAYCARE_ADMINISTRATOR],
  ['manager@littlesprouts.local', 'Michael van Wyk', ROLES.DAYCARE_MANAGER],
  ['curriculum@littlesprouts.local', 'Precious Mabaso', ROLES.CURRICULUM_COORDINATOR],
  ['teacher@littlesprouts.local', 'Anika Botha', ROLES.TEACHER],
  ['assistant@littlesprouts.local', 'Bongani Zulu', ROLES.ASSISTANT_TEACHER],
  ['support@littlesprouts.local', 'Grace Ndlovu', ROLES.SUPPORT_STAFF],
  ['finance@littlesprouts.local', 'Priya Naidoo', ROLES.FINANCE_OFFICER],
  ['admissions@littlesprouts.local', 'Johan Steyn', ROLES.ADMISSIONS_OFFICER],
  ['parent@littlesprouts.local', 'Sarah Johnson', ROLES.PARENT_GUARDIAN],
  ['parent2@littlesprouts.local', 'David Smith', ROLES.PARENT_GUARDIAN],
  ['substitute@littlesprouts.local', 'Lindiwe Sithole', ROLES.SUBSTITUTE_STAFF],
  ['owner@sunrise.local', 'Fatima Adams', ROLES.ORGANISATION_OWNER],
  ['principal@sunrise.local', 'Peter Lange', ROLES.PRINCIPAL]
];

async function seedCatalog() {
  const pool = await getPool();
  for (const role of ROLE_DEFINITIONS) {
    await pool.query(
      `INSERT INTO roles (name, role_key, scope_type, is_system_role, description)
       VALUES ($1,$2,$3,true,$4) ON CONFLICT (role_key) DO NOTHING`,
      [role.name, role.key, role.scope, role.description]
    );
  }
  for (const key of PERMISSION_KEYS) {
    const def = PERMISSIONS[key];
    await pool.query(
      `INSERT INTO permissions (permission_key, resource, action, scope, description)
       VALUES ($1,$2,$3,$4,$5) ON CONFLICT (permission_key) DO NOTHING`,
      [key, def.resource, def.action, def.scope, `${def.action} ${def.resource} (${def.scope})`]
    );
  }
  for (const [roleKey, patterns] of Object.entries(ROLE_PERMISSIONS)) {
    const role = (await pool.query('SELECT id FROM roles WHERE role_key = $1', [roleKey])).rows[0];
    if (!role) continue;
    const keys = new Set();
    for (const pattern of patterns) {
      if (pattern === '*') {
        PERMISSION_KEYS.forEach((k) => keys.add(k));
      } else if (pattern.endsWith('.*')) {
        const prefix = pattern.slice(0, -1);
        PERMISSION_KEYS.filter((k) => k.startsWith(prefix)).forEach((k) => keys.add(k));
      } else {
        keys.add(pattern);
      }
    }
    for (const key of keys) {
      await pool.query(
        `INSERT INTO role_permissions (role_id, permission_id)
         SELECT $1, id FROM permissions WHERE permission_key = $2
         ON CONFLICT DO NOTHING`,
        [role.id, key]
      );
    }
  }
}

async function seedPlatformDefaults(pool) {
  const plans = [
    ['Seedling', 'seedling', 499, 50, 5, 'A single classroom starting out: attendance, learning notes and the parent portal.'],
    ['Sapling', 'sapling', 999, 120, 15, 'A growing centre: adds finance, assessments and the public website builder.'],
    ['Evergreen', 'evergreen', 1899, 300, 40, 'Multi-branch operations with advanced reporting, inventory and priority support.']
  ];
  for (const [name, key, price, learnersMax, staffMax, description] of plans) {
    await pool.query(
      `INSERT INTO subscription_plans (name, plan_key, monthly_price, max_learners, max_staff, features, description)
       VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (plan_key) DO NOTHING`,
      [name, key, price, learnersMax, staffMax, JSON.stringify(['attendance', 'assessments', 'parent_portal', 'finance']), description]
    );
  }
  for (const [key, description, enabled] of [
    ['parent_portal', 'Parent and guardian portal', true],
    ['finance', 'Finance and billing', true],
    ['website_builder', 'Public daycare website', true],
    ['ai_assistance', 'AI-assisted drafting (later phase)', false],
    ['sms_notifications', 'SMS delivery channel', false]
  ]) {
    await pool.query(
      `INSERT INTO feature_flags (flag_key, description, enabled) VALUES ($1,$2,$3)
       ON CONFLICT (flag_key) DO NOTHING`,
      [key, description, enabled]
    );
  }
}

async function seedDevelopment({ force = false } = {}) {
  const pool = await getPool();
  await seedCatalog();
  const existing = await pool.query('SELECT id FROM organisations LIMIT 1');
  if (existing.rows.length && !force) return { seeded: false, reason: 'existing data' };

  if (force) {
    const tables = ['email_deliveries', 'payment_intents', 'payment_webhook_events', 'payment_allocations', 'payments', 'invoice_items', 'invoices',
      'invoice_counters', 'expenses', 'suppliers', 'expense_categories', 'inventory_transactions', 'inventory_items',
      'incident_actions', 'incident_participants', 'incidents', 'task_checklist_items', 'task_comments', 'tasks', 'report_jobs', 'jobs',
      'automation_rules', 'notification_deliveries', 'notifications', 'messages', 'conversation_participants',
      'conversations', 'announcements', 'consent_records', 'form_submissions', 'form_versions', 'form_definitions',
      'staff_training_records', 'leave_requests', 'timesheets', 'staff_attendance_events', 'staff_shifts',
      'staff_documents', 'staff_classrooms', 'staff_profiles', 'attendance_adjustments', 'learner_attendance',
      'daily_reports', 'learner_portfolio_items', 'learner_assessments', 'assessment_periods', 'learner_observations',
      'activity_participation', 'scheduled_activities', 'activities', 'lesson_plans', 'academic_periods',
      'learning_objectives', 'curriculum_domains', 'curriculum_frameworks', 'enrolments', 'admission_applications',
      'admission_enquiries', 'learner_documents', 'learner_collection_events', 'authorised_collectors',
      'learner_medical_records', 'learner_guardians', 'guardians', 'learner_classroom_history', 'learners',
      'classrooms', 'website_configs', 'domains', 'delegations_permissions', 'delegations', 'invitations',
      'membership_roles', 'branch_memberships', 'memberships', 'support_cases', 'feature_flags',
      'platform_subscriptions', 'subscription_plans', 'audit_events', 'idempotency_keys', 'sessions',
      'organisation_settings', 'branches', 'organisations', 'users'];
    for (const table of tables) {
      await pool.query(`DELETE FROM ${table}`);
    }
  }
  await seedPlatformDefaults(pool);

  const passwordHash = await hashPassword(DEMO_PASSWORD);
  const userIds = {};
  for (const [email, name, role] of USERS) {
    const row = await pool.query(
      `INSERT INTO users (email, email_normalized, display_name, password_hash, status, auth_provider, auth_subject)
       VALUES ($1,$2,$3,$4,'active','local',$5) RETURNING id`,
      [email, email.toLowerCase(), name, passwordHash, email]
    );
    userIds[email] = row.rows[0].id;
  }
  const platformId = (await pool.query(
    `INSERT INTO organisations (name, slug, legal_name, registration_number, status, subscription_status,
       primary_colour, secondary_colour, accent_colour, theme_tokens)
     VALUES ('Re-EL Platform','re-el-platform','Re-EL ECD Technologies (Pty) Ltd','2026/000001/07','active','active',
       '#0B534A','#2B9A58','#6FC79B',
       '{"primary":"#0B534A","secondary":"#2B9A58","accent":"#6FC79B","background":"#F6F9F7","surface":"#FFFFFF","text":"#0E2B26","onPrimary":"#FFFFFF"}'::jsonb)
     RETURNING id`
  )).rows[0].id;
  const orgId = (await pool.query(
    `INSERT INTO organisations (name, slug, legal_name, registration_number, status, subscription_status, logo_url)
     VALUES ('Little Sprouts ECD','little-sprouts','Little Sprouts Early Learning Centre','2019/123456/07','active','active',
     'assets/logo-little-sprouts.svg') RETURNING id`
  )).rows[0].id;
  const org2Id = (await pool.query(
    `INSERT INTO organisations (name, slug, legal_name, status, subscription_status)
     VALUES ('Sunrise Kids Academy','sunrise-kids','Sunrise Kids Academy NPC','active','trial') RETURNING id`
  )).rows[0].id;

  await pool.query(`INSERT INTO organisation_settings (organisation_id, settings) VALUES ($1,$2)`, [orgId, JSON.stringify({
    academicYear: 2026,
    operatingHours: { open: '06:30', close: '18:00' },
    attendancePolicy: { lateAfter: '08:30', autoAbsentAfter: '10:00', allowExcusedAbsence: true },
    notificationPreferences: { emailAnnouncements: true, emailInvoices: true, smsIncidents: false },
    publicWebsite: { enabled: true, showFees: false },
    dataRetention: { learnerRecordsYears: 7, financeYears: 7 }
  })]);
  await pool.query(`INSERT INTO organisation_settings (organisation_id, settings) VALUES ($1,$2)`, [org2Id, JSON.stringify({ academicYear: 2026 })]);

  const branch1 = (await pool.query(
    `INSERT INTO branches (organisation_id, name, slug, address, contact_email, contact_phone)
     VALUES ($1,'Rosebank','rosebank','12 Bath Avenue, Rosebank, Johannesburg','hello@littlesprouts.local','+27 11 447 8890')
     RETURNING id`, [orgId])).rows[0].id;
  const branch2 = (await pool.query(
    `INSERT INTO branches (organisation_id, name, slug, address, contact_email, contact_phone)
     VALUES ($1,'Soweto','soweto','45 Vilakazi Street, Orlando West, Soweto','soweto@littlesprouts.local','+27 11 936 2210')
     RETURNING id`, [orgId])).rows[0].id;
  const branch3 = (await pool.query(
    `INSERT INTO branches (organisation_id, name, slug, address, contact_email)
     VALUES ($1,'Main Campus','main','8 Church Street, Cape Town','admin@sunrise.local') RETURNING id`, [org2Id])).rows[0].id;

  // Memberships and roles
  const memberOf = async (email, organisationId, roleKey, branchId = null, status = 'active') => {
    const membership = (await pool.query(
      `INSERT INTO memberships (user_id, organisation_id, status, joined_at) VALUES ($1,$2,$3,now()) RETURNING id`,
      [userIds[email], organisationId, status]
    )).rows[0].id;
    const role = (await pool.query('SELECT id FROM roles WHERE role_key = $1', [roleKey])).rows[0].id;
    await pool.query(
      `INSERT INTO membership_roles (membership_id, role_id, branch_id, status) VALUES ($1,$2,$3,'active')`,
      [membership, role, branchId]
    );
    if (branchId) {
      await pool.query(`INSERT INTO branch_memberships (membership_id, branch_id) VALUES ($1,$2)`, [membership, branchId]);
    }
    return membership;
  };

  const platformRoles = [
    ['platform@re-el-ecd.local', ROLES.PLATFORM_SUPER_ADMIN],
    ['support@re-el-ecd.local', ROLES.PLATFORM_SUPPORT_ADMIN],
    ['platformfinance@re-el-ecd.local', ROLES.PLATFORM_FINANCE_ADMIN]
  ];
  for (const [email, role] of platformRoles) await memberOf(email, platformId, role);

  await memberOf('owner@littlesprouts.local', orgId, ROLES.ORGANISATION_OWNER);
  await memberOf('principal@littlesprouts.local', orgId, ROLES.PRINCIPAL);
  await memberOf('admin@littlesprouts.local', orgId, ROLES.DAYCARE_ADMINISTRATOR, branch1);
  await memberOf('manager@littlesprouts.local', orgId, ROLES.DAYCARE_MANAGER, branch2);
  await memberOf('curriculum@littlesprouts.local', orgId, ROLES.CURRICULUM_COORDINATOR);
  await memberOf('finance@littlesprouts.local', orgId, ROLES.FINANCE_OFFICER);
  await memberOf('admissions@littlesprouts.local', orgId, ROLES.ADMISSIONS_OFFICER);
  await memberOf('teacher@littlesprouts.local', orgId, ROLES.TEACHER, branch1);
  await memberOf('assistant@littlesprouts.local', orgId, ROLES.ASSISTANT_TEACHER, branch1);
  await memberOf('support@littlesprouts.local', orgId, ROLES.SUPPORT_STAFF, branch1);
  await memberOf('substitute@littlesprouts.local', orgId, ROLES.SUBSTITUTE_STAFF, branch2);
  await memberOf('parent@littlesprouts.local', orgId, ROLES.PARENT_GUARDIAN);
  await memberOf('parent2@littlesprouts.local', orgId, ROLES.PARENT_GUARDIAN);
  await memberOf('owner@sunrise.local', org2Id, ROLES.ORGANISATION_OWNER);
  await memberOf('principal@sunrise.local', org2Id, ROLES.PRINCIPAL);

  // Classrooms
  const classroomDefs = [
    [orgId, branch1, 'Butterflies', '4-5 years', 48, 72, 18],
    [orgId, branch1, 'Bunnies', '2-3 years', 24, 48, 12],
    [orgId, branch1, 'Sunflowers', '5-6 years', 60, 84, 20],
    [orgId, branch2, 'Little Stars', '3-4 years', 36, 60, 15],
    [org2Id, branch3, 'Rainbows', '3-5 years', 36, 60, 16]
  ];
  const classrooms = {};
  for (const [organisationId, branchId, name, age, min, max, cap] of classroomDefs) {
    const row = await pool.query(
      `INSERT INTO classrooms (organisation_id, branch_id, name, age_group, min_age_months, max_age_months, configured_capacity)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [organisationId, branchId, name, age, min, max, cap]
    );
    classrooms[name] = row.rows[0].id;
  }

  // Staff
  const staffDefs = [
    ['principal@littlesprouts.local', 'EMP-001', 'Principal', branch1, ['Butterflies','Sunflowers']],
    ['admin@littlesprouts.local', 'EMP-002', 'Daycare Administrator', branch1, []],
    ['manager@littlesprouts.local', 'EMP-003', 'Daycare Manager', branch2, ['Little Stars']],
    ['curriculum@littlesprouts.local', 'EMP-004', 'Curriculum Coordinator', branch1, ['Butterflies','Sunflowers']],
    ['teacher@littlesprouts.local', 'EMP-005', 'Teacher', branch1, ['Butterflies']],
    ['assistant@littlesprouts.local', 'EMP-006', 'Assistant Teacher', branch1, ['Butterflies','Bunnies']],
    ['support@littlesprouts.local', 'EMP-007', 'Support Staff', branch1, []],
    ['finance@littlesprouts.local', 'EMP-008', 'Finance Officer', branch1, []],
    ['admissions@littlesprouts.local', 'EMP-009', 'Admissions Officer', branch1, []],
    ['substitute@littlesprouts.local', 'EMP-010', 'Substitute Teacher', branch2, ['Little Stars']],
    ['principal@sunrise.local', 'SUN-001', 'Principal', branch3, ['Rainbows']]
  ];
  const staffIds = {};
  for (const [email, ref, title, branchId, classNames] of staffDefs) {
    const organisationId = email.endsWith('sunrise.local') ? org2Id : orgId;
    const row = await pool.query(
      `INSERT INTO staff_profiles (organisation_id, user_id, employee_reference, job_title, start_date, contact_details)
       VALUES ($1,$2,$3,$4,'2024-01-15',$5) RETURNING id`,
      [organisationId, userIds[email], ref, title, JSON.stringify({ email, phone: '+27 82 555 0101' })]
    );
    staffIds[email] = row.rows[0].id;
    for (const className of classNames) {
      await pool.query(`INSERT INTO staff_classrooms (organisation_id, staff_id, classroom_id) VALUES ($1,$2,$3)`,
        [organisationId, row.rows[0].id, classrooms[className]]);
    }
  }

  // Learners
  const learnerDefs = [
    ['LS-2026-001', 'Amelia', 'Johnson', '2021-03-14', 'Butterflies', branch1],
    ['LS-2026-002', 'Noah', 'Smith', '2022-07-02', 'Bunnies', branch1],
    ['LS-2026-003', 'Liam', 'Ndlovu', '2021-11-23', 'Butterflies', branch1],
    ['LS-2026-004', 'Zoe', 'Botha', '2021-01-09', 'Sunflowers', branch1],
    ['LS-2026-005', 'Kai', 'Mokoena', '2022-05-18', 'Bunnies', branch1],
    ['LS-2026-006', 'Isabella', 'Naidoo', '2021-08-30', 'Butterflies', branch1],
    ['LS-2026-007', 'Ethan', 'Dlamini', '2022-02-11', 'Little Stars', branch2],
    ['LS-2026-008', 'Mia', 'Khumalo', '2021-06-25', 'Sunflowers', branch1],
    ['LS-2026-009', 'Lucas', 'van Wyk', '2022-09-07', 'Little Stars', branch2],
    ['LS-2026-010', 'Ava', 'Mabaso', '2020-12-19', 'Sunflowers', branch1],
    ['LS-2026-011', 'Sipho', 'Sithole', '2022-04-04', 'Bunnies', branch1],
    ['LS-2026-012', 'Emma', 'Adams', '2021-10-12', 'Butterflies', branch1],
    ['SUN-2026-001', 'Oliver', 'Lange', '2022-01-16', 'Rainbows', branch3]
  ];
  const learners = {};
  for (const [ref, first, last, dob, className, branchId] of learnerDefs) {
    const organisationId = ref.startsWith('SUN') ? org2Id : orgId;
    const row = await pool.query(
      `INSERT INTO learners (organisation_id, branch_id, classroom_id, learner_reference, first_name, last_name, date_of_birth,
        status, enrolment_date, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,'enrolled','2026-01-12',$8) RETURNING id`,
      [organisationId, branchId, classrooms[className], ref, first, last, dob, userIds['principal@littlesprouts.local']]
    );
    learners[first] = row.rows[0].id;
    await pool.query(
      `INSERT INTO learner_classroom_history (organisation_id, learner_id, classroom_id, started_on, reason)
       VALUES ($1,$2,$3,'2026-01-12','Initial enrolment')`,
      [organisationId, row.rows[0].id, classrooms[className]]
    );
  }

  // Guardians and links
  const guardianDefs = [
    ['Sarah', 'Johnson', 'parent@littlesprouts.local', 'Amelia', 'Mother', true, true, true],
    ['Michael', 'Johnson', null, 'Amelia', 'Father', false, true, true],
    ['David', 'Smith', 'parent2@littlesprouts.local', 'Noah', 'Father', true, true, true],
    ['Nomsa', 'Ndlovu', null, 'Liam', 'Mother', true, true, false],
    ['Pieter', 'Botha', null, 'Zoe', 'Father', true, true, true],
    ['Thandi', 'Mokoena', null, 'Kai', 'Mother', true, true, true],
    ['Ravi', 'Naidoo', null, 'Isabella', 'Father', true, true, true],
    ['Elena', 'Dlamini', null, 'Ethan', 'Mother', true, true, true]
  ];
  const guardianIds = {};
  for (const [first, last, email, learnerFirst, relationship, primary, reports, finance] of guardianDefs) {
    const row = await pool.query(
      `INSERT INTO guardians (organisation_id, user_id, first_name, last_name, email, phone)
       VALUES ($1,$2,$3,$4,$5,'+27 82 555 0199') RETURNING id`,
      [orgId, email ? userIds[email] : null, first, last, email || `${first.toLowerCase()}@example.com`]
    );
    guardianIds[`${first} ${last}`] = row.rows[0].id;
    await pool.query(
      `INSERT INTO learner_guardians (organisation_id, learner_id, guardian_id, relationship_type, is_primary_contact,
        can_collect, can_receive_reports, can_receive_financial_information, portal_access_status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [orgId, learners[learnerFirst], row.rows[0].id, relationship, primary, true, reports, finance,
        email ? 'active' : 'pending']
    );
  }

  // Medical and collection records
  await pool.query(
    `INSERT INTO learner_medical_records (organisation_id, learner_id, record_type, details, visibility_level, created_by)
     VALUES ($1,$2,'allergy','Severe peanut allergy. EpiPen stored in classroom first-aid kit.','restricted',$3)`,
    [orgId, learners.Amelia, userIds['principal@littlesprouts.local']]
  );
  await pool.query(
    `INSERT INTO learner_medical_records (organisation_id, learner_id, record_type, details, visibility_level, created_by)
     VALUES ($1,$2,'medication','Inhaler to be administered at 12:00 if required.','medical',$3)`,
    [orgId, learners.Noah, userIds['principal@littlesprouts.local']]
  );
  const collector = (await pool.query(
    `INSERT INTO authorised_collectors (organisation_id, learner_id, name, relationship, contact_phone, created_by)
     VALUES ($1,$2,'Gogo Miriam Johnson','Grandmother','+27 83 555 0144',$3) RETURNING id`,
    [orgId, learners.Amelia, userIds['principal@littlesprouts.local']]
  )).rows[0].id;
  await pool.query(
    `INSERT INTO learner_collection_events (organisation_id, branch_id, learner_id, collector_id, collector_name,
      event_type, verified_by, verification_method, notes)
     VALUES ($1,$2,$3,$4,'Gogo Miriam Johnson','collection',$5,'photo_id','ID verified against authorised collector list')`,
    [orgId, branch1, learners.Amelia, collector, userIds['teacher@littlesprouts.local']]
  );

  // Curriculum
  const framework = (await pool.query(
    `INSERT INTO curriculum_frameworks (organisation_id, name, version, description)
     VALUES ($1,'South African ECD Learning Framework','1.0','Play-based developmental framework aligned to the NCF')
     RETURNING id`, [orgId])).rows[0].id;
  const domainDefs = [
    ['Physical Development', 'Gross and fine motor skills, health and safety.'],
    ['Cognitive Development', 'Problem solving, reasoning, early numeracy and literacy.'],
    ['Language and Communication', 'Listening, speaking, early reading and writing.'],
    ['Social and Emotional Development', 'Self-regulation, relationships and identity.'],
    ['Creative Arts', 'Music, movement, visual art and imaginative play.']
  ];
  const domains = {};
  for (let i = 0; i < domainDefs.length; i += 1) {
    const [name, description] = domainDefs[i];
    const row = await pool.query(
      `INSERT INTO curriculum_domains (framework_id, name, description, sort_order) VALUES ($1,$2,$3,$4) RETURNING id`,
      [framework, name, description, i]
    );
    domains[name] = row.rows[0].id;
  }
  const objectiveDefs = [
    [domains['Physical Development'], 'PD-01', 'Balances on one leg for five seconds', 'Outdoor play'],
    [domains['Physical Development'], 'PD-02', 'Holds a crayon with a tripod grip', 'Drawing table'],
    [domains['Cognitive Development'], 'CD-01', 'Sorts objects by two attributes', 'Structured play'],
    [domains['Cognitive Development'], 'CD-02', 'Counts confidently to ten', 'Number circle'],
    [domains['Language and Communication'], 'LC-01', 'Retells a short story in sequence', 'Story time'],
    [domains['Language and Communication'], 'LC-02', 'Recognises own written name', 'Name cards'],
    [domains['Social and Emotional Development'], 'SE-01', 'Takes turns during group play', 'Free play'],
    [domains['Social and Emotional Development'], 'SE-02', 'Expresses feelings using words', 'Circle time'],
    [domains['Creative Arts'], 'CA-01', 'Explores colour mixing', 'Painting'],
    [domains['Creative Arts'], 'CA-02', 'Joins in singing and movement', 'Music ring']
  ];
  const objectiveIds = {};
  for (const [domainId, code, description, context] of objectiveDefs) {
    const row = await pool.query(
      `INSERT INTO learning_objectives (domain_id, age_group, code, description, expected_observation_context)
       VALUES ($1,'4-5 years',$2,$3,$4) RETURNING id`,
      [domainId, code, description, context]
    );
    objectiveIds[code] = row.rows[0].id;
  }

  const period = (await pool.query(
    `INSERT INTO academic_periods (organisation_id, branch_id, name, period_type, starts_on, ends_on, status)
     VALUES ($1,$2,'Term 1 2026','term','2026-01-14','2026-03-27','active') RETURNING id`,
    [orgId, branch1])).rows[0].id;

  const plan = (await pool.query(
    `INSERT INTO lesson_plans (organisation_id, branch_id, classroom_id, academic_period_id, title, theme,
      objective_ids, preparation_notes, status, created_by, approved_by, published_at, created_at)
     VALUES ($1,$2,$3,$4,'Colours of the Rainbow','Colours and light',$5,
     'Prepare poster paints, smocks, colour swatches and a prism.','published',$6,$7,now(),now()) RETURNING id`,
    [orgId, branch1, classrooms.Butterflies, period, JSON.stringify([objectiveIds['CA-01'], objectiveIds['SE-01']]),
      userIds['teacher@littlesprouts.local'], userIds['principal@littlesprouts.local']]
  )).rows[0].id;

  const activityDefs = [
    ['Rainbow finger painting', 'Learners mix primary colours to discover secondary colours.', 'creative', 40, 'Poster paint, paper, aprons'],
    ['Story circle: The Hungry Caterpillar', 'Sequencing and retelling using props.', 'literacy', 25, 'Story book, felt props'],
    ['Counting with bottle caps', 'One-to-one correspondence up to ten.', 'numeracy', 20, 'Bottle caps, number cards'],
    ['Obstacle course', 'Balance, jumping and coordination.', 'physical', 35, 'Cones, hoops, mats'],
    ['Feelings charades', 'Recognising and naming emotions.', 'social', 20, 'Emotion cards']
  ];
  const activityIds = {};
  for (const [title, description, type, duration, materials] of activityDefs) {
    const row = await pool.query(
      `INSERT INTO activities (organisation_id, branch_id, title, description, age_group, duration_minutes, materials,
        activity_type, created_by) VALUES ($1,$2,$3,$4,'4-5 years',$5,$6,$7,$8) RETURNING id`,
      [orgId, branch1, title, description, duration, materials, type, userIds['teacher@littlesprouts.local']]
    );
    activityIds[title] = row.rows[0].id;
  }

  const scheduled = (await pool.query(
    `INSERT INTO scheduled_activities (organisation_id, branch_id, classroom_id, lesson_plan_id, activity_id, title,
      starts_at, ends_at, assigned_staff_id, status)
     VALUES ($1,$2,$3,$4,$5,'Rainbow finger painting', now() - interval '1 hour', now() - interval '20 minutes', $6, 'completed')
     RETURNING id`,
    [orgId, branch1, classrooms.Butterflies, plan, activityIds['Rainbow finger painting'], staffIds['teacher@littlesprouts.local']]
  )).rows[0].id;

  for (const learner of ['Amelia', 'Liam', 'Isabella', 'Emma']) {
    await pool.query(
      `INSERT INTO activity_participation (organisation_id, scheduled_activity_id, learner_id, participation_status,
        observation_summary, recorded_by) VALUES ($1,$2,$3,'participated','Engaged enthusiastically and shared materials.',$4)`,
      [orgId, scheduled, learners[learner], userIds['teacher@littlesprouts.local']]
    );
  }

  await pool.query(
    `INSERT INTO scheduled_activities (organisation_id, branch_id, classroom_id, activity_id, title, starts_at, ends_at,
      assigned_staff_id, status) VALUES ($1,$2,$3,$4,'Counting with bottle caps', now() + interval '2 hours',
      now() + interval '2 hours 25 minutes',$5,'scheduled')`,
    [orgId, branch1, classrooms.Butterflies, activityIds['Counting with bottle caps'], staffIds['teacher@littlesprouts.local']]
  );

  // Observations and assessments
  const obsDefs = [
    [learners.Amelia, objectiveIds['CA-01'], 'Painting table', 'Amelia independently mixed blue and yellow, announcing "it is green like the grass". She repeated the experiment with red and blue.'],
    [learners.Liam, objectiveIds['SE-01'], 'Free play', 'Liam invited two peers to join the block corner and waited for his turn with the large blocks.'],
    [learners.Isabella, objectiveIds['LC-01'], 'Story time', 'Isabella retold the story using the felt props in the correct sequence, including the beginning and end.'],
    [learners.Noah, objectiveIds['PD-02'], 'Drawing table', 'Noah held the crayon with a developing tripod grip and drew a circle representing his family.']
  ];
  for (const [learnerId, objectiveId, context, text] of obsDefs) {
    await pool.query(
      `INSERT INTO learner_observations (organisation_id, branch_id, learner_id, objective_id, observation_date, context,
        observation_text, assessment_status, visibility_status, recorded_by, reviewed_by, published_at)
       VALUES ($1,$2,$3,$4,CURRENT_DATE,$5,$6,'published','published',$7,$8,now())`,
      [orgId, branch1, learnerId, objectiveId, context, text,
        userIds['teacher@littlesprouts.local'], userIds['principal@littlesprouts.local']]
    );
  }
  const assessmentPeriod = (await pool.query(
    `INSERT INTO assessment_periods (organisation_id, name, starts_on, ends_on, status)
     VALUES ($1,'Term 1 2026 Assessment','2026-01-14','2026-03-27','active') RETURNING id`, [orgId]
  )).rows[0].id;
  await pool.query(
    `INSERT INTO learner_assessments (organisation_id, learner_id, assessment_period_id, domain_id, assessment_status,
      summary, assessed_by, reviewed_by, published_at)
     VALUES ($1,$2,$3,$4,'published','Amelia demonstrates secure colour recognition and confidently describes her discoveries.',$5,$6,now())`,
    [orgId, learners.Amelia, assessmentPeriod, domains['Creative Arts'], userIds['teacher@littlesprouts.local'], userIds['principal@littlesprouts.local']]
  );
  await pool.query(
    `INSERT INTO learner_portfolio_items (organisation_id, learner_id, activity_id, title, description, media_type,
      sharing_status, uploaded_by) VALUES ($1,$2,$3,'Rainbow painting','Amelia''s colour-mixing artwork.','image/jpeg','guardians',$4)`,
    [orgId, learners.Amelia, activityIds['Rainbow finger painting'], userIds['teacher@littlesprouts.local']]
  );
  await pool.query(
    `INSERT INTO daily_reports (organisation_id, learner_id, report_date, mood, meals, naps, activities_summary, notes,
      shared_with_guardians, recorded_by)
     VALUES ($1,$2,CURRENT_DATE,'Happy','Ate all lunch','Rested 45 minutes','Colour mixing and outdoor play.',
      'A lovely day of discovery!',true,$3)`,
    [orgId, learners.Amelia, userIds['teacher@littlesprouts.local']]
  );

  // Attendance (last 10 weekdays)
  const dates = [];
  const cursor = new Date();
  while (dates.length < 10) {
    const day = cursor.getUTCDay();
    if (day !== 0 && day !== 6) dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  const learnerRows = await pool.query('SELECT id, first_name, organisation_id, branch_id FROM learners WHERE organisation_id = $1', [orgId]);
  for (const date of dates) {
    for (const learner of learnerRows.rows) {
      const roll = (learner.first_name.charCodeAt(0) + date.charCodeAt(9)) % 10;
      const status = roll === 0 ? 'absent' : roll === 1 ? 'late' : 'present';
      await pool.query(
        `INSERT INTO learner_attendance (organisation_id, branch_id, learner_id, attendance_date, check_in_at, check_out_at,
          attendance_status, absence_reason, recorded_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [orgId, learner.branch_id, learner.id, date,
          status === 'absent' ? null : `${date}T06:45:00Z`,
          status === 'absent' ? null : `${date}T16:00:00Z`,
          status, status === 'absent' ? 'Family commitment' : null, userIds['teacher@littlesprouts.local']]
      );
    }
  }

  // Shifts, events, timesheet, leave
  const shiftRows = [];
  for (const date of dates.slice(0, 5)) {
    for (const email of ['teacher@littlesprouts.local', 'assistant@littlesprouts.local', 'support@littlesprouts.local']) {
      const row = await pool.query(
        `INSERT INTO staff_shifts (organisation_id, branch_id, staff_id, shift_date, starts_at, ends_at, break_minutes,
          assigned_classroom_id, status, created_by, approved_by)
         VALUES ($1,$2,$3,$4,$5,$6,30,$7,'approved',$8,$9) RETURNING id`,
        [orgId, branch1, staffIds[email], date, `${date}T06:30:00Z`, `${date}T17:00:00Z`,
          email === 'teacher@littlesprouts.local' ? classrooms.Butterflies : null,
          userIds['principal@littlesprouts.local'], userIds['principal@littlesprouts.local']]
      );
      shiftRows.push(row.rows[0].id);
    }
  }
  await pool.query(
    `INSERT INTO staff_attendance_events (organisation_id, branch_id, staff_id, shift_id, event_type, recorded_at, source)
     VALUES ($1,$2,$3,$4,'clock_in',now() - interval '5 hours','web')`,
    [orgId, branch1, staffIds['teacher@littlesprouts.local'], shiftRows[0]]
  );
  await pool.query(
    `INSERT INTO timesheets (organisation_id, staff_id, period_start, period_end, total_minutes, status)
     VALUES ($1,$2,'2026-10-19','2026-10-25',2280,'submitted')`,
    [orgId, staffIds['teacher@littlesprouts.local']]
  );
  await pool.query(
    `INSERT INTO leave_requests (organisation_id, staff_id, leave_type, starts_on, ends_on, reason, status)
     VALUES ($1,$2,'annual','2026-11-16','2026-11-20','Family holiday','pending')`,
    [orgId, staffIds['assistant@littlesprouts.local']]
  );

  // Admissions
  await pool.query(
    `INSERT INTO admission_enquiries (organisation_id, branch_id, guardian_name, guardian_email, guardian_phone, child_name,
      child_date_of_birth, requested_age_group, preferred_start_date, message, source, status)
     VALUES ($1,$2,'Naledi Zulu','naledi.zulu@example.com','+27 82 555 0122','Ayanda Zulu','2022-08-19','3-4 years',
      '2026-11-02','We would love a tour of the Rosebank branch.','website','new')`,
    [orgId, branch1]
  );
  await pool.query(
    `INSERT INTO admission_applications (organisation_id, branch_id, application_reference, child_first_name, child_last_name,
      child_date_of_birth, guardian_name, guardian_email, guardian_phone, requested_classroom_id, preferred_start_date,
      status, submitted_at) VALUES ($1,$2,'APP-2026-0042','Lerato','Mahlangu','2021-12-03','Tumi Mahlangu',
      'tumi.m@example.com','+27 83 555 0166',$3,'2026-11-09','under_review',now())`,
    [orgId, branch1, classrooms.Butterflies]
  );

  // Forms
  const form = (await pool.query(
    `INSERT INTO form_definitions (organisation_id, name, slug, form_type, description, status, is_public, created_by)
     VALUES ($1,'Learner Enrolment Form','enrolment','enrolment','Standard enrolment information and consent.','published',true,$2)
     RETURNING id`, [orgId, userIds['admin@littlesprouts.local']]
  )).rows[0].id;
  const formVersion = (await pool.query(
    `INSERT INTO form_versions (form_definition_id, version_number, schema_json, published_at, published_by)
     VALUES ($1,1,$2,now(),$3) RETURNING id`,
    [form, JSON.stringify({
      fields: [
        { key: 'child_name', label: 'Child full name', type: 'text', required: true },
        { key: 'child_dob', label: 'Date of birth', type: 'date', required: true },
        { key: 'guardian_name', label: 'Guardian full name', type: 'text', required: true },
        { key: 'guardian_email', label: 'Guardian email', type: 'email', required: true },
        { key: 'allergies', label: 'Allergies and medical notes', type: 'textarea', required: false },
        { key: 'photo_consent', label: 'I consent to photographs for internal learning records', type: 'checkbox', required: false }
      ]
    }), userIds['admin@littlesprouts.local']]
  )).rows[0].id;
  await pool.query(`UPDATE form_definitions SET current_version_id = $1 WHERE id = $2`, [formVersion, form]);
  await pool.query(
    `INSERT INTO form_submissions (organisation_id, form_definition_id, form_version_id, submission_data, status,
      submitter_email) VALUES ($1,$2,$3,$4,'received','naledi.zulu@example.com')`,
    [orgId, form, formVersion, JSON.stringify({ child_name: 'Ayanda Zulu', child_dob: '2022-08-19', guardian_name: 'Naledi Zulu', guardian_email: 'naledi.zulu@example.com', allergies: 'None known', photo_consent: true })]
  );
  await pool.query(
    `INSERT INTO consent_records (organisation_id, learner_id, guardian_id, consent_type, purpose, form_version_id,
      status, granted_at, recorded_by)
     VALUES ($1,$2,$3,'photographs','Internal learning records and classroom displays',$4,'granted',now(),$5)`,
    [orgId, learners.Amelia, guardianIds['Sarah Johnson'], formVersion, userIds['admin@littlesprouts.local']]
  );

  // Communications
  await pool.query(
    `INSERT INTO announcements (organisation_id, branch_id, title, body, audience_type, status, published_at, created_by)
     VALUES ($1,$2,'Spring Day celebration','Dear families, we will celebrate Spring Day on 1 September with a picnic and'
     || ' colour parade. Please send your child in bright clothes and pack a hat.','parents','published',now(),$3)`,
    [orgId, branch1, userIds['principal@littlesprouts.local']]
  );
  const conversation = (await pool.query(
    `INSERT INTO conversations (organisation_id, subject, conversation_type, related_learner_id, created_by)
     VALUES ($1,'Amelia''s progress','direct',$2,$3) RETURNING id`,
    [orgId, learners.Amelia, userIds['teacher@littlesprouts.local']]
  )).rows[0].id;
  await pool.query(`INSERT INTO conversation_participants (conversation_id, user_id, participant_role)
    VALUES ($1,$2,'staff'),($1,$3,'guardian')`, [conversation, userIds['teacher@littlesprouts.local'], userIds['parent@littlesprouts.local']]);
  await pool.query(
    `INSERT INTO messages (conversation_id, sender_user_id, body, created_at)
     VALUES ($1,$2,'Good afternoon Sarah, Amelia had a wonderful day exploring colour mixing. I have shared a photo in her portfolio.',now() - interval '4 hours')`,
    [conversation, userIds['teacher@littlesprouts.local']]
  );
  await pool.query(`INSERT INTO notifications (organisation_id, recipient_user_id, notification_type, title, body)
    VALUES ($1,$2,'progress_published','New progress update','A new observation has been published for Amelia.')`,
    [orgId, userIds['parent@littlesprouts.local']]);

  // Finance
  const feePlan = (await pool.query(
    `INSERT INTO fee_plans (organisation_id, name, billing_frequency, currency) VALUES ($1,'Full day care','monthly','ZAR') RETURNING id`,
    [orgId])).rows[0].id;
  await pool.query(`INSERT INTO fee_plan_items (fee_plan_id, description, amount, billing_rule)
    VALUES ($1,'Monthly tuition',4200.00,'per_month'),($1,'Meals',650.00,'per_month')`, [feePlan]);
  await pool.query(`INSERT INTO invoice_counters (organisation_id, last_number) VALUES ($1,3)`, [orgId]);
  const invoiceDefs = [
    ['INV-2026-0001', learners.Amelia, guardianIds['Sarah Johnson'], 4850.00, 4850.00, 'paid'],
    ['INV-2026-0002', learners.Noah, guardianIds['David Smith'], 4850.00, 2000.00, 'partially_paid'],
    ['INV-2026-0003', learners.Liam, guardianIds['Nomsa Ndlovu'], 4850.00, 0, 'issued']
  ];
  const invoiceIds = [];
  for (const [number, learnerId, guardianId, total, paid, status] of invoiceDefs) {
    const row = await pool.query(
      `INSERT INTO invoices (organisation_id, branch_id, invoice_number, learner_id, guardian_id, subtotal, total_amount,
        amount_paid, status, description, issued_at, due_at, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$6,$7,$8,'Term 1 2026 fees',now(),'2026-11-07',$9) RETURNING id`,
      [orgId, branch1, number, learnerId, guardianId, total, paid, status, userIds['finance@littlesprouts.local']]
    );
    invoiceIds.push(row.rows[0].id);
    await pool.query(`INSERT INTO invoice_items (invoice_id, description, quantity, unit_amount, line_total)
      VALUES ($1,'Monthly tuition',1,4200.00,4200.00),($1,'Meals',1,650.00,650.00)`, [row.rows[0].id]);
  }
  const payment1 = (await pool.query(
    `INSERT INTO payments (organisation_id, guardian_id, amount, payment_method, status, received_at, reconciled_by,
      reconciled_at, idempotency_key, created_by)
     VALUES ($1,$2,4850.00,'eft','reconciled',now() - interval '20 days',$3,now(),'demo-payment-1',$4) RETURNING id`,
    [orgId, guardianIds['Sarah Johnson'], userIds['finance@littlesprouts.local'], userIds['finance@littlesprouts.local']]
  )).rows[0].id;
  await pool.query(`INSERT INTO payment_allocations (payment_id, invoice_id, allocated_amount) VALUES ($1,$2,4850.00)`,
    [payment1, invoiceIds[0]]);
  const payment2 = (await pool.query(
    `INSERT INTO payments (organisation_id, guardian_id, amount, payment_method, status, received_at, idempotency_key, created_by)
     VALUES ($1,$2,2000.00,'cash','confirmed',now() - interval '3 days','demo-payment-2',$3) RETURNING id`,
    [orgId, guardianIds['David Smith'], userIds['finance@littlesprouts.local']]
  )).rows[0].id;
  await pool.query(`INSERT INTO payment_allocations (payment_id, invoice_id, allocated_amount) VALUES ($1,$2,2000.00)`,
    [payment2, invoiceIds[1]]);

  const supplier = (await pool.query(
    `INSERT INTO suppliers (organisation_id, name, contact_details) VALUES ($1,'EduSupply SA',$2) RETURNING id`,
    [orgId, JSON.stringify({ email: 'orders@edusupply.example', phone: '+27 11 555 0100' })]
  )).rows[0].id;
  const category = (await pool.query(
    `INSERT INTO expense_categories (organisation_id, name) VALUES ($1,'Learning materials') RETURNING id`, [orgId]
  )).rows[0].id;
  await pool.query(
    `INSERT INTO expenses (organisation_id, branch_id, category_id, supplier_id, description, amount, expense_date,
      approval_status, approved_by, created_by) VALUES ($1,$2,$3,$4,'Art supplies and paper',1875.50,CURRENT_DATE,'approved',$5,$5)`,
    [orgId, branch1, category, supplier, userIds['finance@littlesprouts.local']]
  );

  // Inventory
  const itemDefs = [
    ['Finger paint (assorted)', 'Art supplies', 12, 6, 'bottles', 'Art cupboard'],
    ['A4 paper', 'Stationery', 4, 10, 'reams', 'Office'],
    ['Hand sanitiser', 'Hygiene', 8, 4, 'bottles', 'Store room']
  ];
  for (const [name, categoryName, qty, min, unit, location] of itemDefs) {
    const row = await pool.query(
      `INSERT INTO inventory_items (organisation_id, branch_id, name, category, quantity_on_hand, minimum_quantity, unit,
        storage_location) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [orgId, branch1, name, categoryName, qty, min, unit, location]
    );
    await pool.query(`INSERT INTO inventory_transactions (organisation_id, inventory_item_id, transaction_type,
      quantity_delta, reference, created_by) VALUES ($1,$2,'received',$3,'Opening stock',$4)`,
      [orgId, row.rows[0].id, qty, userIds['principal@littlesprouts.local']]);
  }

  // Safety
  const incident = (await pool.query(
    `INSERT INTO incidents (organisation_id, branch_id, incident_type, occurred_at, location_description, description,
      severity, status, reported_by, reviewed_by)
     VALUES ($1,$2,'minor_injury',now() - interval '2 days','Outdoor play area',
     'Learner tripped on the paving edge and grazed their knee. First aid applied and guardian contacted.',
     'low','follow_up',$3,$4) RETURNING id`,
    [orgId, branch1, userIds['teacher@littlesprouts.local'], userIds['principal@littlesprouts.local']]
  )).rows[0].id;
  await pool.query(`INSERT INTO incident_participants (incident_id, participant_type, participant_id, involvement_type)
    VALUES ($1,'learner',$2,'injured')`, [incident, learners.Noah]);
  await pool.query(`INSERT INTO incident_actions (incident_id, action_description, assigned_to, due_at, status)
    VALUES ($1,'Inspect and repair paving edge',$2,CURRENT_DATE + 3,'open')`,
    [incident, userIds['support@littlesprouts.local']]);

  // Tasks
  await pool.query(
    `INSERT INTO tasks (organisation_id, branch_id, title, description, assigned_to, priority, due_at, status, created_by)
     VALUES ($1,$2,'Order art supplies','Stock of finger paint is below the minimum level.',$3,'high',CURRENT_DATE + 2,
     'open',$4)`,
    [orgId, branch1, userIds['support@littlesprouts.local'], userIds['principal@littlesprouts.local']]
  );
  await pool.query(
    `INSERT INTO tasks (organisation_id, branch_id, title, description, assigned_to, priority, due_at, status, created_by)
     VALUES ($1,$2,'Review enrolment application APP-2026-0042','Application is awaiting a decision.',$3,'medium',
     CURRENT_DATE + 1,'in_progress',$4)`,
    [orgId, branch1, userIds['admissions@littlesprouts.local'], userIds['principal@littlesprouts.local']]
  );

  // Website
  await pool.query(
    `INSERT INTO website_configs (organisation_id, branch_id, slug, theme, published_content, draft_content, status, published_at)
     VALUES ($1,$2,'little-sprouts','nature',$3,$3,'published',now())`,
    [orgId, branch1, JSON.stringify({
      hero: { headline: 'Where little minds grow', subheadline: 'A warm, play-based early learning home in Rosebank.', cta: 'Book a visit' },
      about: 'Little Sprouts ECD is a registered early learning centre offering full-day care for children aged 18 months to 6 years. Our qualified educators follow the South African ECD learning framework.',
      approach: 'We learn through play, nature and meaningful relationships. Days are structured around exploration, story time, outdoor play and rest.',
      programmes: [
        { name: 'Bunnies', ages: '18 months - 3 years', description: 'Nurturing care, sensory play and early language.' },
        { name: 'Butterflies', ages: '3 - 5 years', description: 'Project-based learning, early literacy and numeracy.' },
        { name: 'Sunflowers', ages: '5 - 6 years', description: 'School readiness, independence and leadership.' }
      ],
      facilities: ['Secure outdoor play area', 'Nutritional meals', 'Qualified ECD educators', 'CCTV and access control'],
      routine: [
        { time: '06:30', activity: 'Arrival and free play' },
        { time: '08:30', activity: 'Morning ring and story' },
        { time: '10:00', activity: 'Outdoor play and snack' },
        { time: '12:00', activity: 'Lunch and rest' },
        { time: '15:00', activity: 'Creative activities' },
        { time: '17:00', activity: 'Collection' }
      ],
      fees: 'Full-day care from R4 850 per month, including meals.',
      faqs: [
        { question: 'What ages do you accept?', answer: 'We care for children from 18 months to 6 years.' },
        { question: 'Are meals included?', answer: 'Yes, a cooked lunch and two snacks are included in the monthly fee.' }
      ],
      contact: { email: 'hello@littlesprouts.local', phone: '+27 11 447 8890', address: '12 Bath Avenue, Rosebank, Johannesburg' },
      gallery: []
    })]
  );

  // Platform plans and subscriptions
  const planIds = {};
  for (const row of (await pool.query('SELECT id, plan_key FROM subscription_plans')).rows) {
    planIds[row.plan_key] = row.id;
  }
  await pool.query(`INSERT INTO platform_subscriptions (organisation_id, plan_id, status, current_period_start, current_period_end)
    VALUES ($1,$2,'active','2026-10-01','2026-10-31')`, [orgId, planIds.sapling]);
  await pool.query(`INSERT INTO platform_subscriptions (organisation_id, plan_id, status, current_period_start, current_period_end)
    VALUES ($1,$2,'trial','2026-10-15','2026-11-14')`, [org2Id, planIds.seedling]);
  await pool.query(
    `INSERT INTO audit_events (actor_user_id, organisation_id, branch_id, action, resource_type, resource_id, metadata)
     VALUES ($1,$2,$3,'organisation.provisioned','organisation',$2,$4)`,
    [userIds['platform@re-el-ecd.local'], orgId, branch1, JSON.stringify({ source: 'seed' })]
  );

  return { seeded: true, organisations: [orgId, org2Id], platformId, password: DEMO_PASSWORD };
}

module.exports = { seedDevelopment, seedCatalog, seedPlatformDefaults, DEMO_PASSWORD, USERS };
