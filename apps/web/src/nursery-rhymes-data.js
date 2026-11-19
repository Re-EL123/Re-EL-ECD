'use strict';

/**
 * Nursery rhyme library — traditional, public-domain verses.
 *
 * The titles were gathered from TunePocket's nursery-rhyme collections as a
 * reference for what centres actually use. The lyrics below are the classic
 * traditional verses (public domain, variants exist by region) written out in
 * full so teachers can read, sing and print them without hunting for missing
 * stanzas. TunePocket's own page copy, audio previews and lyric compilations
 * are NOT reproduced. Each entry links to TunePocket where a centre can
 * license audio separately if it wants backing tracks.
 *
 * Modern copyrighted songs (e.g. Baby Shark, Happy Birthday, Johnny Johnny)
 * are deliberately excluded.
 */
(function () {
  const R = window.Reel = window.Reel || {};
  const AUDIO_BASE = 'https://www.tunepocket.com/nursery-rhymes/';
  const POPULAR_BASE = 'https://www.tunepocket.com/most-popular-nursery-rhymes/';
  const CHILDREN_BASE = 'https://www.tunepocket.com/music-children-video/';

  const rhymes = [
    { id: 'twinkle', title: 'Twinkle, Twinkle, Little Star', category: 'Lullabies', source: 'https://www.tunepocket.com/royalty-free-music/twinkle-twinkle-little-star/',
      lyrics: [
        'Twinkle, twinkle, little star,',
        'How I wonder what you are!',
        'Up above the world so high,',
        'Like a diamond in the sky.',
        '',
        'When the blazing sun is gone,',
        'When he nothing shines upon,',
        'Then you show your little light,',
        'Twinkle, twinkle, all the night.',
        '',
        'Then the traveller in the dark',
        'Thanks you for your tiny spark;',
        'He could not see which way to go',
        'If you did not twinkle so.',
        '',
        'In the dark blue sky you keep,',
        'And often through my curtains peep,',
        'For you never shut your eye',
        'Till the sun is in the sky.',
        '',
        'As your bright and tiny spark',
        'Lights the traveller in the dark,',
        'Though I know not what you are,',
        'Twinkle, twinkle, little star.',
        '',
        'Twinkle, twinkle, little star,',
        'How I wonder what you are!'
      ], actions: 'Wiggle fingers like stars; whisper the last line.' },

    { id: 'mary-lamb', title: 'Mary Had a Little Lamb', category: 'Animals', source: 'https://www.tunepocket.com/royalty-free-music/mary-had-little-lamb/',
      lyrics: [
        'Mary had a little lamb,',
        'Its fleece was white as snow;',
        'And everywhere that Mary went',
        'The lamb was sure to go.',
        '',
        'He followed her to school one day,',
        'Which was against the rule;',
        'It made the children laugh and play',
        'To see a lamb at school.',
        '',
        'And so the teacher turned him out,',
        'But still he lingered near,',
        'And waited patiently about',
        'Till Mary did appear.',
        '',
        'Why does the lamb love Mary so?',
        'The eager children cry.',
        'Why, Mary loves the lamb, you know,',
        'The teacher did reply.'
      ], actions: 'Let children take turns being Mary and the lamb.' },

    { id: 'old-macdonald', title: 'Old MacDonald Had a Farm', category: 'Animals', source: 'https://www.tunepocket.com/royalty-free-music/old-macdonald-had-a-farm-acoustic/',
      lyrics: [
        'Old MacDonald had a farm, E-I-E-I-O!',
        'And on his farm he had a cow, E-I-E-I-O!',
        'With a moo-moo here and a moo-moo there,',
        'Here a moo, there a moo, everywhere a moo-moo.',
        'Old MacDonald had a farm, E-I-E-I-O!',
        '',
        'And on his farm he had a pig, E-I-E-I-O!',
        'With an oink-oink here and an oink-oink there,',
        'Here an oink, there an oink, everywhere an oink-oink.',
        'Old MacDonald had a farm, E-I-E-I-O!',
        '',
        'And on his farm he had a duck, E-I-E-I-O!',
        'With a quack-quack here and a quack-quack there,',
        'Here a quack, there a quack, everywhere a quack-quack.',
        'Old MacDonald had a farm, E-I-E-I-O!',
        '',
        'And on his farm he had a dog, E-I-E-I-O!',
        'With a woof-woof here and a woof-woof there,',
        'Here a woof, there a woof, everywhere a woof-woof.',
        'Old MacDonald had a farm, E-I-E-I-O!',
        '',
        'And on his farm he had a cat, E-I-E-I-O!',
        'With a meow-meow here and a meow-meow there,',
        'Here a meow, there a meow, everywhere a meow-meow.',
        'Old MacDonald had a farm, E-I-E-I-O!',
        '',
        'And on his farm he had a horse, E-I-E-I-O!',
        'With a neigh-neigh here and a neigh-neigh there,',
        'Here a neigh, there a neigh, everywhere a neigh-neigh.',
        'Old MacDonald had a farm, E-I-E-I-O!'
      ], actions: 'Add a new animal and sound on every verse.' },

    { id: 'itsy-bitsy', title: 'The Itsy-Bitsy Spider', category: 'Actions', source: 'https://www.tunepocket.com/royalty-free-music/itsy-bitsy-spider/',
      lyrics: [
        'The itsy-bitsy spider climbed up the water spout.',
        'Down came the rain and washed the spider out.',
        'Out came the sun and dried up all the rain,',
        'And the itsy-bitsy spider climbed up the spout again.'
      ], actions: 'Fingers climb, rain fingers fall, sun hands open wide.' },

    { id: 'wheels-bus', title: 'The Wheels on the Bus', category: 'Actions', source: 'https://www.tunepocket.com/royalty-free-music/wheels-on-the-bus-acoustic/',
      lyrics: [
        'The wheels on the bus go round and round,',
        'Round and round, round and round.',
        'The wheels on the bus go round and round,',
        'All through the town.',
        '',
        'The wipers on the bus go swish, swish, swish,',
        'Swish, swish, swish, swish, swish, swish.',
        'The wipers on the bus go swish, swish, swish,',
        'All through the town.',
        '',
        'The horn on the bus goes beep, beep, beep,',
        'Beep, beep, beep, beep, beep, beep.',
        'The horn on the bus goes beep, beep, beep,',
        'All through the town.',
        '',
        'The babies on the bus go wah, wah, wah,',
        'Wah, wah, wah, wah, wah, wah.',
        'The babies on the bus go wah, wah, wah,',
        'All through the town.',
        '',
        'The people on the bus go up and down,',
        'Up and down, up and down.',
        'The people on the bus go up and down,',
        'All through the town.',
        '',
        'The driver on the bus says move on back,',
        'Move on back, move on back.',
        'The driver on the bus says move on back,',
        'All through the town.'
      ], actions: 'Act out wheels, wipers, horn and babies.' },

    { id: 'baa-baa', title: 'Baa, Baa, Black Sheep', category: 'Animals', source: 'https://www.tunepocket.com/royalty-free-music/baa-baa-black-sheep/',
      lyrics: [
        'Baa, baa, black sheep,',
        'Have you any wool?',
        'Yes sir, yes sir,',
        'Three bags full.',
        '',
        'One for the master,',
        'One for the dame,',
        'And one for the little boy',
        'Who lives down the lane.'
      ], actions: 'Hold up three fingers for the three bags.' },

    { id: 'row-boat', title: 'Row, Row, Row Your Boat', category: 'Actions', source: 'https://www.tunepocket.com/royalty-free-music/row-row-row-your-boat/',
      lyrics: [
        'Row, row, row your boat',
        'Gently down the stream.',
        'Merrily, merrily, merrily, merrily,',
        'Life is but a dream.',
        '',
        'Row, row, row your boat',
        'Gently down the stream.',
        'If you see a crocodile,',
        'Don’t forget to scream!'
      ], actions: 'Pairs hold hands and row together, leaning back on “merrily”.' },

    { id: 'abc-song', title: 'The Alphabet Song (ABC)', category: 'Learning', source: 'https://www.tunepocket.com/royalty-free-music/alphabet-song/',
      lyrics: [
        'A, B, C, D, E, F, G,',
        'H, I, J, K, L, M, N, O, P,',
        'Q, R, S, T, U, V,',
        'W, X, Y and Z.',
        '',
        'Now I know my A, B, C,',
        'Next time won’t you sing with me?'
      ], actions: 'Point to each letter as the children sing.' },

    { id: 'rain-rain', title: 'Rain, Rain, Go Away', category: 'Weather', source: 'https://www.tunepocket.com/royalty-free-music/rain-rain-go-away/',
      lyrics: [
        'Rain, rain, go away,',
        'Come again another day.',
        'Little children want to play,',
        'Rain, rain, go away.',
        '',
        'Rain, rain, go away,',
        'Come again another day.',
        'All the family wants to play,',
        'Rain, rain, go away.'
      ], actions: 'Wave goodbye to the rain with both hands.' },

    { id: 'head-shoulders', title: 'Head, Shoulders, Knees and Toes', category: 'Actions', source: 'https://www.tunepocket.com/royalty-free-music/head-shoulders-knees-and-toes/',
      lyrics: [
        'Head, shoulders, knees and toes,',
        'Knees and toes.',
        'Head, shoulders, knees and toes,',
        'Knees and toes.',
        '',
        'And eyes and ears and mouth and nose.',
        'Head, shoulders, knees and toes,',
        'Knees and toes.'
      ], actions: 'Touch each body part; sing it faster each round.' },

    { id: 'hickory-dickory', title: 'Hickory Dickory Dock', category: 'Time', source: 'https://www.tunepocket.com/royalty-free-music/hickory-dickory-dock-instrumental/',
      lyrics: [
        'Hickory, dickory, dock,',
        'The mouse ran up the clock.',
        'The clock struck one,',
        'The mouse ran down,',
        'Hickory, dickory, dock.',
        '',
        'Hickory, dickory, dock,',
        'The mouse ran up the clock.',
        'The clock struck two,',
        'The mouse ran down,',
        'Hickory, dickory, dock.',
        '',
        'Hickory, dickory, dock,',
        'The mouse ran up the clock.',
        'The clock struck three,',
        'The mouse ran down,',
        'Hickory, dickory, dock.'
      ], actions: 'Run fingers up the arm, then slide down.' },

    { id: 'humpty-dumpty', title: 'Humpty Dumpty', category: 'Classics', source: POPULAR_BASE,
      lyrics: [
        'Humpty Dumpty sat on a wall,',
        'Humpty Dumpty had a great fall.',
        'All the king’s horses and all the king’s men',
        'Couldn’t put Humpty together again.'
      ], actions: 'Pretend to be an egg wobbling on a wall.' },

    { id: 'london-bridge', title: 'London Bridge Is Falling Down', category: 'Classics', source: 'https://www.tunepocket.com/royalty-free-music/london-bridge-is-falling-down-instrumental/',
      lyrics: [
        'London Bridge is falling down,',
        'Falling down, falling down.',
        'London Bridge is falling down,',
        'My fair lady.',
        '',
        'Build it up with wood and clay,',
        'Wood and clay, wood and clay.',
        'Build it up with wood and clay,',
        'My fair lady.',
        '',
        'Wood and clay will wash away,',
        'Wash away, wash away.',
        'Wood and clay will wash away,',
        'My fair lady.',
        '',
        'Build it up with bricks and stone,',
        'Bricks and stone, bricks and stone.',
        'Build it up with bricks and stone,',
        'My fair lady.'
      ], actions: 'Two children make an arch; the others pass under.' },

    { id: 'five-monkeys', title: 'Five Little Monkeys', category: 'Counting', source: 'https://www.tunepocket.com/royalty-free-music/5-little-monkeys/',
      lyrics: [
        'Five little monkeys jumping on the bed,',
        'One fell off and bumped his head.',
        'Mama called the doctor and the doctor said:',
        'No more monkeys jumping on the bed!',
        '',
        'Four little monkeys jumping on the bed,',
        'One fell off and bumped his head.',
        'Mama called the doctor and the doctor said:',
        'No more monkeys jumping on the bed!',
        '',
        'Three little monkeys jumping on the bed,',
        'One fell off and bumped his head.',
        'Mama called the doctor and the doctor said:',
        'No more monkeys jumping on the bed!',
        '',
        'Two little monkeys jumping on the bed,',
        'One fell off and bumped his head.',
        'Mama called the doctor and the doctor said:',
        'No more monkeys jumping on the bed!',
        '',
        'One little monkey jumping on the bed,',
        'He fell off and bumped his head.',
        'Mama called the doctor and the doctor said:',
        'No more monkeys jumping on the bed!'
      ], actions: 'Count down from five on your fingers each verse.' },

    { id: 'five-ducks', title: 'Five Little Ducks', category: 'Counting', source: POPULAR_BASE,
      lyrics: [
        'Five little ducks went out one day,',
        'Over the hills and far away.',
        'Mama duck said, “Quack, quack, quack, quack”,',
        'But only four little ducks came back.',
        '',
        'Four little ducks went out one day,',
        'Over the hills and far away.',
        'Mama duck said, “Quack, quack, quack, quack”,',
        'But only three little ducks came back.',
        '',
        'Three little ducks went out one day,',
        'Over the hills and far away.',
        'Mama duck said, “Quack, quack, quack, quack”,',
        'But only two little ducks came back.',
        '',
        'Two little ducks went out one day,',
        'Over the hills and far away.',
        'Mama duck said, “Quack, quack, quack, quack”,',
        'But only one little duck came back.',
        '',
        'One little duck went out one day,',
        'Over the hills and far away.',
        'Mama duck said, “Quack, quack, quack, quack”,',
        'And all five little ducks came back.'
      ], actions: 'Hold up five fingers; lower one each verse.' },

    { id: 'farmer-dell', title: 'The Farmer in the Dell', category: 'Classics', source: 'https://www.tunepocket.com/royalty-free-music/the-farmer-in-the-dell/',
      lyrics: [
        'The farmer in the dell,',
        'The farmer in the dell,',
        'Heigh-ho, the derry-o,',
        'The farmer in the dell.',
        '',
        'The farmer takes a wife,',
        'The farmer takes a wife,',
        'Heigh-ho, the derry-o,',
        'The farmer takes a wife.',
        '',
        'The wife takes a child,',
        'The wife takes a child,',
        'Heigh-ho, the derry-o,',
        'The wife takes a child.',
        '',
        'The child takes a nurse,',
        'The child takes a nurse,',
        'Heigh-ho, the derry-o,',
        'The child takes a nurse.',
        '',
        'The nurse takes a dog,',
        'The nurse takes a dog,',
        'Heigh-ho, the derry-o,',
        'The nurse takes a dog.'
      ], actions: 'Circle game: one child is the farmer and chooses a friend.' },

    { id: 'muffin-man', title: 'Do You Know the Muffin Man?', category: 'Classics', source: 'https://www.tunepocket.com/royalty-free-music/do-you-know-the-muffin-man/',
      lyrics: [
        'Do you know the muffin man,',
        'The muffin man, the muffin man?',
        'Do you know the muffin man',
        'Who lives on Drury Lane?',
        '',
        'Yes, we know the muffin man,',
        'The muffin man, the muffin man.',
        'Yes, we know the muffin man',
        'Who lives on Drury Lane.'
      ], actions: 'Skip in a circle while singing.' },

    { id: 'finger-family', title: 'The Finger Family', category: 'Actions', source: 'https://www.tunepocket.com/royalty-free-music/finger-family/',
      lyrics: [
        'Daddy finger, daddy finger, where are you?',
        'Here I am, here I am. How do you do?',
        '',
        'Mummy finger, mummy finger, where are you?',
        'Here I am, here I am. How do you do?',
        '',
        'Brother finger, brother finger, where are you?',
        'Here I am, here I am. How do you do?',
        '',
        'Sister finger, sister finger, where are you?',
        'Here I am, here I am. How do you do?',
        '',
        'Baby finger, baby finger, where are you?',
        'Here I am, here I am. How do you do?'
      ], actions: 'Wiggle one finger at a time as you name it.' },

    { id: 'happy-you-know', title: 'If You’re Happy and You Know It', category: 'Actions', source: POPULAR_BASE,
      lyrics: [
        'If you’re happy and you know it, clap your hands.',
        'If you’re happy and you know it, clap your hands.',
        'If you’re happy and you know it,',
        'And you really want to show it,',
        'If you’re happy and you know it, clap your hands.',
        '',
        'If you’re happy and you know it, stamp your feet.',
        'If you’re happy and you know it, stamp your feet.',
        'If you’re happy and you know it,',
        'And you really want to show it,',
        'If you’re happy and you know it, stamp your feet.',
        '',
        'If you’re happy and you know it, nod your head.',
        'If you’re happy and you know it, nod your head.',
        'If you’re happy and you know it,',
        'And you really want to show it,',
        'If you’re happy and you know it, nod your head.',
        '',
        'If you’re happy and you know it, shout hooray!',
        'If you’re happy and you know it, shout hooray!',
        'If you’re happy and you know it,',
        'And you really want to show it,',
        'If you’re happy and you know it, shout hooray!'
      ], actions: 'Add stamp feet, nod your head, shout “hooray”.' },

    { id: 'brother-john', title: 'Are You Sleeping, Brother John?', category: 'Lullabies', source: 'https://www.tunepocket.com/royalty-free-music/are-you-sleeping-brother-john-vocal/',
      lyrics: [
        'Are you sleeping, are you sleeping,',
        'Brother John, Brother John?',
        'Morning bells are ringing,',
        'Morning bells are ringing,',
        'Ding, ding, dong. Ding, ding, dong.'
      ], actions: 'Sing as a round in two groups.' },

    { id: 'this-old-man', title: 'This Old Man', category: 'Counting', source: 'https://www.tunepocket.com/royalty-free-music/this-old-man/',
      lyrics: [
        'This old man, he played one,',
        'He played knick-knack on my thumb.',
        'With a knick-knack, paddy-whack,',
        'Give your dog a bone.',
        'This old man came rolling home.',
        '',
        'This old man, he played two,',
        'He played knick-knack on my shoe.',
        'With a knick-knack, paddy-whack,',
        'Give your dog a bone.',
        'This old man came rolling home.',
        '',
        'This old man, he played three,',
        'He played knick-knack on my knee.',
        'With a knick-knack, paddy-whack,',
        'Give your dog a bone.',
        'This old man came rolling home.',
        '',
        'This old man, he played four,',
        'He played knick-knack on my door.',
        'With a knick-knack, paddy-whack,',
        'Give your dog a bone.',
        'This old man came rolling home.',
        '',
        'This old man, he played five,',
        'He played knick-knack on my hive.',
        'With a knick-knack, paddy-whack,',
        'Give your dog a bone.',
        'This old man came rolling home.',
        '',
        'This old man, he played six,',
        'He played knick-knack on my sticks.',
        'With a knick-knack, paddy-whack,',
        'Give your dog a bone.',
        'This old man came rolling home.',
        '',
        'This old man, he played seven,',
        'He played knick-knack up in heaven.',
        'With a knick-knack, paddy-whack,',
        'Give your dog a bone.',
        'This old man came rolling home.',
        '',
        'This old man, he played eight,',
        'He played knick-knack on my gate.',
        'With a knick-knack, paddy-whack,',
        'Give your dog a bone.',
        'This old man came rolling home.',
        '',
        'This old man, he played nine,',
        'He played knick-knack on my spine.',
        'With a knick-knack, paddy-whack,',
        'Give your dog a bone.',
        'This old man came rolling home.',
        '',
        'This old man, he played ten,',
        'He played knick-knack once again.',
        'With a knick-knack, paddy-whack,',
        'Give your dog a bone.',
        'This old man came rolling home.'
      ], actions: 'Count up to ten, changing the rhyming body part.' },

    { id: 'jack-jill', title: 'Jack and Jill', category: 'Classics', source: CHILDREN_BASE,
      lyrics: [
        'Jack and Jill went up the hill',
        'To fetch a pail of water.',
        'Jack fell down and broke his crown,',
        'And Jill came tumbling after.',
        '',
        'Up Jack got and home did trot',
        'As fast as he could caper.',
        'To old Dame Dob, who patched his nob',
        'With vinegar and brown paper.'
      ], actions: 'Walk fingers up “the hill”, then tumble down.' },

    { id: 'little-bo-peep', title: 'Little Bo Peep', category: 'Classics', source: CHILDREN_BASE,
      lyrics: [
        'Little Bo Peep has lost her sheep',
        'And doesn’t know where to find them.',
        'Leave them alone and they’ll come home,',
        'Wagging their tails behind them.',
        '',
        'Little Bo Peep fell fast asleep',
        'And dreamt she heard them bleating.',
        'When she awoke, she found it a joke,',
        'For they were still a-fleeting.',
        '',
        'Then up she took her little crook',
        'Determined for to find them.',
        'She found them indeed, but it made her heart bleed,',
        'For they’d left their tails behind them.'
      ], actions: 'Cup hands behind for wagging tails.' },

    { id: 'three-blind-mice', title: 'Three Blind Mice', category: 'Classics', source: CHILDREN_BASE,
      lyrics: [
        'Three blind mice, three blind mice,',
        'See how they run, see how they run.',
        'They all ran after the farmer’s wife,',
        'Who cut off their tails with a carving knife.',
        'Did you ever see such a sight in your life',
        'As three blind mice?'
      ], actions: 'Sing as a round; tiptoe fingers like mice.' },

    { id: 'mary-contrary', title: 'Mary, Mary, Quite Contrary', category: 'Classics', source: CHILDREN_BASE,
      lyrics: [
        'Mary, Mary, quite contrary,',
        'How does your garden grow?',
        'With silver bells and cockle shells',
        'And pretty maids all in a row.'
      ], actions: 'Plant an imaginary garden with your hands.' },

    { id: 'ring-roses', title: 'Ring a Ring o’ Roses', category: 'Actions', source: CHILDREN_BASE,
      lyrics: [
        'Ring a ring o’ roses,',
        'A pocket full of posies.',
        'A-tishoo, a-tishoo,',
        'We all fall down.'
      ], actions: 'Circle, hold an imaginary posy, then crouch down.' },

    { id: 'ants-marching', title: 'The Ants Go Marching', category: 'Counting', source: POPULAR_BASE,
      lyrics: [
        'The ants go marching one by one, hurrah, hurrah!',
        'The ants go marching one by one, hurrah, hurrah!',
        'The ants go marching one by one,',
        'The little one stops to suck his thumb,',
        'And they all go marching down to the ground',
        'To get out of the rain. Boom! Boom! Boom!',
        '',
        'The ants go marching two by two, hurrah, hurrah!',
        'The little one stops to tie his shoe.',
        '',
        'The ants go marching three by three, hurrah, hurrah!',
        'The little one stops to climb a tree.',
        '',
        'The ants go marching four by four, hurrah, hurrah!',
        'The little one stops to shut the door.',
        '',
        'The ants go marching five by five, hurrah, hurrah!',
        'The little one stops to take a dive.',
        '',
        'The ants go marching six by six, hurrah, hurrah!',
        'The little one stops to pick up sticks.',
        '',
        'The ants go marching seven by seven, hurrah, hurrah!',
        'The little one stops to pray to heaven.',
        '',
        'The ants go marching eight by eight, hurrah, hurrah!',
        'The little one stops to shut the gate.',
        '',
        'The ants go marching nine by nine, hurrah, hurrah!',
        'The little one stops to walk a line.',
        '',
        'The ants go marching ten by ten, hurrah, hurrah!',
        'The little one stops to say, “The end”.'
      ], actions: 'March in line; the littlest child acts out the verse.' },

    { id: 'bingo', title: 'Bingo Was His Name-O', category: 'Classics', source: POPULAR_BASE,
      lyrics: [
        'There was a farmer had a dog,',
        'And Bingo was his name-o.',
        'B-I-N-G-O, B-I-N-G-O, B-I-N-G-O,',
        'And Bingo was his name-o.',
        '',
        'There was a farmer had a dog,',
        'And Bingo was his name-o.',
        '(Clap)-I-N-G-O, (clap)-I-N-G-O, (clap)-I-N-G-O,',
        'And Bingo was his name-o.',
        '',
        'Keep clapping instead of each letter',
        'until the whole name is clapped.'
      ], actions: 'Clap instead of saying each letter, one by one.' },

    { id: 'old-king-cole', title: 'Old King Cole', category: 'Classics', source: CHILDREN_BASE,
      lyrics: [
        'Old King Cole was a merry old soul,',
        'And a merry old soul was he.',
        'He called for his pipe, and he called for his bowl,',
        'And he called for his fiddlers three.',
        '',
        'Every fiddler he had a fine fiddle,',
        'And a very fine fiddle had he.',
        'Tweedle-dee-doo, tweedle-dee-doo,',
        'Said the fiddlers three.',
        '',
        'Oh, there’s none so rare as can compare',
        'With King Cole and his fiddlers three.'
      ], actions: 'Pretend to smoke a pipe, hold a bowl, then play a fiddle.' },

    { id: 'rock-abye', title: 'Rock-a-bye Baby', category: 'Lullabies', source: CHILDREN_BASE,
      lyrics: [
        'Rock-a-bye baby, on the treetop,',
        'When the wind blows, the cradle will rock.',
        'When the bough breaks, the cradle will fall,',
        'And down will come baby, cradle and all.',
        '',
        'Rock-a-bye baby, in the bough,',
        'When the wind blows, the cradle will rock.',
        'When the bough breaks, the cradle will fall,',
        'And down will come baby, cradle and all.',
        '',
        'Hush-a-bye baby, sweet and low,',
        'Daddy is watching wherever you go.',
        'Mummy is near and the moon is bright,',
        'Sleep, little baby, sleep through the night.'
      ], actions: 'Gentle rocking; use a soft voice for rest time.' },

    { id: 'lavenders-blue', title: 'Lavender’s Blue', category: 'Lullabies', source: CHILDREN_BASE,
      lyrics: [
        'Lavender’s blue, dilly, dilly,',
        'Lavender’s green.',
        'When I am king, dilly, dilly,',
        'You shall be queen.',
        '',
        'Who told you so, dilly, dilly?',
        'Who told you so?',
        '’Twas my own heart, dilly, dilly,',
        'That told me so.'
      ], actions: 'Soft clapping game for two children.' },

    { id: 'one-two-three', title: 'One, Two, Three, Four, Five', category: 'Counting', source: CHILDREN_BASE,
      lyrics: [
        'One, two, three, four, five,',
        'Once I caught a fish alive.',
        'Six, seven, eight, nine, ten,',
        'Then I let it go again.',
        '',
        'Why did you let it go?',
        'Because it bit my finger so.',
        'Which finger did it bite?',
        'This little finger on the right.'
      ], actions: 'Count on fingers; make a fish with your hands.' },

    { id: 'im-a-teapot', title: 'I’m a Little Teapot', category: 'Actions', source: CHILDREN_BASE,
      lyrics: [
        'I’m a little teapot, short and stout.',
        'Here is my handle, here is my spout.',
        'When I get all steamed up, hear me shout:',
        'Tip me over and pour me out!',
        '',
        'I’m a clever teapot, yes it’s true.',
        'Here’s a little trick I’ll show to you:',
        'Turn my handle over, lift my spout,',
        'Tip me over and pour me out!'
      ], actions: 'One hand on hip for the handle, the other arm for the spout.' }
  ];

  R.nurseryRhymes = {
    all: rhymes,
    categories: Array.from(new Set(rhymes.map((r) => r.category))).sort(),
    collections: [
      { label: 'Nursery rhymes (TunePocket)', url: AUDIO_BASE },
      { label: 'Most popular nursery rhymes', url: POPULAR_BASE },
      { label: 'Music for children’s videos', url: CHILDREN_BASE }
    ],
    find: (id) => rhymes.find((r) => r.id === id) || null,
    /** Replace organisation-added rhymes without touching the built-ins. */
    setCustom(list) {
      for (let i = rhymes.length - 1; i >= 0; i -= 1) {
        if (rhymes[i].custom) rhymes.splice(i, 1);
      }
      (Array.isArray(list) ? list : []).forEach((r) => {
        if (r && r.id && r.title && Array.isArray(r.lyrics)) {
          rhymes.push(Object.assign({}, r, { custom: true }));
        }
      });
      R.nurseryRhymes.categories = Array.from(new Set(rhymes.map((r) => r.category))).sort();
    }
  };
})();
