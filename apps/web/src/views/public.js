'use strict';

(function () {
  const R = window.Reel;
  const V = R.views;

  /**
   * The tenant's own logo, or a neutral initial chip while no logo has been
   * uploaded. Never borrow another tenant's artwork.
   */
  function logoMark(org, size) {
    const source = org || {};
    const name = source.name || 'Re-EL ECD';
    const dimension = size || 38;
    if (source.logoUrl) {
      return '<img class="public-brand-logo" src="' + R.attr(source.logoUrl) + '" alt="' + R.attr(name) +
        '" width="' + dimension + '" height="' + dimension + '">';
    }
    return '<span class="brand-logo brand-logo-fallback" style="width:' + dimension + 'px;height:' + dimension +
      'px;flex:0 0 ' + dimension + 'px">' + R.esc(String(name).trim().charAt(0).toUpperCase()) + '</span>';
  }

  V.auth = {
    render(ctx) {
      const brand = (ctx && ctx.platformBrand) || null;
      const organisation = (brand && brand.organisation) || {};
      // The product is always Re-EL ECD; the platform organisation record is an
      // internal tenant and may carry a different administrative name.
      const name = R.PLATFORM_BRAND.name;
      const logo = organisation.logoUrl || R.PLATFORM_LOGO;
      const style = R.themeStyle((brand && brand.branding) || R.PLATFORM_BRAND.theme);
      const logoMark = '<span class="auth-brand-logo"><img src="' + R.attr(logo) + '" alt="' + R.attr(name) + '"></span>';
      return '' +
        '<div class="auth-screen" ' + style + '>' +
        '<div class="auth-art">' +
        '<div><div class="row" style="gap:10px">' + logoMark + '<div><div class="brand-name" style="color:#fff">' + R.esc(name) + '</div><div class="brand-sub" style="color:rgba(255,255,255,0.7)">Early childhood, elevated</div></div></div>' +
        '<h1 style="margin-top:56px">Every child\'s early years, held with care.</h1>' +
        '<p style="margin-top:16px">One calm workspace for enrolment, learning, attendance, families, finance and the everyday safety of the children in your care.</p></div>' +
        '<div><div class="auth-quote">“The way we care for our youngest children is the clearest statement of what we value.”</div>' +
        '<div class="row" style="margin-top:22px;gap:18px"><span class="chip" style="background:rgba(255,255,255,0.14);color:#fff">Multi-tenant</span><span class="chip" style="background:rgba(255,255,255,0.14);color:#fff">Role-based</span><span class="chip" style="background:rgba(255,255,255,0.14);color:#fff">Audit-ready</span></div></div>' +
        '</div>' +
        '<div class="auth-panel"><div class="auth-card">' +
        '<div class="row" style="margin-bottom:18px">' + logoMark + '<div><div class="brand-name">' + R.esc(name) + '</div><div class="brand-sub">Sign in to your workspace</div></div></div>' +
        '<h2>Welcome back</h2><div class="muted">Use your work email and password. Parents use the same sign-in.</div>' +
        '<div class="alert alert-danger" x-show="loginError" style="margin-bottom:12px"><i data-lucide="alert-circle"></i><span x-text="loginError"></span></div>' +
        '<form id="login-form" @submit.prevent="login($event)">' +
        '<div class="field"><label for="login-email">Email</label><input class="input" id="login-email" name="email" type="email" autocomplete="username" required x-model="loginEmail" placeholder="you@centre.co.za"></div>' +
        '<div class="field"><label for="login-password">Password</label><input class="input" id="login-password" name="password" type="password" autocomplete="current-password" required x-model="loginPassword" placeholder="Your password"></div>' +
        '<button class="btn btn-primary btn-block" type="submit" :disabled="loginBusy"><span class="spinner" x-show="loginBusy" style="width:15px;height:15px"></span><span x-text="loginBusy ? \'Signing in…\' : \'Sign in\'"></span></button>' +
        '</form>' +
        '<div class="demo-logins">' +
        '<button type="button" @click="fillDemo(\'principal@littlesprouts.local\')">Principal</button>' +
        '<button type="button" @click="fillDemo(\'teacher@littlesprouts.local\')">Teacher</button>' +
        '<button type="button" @click="fillDemo(\'parent@littlesprouts.local\')">Parent</button>' +
        '<button type="button" @click="fillDemo(\'finance@littlesprouts.local\')">Finance</button>' +
        '<button type="button" @click="fillDemo(\'platform@re-el-ecd.local\')">Platform admin</button>' +
        '</div>' +
        '<div class="auth-foot">Demo password: <span class="mono">Re-EL-Demo-2026!</span> · <a href="#/site/little-sprouts">View a public daycare website</a></div>' +
        '<div class="row" style="margin-top:10px;justify-content:center"><button type="button" class="link-strong small" @click="forgotOpen = !forgotOpen">Forgot password?</button></div>' +
        '<div x-show="forgotOpen" x-cloak style="margin-top:10px">' +
        '<div class="alert alert-success" x-show="resetSent" x-cloak><i data-lucide="check-circle"></i><span x-text="resetSent"></span></div>' +
        '<form @submit.prevent="sendPasswordReset($event)" x-show="!resetSent">' +
        '<div class="field"><label for="forgot-email">Email address</label><input class="input" id="forgot-email" name="email" type="email" autocomplete="username" required placeholder="you@centre.co.za"></div>' +
        '<button class="btn btn-secondary btn-block" type="submit">Email me a reset link</button></form></div>' +
        '</div></div></div>';
    }
  };

  const SITE_PAGES = [
    { key: 'home', label: 'Home', path: '' },
    { key: 'about', label: 'About', path: 'about' },
    { key: 'programmes', label: 'Programmes', path: 'programmes' },
    { key: 'admissions', label: 'Admissions', path: 'admissions' },
    { key: 'gallery', label: 'Gallery', path: 'gallery' },
    { key: 'contact', label: 'Contact', path: 'contact' }
  ];

  function sitePage(key) {
    return SITE_PAGES.find((page) => page.key === key) || null;
  }

  function siteHref(slug, key) {
    const page = sitePage(key);
    return '#/site/' + encodeURIComponent(slug) + (page && page.path ? '/' + page.path : '');
  }

  /** Only absolute http(s) URLs and same-site paths reach an attribute. */
  function safeImageUrl(value) {
    const text = String(value || '').trim();
    if (!text) return '';
    if (/^https?:\/\//i.test(text)) return text;
    if (/^\/(?!\/)/.test(text)) return text;
    if (/^assets\//i.test(text)) return text;
    return '';
  }

  function imgTag(url, alt, className) {
    const source = safeImageUrl(url);
    if (!source) return '';
    return '<img class="' + R.attr(className || 'site-image') + '" src="' + R.attr(source) + '" alt="' +
      R.attr(alt || '') + '" loading="lazy" decoding="async">';
  }

  function socialLinks(social) {
    const labels = { facebook: 'Facebook', instagram: 'Instagram', whatsapp: 'WhatsApp', youtube: 'YouTube', tiktok: 'TikTok', x: 'X' };
    const links = Object.keys(labels).filter((key) => safeImageUrl(social && social[key]))
      .map((key) => '<a class="site-social" href="' + R.attr(social[key]) + '" target="_blank" rel="noopener">' +
        R.esc(labels[key]) + '</a>');
    return links.length ? '<div class="site-socials">' + links.join('') + '</div>' : '';
  }

  function siteNav(slug, current, org) {
    const links = SITE_PAGES.map((page) => '<a class="' + (page.key === current ? 'active' : '') + '" href="' +
      R.attr(siteHref(slug, page.key)) + '">' + R.esc(page.label) + '</a>').join('');
    return '<nav class="public-nav site-nav">' +
      '<a class="site-brand" href="' + R.attr(siteHref(slug, 'home')) + '">' + logoMark(org, 42) +
      '<span><span class="brand-name">' + R.esc(org.name || 'Early learning centre') + '</span>' +
      '<span class="brand-sub">Early learning centre</span></span></a>' +
      '<button type="button" class="site-nav-toggle" aria-label="Open menu" @click="siteMenuOpen = !siteMenuOpen">' + R.icon('menu') + '</button>' +
      '<div class="links" :class="siteMenuOpen ? \'open\' : \'\'">' + links +
      '<a class="btn btn-primary btn-sm" href="#/site/' + R.attr(slug) + '/apply">Enquire</a>' +
      '<a class="muted site-staff-link" href="#/login">Staff</a></div>' +
      '</nav>';
  }

  function siteFooter(slug, org, content) {
    const contact = (content && content.contact) || {};
    const social = (content && content.social) || {};
    const links = SITE_PAGES.map((page) => '<a href="' + R.attr(siteHref(slug, page.key)) + '">' +
      R.esc(page.label) + '</a>').join('');
    return '<footer class="public-footer site-footer">' +
      '<div class="site-wrap site-footer-grid">' +
      '<div class="site-footer-brand">' + logoMark(org, 46) +
      '<div><div class="strong">' + R.esc(org.name || 'Early learning centre') + '</div>' +
      '<p class="muted small">' + R.esc((content && content.hero && content.hero.subheadline) || 'Play-based early learning, caring educators and a community where every child belongs.') + '</p>' +
      socialLinks(social) + '</div></div>' +
      '<div><div class="site-footer-title">Explore</div><div class="site-footer-links">' + links + '</div></div>' +
      '<div><div class="site-footer-title">Contact</div><div class="site-footer-links">' +
      (contact.address ? '<span>' + R.esc(contact.address) + '</span>' : '') +
      (contact.phone ? '<a href="tel:' + R.attr(String(contact.phone).replace(/[^\d+]/g, '')) + '">' + R.esc(contact.phone) + '</a>' : '') +
      (contact.email ? '<a href="mailto:' + R.attr(contact.email) + '">' + R.esc(contact.email) + '</a>' : '') +
      (contact.hours ? '<span>' + R.esc(contact.hours) + '</span>' : '') +
      '</div></div></div>' +
      '<div class="site-wrap site-footer-base"><span>© ' + new Date().getFullYear() + ' ' + R.esc(org.name || '') + '. All rights reserved.</span>' +
      '<span class="spacer"></span><a href="#/site/' + R.attr(slug) + '/apply">Enquire about a place</a>' +
      '<a href="#/login">Staff sign in</a></div>' +
      '</footer>';
  }

  function sectionHead(eyebrow, title, lede) {
    return '<div class="site-section-head">' + (eyebrow ? '<div class="site-eyebrow">' + R.esc(eyebrow) + '</div>' : '') +
      '<h2>' + R.esc(title || '') + '</h2>' + (lede ? '<p class="lede">' + R.esc(lede) + '</p>' : '') + '</div>';
  }

  function pageHero(title, lede, image, eyebrow) {
    return '<header class="site-page-hero' + (safeImageUrl(image) ? ' has-image' : '') + '">' +
      (safeImageUrl(image) ? imgTag(image, '', 'site-page-hero-image') : '') +
      '<div class="site-wrap site-page-hero-inner">' +
      (eyebrow ? '<div class="site-eyebrow">' + R.esc(eyebrow) + '</div>' : '') +
      '<h1>' + R.esc(title || '') + '</h1>' + (lede ? '<p class="lede">' + R.esc(lede) + '</p>' : '') +
      '</div></header>';
  }

  function programmeCards(programmes, limit) {
    const rows = (programmes || []).slice(0, limit || 99);
    if (!rows.length) {
      return '<div class="site-empty">Programme details are being updated. Please contact the centre for the current offering.</div>';
    }
    return '<div class="site-card-grid">' + rows.map((programme) =>
      '<article class="site-card site-programme-card">' +
      (safeImageUrl(programme.image) ? '<div class="site-card-media">' + imgTag(programme.image, programme.name, 'site-card-image') + '</div>' : '') +
      '<div class="site-card-body">' +
      (programme.ages ? '<div class="site-pill">' + R.esc(programme.ages) + '</div>' : '') +
      '<h3>' + R.esc(programme.name) + '</h3>' +
      (programme.description ? '<p>' + R.esc(programme.description) + '</p>' : '') +
      (programme.price ? '<div class="site-price">' + R.esc(programme.price) + '</div>' : '') +
      '</div></article>').join('') + '</div>';
  }

  function galleryGrid(gallery, limit) {
    const rows = (gallery || []).filter((item) => safeImageUrl(item.url)).slice(0, limit || 99);
    if (!rows.length) return '';
    return '<div class="site-gallery">' + rows.map((item) =>
      '<figure class="site-gallery-item">' + imgTag(item.url, item.caption || 'Centre photo', 'site-gallery-image') +
      (item.caption ? '<figcaption>' + R.esc(item.caption) + '</figcaption>' : '') + '</figure>').join('') + '</div>';
  }

  function valueCards(values) {
    if (!values || !values.length) return '';
    return '<div class="site-card-grid site-values">' + values.map((value) =>
      '<article class="site-value"><div class="site-value-mark">' + R.icon('sparkles') + '</div>' +
      '<h3>' + R.esc(value.title) + '</h3><p>' + R.esc(value.description) + '</p></article>').join('') + '</div>';
  }

  function contactCards(contact) {
    const cards = [
      { label: 'Email', value: contact.email, href: contact.email ? 'mailto:' + contact.email : '', icon: 'mail' },
      { label: 'Phone', value: contact.phone, href: contact.phone ? 'tel:' + String(contact.phone).replace(/[^\d+]/g, '') : '', icon: 'phone' },
      { label: 'Visit', value: contact.address, href: contact.mapUrl, icon: 'map-pin' },
      { label: 'Hours', value: contact.hours, href: '', icon: 'clock' }
    ].filter((card) => card.value);
    if (!cards.length) return '';
    return '<div class="site-contact-grid">' + cards.map((card) =>
      '<div class="site-contact-card"><div class="site-contact-icon">' + R.icon(card.icon) + '</div>' +
      '<div class="site-contact-label">' + R.esc(card.label) + '</div>' +
      (card.href ? '<a href="' + R.attr(card.href) + '"' + (/^https?:/i.test(card.href) ? ' target="_blank" rel="noopener"' : '') + '>' + R.esc(card.value) + '</a>' : '<div class="strong">' + R.esc(card.value) + '</div>') +
      '</div>').join('') + '</div>';
  }

  function branchCards(branches) {
    if (!branches || !branches.length) return '';
    return '<div class="site-card-grid">' + branches.map((branch) =>
      '<article class="site-card">' +
      (safeImageUrl(branch.image_url) ? '<div class="site-card-media">' + imgTag(branch.image_url, branch.name, 'site-card-image') + '</div>' : '') +
      '<div class="site-card-body"><h3>' + R.esc(branch.name) + '</h3>' +
      (branch.address ? '<p>' + R.esc(branch.address) + '</p>' : '') +
      (branch.contact_phone ? '<p class="small"><a href="tel:' + R.attr(String(branch.contact_phone).replace(/[^\d+]/g, '')) + '">' + R.esc(branch.contact_phone) + '</a></p>' : '') +
      (branch.contact_email ? '<p class="small"><a href="mailto:' + R.attr(branch.contact_email) + '">' + R.esc(branch.contact_email) + '</a></p>' : '') +
      '</div></article>').join('') + '</div>';
  }

  function enquiryForm(slug, branches) {
    return '<div class="card glass site-form-card">' +
      '<h3>Send an enquiry</h3><p class="muted small">Share a few details and the admissions team will reply by email. There is no obligation.</p>' +
      '<div class="alert alert-success" x-show="publicResult" style="margin-bottom:12px"><i data-lucide="check-circle"></i><span x-text="publicResult"></span></div>' +
      '<div class="alert alert-danger" x-show="publicError" style="margin-bottom:12px"><i data-lucide="alert-circle"></i><span x-text="publicError"></span></div>' +
      '<form @submit.prevent="submitPublicEnquiry($event, \'' + R.attr(slug) + '\')">' +
      '<div class="form-grid">' +
      '<div class="field"><label>Your name *</label><input class="input" name="guardianName" required x-model="publicEnquiry.guardianName"></div>' +
      '<div class="field"><label>Email *</label><input class="input" type="email" name="guardianEmail" required x-model="publicEnquiry.guardianEmail"></div>' +
      '<div class="field"><label>Phone</label><input class="input" type="tel" name="guardianPhone" x-model="publicEnquiry.guardianPhone"></div>' +
      '<div class="field"><label>Child\'s name</label><input class="input" name="childName" x-model="publicEnquiry.childName"></div>' +
      (branches && branches.length ? '<div class="field"><label>Preferred centre</label><select class="select" x-model="publicEnquiry.branchId"><option value="">Any centre</option>' +
        branches.map((branch) => '<option value="' + R.attr(branch.id) + '">' + R.esc(branch.name) + '</option>').join('') + '</select></div>' : '') +
      '<div class="field"><label>Child\'s date of birth</label><input class="input" type="date" name="childDateOfBirth" x-model="publicEnquiry.childDateOfBirth"></div>' +
      '<div class="field"><label>Preferred start</label><input class="input" type="date" name="preferredStartDate" x-model="publicEnquiry.preferredStartDate"></div>' +
      '<div class="field span-2"><label>Message</label><textarea class="textarea" name="message" x-model="publicEnquiry.message" placeholder="Tell us a little about your family and what you are looking for."></textarea></div>' +
      '<div class="field span-2" style="position:absolute;left:-9999px" aria-hidden="true"><label>Website</label><input class="input" name="website" tabindex="-1" autocomplete="off" x-model="publicEnquiry.website"></div>' +
      '</div><button class="btn btn-primary" type="submit">Send enquiry</button></form></div>';
  }

  function ctaBand(slug, admissions, org) {
    const title = (admissions && admissions.cta) || 'Come and see us';
    return '<section class="site-cta"><div class="site-wrap site-cta-inner">' +
      '<div><div class="site-eyebrow">Admissions</div><h2>' + R.esc(title) + '</h2>' +
      '<p>' + R.esc((admissions && admissions.intro) || ('Enquire about a place at ' + (org.name || 'our centre') + '. We will reply by email and arrange a visit.')) + '</p></div>' +
      '<div class="site-actions"><a class="btn btn-primary" href="#/site/' + R.attr(slug) + '/apply">Enquire about a place</a>' +
      '<a class="btn btn-secondary" href="' + R.attr(siteHref(slug, 'contact')) + '">Contact us</a></div>' +
      '</div></section>';
  }

  V.publicSite = {
    async load(ctx, params) {
      const slug = params.slug || 'little-sprouts';
      ctx.publicSlug = slug;
      ctx.publicEnquiry = {
        guardianName: '', guardianEmail: '', guardianPhone: '', childName: '', childDateOfBirth: '',
        requestedAgeGroup: '', preferredStartDate: '', message: '', website: '', branchId: ''
      };
      ctx.publicResult = null;
      ctx.publicError = null;
      ctx.siteMenuOpen = false;
      const payload = await R.api('GET', '/public/daycares/' + encodeURIComponent(slug));
      return payload.data;
    },

    render(ctx, params, page) {
      const content = (page && page.content) || {};
      const org = (page && page.organisation) || { name: R.titleCase(params.slug || 'Early learning centre') };
      const branches = (page && page.branches) || [];
      const branding = (page && page.branding) || {};
      const slug = params.slug || org.slug || 'little-sprouts';
      const current = sitePage(params.page || 'home');
      const theme = (page && page.theme) || 'nature';
      const banner = page && page.published === false
        ? '<div class="site-banner">This daycare website is being prepared. Staff can sign in to manage it.</div>'
        : '';

      const wrapper = (body) => '<div class="public site" data-site-theme="' + R.attr(theme) + '" ' + R.themeStyle(branding) + '>' +
        banner + siteNav(slug, current ? current.key : 'home', org) + body + siteFooter(slug, org, content) + '</div>';

      if (!current) {
        return wrapper('<section class="site-section"><div class="site-wrap site-narrow site-empty-page">' +
          '<div class="site-eyebrow">404</div><h1>We could not find that page</h1>' +
          '<p class="lede">The page you followed may have moved. Use the menu above, or start again from the home page.</p>' +
          '<a class="btn btn-primary" href="' + R.attr(siteHref(slug, 'home')) + '">Back to home</a></div></section>');
      }

      if (page && page.published === false) {
        return wrapper('<section class="site-section"><div class="site-wrap site-narrow site-coming-soon">' +
          logoMark(org, 72) + '<div class="site-eyebrow">Coming soon</div><h1>' + R.esc(org.name) + '</h1>' +
          '<p class="lede">' + R.esc(content.hero.subheadline) + '</p>' +
          contactCards(content.contact) +
          '<div class="site-actions"><a class="btn btn-primary" href="#/site/' + R.attr(slug) + '/apply">Send an enquiry</a>' +
          '<a class="btn btn-secondary" href="#/login">Staff sign in</a></div></div></section>');
      }

      const renderer = {
        home: this.renderHome,
        about: this.renderAbout,
        programmes: this.renderProgrammes,
        admissions: this.renderAdmissions,
        gallery: this.renderGallery,
        contact: this.renderContact
      }[current.key];
      return wrapper(renderer.call(this, slug, org, content, branches));
    },

    renderHome(slug, org, content, branches) {
      const hero = content.hero || {};
      const about = content.about || {};
      const admissions = content.admissions || {};
      const programmes = content.programmes || [];
      const gallery = content.gallery || [];
      const testimonials = content.testimonials || [];
      const stats = hero.stats || [];
      const heroImage = safeImageUrl(hero.image) || safeImageUrl(content.images && content.images.hero);

      const heroBlock = '<header class="site-hero">' +
        (content.announcement ? '<div class="site-wrap"><div class="site-notice">' + R.icon('megaphone') + '<span>' + R.esc(content.announcement) + '</span></div></div>' : '') +
        '<div class="site-wrap site-hero-grid">' +
        '<div class="site-hero-copy">' +
        '<div class="site-eyebrow">' + R.icon('sprout') + ' ' + R.esc(hero.badge || 'Registered ECD centre') + '</div>' +
        '<h1>' + R.esc(hero.headline) + '</h1>' +
        '<p class="lede">' + R.esc(hero.subheadline) + '</p>' +
        '<div class="site-actions">' +
        '<a class="btn btn-primary" href="#/site/' + R.attr(slug) + '/apply">' + R.esc(hero.cta || 'Book a visit') + '</a>' +
        '<a class="btn btn-secondary" href="' + R.attr(siteHref(slug, 'programmes')) + '">' + R.esc(hero.secondaryCta || 'Explore programmes') + '</a>' +
        '</div>' +
        (stats.length ? '<div class="site-stats">' + stats.map((stat) =>
          '<div><div class="site-stat-value">' + R.esc(stat.value) + '</div><div class="site-stat-label">' + R.esc(stat.label) + '</div></div>').join('') + '</div>' : '') +
        '</div>' +
        '<div class="site-hero-media' + (heroImage ? '' : ' is-empty') + '">' +
        (heroImage ? imgTag(heroImage, hero.headline || org.name, 'site-hero-image') : '<div class="site-hero-pattern"></div>') +
        '<div class="site-hero-float"><div class="site-float-mark">' + R.icon('heart-handshake') + '</div>' +
        '<div><div class="strong">Our promise</div><div class="muted small">Safety, belonging and joyful discovery every single day.</div></div></div>' +
        '</div></div></header>';

      const aboutBlock = '<section class="site-section"><div class="site-wrap site-split">' +
        '<div class="site-split-media' + (safeImageUrl(about.image) ? '' : ' is-empty') + '">' +
        (safeImageUrl(about.image) ? imgTag(about.image, about.heading || org.name, 'site-split-image') : '<div class="site-hero-pattern"></div>') +
        '</div><div class="site-split-copy">' + sectionHead('About us', about.heading || ('About ' + org.name), '') +
        '<p>' + R.esc(about.body) + '</p>' +
        (about.approach ? '<div class="site-quote"><p>' + R.esc(about.approach) + '</p></div>' : '') +
        '<a class="btn btn-secondary" href="' + R.attr(siteHref(slug, 'about')) + '">More about our centre</a>' +
        '</div></div></section>';

      const valuesBlock = about.values && about.values.length
        ? '<section class="site-section site-section-tint"><div class="site-wrap">' +
          sectionHead('Why families choose us', 'Care you can see, every day', 'The small things that make a centre feel like home.') +
          valueCards(about.values) + '</div></section>'
        : '';

      const programmeBlock = '<section class="site-section"><div class="site-wrap">' +
        sectionHead('Programmes', 'Rooms that grow with your child', 'Age-appropriate routines, caring educators and space to explore.') +
        programmeCards(programmes, 3) +
        '<div class="site-section-foot"><a class="btn btn-secondary" href="' + R.attr(siteHref(slug, 'programmes')) + '">See all programmes</a></div>' +
        '</div></section>';

      const galleryBlock = galleryGrid(gallery, 6)
        ? '<section class="site-section site-section-tint"><div class="site-wrap">' +
          sectionHead('Life at our centre', 'A little look around', 'Real rooms, real play and the everyday moments families tell us about.') +
          galleryGrid(gallery, 6) +
          '<div class="site-section-foot"><a class="btn btn-secondary" href="' + R.attr(siteHref(slug, 'gallery')) + '">Open the gallery</a></div>' +
          '</div></section>'
        : '';

      const testimonialBlock = testimonials.length
        ? '<section class="site-section"><div class="site-wrap">' +
          sectionHead('From our families', 'What parents tell us', '') +
          '<div class="site-card-grid site-testimonials">' + testimonials.map((item) =>
            '<blockquote class="site-testimonial"><p>“' + R.esc(item.quote) + '”</p>' +
            '<footer><span class="strong">' + R.esc(item.author) + '</span>' +
            (item.role ? '<span class="muted small">' + R.esc(item.role) + '</span>' : '') + '</footer></blockquote>').join('') +
          '</div></div></section>'
        : '';

      const contactBlock = '<section class="site-section site-section-tint"><div class="site-wrap site-split site-contact-split">' +
        '<div>' + sectionHead('Contact', 'Come and see us', 'Book a visit or ask a question. We will reply by email.') +
        contactCards(content.contact || {}) +
        (branches.length ? '<div class="site-branch-list">' + branchCards(branches) + '</div>' : '') +
        '</div><div>' + enquiryForm(slug, branches) + '</div>' +
        '</div></section>';

      return heroBlock + valuesBlock + aboutBlock + programmeBlock + galleryBlock + testimonialBlock + ctaBand(slug, admissions, org) + contactBlock;
    },

    renderAbout(slug, org, content) {
      const about = content.about || {};
      const facilities = content.facilities || [];
      const routine = content.routine || [];
      return pageHero(about.heading || ('About ' + org.name), 'A registered early learning centre built around play, relationships and the first six years.', about.image, 'About us') +
        '<section class="site-section"><div class="site-wrap site-split">' +
        '<div class="site-split-copy">' + sectionHead('Our story', 'A warm start for curious minds', '') +
        '<p>' + R.esc(about.body) + '</p>' +
        (about.mission ? '<p>' + R.esc(about.mission) + '</p>' : '') +
        '</div><div class="site-split-media' + (safeImageUrl(about.image) ? '' : ' is-empty') + '">' +
        (safeImageUrl(about.image) ? imgTag(about.image, about.heading || org.name, 'site-split-image') : '<div class="site-hero-pattern"></div>') +
        '</div></div></section>' +
        (about.approach ? '<section class="site-section site-section-tint"><div class="site-wrap site-narrow">' +
          sectionHead('Our approach', 'Learning through play, held with care', '') +
          '<p class="site-large-copy">' + R.esc(about.approach) + '</p></div></section>' : '') +
        (about.values && about.values.length ? '<section class="site-section"><div class="site-wrap">' +
          sectionHead('What we value', 'The things we never compromise on', '') + valueCards(about.values) +
          '</div></section>' : '') +
        (facilities.length ? '<section class="site-section site-section-tint"><div class="site-wrap">' +
          sectionHead('Our spaces', 'Room to learn, play and rest', '') +
          '<div class="site-facility-grid">' + facilities.map((facility) =>
            '<div class="site-facility"><div class="site-facility-mark">' + R.icon('check') + '</div>' +
            '<div><div class="strong">' + R.esc(facility.name) + '</div>' +
            (facility.description ? '<p class="muted small">' + R.esc(facility.description) + '</p>' : '') + '</div></div>').join('') +
          '</div></div></section>' : '') +
        (routine.length ? '<section class="site-section"><div class="site-wrap site-narrow">' +
          sectionHead('Our day', 'A rhythm children can trust', '') +
          '<div class="site-routine">' + routine.map((row) =>
            '<div class="site-routine-row"><span class="site-routine-time">' + R.esc(row.time) + '</span>' +
            '<span>' + R.esc(row.activity) + '</span></div>').join('') + '</div></div></section>' : '') +
        ctaBand(slug, content.admissions || {}, org);
    },

    renderProgrammes(slug, org, content) {
      const programmes = content.programmes || [];
      const fees = content.fees || {};
      const faqs = content.faqs || [];
      return pageHero('Programmes', 'Age-appropriate rooms and routines that grow with your child.', (programmes[0] && programmes[0].image) || (content.images && content.images.hero), 'Learning') +
        '<section class="site-section"><div class="site-wrap">' +
        programmeCards(programmes) + '</div></section>' +
        '<section class="site-section site-section-tint"><div class="site-wrap site-narrow">' +
        sectionHead('Fees', 'Simple, transparent fees', '') +
        (fees.summary ? '<p class="site-large-copy">' + R.esc(fees.summary) + '</p>' : '') +
        (fees.items && fees.items.length ? '<div class="site-fee-table">' + fees.items.map((item) =>
          '<div class="site-fee-row"><div><div class="strong">' + R.esc(item.label) + '</div>' +
          (item.note ? '<div class="muted small">' + R.esc(item.note) + '</div>' : '') + '</div>' +
          '<div class="site-fee-amount">' + R.esc(item.amount) + '</div></div>').join('') + '</div>' : '') +
        (fees.note ? '<p class="muted small">' + R.esc(fees.note) + '</p>' : '') +
        '</div></section>' +
        (faqs.length ? '<section class="site-section"><div class="site-wrap site-narrow">' +
          sectionHead('Questions', 'What families ask us', '') +
          '<div class="site-faqs">' + faqs.map((faq) =>
            '<details class="site-faq"><summary>' + R.esc(faq.question) + '</summary><p>' + R.esc(faq.answer) + '</p></details>').join('') +
          '</div></div></section>' : '') +
        ctaBand(slug, content.admissions || {}, org);
    },

    renderAdmissions(slug, org, content) {
      const admissions = content.admissions || {};
      const contact = content.contact || {};
      const steps = admissions.steps || [];
      return pageHero(admissions.heading || 'Joining our centre', admissions.intro || 'A simple, personal admissions process.', '', 'Admissions') +
        '<section class="site-section"><div class="site-wrap">' +
        sectionHead('How it works', 'Three calm steps to a place', '') +
        '<div class="site-steps">' + steps.map((step, index) =>
          '<article class="site-step"><div class="site-step-number">' + (index + 1) + '</div>' +
          '<h3>' + R.esc(step.title) + '</h3><p>' + R.esc(step.description) + '</p></article>').join('') + '</div>' +
        '</div></section>' +
        (admissions.checklist && admissions.checklist.length ? '<section class="site-section site-section-tint"><div class="site-wrap site-split">' +
          '<div>' + sectionHead('Before you start', 'What to have ready', 'You do not need everything on day one. We will guide you through the forms.') +
          '<ul class="site-checklist">' + admissions.checklist.map((item) =>
            '<li>' + R.icon('check-circle') + '<span>' + R.esc(item) + '</span></li>').join('') + '</ul></div>' +
          '<div class="site-callout"><div class="site-eyebrow">Open days</div><h3>' + R.esc(admissions.openDays || 'Book a personal visit') + '</h3>' +
          '<p>Meet the educators, see the rooms and ask anything. Visits are booked directly with the centre.</p>' +
          '<a class="btn btn-primary" href="#/site/' + R.attr(slug) + '/apply">Book a visit</a></div>' +
          '</div></section>' : '') +
        '<section class="site-section"><div class="site-wrap site-split site-contact-split">' +
        '<div>' + sectionHead('Talk to us', 'Questions about a place?', 'The admissions team replies by email, usually within one working day.') +
        contactCards(contact) + '</div><div>' + enquiryForm(slug, []) + '</div></div></section>' +
        ctaBand(slug, admissions, org);
    },

    renderGallery(slug, org, content) {
      const gallery = content.gallery || [];
      return pageHero('Gallery', 'A little look at the rooms, the garden and the everyday joy of learning through play.', (gallery[0] && gallery[0].url) || '', 'Life at our centre') +
        '<section class="site-section"><div class="site-wrap">' +
        (galleryGrid(gallery) || '<div class="site-empty">Photos are on their way. In the meantime, book a visit and see the centre for yourself.</div>') +
        '<div class="site-section-foot"><a class="btn btn-primary" href="#/site/' + R.attr(slug) + '/apply">Book a visit</a></div>' +
        '</div></section>' + ctaBand(slug, content.admissions || {}, org);
    },

    renderContact(slug, org, content, branches) {
      const contact = content.contact || {};
      return pageHero('Contact us', 'Book a visit, ask a question or start an enquiry. We would love to meet your family.', '', 'Get in touch') +
        '<section class="site-section"><div class="site-wrap">' +
        contactCards(contact) +
        (branches.length ? '<div class="site-section-head" style="margin-top:32px"><h2>Our centres</h2></div>' + branchCards(branches) : '') +
        '</div></section>' +
        '<section class="site-section site-section-tint"><div class="site-wrap site-split site-contact-split">' +
        '<div>' + sectionHead('Send a message', 'Tell us about your family', 'We reply by email. If you would rather talk, call the centre during office hours.') +
        socialLinks(content.social || {}) +
        (contact.mapUrl ? '<div class="site-section-foot"><a class="btn btn-secondary" href="' + R.attr(contact.mapUrl) + '" target="_blank" rel="noopener">Open directions</a></div>' : '') +
        '</div><div>' + enquiryForm(slug, branches) + '</div></div></section>' +
        ctaBand(slug, content.admissions || {}, org);
    }
  };

  V.publicApply = {
    async load(ctx, params) {
      ctx.publicSlug = params.slug;
      ctx.publicEnquiry = {
        guardianName: '', guardianEmail: '', guardianPhone: '', childName: '', childDateOfBirth: '',
        requestedAgeGroup: '', preferredStartDate: '', message: '', website: '', branchId: ''
      };
      ctx.publicResult = null;
      ctx.publicError = null;
      ctx.siteMenuOpen = false;
      const payload = await R.api('GET', '/public/daycares/' + encodeURIComponent(params.slug));
      const form = await R.api('GET', '/public/daycares/' + encodeURIComponent(params.slug) + '/enquiry-form');
      return { site: payload.data, form: form.data };
    },

    render(ctx, params, page) {
      const site = page.site || {};
      const org = site.organisation || {};
      const branding = site.branding || {};
      const content = site.content || {};
      const branches = (page.form && page.form.branches) || [];
      const ageGroups = (page.form && page.form.ageGroups) || [];
      return '<div class="public site" ' + R.themeStyle(branding) + '>' +
        siteNav(params.slug, 'admissions', org) +
        '<section class="site-section"><div class="site-wrap site-narrow">' +
        '<a href="' + R.attr(siteHref(params.slug, 'home')) + '" class="muted small">← Back to website</a>' +
        '<div class="site-eyebrow" style="margin-top:20px">Admissions</div>' +
        '<h1>Enquire about a place</h1>' +
        '<p class="lede">Share a few details and the admissions team will be in touch. There is no obligation.</p>' +
        '<div class="alert alert-success" x-show="publicResult" style="margin-top:12px"><i data-lucide="check-circle"></i><span x-text="publicResult"></span></div>' +
        '<div class="alert alert-danger" x-show="publicError" style="margin-top:12px"><i data-lucide="alert-circle"></i><span x-text="publicError"></span></div>' +
        '<div class="card glass site-form-card" style="margin-top:16px">' +
        '<form @submit.prevent="submitPublicEnquiry($event, \'' + R.attr(params.slug) + '\')"><div class="form-grid">' +
        '<div class="field"><label>Your name *</label><input class="input" name="guardianName" required x-model="publicEnquiry.guardianName"></div>' +
        '<div class="field"><label>Email *</label><input class="input" type="email" name="guardianEmail" required x-model="publicEnquiry.guardianEmail"></div>' +
        '<div class="field"><label>Phone</label><input class="input" type="tel" name="guardianPhone" x-model="publicEnquiry.guardianPhone"></div>' +
        '<div class="field"><label>Child\'s name</label><input class="input" name="childName" x-model="publicEnquiry.childName"></div>' +
        '<div class="field"><label>Child\'s date of birth</label><input class="input" type="date" name="childDateOfBirth" x-model="publicEnquiry.childDateOfBirth"></div>' +
        (branches.length ? '<div class="field"><label>Preferred centre</label><select class="select" x-model="publicEnquiry.branchId"><option value="">Any centre</option>' +
          branches.map((branch) => '<option value="' + R.attr(branch.id) + '">' + R.esc(branch.name) + '</option>').join('') + '</select></div>' : '') +
        (ageGroups.length ? '<div class="field"><label>Age group</label><select class="select" x-model="publicEnquiry.requestedAgeGroup"><option value="">Select…</option>' +
          ageGroups.map((group) => '<option value="' + R.attr(group) + '">' + R.esc(group) + '</option>').join('') + '</select></div>' : '') +
        '<div class="field"><label>Preferred start date</label><input class="input" type="date" x-model="publicEnquiry.preferredStartDate"></div>' +
        '<div class="field span-2"><label>Message</label><textarea class="textarea" x-model="publicEnquiry.message" placeholder="Tell us a little about your family and what you are looking for."></textarea></div>' +
        '<div class="field span-2" style="position:absolute;left:-9999px" aria-hidden="true"><label>Website</label><input class="input" tabindex="-1" autocomplete="off" x-model="publicEnquiry.website"></div>' +
        '</div><button class="btn btn-primary" type="submit">Send enquiry</button></form></div>' +
        (content.contact && content.contact.phone ? '<p class="muted small" style="margin-top:14px">Prefer to talk? Call <a href="tel:' +
          R.attr(String(content.contact.phone).replace(/[^\d+]/g, '')) + '">' + R.esc(content.contact.phone) + '</a>.</p>' : '') +
        '</div></section>' +
        siteFooter(params.slug, org, content) + '</div>';
    }
  };

  V.publicForm = {
    async load(ctx, params) {
      const payload = await R.api('GET', '/public/forms/' + encodeURIComponent(params.slug) + '/' + encodeURIComponent(params.formSlug));
      ctx.publicFormData = {};
      (payload.data.form.schema_json.fields || []).forEach((f) => { ctx.publicFormData[f.key] = f.type === 'checkbox' ? false : ''; });
      ctx.publicResult = null;
      ctx.publicError = null;
      ctx.siteMenuOpen = false;
      return payload.data;
    },
    render(ctx, params, page) {
      const fields = (page.form.schema_json && page.form.schema_json.fields) || [];
      const branding = page.branding || {};
      const org = page.organisation || {};
      const input = (field) => {
        const model = 'publicFormData.' + field.key;
        if (field.type === 'textarea') return '<textarea class="textarea" x-model="' + model + '" ' + (field.required ? 'required' : '') + '></textarea>';
        if (field.type === 'select' || field.type === 'radio') return '<select class="select" x-model="' + model + '" ' + (field.required ? 'required' : '') + '><option value="">Select…</option>' + (field.options || []).map((o) => '<option value="' + R.attr(o) + '">' + R.esc(o) + '</option>').join('') + '</select>';
        if (field.type === 'checkbox') return '<label class="check"><input type="checkbox" x-model="' + model + '"><span>' + R.esc(field.helpText || 'Yes') + '</span></label>';
        if (field.type === 'date') return '<input class="input" type="date" x-model="' + model + '" ' + (field.required ? 'required' : '') + '>';
        if (field.type === 'number') return '<input class="input" type="number" x-model="' + model + '" ' + (field.required ? 'required' : '') + '>';
        if (field.type === 'email') return '<input class="input" type="email" x-model="' + model + '" ' + (field.required ? 'required' : '') + '>';
        if (field.type === 'phone') return '<input class="input" type="tel" x-model="' + model + '" ' + (field.required ? 'required' : '') + '>';
        return '<input class="input" type="text" x-model="' + model + '" ' + (field.required ? 'required' : '') + '>';
      };
      return '<div class="public site" ' + R.themeStyle(branding) + '>' +
        siteNav(params.slug, null, org) +
        '<section class="site-section"><div class="site-wrap site-narrow">' +
        '<a href="' + R.attr(siteHref(params.slug, 'home')) + '" class="muted small">← Back to website</a>' +
        '<div class="site-eyebrow" style="margin-top:20px">Form</div>' +
        '<h1>' + R.esc(page.form.name) + '</h1><p class="lede">' + R.esc(page.form.description || '') + '</p>' +
        '<div class="alert alert-success" x-show="publicResult" style="margin-top:12px"><i data-lucide="check-circle"></i><span x-text="publicResult"></span></div>' +
        '<div class="alert alert-danger" x-show="publicError" style="margin-top:12px"><i data-lucide="alert-circle"></i><span x-text="publicError"></span></div>' +
        '<div class="card glass site-form-card" style="margin-top:16px"><form @submit.prevent="submitPublicForm($event, \'' + R.attr(params.slug) + '\', \'' + R.attr(params.formSlug) + '\')">' +
        (fields.length ? fields.map((f) => '<div class="field"><label>' + R.esc(f.label) + (f.required ? ' *' : '') + '</label>' + input(f) + (f.helpText ? '<div class="hint">' + R.esc(f.helpText) + '</div>' : '') + '</div>').join('') : '<p class="muted">This form has no fields yet.</p>') +
        '<button class="btn btn-primary" type="submit">Submit</button></form></div>' +
        '</div></section>' + siteFooter(params.slug, org, {}) + '</div>';
    }
  };

  V.resetPassword = {
    load(ctx) {
      ctx.resetDone = false;
      ctx.resetError = null;
      return { token: (ctx.query && ctx.query.token) || '' };
    },
    render(ctx, params, page) {
      const body = page.token
        ? '<div class="alert alert-success" x-show="resetDone"><i data-lucide="check-circle"></i><span>Your password has been changed. You can now sign in.</span></div>' +
          '<div class="alert alert-danger" x-show="resetError" style="margin-top:10px"><i data-lucide="alert-circle"></i><span x-text="resetError"></span></div>' +
          '<form @submit.prevent="submitResetPassword($event)" x-show="!resetDone">' +
          '<div class="field"><label for="reset-password">New password</label><input class="input" id="reset-password" name="password" type="password" autocomplete="new-password" minlength="10" required placeholder="At least 10 characters"></div>' +
          '<div class="field"><label for="reset-confirm">Confirm password</label><input class="input" id="reset-confirm" name="confirm" type="password" autocomplete="new-password" minlength="10" required></div>' +
          '<button class="btn btn-primary btn-block" type="submit">Choose new password</button></form>' +
          '<div class="row" style="margin-top:14px"><a class="muted small" href="#/login" x-show="resetDone">Go to sign in →</a></div>'
        : '<div class="alert alert-warning"><i data-lucide="alert-triangle"></i><span>This reset link is missing its token. Request a new link from the sign-in page.</span></div>' +
          '<a class="btn btn-primary" href="#/login">Back to sign in</a>';
      return '<div class="public"><nav class="public-nav"><div class="row" style="gap:10px"><div class="brand-mark">R</div><div><div class="brand-name">Re-EL ECD</div><div class="brand-sub">Early childhood, elevated</div></div></div><div class="links"><a href="#/login">Sign in</a></div></nav>' +
        '<section class="public-section" style="max-width:520px;margin:40px auto"><h1>Choose a new password</h1><p class="lede">Use at least 10 characters. Signing in elsewhere will be required again.</p>' +
        '<div class="card glass" style="margin-top:16px">' + body + '</div></section></div>';
    }
  };

  V.acceptInvite = {
    load(ctx) {
      ctx.inviteDone = false;
      ctx.inviteError = null;
      return { token: (ctx.query && ctx.query.token) || '' };
    },
    render(ctx, params, page) {
      const body = page.token
        ? '<div class="alert alert-success" x-show="inviteDone"><i data-lucide="check-circle"></i><span>Your account is ready. Sign in with your email and new password.</span></div>' +
          '<div class="alert alert-danger" x-show="inviteError" style="margin-top:10px"><i data-lucide="alert-circle"></i><span x-text="inviteError"></span></div>' +
          '<form @submit.prevent="submitAcceptInvite($event)" x-show="!inviteDone">' +
          '<div class="field"><label for="invite-name">Your name</label><input class="input" id="invite-name" name="displayName" autocomplete="name" required placeholder="How your name appears in the centre"></div>' +
          '<div class="field"><label for="invite-password">Password</label><input class="input" id="invite-password" name="password" type="password" autocomplete="new-password" minlength="10" required placeholder="At least 10 characters"></div>' +
          '<div class="field"><label for="invite-confirm">Confirm password</label><input class="input" id="invite-confirm" name="confirm" type="password" autocomplete="new-password" minlength="10" required></div>' +
          '<button class="btn btn-primary btn-block" type="submit">Accept invitation</button></form>' +
          '<div class="row" style="margin-top:14px"><a class="muted small" href="#/login" x-show="inviteDone">Go to sign in →</a></div>'
        : '<div class="alert alert-warning"><i data-lucide="alert-triangle"></i><span>This invitation link is missing its token. Ask the centre administrator to send a new invitation.</span></div>' +
          '<a class="btn btn-primary" href="#/login">Back to sign in</a>';
      return '<div class="public"><nav class="public-nav"><div class="row" style="gap:10px"><div class="brand-mark">R</div><div><div class="brand-name">Re-EL ECD</div><div class="brand-sub">Early childhood, elevated</div></div></div><div class="links"><a href="#/login">Sign in</a></div></nav>' +
        '<section class="public-section" style="max-width:520px;margin:40px auto"><h1>Join your centre</h1><p class="lede">Set your name and a password to activate your Re-EL ECD account.</p>' +
        '<div class="card glass" style="margin-top:16px">' + body + '</div></section></div>';
    }
  };
})();
