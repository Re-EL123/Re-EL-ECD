'use strict';

/**
 * Nursery rhyme enrichment: use-case tags, duration bands, curated ordering
 * and the small localStorage sets (favourites, recents, requests) that make
 * a 33-song library feel personal instead of alphabetical.
 *
 * Classic script — no imports. Everything is defensive because a blocked
 * localStorage must never break the song library.
 */
(function () {
  const R = window.Reel = window.Reel || {};

  const TAGS = ['Calm down', 'Energise', 'Transition', 'Bedtime', 'Circle time'];
  const BANDS = ['Under 2 min', '2–4 min', 'Over 4 min'];

  // Category defaults; a few well-known songs get explicit overrides because
  // teachers look for them by mood, not by noun.
  const BY_CATEGORY = {
    Actions: ['Energise', 'Circle time'],
    Animals: ['Circle time'],
    Classics: ['Circle time'],
    Counting: ['Energise', 'Transition'],
    Learning: ['Transition'],
    Lullabies: ['Calm down', 'Bedtime'],
    Time: ['Transition'],
    Weather: ['Transition']
  };
  const OVERRIDES = {
    'twinkle': ['Bedtime', 'Calm down'],
    'rock-abye': ['Bedtime', 'Calm down'],
    'lavenders-blue': ['Bedtime', 'Calm down'],
    'brother-john': ['Bedtime', 'Calm down'],
    'itsy-bitsy': ['Energise', 'Circle time'],
    'happy-you-know': ['Energise', 'Circle time'],
    'wheels-bus': ['Energise', 'Circle time'],
    'head-shoulders': ['Energise', 'Transition'],
    'ring-roses': ['Energise', 'Circle time'],
    'rain-rain': ['Calm down', 'Transition'],
    'row-boat': ['Calm down', 'Transition'],
    'humpty-dumpty': ['Calm down', 'Transition'],
    'bingo': ['Energise', 'Circle time'],
    'old-king-cole': ['Circle time'],
    'hickory-dickory': ['Transition']
  };

  function tagsFor(rhyme) {
    if (!rhyme) return [];
    if (Array.isArray(rhyme.tags) && rhyme.tags.length) {
      return rhyme.tags.filter((t) => TAGS.indexOf(t) !== -1);
    }
    return (OVERRIDES[rhyme.id] || BY_CATEGORY[rhyme.category] || []).slice();
  }

  /** Approximate singing time from the word count (~70 words a minute). */
  function minutesFor(rhyme) {
    if (!rhyme) return 2;
    if (Number.isFinite(rhyme.minutes) && rhyme.minutes > 0) return rhyme.minutes;
    const words = (rhyme.lyrics || []).join(' ').trim().split(/\s+/).filter(Boolean).length;
    return Math.max(1, Math.min(20, Math.round(words / 55)));
  }

  function bandFor(rhyme) {
    const minutes = minutesFor(rhyme);
    if (minutes < 2) return BANDS[0];
    if (minutes <= 4) return BANDS[1];
    return BANDS[2];
  }

  // Curated "most used first" order — the order the built-in library ships in.
  // Custom rhymes are always appended, so they simply follow the classics.
  function popularRank(rhyme, list) {
    if (!rhyme) return 9999;
    if (rhyme.custom) return 9000;
    const index = (list || (R.nurseryRhymes && R.nurseryRhymes.all) || []).findIndex((r) => r.id === rhyme.id);
    return index === -1 ? 8000 : index;
  }

  function read(key, fallback) {
    try {
      const raw = window.localStorage.getItem(key);
      const parsed = raw ? JSON.parse(raw) : null;
      return Array.isArray(parsed) ? parsed : (fallback || []).slice();
    } catch (error) {
      return (fallback || []).slice();
    }
  }
  function write(key, list) {
    try { window.localStorage.setItem(key, JSON.stringify(list)); } catch (error) { /* storage blocked */ }
    return list;
  }
  function toggle(key, id) {
    const list = read(key);
    const at = list.indexOf(id);
    if (at === -1) list.push(id); else list.splice(at, 1);
    return write(key, list);
  }
  function remember(id, limit) {
    const list = read('reel.rhymes.recent').filter((value) => value !== id);
    list.unshift(id);
    return write('reel.rhymes.recent', list.slice(0, limit || 8));
  }

  R.rhymeMeta = {
    TAGS, BANDS,
    tagsFor, minutesFor, bandFor, popularRank,
    favourites: () => read('reel.rhymes.favs'),
    toggleFavourite: (id) => toggle('reel.rhymes.favs', id),
    recents: () => read('reel.rhymes.recent'),
    remember,
    requests: () => read('reel.rhymes.requests'),
    request: (id) => {
      const list = read('reel.rhymes.requests');
      if (list.indexOf(id) === -1) list.push(id);
      return write('reel.rhymes.requests', list);
    },
    volume: () => {
      try { return Number(window.localStorage.getItem('reel.rhymes.volume')); } catch (error) { return NaN; }
    },
    setVolume: (value) => {
      try { window.localStorage.setItem('reel.rhymes.volume', String(value)); } catch (error) { /* blocked */ }
    }
  };
})();
