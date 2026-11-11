'use strict';

/**
 * Public website content.
 *
 * A website config is stored as JSONB, so the shape has to be defended on the
 * way in and on the way out. This module owns that shape: it trims strings,
 * drops unknown fields, normalises arrays and derives sensible defaults so a
 * centre can publish a complete website without filling in every field.
 *
 * The same normalised payload drives the public pages, the search/social meta
 * tags and the in-app editor, which means the editor can never save a value
 * the public site does not understand.
 */

const LIMITS = {
  short: 120,
  medium: 320,
  long: 6000,
  url: 1200,
  keyword: 80
};

const PAGE_DEFINITIONS = [
  { key: 'home', label: 'Home', path: '' },
  { key: 'about', label: 'About', path: 'about' },
  { key: 'programmes', label: 'Programmes', path: 'programmes' },
  { key: 'admissions', label: 'Admissions', path: 'admissions' },
  { key: 'gallery', label: 'Gallery', path: 'gallery' },
  { key: 'contact', label: 'Contact', path: 'contact' }
];

function plain(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function text(value, max) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number' || typeof value === 'boolean') return String(value).slice(0, max);
  if (typeof value !== 'string') return '';
  return value.replace(/\r\n/g, '\n').trim().slice(0, max);
}

/**
 * Only absolute http(s) URLs or same-site paths are accepted. A tenant must not
 * be able to put `javascript:` into an image or social link.
 */
function safeUrl(value) {
  const cleaned = text(value, LIMITS.url);
  if (!cleaned) return '';
  if (/^https?:\/\//i.test(cleaned)) return cleaned;
  if (/^\/(?!\/)/.test(cleaned)) return cleaned;
  if (/^assets\//i.test(cleaned)) return cleaned;
  return '';
}

function safeEmail(value) {
  const cleaned = text(value, LIMITS.medium).toLowerCase();
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(cleaned) ? cleaned : '';
}

/**
 * Links may point at an external site, a same-site path, a hash route or one
 * of the known page keys. They are kept separate from image URLs so a button
 * can safely use mailto:, tel: or #/site/... without widening what an image
 * src accepts.
 */
function safeLink(value) {
  const cleaned = text(value, LIMITS.url);
  if (!cleaned) return '';
  if (/^(https?:\/\/|mailto:|tel:)/i.test(cleaned)) return cleaned;
  if (/^#\//.test(cleaned)) return cleaned;
  if (/^\/(?!\/)/.test(cleaned)) return cleaned;
  if (/^[a-z0-9][a-z0-9-]*$/i.test(cleaned)) return cleaned;
  return '';
}

function safePhone(value) {
  return text(value, 60).replace(/[^\d+()\s.-]/g, '');
}

function stringList(value, maxItems, maxLength) {
  return list(value)
    .map((item) => text(item, maxLength))
    .filter(Boolean)
    .slice(0, maxItems);
}

function uniqueList(values, maxItems, maxLength) {
  const seen = new Set();
  const output = [];
  for (const value of values) {
    const cleaned = text(value, maxLength);
    if (!cleaned) continue;
    const key = cleaned.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(cleaned);
    if (output.length >= maxItems) break;
  }
  return output;
}

function objects(value, mapper, maxItems) {
  return list(value).map((item) => mapper(plain(item), item)).filter(Boolean).slice(0, maxItems || 30);
}

function normaliseHero(input) {
  const source = plain(input);
  return {
    badge: text(source.badge, LIMITS.short) || 'Registered ECD centre',
    headline: text(source.headline, 180),
    subheadline: text(source.subheadline, LIMITS.medium),
    cta: text(source.cta, 60) || 'Book a visit',
    ctaHref: safeLink(source.ctaHref) || '',
    secondaryCta: text(source.secondaryCta, 60) || 'Explore programmes',
    secondaryHref: safeLink(source.secondaryHref) || '',
    image: safeUrl(source.image),
    stats: objects(source.stats, (row) => ({
      label: text(row.label, 60),
      value: text(row.value, 60)
    })).filter((row) => row.label || row.value)
  };
}

function normaliseAbout(input) {
  const source = plain(input);
  return {
    heading: text(source.heading, 160),
    body: text(source.body || (typeof input === 'string' ? input : ''), LIMITS.long),
    image: safeUrl(source.image),
    approach: text(source.approach, LIMITS.long),
    mission: text(source.mission, LIMITS.long),
    values: objects(source.values, (row) => ({
      title: text(row.title || row.name, 120),
      description: text(row.description || row.body, LIMITS.medium)
    })).filter((row) => row.title || row.description)
  };
}

function normaliseProgrammes(input) {
  return objects(input, (row, original) => {
    if (typeof original === 'string') return { name: text(original, 120), ages: '', description: '', image: '', price: '' };
    return {
      name: text(row.name || row.title, 120),
      ages: text(row.ages || row.ageGroup, 60),
      description: text(row.description, LIMITS.medium),
      image: safeUrl(row.image),
      price: text(row.price, 80)
    };
  }, 12).filter((row) => row.name);
}

function normaliseFacilities(input) {
  return objects(input, (row, original) => {
    if (typeof original === 'string') return { name: text(original, 120), description: '' };
    return {
      name: text(row.name || row.title, 120),
      description: text(row.description, LIMITS.medium)
    };
  }, 20).filter((row) => row.name);
}

function normaliseRoutine(input) {
  return objects(input, (row) => ({
    time: text(row.time, 40),
    activity: text(row.activity || row.description, 160)
  }), 30).filter((row) => row.time || row.activity);
}

function normaliseFees(input) {
  if (typeof input === 'string') return { summary: text(input, LIMITS.long), items: [], note: '' };
  const source = plain(input);
  return {
    summary: text(source.summary || source.body, LIMITS.long),
    items: objects(source.items, (row) => ({
      label: text(row.label || row.name, 120),
      amount: text(row.amount || row.price, 80),
      note: text(row.note, 160)
    })).filter((row) => row.label || row.amount),
    note: text(source.note, LIMITS.medium)
  };
}

function normaliseFaqs(input) {
  return objects(input, (row) => ({
    question: text(row.question || row.title, 240),
    answer: text(row.answer || row.body, LIMITS.long)
  }), 30).filter((row) => row.question || row.answer);
}

function normaliseContact(input) {
  const source = plain(input);
  return {
    heading: text(source.heading, 160),
    email: safeEmail(source.email),
    phone: safePhone(source.phone),
    whatsapp: safePhone(source.whatsapp),
    address: text(source.address, 400),
    hours: text(source.hours, 400),
    mapUrl: safeUrl(source.mapUrl)
  };
}

function normaliseSocial(input) {
  const source = plain(input);
  return {
    facebook: safeUrl(source.facebook),
    instagram: safeUrl(source.instagram),
    whatsapp: safeUrl(source.whatsapp),
    youtube: safeUrl(source.youtube),
    tiktok: safeUrl(source.tiktok),
    x: safeUrl(source.x)
  };
}

function normaliseAdmissions(input) {
  const source = plain(input);
  return {
    heading: text(source.heading, 160),
    intro: text(source.intro, LIMITS.long),
    openDays: text(source.openDays, LIMITS.medium),
    cta: text(source.cta, 120),
    ctaHref: safeLink(source.ctaHref) || '',
    checklist: stringList(source.checklist, 12, 160),
    steps: objects(source.steps, (row) => ({
      title: text(row.title || row.name, 140),
      description: text(row.description || row.body, LIMITS.medium)
    }), 12).filter((row) => row.title || row.description)
  };
}

function normaliseGallery(input) {
  return objects(input, (row, original) => {
    if (typeof original === 'string') return { url: safeUrl(original), caption: '' };
    return {
      url: safeUrl(row.url || row.image),
      caption: text(row.caption || row.title, 200)
    };
  }, 40).filter((row) => row.url);
}

function normaliseTestimonials(input) {
  return objects(input, (row) => ({
    quote: text(row.quote || row.body, LIMITS.long),
    author: text(row.author || row.name, 120),
    role: text(row.role, 120)
  }), 12).filter((row) => row.quote);
}

function normaliseSeo(input, content, organisation) {
  const source = plain(input);
  const org = plain(organisation);
  const name = text(org.name, 200) || 'Early learning centre';
  const programmes = content.programmes || [];
  const contact = content.contact || {};
  const hero = content.hero || {};
  const about = content.about || {};
  const address = text(contact.address, 300);
  const locality = address ? address.split(',')[0].trim() : '';

  const keywordSource = Array.isArray(source.keywords)
    ? source.keywords
    : String(source.keywords || '').split(',');
  const keywords = uniqueList([
    ...keywordSource,
    name,
    locality,
    'early childhood development',
    'ECD centre',
    'daycare',
    'creche',
    'preschool',
    'early learning',
    'child care',
    ...programmes.map((programme) => programme.name)
  ], 24, LIMITS.keyword);

  const title = text(source.title, 160)
    || (hero.headline ? `${hero.headline} | ${name}` : `${name} | Early learning centre`);
  const description = text(source.description, LIMITS.medium)
    || text(hero.subheadline, LIMITS.medium)
    || text(about.body, LIMITS.medium)
    || `${name} is an early childhood development centre. Explore our programmes, meet our educators and enquire about a place.`;

  return {
    title,
    description,
    keywords,
    image: safeUrl(source.image) || content.images.og || hero.image || safeUrl(org.logo_url),
    canonical: safeUrl(source.canonical),
    twitterHandle: text(source.twitterHandle, 80),
    organisationName: name,
    address,
    telephone: contact.phone || '',
    email: contact.email || '',
    sameAs: Object.values(content.social || {}).filter(Boolean)
  };
}

function deepMerge(base, patch) {
  const source = plain(base);
  const update = plain(patch);
  const merged = Object.assign({}, source);
  for (const key of Object.keys(update)) {
    const value = update[key];
    if (value === undefined) continue;
    if (value && typeof value === 'object' && !Array.isArray(value) && source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      merged[key] = deepMerge(source[key], value);
    } else {
      merged[key] = value;
    }
  }
  return merged;
}

/**
 * Turn whatever is in the database (or whatever the editor sent) into the
 * canonical website content shape. Missing fields get useful defaults.
 */
function normalise(input, organisation) {
  const source = plain(input);
  const org = plain(organisation);

  const hero = normaliseHero(source.hero);
  const about = normaliseAbout(source.about);
  const contact = normaliseContact(source.contact);
  const programmes = normaliseProgrammes(source.programmes);
  const facilities = normaliseFacilities(source.facilities);
  const imagesInput = plain(source.images);

  if (!about.body && typeof source.about === 'string') about.body = text(source.about, LIMITS.long);
  // Only fall back to the shared image bag when the section did not mention an
  // image at all. An explicitly cleared (or rejected) image stays cleared.
  if (plain(source.hero).image === undefined && !hero.image) hero.image = safeUrl(imagesInput.hero);
  if (plain(source.about).image === undefined && !about.image) about.image = safeUrl(imagesInput.about);
  if (!hero.headline) hero.headline = 'A warm start for curious minds';
  if (!hero.subheadline) {
    hero.subheadline = `Play-based early learning, caring educators and a community where every child belongs at ${text(org.name, 160) || 'our centre'}.`;
  }
  if (!about.heading) about.heading = `About ${text(org.name, 160) || 'our centre'}`;
  if (!about.body) {
    about.body = 'We are a registered early childhood development centre dedicated to the first six years of a child\'s life. Our days are built around play, relationships and purposeful routines.';
  }
  if (!about.values.length) {
    about.values = [
      { title: 'Play-based learning', description: 'Children learn through play, relationships and purposeful routines.' },
      { title: 'Qualified educators', description: 'Our team is trained in early childhood development and first aid, with ongoing professional learning.' },
      { title: 'Safe and secure', description: 'Access control, supervised drop-off and collection, and clear health and safety routines.' }
    ];
  }
  if (!hero.stats.length) {
    hero.stats = [
      { label: 'Ages welcomed', value: '18m – 6y' },
      { label: 'Learning approach', value: 'Play-based' },
      { label: 'Registered', value: 'ECD centre' }
    ];
  }

  const fees = normaliseFees(source.fees);
  const admissions = normaliseAdmissions(source.admissions);
  if (!admissions.heading) admissions.heading = 'Joining our centre';
  if (!admissions.intro) {
    admissions.intro = 'We keep admissions simple and personal. Send an enquiry, visit the centre and meet the team, then complete the enrolment forms when you are ready.';
  }
  if (!admissions.steps.length) {
    admissions.steps = [
      { title: 'Enquire online', description: 'Tell us a little about your child and the care you need. The admissions team will reply by email.' },
      { title: 'Visit the centre', description: 'Book a tour, meet the educators and see the rooms and outdoor spaces for yourself.' },
      { title: 'Complete enrolment', description: 'We will guide you through the forms, fees and start date. No paperwork surprises.' }
    ];
  }
  if (!admissions.checklist.length) {
    admissions.checklist = [
      'Your child\'s birth certificate or ID',
      'Immunisation record',
      'Guardian contact details and emergency contacts',
      'Any medical or allergy information we should know'
    ];
  }

  const gallery = normaliseGallery(source.gallery);
  const images = {
    hero: hero.image,
    about: about.image,
    og: safeUrl(imagesInput.og) || hero.image || about.image || gallery[0] && gallery[0].url || safeUrl(org.logo_url),
    logo: safeUrl(imagesInput.logo) || safeUrl(org.logo_url)
  };

  const content = {
    hero,
    about,
    programmes,
    facilities,
    routine: normaliseRoutine(source.routine),
    fees,
    faqs: normaliseFaqs(source.faqs),
    contact,
    social: normaliseSocial(source.social),
    admissions,
    gallery,
    testimonials: normaliseTestimonials(source.testimonials),
    images,
    announcement: text(source.announcement, LIMITS.medium)
  };

  content.seo = normaliseSeo(source.seo, content, org);
  return content;
}

/**
 * Derive the SEO payload the browser needs. Kept separate so a caller can
 * refresh the tags after a publish without re-normalising everything.
 */
function deriveSeo(content, organisation) {
  const normalised = normalise(content, organisation);
  return normalised.seo;
}

function pages() {
  return PAGE_DEFINITIONS.map((page) => Object.assign({}, page));
}

function pageByKey(key) {
  return PAGE_DEFINITIONS.find((page) => page.key === key) || null;
}

/**
 * Canonical address for a public page. The site is a hash-routed single page
 * app, so the canonical URL includes the fragment. A future custom-domain
 * renderer can replace the base without changing content.
 */
function canonicalUrl(slug, pageKey) {
  const base = String(
    process.env.APP_BASE_URL
    || (process.env.FRONTEND_ORIGIN || '').split(',')[0]
    || 'https://ecd.re-el.co.za'
  ).replace(/\/+$/, '');
  const page = pageByKey(pageKey || 'home');
  const suffix = page && page.path ? '/' + page.path : '';
  return `${base}/#/site/${encodeURIComponent(slug || '')}${suffix}`;
}

/**
 * Canonical address on a verified custom domain. The host is already validated
 * by the domain service before it reaches this function.
 */
function canonicalUrlForHost(host, slug, pageKey) {
  const clean = String(host || '').trim().toLowerCase()
    .replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/\.+$/, '');
  const page = pageByKey(pageKey || 'home');
  const suffix = page && page.path ? '/' + page.path : '';
  return `https://${clean}/#/site/${encodeURIComponent(slug || '')}${suffix}`;
}

module.exports = {
  LIMITS,
  PAGE_DEFINITIONS,
  normalise,
  deriveSeo,
  pages,
  pageByKey,
  canonicalUrl,
  canonicalUrlForHost,
  deepMerge,
  safeUrl,
  safeLink,
  text
};
