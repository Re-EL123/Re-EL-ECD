'use strict';

/**
 * Reusable content templates. Each centre keeps its own library of lesson
 * plans, activities, observation snippets and announcement wording; built-in
 * starter templates (defined in code) are available to everyone.
 */

const { validate } = require('../../../../packages/contracts/validate');
const { AppError, fail } = require('../../../../packages/contracts/errors');
const { has } = require('./helpers');

const KINDS = ['lesson_plan', 'activity', 'observation', 'announcement'];

const CREATE_PERMISSIONS = {
  lesson_plan: ['curriculum.create.daycare'],
  activity: ['curriculum.create.daycare'],
  observation: ['assessments.create.assigned', 'assessments.read.daycare'],
  announcement: ['announcements.manage.daycare']
};

const BUILTIN_TEMPLATES = [
  { id: 'builtin-lesson-colours', kind: 'lesson_plan', builtin: true, name: 'Colours of the Rainbow', description: 'A week of colour, paint and sorting.', payload: {
    theme: 'colours', title: 'Colours of the Rainbow',
    preparationNotes: 'Gather paints, brushes, colour sorting trays, colour charts and mixing cups. Set up a colour mixing table and a colour hunt corner.',
    objectiveCodes: ['CL-01', 'MA-01', 'PD-02'] } },
  { id: 'builtin-lesson-outdoors', kind: 'lesson_plan', builtin: true, name: 'Outdoor Explorers', description: 'A week about the garden and the world outside.', payload: {
    theme: 'outdoors', title: 'Outdoor Explorers',
    preparationNotes: 'Prepare magnifying glasses, bug catchers, clipboards, crayons, sun hats and a water station. Plan a short nature walk around the garden.',
    objectiveCodes: ['PD-01', 'CL-02'] } },
  { id: 'builtin-lesson-storytime', kind: 'lesson_plan', builtin: true, name: 'Story Time Week', description: 'A week built around a favourite storybook.', payload: {
    theme: 'stories', title: 'Story Time Week',
    preparationNotes: 'Choose one storybook as the theme for the week. Prepare cushions, a felt board with the characters and simple props for retellings.',
    objectiveCodes: ['CL-02', 'CL-03'] } },
  { id: 'builtin-lesson-helpers', kind: 'lesson_plan', builtin: true, name: 'Snack Time Helpers', description: 'A practical life week in the kitchen.', payload: {
    theme: 'practical life', title: 'Snack Time Helpers',
    preparationNotes: 'Prepare aprons, child-safe chopping boards, blunt knives, fruit and a washing station. Plan a simple fruit salad activity for the end of the week.',
    objectiveCodes: ['PD-02', 'SE-01'] } },

  { id: 'builtin-activity-rice', kind: 'activity', builtin: true, name: 'Sensory Rice Play', description: 'Coloured rice with scoops and small objects.', payload: {
    title: 'Sensory Rice Play', activityType: 'sensory', durationMinutes: 30,
    description: 'Coloured rice in a large tray with cups, scoops and small toys for scooping and pouring.',
    materials: 'Rice, food colouring, trays, cups, scoops, small objects',
    safetyNotes: 'Supervise closely; keep rice off the floor; check for choking hazards.' } },
  { id: 'builtin-activity-paint-mix', kind: 'activity', builtin: true, name: 'Colour Mixing with Paint', description: 'Children mix primary colours to find new ones.', payload: {
    title: 'Colour Mixing with Paint', activityType: 'creative', durationMinutes: 30,
    description: 'Children use primary colour paints to mix secondary colours on paper.',
    materials: 'Red, yellow and blue paint, brushes, mixing trays, paper',
    safetyNotes: 'Use washable paint; provide aprons; supervise closely.' } },
  { id: 'builtin-activity-caps', kind: 'activity', builtin: true, name: 'Counting with Bottle Caps', description: 'Counting and grouping with everyday objects.', payload: {
    title: 'Counting with Bottle Caps', activityType: 'numeracy', durationMinutes: 20,
    description: 'Children count, group and match bottle caps; older children add and subtract.',
    materials: 'Bottle caps, number cards, counting trays',
    safetyNotes: 'Check caps for sharp edges.' } },
  { id: 'builtin-activity-obstacle', kind: 'activity', builtin: true, name: 'Outdoor Obstacle Course', description: 'Balance, crawl, jump and climb outdoors.', payload: {
    title: 'Outdoor Obstacle Course', activityType: 'physical', durationMinutes: 30,
    description: 'A friendly obstacle course with balance beam, tunnel, cones and soft mats.',
    materials: 'Cones, soft mats, tunnel, balance beam, hoops',
    safetyNotes: 'Supervise the physical play; check equipment before use.' } },
  { id: 'builtin-activity-storytime', kind: 'activity', builtin: true, name: 'Story Time with Picture Books', description: 'A calm reading and retelling activity.', payload: {
    title: 'Story Time with Picture Books', activityType: 'literacy', durationMinutes: 20,
    description: 'Read a picture book aloud together, then let children retell it in pairs with props.',
    materials: 'Picture book, cushions, character props',
    safetyNotes: '' } },

  { id: 'builtin-observation-balance', kind: 'observation', builtin: true, name: 'Balanced on one leg', description: 'Balance observation snippet.', payload: {
    text: 'Balanced on one leg for five seconds during outdoor play and laughed when she lost her balance.' } },
  { id: 'builtin-observation-grip', kind: 'observation', builtin: true, name: 'Tripod grip', description: 'Early writing observation snippet.', payload: {
    text: 'Held a crayon with a developing tripod grip during drawing and drew a circle representing her family.' } },
  { id: 'builtin-observation-turns', kind: 'observation', builtin: true, name: 'Taking turns', description: 'Social development observation snippet.', payload: {
    text: 'Took turns waiting and played cooperatively with a peer during block play.' } },
  { id: 'builtin-observation-colours', kind: 'observation', builtin: true, name: 'Knows colours', description: 'Colour recognition observation snippet.', payload: {
    text: 'Recognised and named three primary colours during the colour sorting activity.' } },
  { id: 'builtin-observation-sentence', kind: 'observation', builtin: true, name: 'Full sentences', description: 'Language observation snippet.', payload: {
    text: 'Used a full sentence to request more crayons during art time.' } },

  { id: 'builtin-announcement-newsletter', kind: 'announcement', builtin: true, name: 'Weekly newsletter', description: 'Standard weekly update layout.', payload: {
    audienceType: 'all',
    body: 'Good morning families!\n\nHere is what the children have been exploring this week. Please look at the gallery and talk to your child about their favourite moment.\n\nKind regards,\nThe centre team' } },
  { id: 'builtin-announcement-fees', kind: 'announcement', builtin: true, name: 'Fee reminder', description: 'Friendly reminder that fees are due.', payload: {
    audienceType: 'parents',
    body: 'A friendly reminder that fees are due by the end of the month. If you need to discuss a payment plan, please contact the office.' } },
  { id: 'builtin-announcement-open-day', kind: 'announcement', builtin: true, name: 'Open day invitation', description: 'Invite families to visit the centre.', payload: {
    audienceType: 'all',
    body: 'You are warmly invited to an open morning. Come and see the classrooms, meet the educators and enjoy a cup of tea.\n\nPlease reply to let us know if you will be joining us.' } }
];

function canCreate(ctx, kind) {
  return (CREATE_PERMISSIONS[kind] || []).some((permission) => has(ctx, permission));
}

function present(row) {
  return { id: row.id, kind: row.kind, name: row.name, description: row.description, payload: row.payload || {}, createdAt: row.created_at, updatedAt: row.updated_at };
}

function register(router) {
  router.get('/templates', async (ctx) => {
    const kind = String(ctx.query.kind || '').trim();
    if (!KINDS.includes(kind)) fail('VALIDATION', [{ field: 'kind', message: 'kind must be one of lesson_plan, activity, observation, announcement.' }]);
    if (!has(ctx, 'curriculum.read.daycare') && !has(ctx, 'assessments.read.daycare') && !has(ctx, 'announcements.read.daycare')) throw new AppError('FORBIDDEN');
    const builtins = BUILTIN_TEMPLATES.filter((template) => template.kind === kind);
    const rows = await ctx.db.many(
      'SELECT * FROM content_templates WHERE organisation_id = $1 AND kind = $2 ORDER BY updated_at DESC',
      [ctx.organisationId, kind]
    );
    return { data: [...builtins, ...rows.map(present)] };
  }, { permission: ['curriculum.read.daycare', 'assessments.read.daycare', 'announcements.read.daycare'], permissionMode: 'any' });

  router.post('/templates', async (ctx) => {
    const body = validate(ctx.body, {
      kind: { type: 'string', enum: KINDS },
      name: { type: 'string', min: 2, max: 120 },
      description: { type: 'string', max: 500, optional: true },
      payload: { type: 'object', optional: true }
    });
    if (!canCreate(ctx, body.kind)) throw new AppError('FORBIDDEN');
    const name = body.name.trim();
    const row = await ctx.db.one(
      `INSERT INTO content_templates (organisation_id, kind, name, description, payload, created_by)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (organisation_id, kind, name)
       DO UPDATE SET description = EXCLUDED.description, payload = EXCLUDED.payload, updated_at = now()
       RETURNING *`,
      [ctx.organisationId, body.kind, name, body.description || null, JSON.stringify(body.payload || {}), ctx.user.id]
    );
    ctx.status = 201;
    return present(row);
  }, { permission: ['curriculum.create.daycare', 'assessments.create.assigned', 'assessments.read.daycare', 'announcements.manage.daycare'], permissionMode: 'any' });

  router.delete('/templates/:id', async (ctx) => {
    const template = await ctx.db.one('SELECT * FROM content_templates WHERE id = $1 AND organisation_id = $2',
      [ctx.params.id, ctx.organisationId]);
    if (!template) throw new AppError('NOT_FOUND');
    if (!canCreate(ctx, template.kind)) throw new AppError('FORBIDDEN');
    await ctx.db.query('DELETE FROM content_templates WHERE id = $1', [template.id]);
    return { deleted: true };
  }, { permission: ['curriculum.create.daycare', 'assessments.create.assigned', 'assessments.read.daycare', 'announcements.manage.daycare'], permissionMode: 'any' });
}

module.exports = { register, KINDS };
