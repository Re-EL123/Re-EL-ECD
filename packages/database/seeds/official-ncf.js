'use strict';

/**
 * The Official NCF pack: a play-based starter curriculum aligned to the
 * South African National Curriculum Framework for children from birth to four
 * (Department of Basic Education, 2015, comprehensive 2018).
 *
 * Rows carry NULL organisation_id (the same convention as the platform-wide
 * South African ECD Learning Framework) and are therefore read-only for
 * tenants. Tenants opt in per centre; enabling copies nothing — it only
 * makes the official rows visible to that centre's curriculum views. "Adopt"
 * (POST /curriculum/adopt) clones a row into the tenant with source
 * attribution preserved.
 *
 * Everything here is idempotent: running the seed repeatedly updates rows in
 * place instead of duplicating them. Tenants never see drafts of this pack;
 * the catalogue owns it.
 */

const STEP_DEFS = require('./official-ncf-steps.json');
const SOURCE = 'ncf';
const VERSION = '1.0';
const BANDS = { infant: '0-18 months', toddler: '18-36 months', preschool: '3-4 years' };
const ELDA = {
  WELLBEING: 'Well-being',
  IDENTITY: 'Identity and Belonging',
  COMMUNICATION: 'Communication',
  MATHS: 'Exploring Mathematics',
  CREATIVITY: 'Creativity',
  WORLD: 'Knowledge and Understanding of the World'
};

const DOMAIN_DEFS = [
  [ELDA.WELLBEING, 'The key area of the NCF. Children are physically healthy, emotionally secure, self-regulated and safe in their bodies and environments. Play, responsive care and predictable routines are the strongest levers.', 0],
  [ELDA.IDENTITY, 'Children know who they are: name, age, family, home language, culture and belonging to their family, classroom and community. Feeling like they belong is the foundation for all learning.', 1],
  [ELDA.COMMUNICATION, 'Listening, speaking and the early seeds of reading and writing grow through responsive conversation, picture books, songs, rhymes and mark making.', 2],
  [ELDA.MATHS, 'Number, counting, shape, pattern, space, measurement and simple problem solving — explored concretely through play, routines and everyday objects.', 3],
  [ELDA.CREATIVITY, 'Music, movement, visual art, dramatic and imaginative play as ways to express, represent and make sense of the world.', 4],
  [ELDA.WORLD, 'People, families, communities, living things, materials, technology and natural phenomena — observation, curiosity and first scientific thinking.', 5]
];

// [elda, code, description, context]
const OBJECTIVE_DEFS = [
  // Well-being — NCF-WB-01..12
  [ELDA.WELLBEING, 'NCF-WB-01', 'Calms and settles for a familiar adult when upset; shows signs of trust and attachment.', 'Floor play, caregiver routines'],
  [ELDA.WELLBEING, 'NCF-WB-02', 'Feeds, sleeps and wakes in a predictable rhythm with supportive care.', 'Mealtimes, nap time'],
  [ELDA.WELLBEING, 'NCF-WB-03', 'Uses hands to explore close objects; reaches, grasps, bangs and mouths safely.', 'Sensory exploration trays'],
  [ELDA.WELLBEING, 'NCF-WB-04', 'Holds head up, rolls, sits with less support, then stands and cruises.', 'Tummy time, gross motor play'],
  [ELDA.WELLBEING, 'NCF-WB-05', 'Expresses feelings with gestures and simple words ("mine", "want", "no") and notices others\' feelings.', 'Everyday routines, group circle'],
  [ELDA.WELLBEING, 'NCF-WB-06', 'Washes hands, brushes teeth and toilets with reminders and growing independence.', 'Hygiene routines'],
  [ELDA.WELLBEING, 'NCF-WB-07', 'Eats a variety of familiar foods and stays seated at snack and meal times.', 'Mealtimes'],
  [ELDA.WELLBEING, 'NCF-WB-08', 'Walks, runs, jumps, climbs and kicks with growing balance and control.', 'Outdoor play, movement'],
  [ELDA.WELLBEING, 'NCF-WB-09', 'Names own feelings, recognises others\' feelings and uses simple self-calming strategies.', 'Circle time, feelings activities'],
  [ELDA.WELLBEING, 'NCF-WB-10', 'Takes care of body and space with light support (dressing, tidying, washing).', 'Dressing, tidying, self-care'],
  [ELDA.WELLBEING, 'NCF-WB-11', 'Stands on one leg, hops, throws and catches with increasing coordination.', 'Outdoor physical play'],
  [ELDA.WELLBEING, 'NCF-WB-12', 'Knows and follows simple safety and health rules and can say why they matter.', 'Safety talks, snack helper jobs'],

  // Identity and Belonging — NCF-ID-01..12
  [ELDA.IDENTITY, 'NCF-ID-01', 'Responds to own name and recognises the faces of familiar caregivers and peers.', 'Arrival time, greeting circle'],
  [ELDA.IDENTITY, 'NCF-ID-02', 'Shows attachment: seeks familiar adults, is briefly upset at separation, settles on return.', 'Drop-off, pick-up'],
  [ELDA.IDENTITY, 'NCF-ID-03', 'Engages in back-and-forth play with a caregiver using smiles, sounds and gestures.', 'Floor play, lap games'],
  [ELDA.IDENTITY, 'NCF-ID-04', 'Recognises family photos and household members; babbles for greetings.', 'Family wall, books at story time'],
  [ELDA.IDENTITY, 'NCF-ID-05', 'Says own name, names family members and knows "mine".', 'Registration, family photos'],
  [ELDA.IDENTITY, 'NCF-ID-06', 'Joins family and cultural routines such as songs, greetings and celebrations.', 'Celebrations, songs, circle time'],
  [ELDA.IDENTITY, 'NCF-ID-07', 'Greets and says goodbye to others with support.', 'Arrival and departure routines'],
  [ELDA.IDENTITY, 'NCF-ID-08', 'Expresses preferences and choices ("I like", "I want", "no thank you").', 'Snack choice, free play'],
  [ELDA.IDENTITY, 'NCF-ID-09', 'Describes own family, culture, home language and what makes them special.', 'Family enquiry, show-and-tell'],
  [ELDA.IDENTITY, 'NCF-ID-10', 'Shows empathy and helping behaviour: comforts, shares, helps with support.', 'Peer play, tidy-up, buddy jobs'],
  [ELDA.IDENTITY, 'NCF-ID-11', 'Belongs to groups (classroom, games): uses names, takes turns, waits.', 'Group activities, group games'],
  [ELDA.IDENTITY, 'NCF-ID-12', 'Notices similarities and differences; asks questions about others without prejudice.', 'Community walks, diversity books'],

  // Communication — NCF-COM-01..12
  [ELDA.COMMUNICATION, 'NCF-COM-01', 'Coos and babbles; takes vocal turns with a caregiver (proto-conversation).', 'Face-to-face play, bath time'],
  [ELDA.COMMUNICATION, 'NCF-COM-02', 'Responds to own name and to simple gestures and words ("no", "bye", "more").', 'Everyday routines'],
  [ELDA.COMMUNICATION, 'NCF-COM-03', 'Points, reaches and vocalises to request objects and activities.', 'Snack, toy choice, play'],
  [ELDA.COMMUNICATION, 'NCF-COM-04', 'Enjoys songs, rhymes and picture books; looks at images for pleasure.', 'Song time, story corner'],
  [ELDA.COMMUNICATION, 'NCF-COM-05', 'Uses two- to three-word phrases ("want more", "all done"); names common objects.', 'Everyday routines, naming games'],
  [ELDA.COMMUNICATION, 'NCF-COM-06', 'Follows a two-step instruction ("pick up your cup and sit down").', 'Tidy-up, transitions'],
  [ELDA.COMMUNICATION, 'NCF-COM-07', 'Asks questions about objects and events ("what\'s this?", "who that?").', 'Exploration trays, outdoor walks'],
  [ELDA.COMMUNICATION, 'NCF-COM-08', 'Holds a book the right way up, turns pages and joins in repetitive phrases.', 'Story corner, library time'],
  [ELDA.COMMUNICATION, 'NCF-COM-09', 'Listens to stories and retells them in sequence with props.', 'Story circle, flannel board'],
  [ELDA.COMMUNICATION, 'NCF-COM-10', 'Uses full sentences with developing grammar; answers "why" and "how" questions.', 'Circle discussion, enquiry'],
  [ELDA.COMMUNICATION, 'NCF-COM-11', 'Recognises own written name and some familiar letters; makes meaningful marks.', 'Name cards, writing table'],
  [ELDA.COMMUNICATION, 'NCF-COM-12', 'Listens and responds during group conversations; takes turns speaking.', 'Group circle, group discussion'],

  // Exploring Mathematics — NCF-EM-01..12
  [ELDA.MATHS, 'NCF-EM-01', 'Explores cause and effect: bangs, shakes, stacks and drops objects to see what happens.', 'Discovery boxes, water play'],
  [ELDA.MATHS, 'NCF-EM-02', 'Notices and handles differences in shape, size and quantity of objects.', 'Shape sorters, stacking rings'],
  [ELDA.MATHS, 'NCF-EM-03', 'Fits shapes and objects into sorters; completes simple two-stage puzzles.', 'Shape sorters, simple puzzles'],
  [ELDA.MATHS, 'NCF-EM-04', 'Finds hidden objects (object permanence) and searches deliberately.', 'Peekaboo games, hide and seek'],
  [ELDA.MATHS, 'NCF-EM-05', 'Counts 1-3 items and matches small quantities to objects.', 'Counting during snack and tidy-up'],
  [ELDA.MATHS, 'NCF-EM-06', 'Sorts objects by one attribute (colour, size or shape).', 'Sorting trays, tidy-up jobs'],
  [ELDA.MATHS, 'NCF-EM-07', 'Understands positional words: in, on, under, next to.', 'Treasure basket games, obstacle play'],
  [ELDA.MATHS, 'NCF-EM-08', 'Knows big/small, more/less and one/many in everyday contexts.', 'Snack time, water play, block play'],
  [ELDA.MATHS, 'NCF-EM-09', 'Counts reliably to 10 and beyond with 1:1 correspondence.', 'Number circle, counting walk'],
  [ELDA.MATHS, 'NCF-EM-10', 'Sorts by two attributes and continues simple patterns (red-blue-red-blue).', 'Pattern beads, block play'],
  [ELDA.MATHS, 'NCF-EM-11', 'Names shapes (circle, square, triangle) and compares size, weight and time.', 'Shape hunts, baking, sand and water'],
  [ELDA.MATHS, 'NCF-EM-12', 'Solves simple problems with concrete materials (building, sharing, grouping).', 'Block play, sharing snacks'],

  // Creativity — NCF-CRA-01..12
  [ELDA.CREATIVITY, 'NCF-CRA-01', 'Responds to music with bouncing, clapping and moving the body.', 'Music and movement time'],
  [ELDA.CREATIVITY, 'NCF-CRA-02', 'Makes marks with crayons and paints; experiments with colour and shape.', 'Mark-making table, easel'],
  [ELDA.CREATIVITY, 'NCF-CRA-03', 'Explores new textures, materials and mess with adult support.', 'Sensory trays, messy play'],
  [ELDA.CREATIVITY, 'NCF-CRA-04', 'Joins in finger plays and action rhymes with gestures.', 'Song time, rhyme time'],
  [ELDA.CREATIVITY, 'NCF-CRA-05', 'Sings, claps and moves to music with peers and grown-ups.', 'Music circle, action songs'],
  [ELDA.CREATIVITY, 'NCF-CRA-06', 'Creates pictures with intended meaning and talks about them.', 'Drawing table, painting wall'],
  [ELDA.CREATIVITY, 'NCF-CRA-07', 'Uses materials in pretend play (drinks from empty cup, feeds doll).', 'Role-play corner'],
  [ELDA.CREATIVITY, 'NCF-CRA-08', 'Builds and creates with blocks, playdough, sand and collage materials.', 'Block area, creative corner'],
  [ELDA.CREATIVITY, 'NCF-CRA-09', 'Creates original artwork and richer pretend scenarios with peers.', 'Creative corner, dramatic play'],
  [ELDA.CREATIVITY, 'NCF-CRA-10', 'Sings known songs, keeps a beat, plays simple instruments (shakers, drums).', 'Music ring'],
  [ELDA.CREATIVITY, 'NCF-CRA-11', 'Tells and invents stories; joins in drama and role play.', 'Story corner, dramatic play'],
  [ELDA.CREATIVITY, 'NCF-CRA-12', 'Chooses, talks about and displays own creative work.', 'Gallery walk, portfolio'],

  // Knowledge and Understanding of the World — NCF-KUW-01..12
  [ELDA.WORLD, 'NCF-KUW-01', 'Explores the world through senses: safe tastes, textures, sounds and sights.', 'Sensory play, outdoor time'],
  [ELDA.WORLD, 'NCF-KUW-02', 'Shows curiosity at new objects, people and events; watches intently.', 'Discovery trays, walks'],
  [ELDA.WORLD, 'NCF-KUW-03', 'Understands simple cause and effect from daily experiments.', 'Water play, stacking and knocking down'],
  [ELDA.WORLD, 'NCF-KUW-04', 'Notices weather, animals, plants and natural events in daily life.', 'Outdoor walks, weather chart'],
  [ELDA.WORLD, 'NCF-KUW-05', 'Groups things into families: animals, plants, vehicles, household objects.', 'Sorting trays, picture books'],
  [ELDA.WORLD, 'NCF-KUW-06', 'Asks "why?" and "what\'s that?" about the world around them.', 'Enquiry during walks and routines'],
  [ELDA.WORLD, 'NCF-KUW-07', 'Knows and names common household objects and what they are used for.', 'Practical life, role play'],
  [ELDA.WORLD, 'NCF-KUW-08', 'Uses simple tools with support (spoons, brushes, scoops, stacking cups).', 'Practical life, water and sand'],
  [ELDA.WORLD, 'NCF-KUW-09', 'Explores nature directly: gardening, insects, worms, leaves, bird feeding.', 'Nature table, garden, walks'],
  [ELDA.WORLD, 'NCF-KUW-10', 'Describes places in their world: home, school, shops, parks, transport.', 'Walks, maps, community helpers'],
  [ELDA.WORLD, 'NCF-KUW-11', 'Uses simple technology with growing skill (tap screen, drag, build, sort).', 'Carefully chosen screen activities'],
  [ELDA.WORLD, 'NCF-KUW-12', 'Understands time words (day/night, yesterday/today, seasons, weather).', 'Weather chart, calendar circle']
];

// [key, title, description, theme, durationWeeks]
const MODULE_DEFS = [
  ['ncf-module-myself', 'Myself and My World',
    'A four-week journey about who the children are: names, families, feelings, bodies, belonging and the routines that make them safe. Deeply play-based, heavy on songs, photos, mirrors and talk.',
    'Identity and well-being', 4],
  ['ncf-module-sounds', 'Sounds, Songs and Stories',
    'Songs, rhymes, picture books, sound walks and mark making. Builds listening, speaking, early reading and writing, and joy in stories — for babies through to four-year-olds.',
    'Communication', 4],
  ['ncf-module-counting', 'Counting, Shapes and Play',
    'Concrete number work through play: counting real objects, sorting, patterns, shapes and simple problem solving. Every concept is handled with children\'s own hands first.',
    'Exploring mathematics', 4],
  ['ncf-module-world', 'Our Wonderful World',
    'Nature, community helpers, weather, gardens and the rhythm of the seasons. Feeds curiosity and first scientific thinking while strengthening identity and belonging.',
    'Knowledge and understanding', 4]
];

// [moduleKey, key, title, theme, objectiveCodes, preparationNotes]
const PLAN_DEFS = [
  ['ncf-module-myself', 'ncf-plan-welcome', 'Welcome to Our Centre', 'Belonging',
    ['NCF-ID-01', 'NCF-ID-02', 'NCF-ID-05', 'NCF-WB-02', 'NCF-WB-06'],
    'Prepare a family photo wall, a name chart for each child, greeting song, and a soft settling-in corner with comfort objects. Greet each child individually at arrival.'],
  ['ncf-module-myself', 'ncf-plan-family', 'My Family and Me', 'Identity',
    ['NCF-ID-04', 'NCF-ID-05', 'NCF-ID-09', 'NCF-COM-05'],
    'Invite families to send 2-3 photos from home. Set up the family wall, story basket with clothing from different cultures, and crayons for self-portraits.'],
  ['ncf-module-myself', 'ncf-plan-feelings', 'Big Feelings, Little Calm', 'Well-being',
    ['NCF-WB-05', 'NCF-WB-09', 'NCF-ID-10', 'NCF-COM-12'],
    'Collect feelings faces cards (draw your own), a calm corner with cushions and sensory bottle, and a feelings mirror. Practise naming feelings during circle time.'],
  ['ncf-module-myself', 'ncf-plan-belong', 'We All Belong', 'Identity',
    ['NCF-ID-09', 'NCF-ID-10', 'NCF-ID-11', 'NCF-ID-12', 'NCF-WB-11'],
    'Prepare books showing diverse families, a fairness game (taking turns with a beloved toy), and a group mural: "Our Class Family". Plan a community walk if possible.'],
  ['ncf-module-myself', 'ncf-plan-healthy', 'Healthy Bodies', 'Well-being',
    ['NCF-WB-06', 'NCF-WB-10', 'NCF-WB-12', 'NCF-ID-08'],
    'Set up a pretend doctor role play, washing hands poster with photos of your children, and a snack-time helpers job chart. Celebrate tiny wins loudly.'],

  ['ncf-module-sounds', 'ncf-plan-rhyme', 'Rhyme Time', 'Language and music',
    ['NCF-COM-01', 'NCF-COM-04', 'NCF-CRA-04', 'NCF-CRA-10'],
    'Choose 3 familiar rhymes with hand actions; record or loop them softly during arrival. Gather shakers and drums. Print rhyme cards with big pictures.'],
  ['ncf-module-sounds', 'ncf-plan-story', 'Story Circle', 'Literacy',
    ['NCF-COM-08', 'NCF-COM-09', 'NCF-COM-12', 'NCF-CRA-11'],
    'Pick one storybook for the whole week; use a flannel board or props so children act it out each day. Add a book corner basket with related small world figures.'],
  ['ncf-module-sounds', 'ncf-plan-sounds', 'Sound Search', 'Listening',
    ['NCF-KUW-02', 'NCF-KUW-04', 'NCF-COM-02', 'NCF-COM-05'],
    'Plan a "sound walk" around the centre or garden. Prepare sound jars (rice, paper clips, stones, beans). Create a listening map to mark what you heard.'],
  ['ncf-module-sounds', 'ncf-plan-letters', 'My Name, My Marks', 'Pre-writing',
    ['NCF-COM-11', 'NCF-CRA-02', 'NCF-CRA-06', 'NCF-COM-05'],
    'Make name cards for every child; set out mark-making tables with interest trays (sand, salt, shaving foam, chalk). Praise effort, never neatness.'],
  ['ncf-module-sounds', 'ncf-plan-songs', 'Songs from My Home', 'Language and culture',
    ['NCF-COM-01', 'NCF-COM-04', 'NCF-ID-06', 'NCF-CRA-10'],
    'Ask every family for one song in any home language; write or record them. Invite a parent to sing with the children. Celebrate every language equally.'],

  ['ncf-module-counting', 'ncf-plan-numbers', 'Numbers in Our Day', 'Number',
    ['NCF-EM-05', 'NCF-EM-08', 'NCF-EM-09'],
    'Build a number parade: counting out cups, steps, claps and jumps through the day. Snack time becomes counting time. Keep it joyful and concrete.'],
  ['ncf-module-counting', 'ncf-plan-shapes', 'Shape Hunt', 'Geometry',
    ['NCF-EM-03', 'NCF-EM-06', 'NCF-EM-11', 'NCF-KUW-02'],
    'Hide shape cards around the classroom; give each shape a monster name ("Circle-face"). Set up shape-sorting trays and shape-side paint printing.'],
  ['ncf-module-counting', 'ncf-plan-patterns', 'Pattern Beads', 'Pattern',
    ['NCF-EM-10', 'NCF-EM-06', 'NCF-CRA-08', 'NCF-EM-12'],
    'String big beads in patterns (red-blue-red); children continue yours and invent their own. Make pattern snakes and pattern mats for the art table.'],
  ['ncf-module-counting', 'ncf-plan-counting-walk', 'Counting Walk', 'Number outdoors',
    ['NCF-EM-09', 'NCF-KUW-02', 'NCF-KUW-09', 'NCF-COM-07'],
    'Walk to count leaves, gates, pillars, birds and stones; tally with chalk on clipboards. Count backwards when returning from the gate.'],
  ['ncf-module-counting', 'ncf-plan-blocks', 'Blocks and Balance', 'Problem solving',
    ['NCF-EM-06', 'NCF-EM-12', 'NCF-CRA-08', 'NCF-WB-11'],
    'Provide big hollow blocks, small solid blocks, ramps and tubes. Introduce challenges: "Build a tower taller than you" and "Build a bridge for the car".'],

  ['ncf-module-world', 'ncf-plan-nature', 'Nature Detectives', 'Nature',
    ['NCF-KUW-01', 'NCF-KUW-02', 'NCF-KUW-09', 'NCF-COM-12'],
    'Magnifying glasses, bug viewers, collection trays and identification cards with simple pictures. Agree gentle rules: look, don\'t squash.'],
  ['ncf-module-world', 'ncf-plan-weather', 'Rain or Sunshine', 'Weather',
    ['NCF-KUW-04', 'NCF-KUW-12', 'NCF-COM-09', 'NCF-CRA-06'],
    'Start a weather chart the children fill in daily. Paint rain clouds vs sun umbrellas. Sing "Rain rain go away" and compare weather words.'],
  ['ncf-module-world', 'ncf-plan-helpers', 'Helpers in Our Community', 'Community',
    ['NCF-KUW-10', 'NCF-ID-11', 'NCF-COM-10', 'NCF-ID-07'],
    'Visitor from the community (nurse, police, refuse collector, librarian) if possible; otherwise picture books and role-play uniforms and equipment.'],
  ['ncf-module-world', 'ncf-plan-garden', 'Gardens and Growing', 'Nature and care',
    ['NCF-KUW-09', 'NCF-KUW-08', 'NCF-WB-10', 'NCF-EM-05'],
    'Plant fast-growing beans in cups (child-labelled); water daily. Start a compost bucket for kitchen scraps. Watch roots grow through clear cups.'],
  ['ncf-module-world', 'ncf-plan-neighbours', 'Home and Neighbours', 'Community',
    ['NCF-KUW-07', 'NCF-KUW-10', 'NCF-ID-09', 'NCF-ID-11'],
    'Build a model street from boxes and bottle caps; walk it with toy people from different "homes". Talk about neighbours: who lives next door?']
];

// [key, title, description, ageGroup, durationMinutes, materials, safetyNotes, activityType]
const ACTIVITY_DEFS = [
  ['ncf-activity-rice', 'Sensory Rice Play', 'Coloured rice with scoops, funnels and small toys for pouring and scooping.', '0-4 years', 30, 'Rice, food colouring, trays, cups, scoops', 'Supervise closely; keep rice out of the mouth where possible.', 'sensory'],
  ['ncf-activity-dough', 'Playdough Letters and Numbers', 'Children roll and shape letters and numbers from their names, with teacher modelling.', '2-4 years', 25, 'Playdough, letter mats, tools', 'Check dough ingredients for allergies.', 'creative'],
  ['ncf-activity-paint-mix', 'Colour Mixing Station', 'Finger paints to mix primary colours and discover secondary colours.', '1-4 years', 30, 'Washable paint, trays, paper, aprons', 'Washable paint only; aprons on; floor protected.', 'creative'],
  ['ncf-activity-caps', 'Counting Bottle Caps', 'Counting, matching and grouping with washed bottle caps.', '2-4 years', 20, 'Clean bottle caps, number cards, trays', 'Cap choking check: only large caps for under-twos.', 'numeracy'],
  ['ncf-activity-story-props', 'Story Circle with Props', 'Teacher reads a story; children retell with props and flannel pieces.', '18 months-4 years', 20, 'Book, props, flannel board', 'None', 'literacy'],
  ['ncf-activity-action-songs', 'Action Songs and Rhymes', 'Familiar songs with hand and whole-body actions.', '0-4 years', 15, 'Shakers, tambourines, recorded music', 'None', 'music'],
  ['ncf-activity-nature-walk', 'Nature Walk with Magnifying Glasses', 'Slow walk; notice and name living things; collect treasures.', '1-4 years', 40, 'Magnifying glasses, collection bags, clipboards', 'Stay with an adult; sunscreen and hats; insect respect.', 'outdoor'],
  ['ncf-activity-feelings-mirror', 'Feelings Mirrors', 'Children look at mirrors, make feelings faces, match feelings cards.', '18 months-4 years', 20, 'Unbreakable mirrors, feelings flashcards', 'Unbreakable mirrors only.', 'quiet'],
  ['ncf-activity-blocks-balance', 'Blocks and Balance Challenge', 'Guided block challenges: towers, bridges and towers taller than you.', '18 months-4 years', 30, 'Hollow and solid blocks, ramps, tubes', 'Feet clear of towers; stack with two hands.', 'physical'],
  ['ncf-activity-water-play', 'Water Play Trays', 'Pouring, scooping, sink-or-float investigation.', '1-4 years', 30, 'Water tray, jugs, cups, sink/float items', 'Never leave water unsupervised; mop slippery floors.', 'sensory'],
  ['ncf-activity-leaf-printing', 'Leaf Printing', 'Collect leaves, paint and print to reveal vein patterns.', '2-4 years', 30, 'Leaves, paint, paper, brushes', 'Wash hands after painting.', 'creative'],
  ['ncf-activity-sound-bottles', 'Sound Bottles', 'Fill clear bottles with rice, clips, stones; shake and compare.', '1-4 years', 25, 'Clear bottles, rice, stones, clips, tape', 'Secure lids firmly with tape.', 'music'],
  ['ncf-activity-sorting-trays', 'Sorting Trays', 'Sort shells, buttons and stones by colour, size and shape.', '18 months-4 years', 20, 'Shells/buttons/stones, trays, tongs', 'Button check: none small enough to swallow for under-threes.', 'numeracy'],
  ['ncf-activity-giggle-yoga', 'Giggle Yoga', 'Animal-shaped movements: frog jumps, cat stretches, bear walks, elephant trunk twists.', '1-4 years', 15, 'Space, soft music', 'None', 'physical'],
  ['ncf-activity-family-wall', 'Family Photo Wall', 'Children place their family photos on the wall and tell the class.', '18 months-4 years', 20, 'Photos from home, wall space, name labels', 'Check photo permissions with families first.', 'quiet'],
  ['ncf-activity-snack-helpers', 'Snack Time Little Helpers', 'Children help set tables, distribute cups or serve fruit with clean hands.', '18 months-4 years', 20, 'Aprons, child-safe knives (supervised), fruit', 'Hand washing first; child-safe tools only; gloves/allergies checked.', 'outdoor']
];

/** NCF age band from the objective number: 01-04 infant, 05-08 toddler, 09-12 preschool. */
function bandForCode(code) {
  const n = Number(String(code).split('-')[2]);
  if (n <= 4) return BANDS.infant;
  if (n <= 8) return BANDS.toddler;
  return BANDS.preschool;
}

module.exports = { SOURCE, VERSION, DOMAIN_DEFS, OBJECTIVE_DEFS, MODULE_DEFS, PLAN_DEFS, ACTIVITY_DEFS, BANDS, ELDA, bandForCode };

/**
 * Idempotently upsert the official pack. Safe to call on every catalogue
 * seed (including Vercel cold starts) and from scripts/seed-ncf.js.
 */
async function seedOfficialNcf(pool) {
  const { DOMAIN_DEFS, OBJECTIVE_DEFS, MODULE_DEFS, PLAN_DEFS, ACTIVITY_DEFS, SOURCE, VERSION, bandForCode } = module.exports;
  const db = pool || (await require('../index').getPool());
  const one = (sql, params) => db.query(sql, params).then((r) => r.rows[0] || null);
  const many = (sql, params) => db.query(sql, params).then((r) => r.rows);

  // --- framework -------------------------------------------------------------
  let framework = await one(
    'SELECT * FROM curriculum_frameworks WHERE organisation_id IS NULL AND source_key = $1',
    ['ncf-framework']
  );
  const frameworkName = 'South African National Curriculum Framework (Birth to Four)';
  const frameworkDescription = 'Official starter curriculum aligned to the NCF — play-based, DBE context. Content drafted by Re-EL ECD and reviewed against the National Curriculum Framework for Children from Birth to Four (© Department of Basic Education, 2015). Edited and curated by your centre once adopted.';
  if (!framework) {
    framework = await one(
      `INSERT INTO curriculum_frameworks (organisation_id, name, version, description, status, source, source_version, source_key)
       VALUES (NULL,$1,$2,$3,'active',$4,$5,'ncf-framework') RETURNING *`,
      [frameworkName, VERSION, frameworkDescription, SOURCE, VERSION]
    );
  } else {
    await db.query(
      `UPDATE curriculum_frameworks SET name = $1, description = $2, version = $3, status = 'active', source = $4, source_version = $5 WHERE id = $6`,
      [frameworkName, frameworkDescription, VERSION, SOURCE, VERSION, framework.id]
    );
  }

  // --- domains ----------------------------------------------------------------
  const domainIds = {};
  for (const [name, description, sortOrder] of DOMAIN_DEFS) {
    let domain = await one(
      'SELECT * FROM curriculum_domains WHERE framework_id = $1 AND name = $2',
      [framework.id, name]
    );
    if (!domain) {
      domain = await one(
        'INSERT INTO curriculum_domains (framework_id, name, description, sort_order) VALUES ($1,$2,$3,$4) RETURNING *',
        [framework.id, name, description, sortOrder]
      );
    } else {
      await db.query(
        'UPDATE curriculum_domains SET description = $1, sort_order = $2 WHERE id = $3',
        [description, sortOrder, domain.id]
      );
    }
    domainIds[name] = domain.id;
  }

  // --- objectives ---------------------------------------------------------------
  const objectiveIdsByCode = {};
  const frameworkCodes = await many(
    `SELECT o.code, o.id FROM learning_objectives o
     JOIN curriculum_domains d ON d.id = o.domain_id
     WHERE d.framework_id = $1`,
    [framework.id]
  );
  for (const row of frameworkCodes) objectiveIdsByCode[row.code] = row.id;
  for (const [domainName, code, description, context] of OBJECTIVE_DEFS) {
    const ageGroup = bandForCode(code);
    const domainId = domainIds[domainName];
    if (objectiveIdsByCode[code]) {
      await db.query(
        `UPDATE learning_objectives SET domain_id = $1, age_group = $2, description = $3, expected_observation_context = $4, status = 'active' WHERE id = $5`,
        [domainId, ageGroup, description, context, objectiveIdsByCode[code]]
      );
    } else {
      const row = await one(
        `INSERT INTO learning_objectives (domain_id, age_group, code, description, expected_observation_context, status)
         VALUES ($1,$2,$3,$4,$5,'active') RETURNING id`,
        [domainId, ageGroup, code, description, context]
      );
      objectiveIdsByCode[code] = row.id;
    }
  }

  // --- modules -------------------------------------------------------------------
  const moduleIds = {};
  for (const [key, title, description, theme, weeks] of MODULE_DEFS) {
    let module = await one(
      'SELECT * FROM learning_modules WHERE organisation_id IS NULL AND source_key = $1',
      [key]
    );
    if (!module) {
      module = await one(
        `INSERT INTO learning_modules (organisation_id, title, description, theme, age_group, duration_weeks, status, source, source_version, source_key)
         VALUES (NULL,$1,$2,$3,NULL,$4,'published',$5,$6,$7) RETURNING *`,
        [title, description, theme, weeks, SOURCE, VERSION, key]
      );
    } else {
      await db.query(
        `UPDATE learning_modules SET title = $1, description = $2, theme = $3, duration_weeks = $4, status = 'published', source = $5, source_version = $6 WHERE id = $7`,
        [title, description, theme, weeks, SOURCE, VERSION, module.id]
      );
    }
    moduleIds[key] = module.id;
  }

  // --- activities -----------------------------------------------------------------
  const activityIds = {};
  for (const [key, title, description, ageGroup, duration, materials, safety, type] of ACTIVITY_DEFS) {
    let activity = await one(
      'SELECT * FROM activities WHERE organisation_id IS NULL AND source_key = $1',
      [key]
    );
    if (!activity) {
      activity = await one(
        `INSERT INTO activities (organisation_id, branch_id, title, description, age_group, duration_minutes, materials, safety_notes, activity_type, status, source, source_version, source_key)
         VALUES (NULL,NULL,$1,$2,$3,$4,$5,$6,$7,'active',$8,$9,$10) RETURNING *`,
        [title, description, ageGroup, duration, materials, safety, type, SOURCE, VERSION, key]
      );
    } else {
      await db.query(
        `UPDATE activities SET title = $1, description = $2, age_group = $3, duration_minutes = $4, materials = $5, safety_notes = $6, activity_type = $7, status = 'active', source = $8, source_version = $9 WHERE id = $10`,
        [title, description, ageGroup, duration, materials, safety, type, SOURCE, VERSION, activity.id]
      );
    }
    activityIds[key] = activity.id;
  }

  // --- plans ------------------------------------------------------------------------
  const plansPerModule = {};
  const planIdsByKey = {};
  for (const [moduleKey, key, title, theme, objectiveCodes, notes] of PLAN_DEFS) {
    const objectiveIds = objectiveCodes.map((code) => objectiveIdsByCode[code]).filter(Boolean);
    let plan = await one(
      'SELECT * FROM lesson_plans WHERE organisation_id IS NULL AND source_key = $1',
      [key]
    );
    if (!plan) {
      plan = await one(
        `INSERT INTO lesson_plans (organisation_id, branch_id, classroom_id, academic_period_id, title, theme, objective_ids, preparation_notes, status, module_id, source, source_version, source_key)
         VALUES (NULL,NULL,NULL,NULL,$1,$2,$3,$4,'published',$5,$6,$7,$8) RETURNING *`,
        [title, theme, JSON.stringify(objectiveIds), notes, moduleIds[moduleKey] || null, SOURCE, VERSION, key]
      );
    } else {
      await db.query(
        `UPDATE lesson_plans SET title = $1, theme = $2, objective_ids = $3, preparation_notes = $4, status = 'published', module_id = $5, source = $6, source_version = $7 WHERE id = $8`,
        [title, theme, JSON.stringify(objectiveIds), notes, moduleIds[moduleKey] || null, SOURCE, VERSION, plan.id]
      );
    }
    plansPerModule[moduleKey] = (plansPerModule[moduleKey] || 0) + 1;
    await db.query(
      'UPDATE lesson_plans SET module_position = $1 WHERE id = $2',
      [plansPerModule[moduleKey], plan.id]
    );
    planIdsByKey[key] = plan.id;
  }

  // --- steps -----------------------------------------------------------------------
  const stepsByPlan = {};
  for (const step of STEP_DEFS) {
    if (!stepsByPlan[step.plan]) stepsByPlan[step.plan] = [];
    stepsByPlan[step.plan].push(step);
  }
  let stepCount = 0;
  for (const [planKey, steps] of Object.entries(stepsByPlan)) {
    const planId = planIdsByKey[planKey];
    if (!planId) continue;
    await db.query('DELETE FROM lesson_steps WHERE lesson_plan_id = $1', [planId]);
    for (const step of steps) {
      await db.query(
        `INSERT INTO lesson_steps (organisation_id, lesson_plan_id, position, step_type, title, body, duration_minutes)
         VALUES (NULL,$1,$2,$3,$4,$5,$6)`,
        [planId, step.position, step.type, step.title, step.body, step.durationMinutes || null]
      );
      stepCount += 1;
    }
  }

  return { framework: frameworkName, version: VERSION, steps: stepCount };
}

module.exports.seedOfficialNcf = seedOfficialNcf;
