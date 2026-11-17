-- Official NCF v1.1: interactive slides for the official pack.

-- One 'Quick check' MCQ per plan, plus a drag-drop for the eight concrete/matching plans.

-- Reflection shifts accordingly. Mirrors official-ncf-steps.json (v1.1).

-- Tenant-adopted plans are never touched.



UPDATE lesson_steps st SET position = 6 FROM lesson_plans lp WHERE lp.id = st.lesson_plan_id AND lp.organisation_id IS NULL AND lp.source_key LIKE 'ncf-plan-%' AND st.position = 5;

UPDATE lesson_steps st SET position = 7 WHERE st.lesson_plan_id IN (SELECT id FROM lesson_plans WHERE organisation_id IS NULL AND source_key IN ('ncf-plan-shapes','ncf-plan-patterns','ncf-plan-counting-walk','ncf-plan-blocks','ncf-plan-numbers','ncf-plan-sounds','ncf-plan-garden','ncf-plan-helpers')) AND st.position = 6;



INSERT INTO lesson_steps (organisation_id, lesson_plan_id, position, step_type, title, body, duration_minutes, interactive_data)
SELECT NULL, lp.id, 5, 'mcq', 'Quick check', 'Ears all ears — what did we learn this week? Tap the answer you believe is right.', 5,
  jsonb_build_object('question', 'Where do we greet each other in the morning?', 'options', jsonb_build_array('At the gate', 'At the dinner table', 'In the bath'), 'correct', jsonb_build_array(0), 'objectiveIds', jsonb_build_array((SELECT o.id FROM learning_objectives o JOIN curriculum_domains d ON d.id = o.domain_id JOIN curriculum_frameworks f ON f.id = d.framework_id WHERE f.source_key='ncf-framework' AND o.code = 'NCF-ID-01')))
FROM lesson_plans lp WHERE lp.organisation_id IS NULL AND lp.source_key = 'ncf-plan-welcome';

INSERT INTO lesson_steps (organisation_id, lesson_plan_id, position, step_type, title, body, duration_minutes, interactive_data)
SELECT NULL, lp.id, 5, 'mcq', 'Quick check', 'Ears all ears — what did we learn this week? Tap the answer you believe is right.', 5,
  jsonb_build_object('question', 'What does our family song say?', 'options', jsonb_build_array('Everyone belongs', 'Only children belong', 'Nobody belongs'), 'correct', jsonb_build_array(0), 'objectiveIds', jsonb_build_array((SELECT o.id FROM learning_objectives o JOIN curriculum_domains d ON d.id = o.domain_id JOIN curriculum_frameworks f ON f.id = d.framework_id WHERE f.source_key='ncf-framework' AND o.code = 'NCF-ID-09')))
FROM lesson_plans lp WHERE lp.organisation_id IS NULL AND lp.source_key = 'ncf-plan-family';

INSERT INTO lesson_steps (organisation_id, lesson_plan_id, position, step_type, title, body, duration_minutes, interactive_data)
SELECT NULL, lp.id, 5, 'mcq', 'Quick check', 'Ears all ears — what did we learn this week? Tap the answer you believe is right.', 5,
  jsonb_build_object('question', 'In the Feeling Monster story, what colour is angry?', 'options', jsonb_build_array('Red', 'Blue', 'Yellow'), 'correct', jsonb_build_array(0), 'objectiveIds', jsonb_build_array((SELECT o.id FROM learning_objectives o JOIN curriculum_domains d ON d.id = o.domain_id JOIN curriculum_frameworks f ON f.id = d.framework_id WHERE f.source_key='ncf-framework' AND o.code = 'NCF-WB-05')))
FROM lesson_plans lp WHERE lp.organisation_id IS NULL AND lp.source_key = 'ncf-plan-feelings';

INSERT INTO lesson_steps (organisation_id, lesson_plan_id, position, step_type, title, body, duration_minutes, interactive_data)
SELECT NULL, lp.id, 5, 'mcq', 'Quick check', 'Ears all ears — what did we learn this week? Tap the answer you believe is right.', 5,
  jsonb_build_object('question', 'What did The Rainbow Class teach us?', 'options', jsonb_build_array('Everyone is a stripe in the rainbow', 'Only some children are stripes', 'A rainbow is only red'), 'correct', jsonb_build_array(0), 'objectiveIds', jsonb_build_array((SELECT o.id FROM learning_objectives o JOIN curriculum_domains d ON d.id = o.domain_id JOIN curriculum_frameworks f ON f.id = d.framework_id WHERE f.source_key='ncf-framework' AND o.code = 'NCF-ID-11')))
FROM lesson_plans lp WHERE lp.organisation_id IS NULL AND lp.source_key = 'ncf-plan-belong';

INSERT INTO lesson_steps (organisation_id, lesson_plan_id, position, step_type, title, body, duration_minutes, interactive_data)
SELECT NULL, lp.id, 5, 'mcq', 'Quick check', 'Ears all ears — what did we learn this week? Tap the answer you believe is right.', 5,
  jsonb_build_object('question', 'What does Druss the tooth doctor check at night?', 'options', jsonb_build_array('Whether the teeth are shiny or sticky', 'What shoes we wear', 'How tall we are'), 'correct', jsonb_build_array(0), 'objectiveIds', jsonb_build_array((SELECT o.id FROM learning_objectives o JOIN curriculum_domains d ON d.id = o.domain_id JOIN curriculum_frameworks f ON f.id = d.framework_id WHERE f.source_key='ncf-framework' AND o.code = 'NCF-WB-12')))
FROM lesson_plans lp WHERE lp.organisation_id IS NULL AND lp.source_key = 'ncf-plan-healthy';

INSERT INTO lesson_steps (organisation_id, lesson_plan_id, position, step_type, title, body, duration_minutes, interactive_data)
SELECT NULL, lp.id, 5, 'mcq', 'Quick check', 'Ears all ears — what did we learn this week? Tap the answer you believe is right.', 5,
  jsonb_build_object('question', 'In The Itsy Bitsy Spider song, what washed the spider out?', 'options', jsonb_build_array('The rain', 'The sun', 'The wind'), 'correct', jsonb_build_array(0), 'objectiveIds', jsonb_build_array((SELECT o.id FROM learning_objectives o JOIN curriculum_domains d ON d.id = o.domain_id JOIN curriculum_frameworks f ON f.id = d.framework_id WHERE f.source_key='ncf-framework' AND o.code = 'NCF-COM-04')))
FROM lesson_plans lp WHERE lp.organisation_id IS NULL AND lp.source_key = 'ncf-plan-rhyme';

INSERT INTO lesson_steps (organisation_id, lesson_plan_id, position, step_type, title, body, duration_minutes, interactive_data)
SELECT NULL, lp.id, 5, 'mcq', 'Quick check', 'Ears all ears — what did we learn this week? Tap the answer you believe is right.', 5,
  jsonb_build_object('question', 'In our story, what is the Gruffalo?', 'options', jsonb_build_array('A small mouse', 'A big monster', 'A bird'), 'correct', jsonb_build_array(1), 'objectiveIds', jsonb_build_array((SELECT o.id FROM learning_objectives o JOIN curriculum_domains d ON d.id = o.domain_id JOIN curriculum_frameworks f ON f.id = d.framework_id WHERE f.source_key='ncf-framework' AND o.code = 'NCF-COM-09')))
FROM lesson_plans lp WHERE lp.organisation_id IS NULL AND lp.source_key = 'ncf-plan-story';

INSERT INTO lesson_steps (organisation_id, lesson_plan_id, position, step_type, title, body, duration_minutes, interactive_data)
SELECT NULL, lp.id, 5, 'mcq', 'Quick check', 'Ears all ears — what did we learn this week? Tap the answer you believe is right.', 5,
  jsonb_build_object('question', 'When we listen very quietly, how many sounds do we count?', 'options', jsonb_build_array('Five', 'Ten', 'Twenty'), 'correct', jsonb_build_array(0), 'objectiveIds', jsonb_build_array((SELECT o.id FROM learning_objectives o JOIN curriculum_domains d ON d.id = o.domain_id JOIN curriculum_frameworks f ON f.id = d.framework_id WHERE f.source_key='ncf-framework' AND o.code = 'NCF-COM-05')))
FROM lesson_plans lp WHERE lp.organisation_id IS NULL AND lp.source_key = 'ncf-plan-sounds';

INSERT INTO lesson_steps (organisation_id, lesson_plan_id, position, step_type, title, body, duration_minutes, interactive_data)
SELECT NULL, lp.id, 5, 'mcq', 'Quick check', 'Ears all ears — what did we learn this week? Tap the answer you believe is right.', 5,
  jsonb_build_object('question', 'In the interest trays, what comes before letters?', 'options', jsonb_build_array('Lines and curves', 'Numbers to 20', 'Full sentences'), 'correct', jsonb_build_array(0), 'objectiveIds', jsonb_build_array((SELECT o.id FROM learning_objectives o JOIN curriculum_domains d ON d.id = o.domain_id JOIN curriculum_frameworks f ON f.id = d.framework_id WHERE f.source_key='ncf-framework' AND o.code = 'NCF-COM-11')))
FROM lesson_plans lp WHERE lp.organisation_id IS NULL AND lp.source_key = 'ncf-plan-letters';

INSERT INTO lesson_steps (organisation_id, lesson_plan_id, position, step_type, title, body, duration_minutes, interactive_data)
SELECT NULL, lp.id, 5, 'mcq', 'Quick check', 'Ears all ears — what did we learn this week? Tap the answer you believe is right.', 5,
  jsonb_build_object('question', 'In Head, Shoulders, Knees and Toes, what comes after the knees?', 'options', jsonb_build_array('Toes', 'Ears', 'Elbows'), 'correct', jsonb_build_array(0), 'objectiveIds', jsonb_build_array((SELECT o.id FROM learning_objectives o JOIN curriculum_domains d ON d.id = o.domain_id JOIN curriculum_frameworks f ON f.id = d.framework_id WHERE f.source_key='ncf-framework' AND o.code = 'NCF-CRA-10')))
FROM lesson_plans lp WHERE lp.organisation_id IS NULL AND lp.source_key = 'ncf-plan-songs';

INSERT INTO lesson_steps (organisation_id, lesson_plan_id, position, step_type, title, body, duration_minutes, interactive_data)
SELECT NULL, lp.id, 5, 'mcq', 'Quick check', 'Ears all ears — what did we learn this week? Tap the answer you believe is right.', 5,
  jsonb_build_object('question', 'In One, Two, Buckle My Shoe, how high do we count?', 'options', jsonb_build_array('Ten', 'Five', 'Twenty'), 'correct', jsonb_build_array(0), 'objectiveIds', jsonb_build_array((SELECT o.id FROM learning_objectives o JOIN curriculum_domains d ON d.id = o.domain_id JOIN curriculum_frameworks f ON f.id = d.framework_id WHERE f.source_key='ncf-framework' AND o.code = 'NCF-EM-09')))
FROM lesson_plans lp WHERE lp.organisation_id IS NULL AND lp.source_key = 'ncf-plan-numbers';

INSERT INTO lesson_steps (organisation_id, lesson_plan_id, position, step_type, title, body, duration_minutes, interactive_data)
SELECT NULL, lp.id, 5, 'mcq', 'Quick check', 'Ears all ears — what did we learn this week? Tap the answer you believe is right.', 5,
  jsonb_build_object('question', 'The monster''s body is made of which shapes?', 'options', jsonb_build_array('Circles, squares and triangles', 'Letters of the alphabet', 'Flowers and leaves'), 'correct', jsonb_build_array(0), 'objectiveIds', jsonb_build_array((SELECT o.id FROM learning_objectives o JOIN curriculum_domains d ON d.id = o.domain_id JOIN curriculum_frameworks f ON f.id = d.framework_id WHERE f.source_key='ncf-framework' AND o.code = 'NCF-EM-11')))
FROM lesson_plans lp WHERE lp.organisation_id IS NULL AND lp.source_key = 'ncf-plan-shapes';

INSERT INTO lesson_steps (organisation_id, lesson_plan_id, position, step_type, title, body, duration_minutes, interactive_data)
SELECT NULL, lp.id, 5, 'mcq', 'Quick check', 'Ears all ears — what did we learn this week? Tap the answer you believe is right.', 5,
  jsonb_build_object('question', 'Beads go red, blue, red, blue. What colour comes next?', 'options', jsonb_build_array('Red', 'Blue', 'Green'), 'correct', jsonb_build_array(0), 'objectiveIds', jsonb_build_array((SELECT o.id FROM learning_objectives o JOIN curriculum_domains d ON d.id = o.domain_id JOIN curriculum_frameworks f ON f.id = d.framework_id WHERE f.source_key='ncf-framework' AND o.code = 'NCF-EM-10')))
FROM lesson_plans lp WHERE lp.organisation_id IS NULL AND lp.source_key = 'ncf-plan-patterns';

INSERT INTO lesson_steps (organisation_id, lesson_plan_id, position, step_type, title, body, duration_minutes, interactive_data)
SELECT NULL, lp.id, 5, 'mcq', 'Quick check', 'Ears all ears — what did we learn this week? Tap the answer you believe is right.', 5,
  jsonb_build_object('question', 'When we walk back through the gate, what do we count to?', 'options', jsonb_build_array('Ten backwards', 'Five forwards', 'Twenty'), 'correct', jsonb_build_array(0), 'objectiveIds', jsonb_build_array((SELECT o.id FROM learning_objectives o JOIN curriculum_domains d ON d.id = o.domain_id JOIN curriculum_frameworks f ON f.id = d.framework_id WHERE f.source_key='ncf-framework' AND o.code = 'NCF-EM-09')))
FROM lesson_plans lp WHERE lp.organisation_id IS NULL AND lp.source_key = 'ncf-plan-counting-walk';

INSERT INTO lesson_steps (organisation_id, lesson_plan_id, position, step_type, title, body, duration_minutes, interactive_data)
SELECT NULL, lp.id, 5, 'mcq', 'Quick check', 'Ears all ears — what did we learn this week? Tap the answer you believe is right.', 5,
  jsonb_build_object('question', 'When a tower falls, what should we ask?', 'options', jsonb_build_array('Why did it fall?', 'Whose tower is biggest?', 'Should we stop playing?'), 'correct', jsonb_build_array(0), 'objectiveIds', jsonb_build_array((SELECT o.id FROM learning_objectives o JOIN curriculum_domains d ON d.id = o.domain_id JOIN curriculum_frameworks f ON f.id = d.framework_id WHERE f.source_key='ncf-framework' AND o.code = 'NCF-EM-12')))
FROM lesson_plans lp WHERE lp.organisation_id IS NULL AND lp.source_key = 'ncf-plan-blocks';

INSERT INTO lesson_steps (organisation_id, lesson_plan_id, position, step_type, title, body, duration_minutes, interactive_data)
SELECT NULL, lp.id, 5, 'mcq', 'Quick check', 'Ears all ears — what did we learn this week? Tap the answer you believe is right.', 5,
  jsonb_build_object('question', 'When we find a spider on our insect walk, what do we do?', 'options', jsonb_build_array('Look gently — never squash', 'Pick it up and keep it', 'Run away'), 'correct', jsonb_build_array(0), 'objectiveIds', jsonb_build_array((SELECT o.id FROM learning_objectives o JOIN curriculum_domains d ON d.id = o.domain_id JOIN curriculum_frameworks f ON f.id = d.framework_id WHERE f.source_key='ncf-framework' AND o.code = 'NCF-KUW-09')))
FROM lesson_plans lp WHERE lp.organisation_id IS NULL AND lp.source_key = 'ncf-plan-nature';

INSERT INTO lesson_steps (organisation_id, lesson_plan_id, position, step_type, title, body, duration_minutes, interactive_data)
SELECT NULL, lp.id, 5, 'mcq', 'Quick check', 'Ears all ears — what did we learn this week? Tap the answer you believe is right.', 5,
  jsonb_build_object('question', 'How many weather cards do we have?', 'options', jsonb_build_array('Four', 'Two', 'Seven'), 'correct', jsonb_build_array(0), 'objectiveIds', jsonb_build_array((SELECT o.id FROM learning_objectives o JOIN curriculum_domains d ON d.id = o.domain_id JOIN curriculum_frameworks f ON f.id = d.framework_id WHERE f.source_key='ncf-framework' AND o.code = 'NCF-KUW-04')))
FROM lesson_plans lp WHERE lp.organisation_id IS NULL AND lp.source_key = 'ncf-plan-weather';

INSERT INTO lesson_steps (organisation_id, lesson_plan_id, position, step_type, title, body, duration_minutes, interactive_data)
SELECT NULL, lp.id, 5, 'mcq', 'Quick check', 'Ears all ears — what did we learn this week? Tap the answer you believe is right.', 5,
  jsonb_build_object('question', 'In The Night Watch story, who drives through checking everyone?', 'options', jsonb_build_array('The nurse', 'The police officer', 'The librarian'), 'correct', jsonb_build_array(1), 'objectiveIds', jsonb_build_array((SELECT o.id FROM learning_objectives o JOIN curriculum_domains d ON d.id = o.domain_id JOIN curriculum_frameworks f ON f.id = d.framework_id WHERE f.source_key='ncf-framework' AND o.code = 'NCF-KUW-10')))
FROM lesson_plans lp WHERE lp.organisation_id IS NULL AND lp.source_key = 'ncf-plan-helpers';

INSERT INTO lesson_steps (organisation_id, lesson_plan_id, position, step_type, title, body, duration_minutes, interactive_data)
SELECT NULL, lp.id, 5, 'mcq', 'Quick check', 'Ears all ears — what did we learn this week? Tap the answer you believe is right.', 5,
  jsonb_build_object('question', 'In the beans-in-cups activity, what do the children do every day?', 'options', jsonb_build_array('Water the beans', 'Paint the cups', 'Eat the leaves'), 'correct', jsonb_build_array(0), 'objectiveIds', jsonb_build_array((SELECT o.id FROM learning_objectives o JOIN curriculum_domains d ON d.id = o.domain_id JOIN curriculum_frameworks f ON f.id = d.framework_id WHERE f.source_key='ncf-framework' AND o.code = 'NCF-KUW-09')))
FROM lesson_plans lp WHERE lp.organisation_id IS NULL AND lp.source_key = 'ncf-plan-garden';

INSERT INTO lesson_steps (organisation_id, lesson_plan_id, position, step_type, title, body, duration_minutes, interactive_data)
SELECT NULL, lp.id, 5, 'mcq', 'Quick check', 'Ears all ears — what did we learn this week? Tap the answer you believe is right.', 5,
  jsonb_build_object('question', 'What is on our model street?', 'options', jsonb_build_array('Houses, a clinic, a park and a shop', 'Castles and dragons', 'Dinosaurs'), 'correct', jsonb_build_array(0), 'objectiveIds', jsonb_build_array((SELECT o.id FROM learning_objectives o JOIN curriculum_domains d ON d.id = o.domain_id JOIN curriculum_frameworks f ON f.id = d.framework_id WHERE f.source_key='ncf-framework' AND o.code = 'NCF-KUW-10')))
FROM lesson_plans lp WHERE lp.organisation_id IS NULL AND lp.source_key = 'ncf-plan-neighbours';

INSERT INTO lesson_steps (organisation_id, lesson_plan_id, position, step_type, title, body, duration_minutes, interactive_data)
SELECT NULL, lp.id, 6, 'dragdrop', 'Match the shape to describe it', 'Match each one to its friend — drag them into place.', 6,
  jsonb_build_object('question', 'Match the shape to describe it', 'items', jsonb_build_array(jsonb_build_object('label', 'Circle'), jsonb_build_object('label', 'Square'), jsonb_build_object('label', 'Triangle')), 'targets', jsonb_build_array(jsonb_build_object('label', 'Round like a ball'), jsonb_build_object('label', 'Four straight sides'), jsonb_build_object('label', 'Three straight sides')), 'objectiveIds', jsonb_build_array((SELECT o.id FROM learning_objectives o JOIN curriculum_domains d ON d.id = o.domain_id JOIN curriculum_frameworks f ON f.id = d.framework_id WHERE f.source_key='ncf-framework' AND o.code = 'NCF-EM-03')))
FROM lesson_plans lp WHERE lp.organisation_id IS NULL AND lp.source_key = 'ncf-plan-shapes';

INSERT INTO lesson_steps (organisation_id, lesson_plan_id, position, step_type, title, body, duration_minutes, interactive_data)
SELECT NULL, lp.id, 6, 'dragdrop', 'Build our red-blue pattern', 'Match each one to its friend — drag them into place.', 6,
  jsonb_build_object('question', 'Build our red-blue pattern', 'items', jsonb_build_array(jsonb_build_object('label', 'Red'), jsonb_build_object('label', 'Blue'), jsonb_build_object('label', 'Red'), jsonb_build_object('label', 'Blue')), 'targets', jsonb_build_array(jsonb_build_object('label', 'First'), jsonb_build_object('label', 'Second'), jsonb_build_object('label', 'Third'), jsonb_build_object('label', 'Fourth')), 'objectiveIds', jsonb_build_array((SELECT o.id FROM learning_objectives o JOIN curriculum_domains d ON d.id = o.domain_id JOIN curriculum_frameworks f ON f.id = d.framework_id WHERE f.source_key='ncf-framework' AND o.code = 'NCF-EM-10')))
FROM lesson_plans lp WHERE lp.organisation_id IS NULL AND lp.source_key = 'ncf-plan-patterns';

INSERT INTO lesson_steps (organisation_id, lesson_plan_id, position, step_type, title, body, duration_minutes, interactive_data)
SELECT NULL, lp.id, 6, 'dragdrop', 'Walk home counting backwards', 'Match each one to its friend — drag them into place.', 6,
  jsonb_build_object('question', 'Walk home counting backwards', 'items', jsonb_build_array(jsonb_build_object('label', '10'), jsonb_build_object('label', '9'), jsonb_build_object('label', '8')), 'targets', jsonb_build_array(jsonb_build_object('label', 'First'), jsonb_build_object('label', 'Second'), jsonb_build_object('label', 'Third')), 'objectiveIds', jsonb_build_array((SELECT o.id FROM learning_objectives o JOIN curriculum_domains d ON d.id = o.domain_id JOIN curriculum_frameworks f ON f.id = d.framework_id WHERE f.source_key='ncf-framework' AND o.code = 'NCF-EM-09')))
FROM lesson_plans lp WHERE lp.organisation_id IS NULL AND lp.source_key = 'ncf-plan-counting-walk';

INSERT INTO lesson_steps (organisation_id, lesson_plan_id, position, step_type, title, body, duration_minutes, interactive_data)
SELECT NULL, lp.id, 6, 'dragdrop', 'Match each block to its job', 'Match each one to its friend — drag them into place.', 6,
  jsonb_build_object('question', 'Match each block to its job', 'items', jsonb_build_array(jsonb_build_object('label', 'Big hollow blocks'), jsonb_build_object('label', 'Small solid blocks'), jsonb_build_object('label', 'Ramps and tubes')), 'targets', jsonb_build_array(jsonb_build_object('label', 'Build the tall tower'), jsonb_build_object('label', 'Add the small details'), jsonb_build_object('label', 'Send the car rolling')), 'objectiveIds', jsonb_build_array((SELECT o.id FROM learning_objectives o JOIN curriculum_domains d ON d.id = o.domain_id JOIN curriculum_frameworks f ON f.id = d.framework_id WHERE f.source_key='ncf-framework' AND o.code = 'NCF-CRA-08')))
FROM lesson_plans lp WHERE lp.organisation_id IS NULL AND lp.source_key = 'ncf-plan-blocks';

INSERT INTO lesson_steps (organisation_id, lesson_plan_id, position, step_type, title, body, duration_minutes, interactive_data)
SELECT NULL, lp.id, 6, 'dragdrop', 'Put one, two, three in order', 'Match each one to its friend — drag them into place.', 6,
  jsonb_build_object('question', 'Put one, two, three in order', 'items', jsonb_build_array(jsonb_build_object('label', '3', 'correctTarget', 2), jsonb_build_object('label', '1', 'correctTarget', 0), jsonb_build_object('label', '2', 'correctTarget', 1)), 'targets', jsonb_build_array(jsonb_build_object('label', 'First'), jsonb_build_object('label', 'Second'), jsonb_build_object('label', 'Third')), 'objectiveIds', jsonb_build_array((SELECT o.id FROM learning_objectives o JOIN curriculum_domains d ON d.id = o.domain_id JOIN curriculum_frameworks f ON f.id = d.framework_id WHERE f.source_key='ncf-framework' AND o.code = 'NCF-EM-05')))
FROM lesson_plans lp WHERE lp.organisation_id IS NULL AND lp.source_key = 'ncf-plan-numbers';

INSERT INTO lesson_steps (organisation_id, lesson_plan_id, position, step_type, title, body, duration_minutes, interactive_data)
SELECT NULL, lp.id, 6, 'dragdrop', 'Match the jar to its sound', 'Match each one to its friend — drag them into place.', 6,
  jsonb_build_object('question', 'Match the jar to its sound', 'items', jsonb_build_array(jsonb_build_object('label', 'Rice jar'), jsonb_build_object('label', 'Bean jar'), jsonb_build_object('label', 'Paper clip jar')), 'targets', jsonb_build_array(jsonb_build_object('label', 'Sounds like rain'), jsonb_build_object('label', 'Sounds like dry beans in a can'), jsonb_build_object('label', 'Sounds like keys')), 'objectiveIds', jsonb_build_array((SELECT o.id FROM learning_objectives o JOIN curriculum_domains d ON d.id = o.domain_id JOIN curriculum_frameworks f ON f.id = d.framework_id WHERE f.source_key='ncf-framework' AND o.code = 'NCF-COM-05')))
FROM lesson_plans lp WHERE lp.organisation_id IS NULL AND lp.source_key = 'ncf-plan-sounds';

INSERT INTO lesson_steps (organisation_id, lesson_plan_id, position, step_type, title, body, duration_minutes, interactive_data)
SELECT NULL, lp.id, 6, 'dragdrop', 'Match the beans’ needs', 'Match each one to its friend — drag them into place.', 6,
  jsonb_build_object('question', 'Match the beans’ needs', 'items', jsonb_build_array(jsonb_build_object('label', 'Sun'), jsonb_build_object('label', 'Water'), jsonb_build_object('label', 'Soil')), 'targets', jsonb_build_array(jsonb_build_object('label', 'What shines down on us'), jsonb_build_object('label', 'What we pour on the beans'), jsonb_build_object('label', 'What the beans sit in')), 'objectiveIds', jsonb_build_array((SELECT o.id FROM learning_objectives o JOIN curriculum_domains d ON d.id = o.domain_id JOIN curriculum_frameworks f ON f.id = d.framework_id WHERE f.source_key='ncf-framework' AND o.code = 'NCF-KUW-09')))
FROM lesson_plans lp WHERE lp.organisation_id IS NULL AND lp.source_key = 'ncf-plan-garden';

INSERT INTO lesson_steps (organisation_id, lesson_plan_id, position, step_type, title, body, duration_minutes, interactive_data)
SELECT NULL, lp.id, 6, 'dragdrop', 'Match the helper to the job', 'Match each one to its friend — drag them into place.', 6,
  jsonb_build_object('question', 'Match the helper to the job', 'items', jsonb_build_array(jsonb_build_object('label', 'Nurse'), jsonb_build_object('label', 'Police officer'), jsonb_build_object('label', 'Librarian')), 'targets', jsonb_build_array(jsonb_build_object('label', 'Looks after sick people'), jsonb_build_object('label', 'Keeps everyone safe'), jsonb_build_object('label', 'Helps us find books')), 'objectiveIds', jsonb_build_array((SELECT o.id FROM learning_objectives o JOIN curriculum_domains d ON d.id = o.domain_id JOIN curriculum_frameworks f ON f.id = d.framework_id WHERE f.source_key='ncf-framework' AND o.code = 'NCF-KUW-10')))
FROM lesson_plans lp WHERE lp.organisation_id IS NULL AND lp.source_key = 'ncf-plan-helpers';
