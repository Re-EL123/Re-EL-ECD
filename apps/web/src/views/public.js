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
        '<video class="auth-art-video" src="assets/branding/login-hero.mp4" type="video/mp4" autoplay muted loop playsinline preload="metadata" aria-hidden="true" tabindex="-1"></video>' +
        '<div><div class="row" style="gap:10px">' + logoMark + '<div><div class="brand-name" style="color:#fff">' + R.esc(name) + '</div><div class="brand-sub" style="color:rgba(255,255,255,0.7)">' + R.esc(R.PLATFORM_BRAND.tagline) + '</div></div></div>' +
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
        '<div class="field"><label for="login-email">Email</label><div class="input-wrap"><span class="input-icon" aria-hidden="true"><i data-lucide="mail"></i></span><input class="input input-icon-left" id="login-email" name="email" type="email" autocomplete="username" required x-model="loginEmail" placeholder="you@centre.co.za"></div></div>' +
        '<div class="field"><label for="login-password">Password</label><div class="input-wrap"><span class="input-icon" aria-hidden="true"><i data-lucide="lock"></i></span><input class="input input-icon-left input-icon-right" id="login-password" name="password" :type="loginShowPassword ? \'text\' : \'password\'" autocomplete="current-password" required x-model="loginPassword" placeholder="Your password"><button type="button" class="password-toggle" @click.prevent="loginShowPassword = !loginShowPassword" :aria-label="loginShowPassword ? \'Hide password\' : \'Show password\'" :aria-pressed="loginShowPassword" :title="loginShowPassword ? \'Hide password\' : \'Show password\'"><i data-lucide="eye" x-show="!loginShowPassword" x-cloak></i><i data-lucide="eye-off" x-show="loginShowPassword" x-cloak></i></button></div></div>' +
        '<button class="btn btn-primary btn-block" type="submit" :disabled="loginBusy"><span class="spinner" x-show="loginBusy" style="width:15px;height:15px"></span><span x-text="loginBusy ? \'Signing in…\' : \'Sign in\'"></span></button>' +
        '</form>' +
        '<div class="row" style="margin-top:10px;justify-content:center"><button type="button" class="link-strong small" @click="forgotOpen = !forgotOpen">Forgot password?</button></div>' +
        ((brand && brand.allowTenantSignup) ? '<div class="row" style="margin-top:10px;justify-content:center"><a class="link-strong small" href="#/signup">New centre? Create your account →</a></div>' : '') +
        '<div class="auth-legal-links"><a href="#/legal/terms">Terms</a><span aria-hidden="true">·</span><a href="#/legal/privacy">Privacy</a><span aria-hidden="true">·</span><a href="#/legal/cookies">Cookies</a><span aria-hidden="true">·</span><a href="#/legal">Legal hub</a></div>' +
        '<div x-show="forgotOpen" x-cloak style="margin-top:10px">' +
        '<div class="alert alert-success" x-show="resetSent" x-cloak><i data-lucide="check-circle"></i><span x-text="resetSent"></span></div>' +
        '<form @submit.prevent="sendPasswordReset($event)" x-show="!resetSent">' +
        '<div class="field"><label for="forgot-email">Email address</label><div class="input-wrap"><span class="input-icon" aria-hidden="true"><i data-lucide="mail"></i></span><input class="input input-icon-left" id="forgot-email" name="email" type="email" autocomplete="username" required placeholder="you@centre.co.za"></div></div>' +
        '<button class="btn btn-secondary btn-block" type="submit">Email me a reset link</button></form></div>' +
        '</div></div></div>';
    }
  };

  const SITE_PAGES = [
    { key: 'home', label: 'Home', path: '' },
    { key: 'about', label: 'About', path: 'about' },
    { key: 'programmes', label: 'Programmes', path: 'programmes' },
    { key: 'admissions', label: 'Admissions', path: 'admissions' },
    { key: 'forms', label: 'Forms', path: 'forms' },
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

  /**
   * Staff sign-in always belongs to the product's own address. On a tenant's
   * custom domain the session cookie and CSRF token live on the platform
   * origin, so sending staff to the platform address avoids a confusing
   * cross-site login.
   */
  function staffHref() {
    if (!R.isPlatformHost || R.isPlatformHost()) return '#/login';
    const base = String(window.REEL_PLATFORM_URL || 'https://ecd.re-el.co.za').replace(/\/+$/, '');
    return base + '/#/login';
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

  /**
   * Families sign in with the same credentials as staff — the portal decides
   * which workspace to show. The daycare website speaks to parents first, so
   * the prominent sign-in entry is the parent one; staff keep a smaller link.
   */
  function parentHref() {
    return staffHref();
  }

  /**
   * Signed-out pages (sign-in, sign-up, password reset, legal) all share one
   * platform lockup. The logo comes from Platform → Configuration when the
   * super admin has uploaded one, so every surface updates together instead of
   * some pages showing the bundled artwork and others a letter tile.
   */
  function platformBranding(ctx) {
    return (ctx && ctx.platformBrand && ctx.platformBrand.branding) || R.PLATFORM_BRAND.theme;
  }

  function platformLogo(ctx) {
    const organisation = (ctx && ctx.platformBrand && ctx.platformBrand.organisation) || {};
    return organisation.logoUrl || R.PLATFORM_LOGO;
  }

  function platformLockup(ctx, tagline) {
    const name = R.PLATFORM_BRAND.name;
    return '<span class="auth-brand-logo"><img src="' + R.attr(platformLogo(ctx)) + '" alt="' + R.attr(name) + '"></span>' +
      '<div><div class="brand-name">' + R.esc(name) + '</div><div class="brand-sub">' + R.esc(tagline || R.PLATFORM_BRAND.tagline) + '</div></div>';
  }

  function platformNav(ctx, links) {
    return '<nav class="public-nav site-nav"><a class="site-brand" href="#/login">' + platformLockup(ctx) + '</a>' +
      '<div class="links">' + (links || '<a href="#/login">Sign in</a>') + '</div></nav>';
  }

  function platformShell(ctx, body) {
    // `site` carries the shared page-width and lockup rules, so signed-out
    // platform pages line up with tenant websites instead of running to the
    // viewport edge.
    return '<div class="public site" ' + R.themeStyle(platformBranding(ctx)) + '>' + body + '</div>';
  }

  function missingSitePage(ctx, title, message, backHref, backLabel) {
    return '<div class="public site site-missing" ' + R.themeStyle(platformBranding(ctx)) + '><div class="site-missing-card">' +
      '<span class="auth-brand-logo" style="margin:0 auto 16px"><img src="' + R.attr(platformLogo(ctx)) + '" alt="' + R.attr(R.PLATFORM_BRAND.name) + '"></span>' +
      '<h1>' + R.esc(title) + '</h1>' +
      '<p class="lede">' + R.esc(message) + '</p>' +
      '<div class="site-actions" style="justify-content:center">' +
      '<a class="btn btn-primary" href="' + R.attr(parentHref()) + '">Parent sign-in</a>' +
      (backHref ? '<a class="btn btn-secondary" href="' + R.attr(backHref) + '">' + R.esc(backLabel || 'Back to website') + '</a>' : '') +
      '</div><p class="muted small" style="margin-top:12px">Centre staff? <a href="' + R.attr(staffHref()) + '">Sign in here</a>.</p></div></div>';
  }

  function siteNav(slug, current, org) {
    const links = SITE_PAGES.map((page) => '<a class="' + (page.key === current ? 'active' : '') + '" href="' +
      R.attr(siteHref(slug, page.key)) + '" @click="siteMenuOpen = false">' + R.esc(page.label) + '</a>').join('');
    return '<nav class="public-nav site-nav">' +
      '<a class="site-brand" href="' + R.attr(siteHref(slug, 'home')) + '">' + logoMark(org, 42) +
      '<span><span class="brand-name">' + R.esc(org.name || 'Early learning centre') + '</span>' +
      '<span class="brand-sub">Early learning centre</span></span></a>' +
      '<button type="button" class="site-nav-toggle" :aria-label="siteMenuOpen ? \'Close menu\' : \'Open menu\'" :aria-expanded="siteMenuOpen" @click="siteMenuOpen = !siteMenuOpen">' + R.icon('menu') + '</button>' +
      '<div class="links" :class="siteMenuOpen ? \'open\' : \'\'">' + links +
      '<a class="btn btn-secondary btn-sm" href="' + R.attr(parentHref()) + '" @click="siteMenuOpen = false">' + R.icon('users') + ' Parent sign-in</a>' +
      '<a class="btn btn-primary btn-sm" href="#/site/' + R.attr(slug) + '/apply" @click="siteMenuOpen = false">Enquire</a>' +
      '<a class="muted site-staff-link" href="' + R.attr(staffHref()) + '" @click="siteMenuOpen = false">Staff</a></div>' +
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
      '<span class="spacer"></span><a href="#/legal/terms">Terms</a><a href="#/legal/privacy">Privacy</a><a href="#/legal/cookies">Cookies</a><a href="#/legal">Legal</a><a href="#/site/' + R.attr(slug) + '/apply">Enquire about a place</a>' +
      '<a class="site-parent-link" href="' + R.attr(parentHref()) + '">Parent sign-in</a><a href="' + R.attr(staffHref()) + '">Staff sign in</a></div>' +
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
      '<a class="btn btn-secondary" href="' + R.attr(siteHref(slug, 'forms')) + '">Forms and payments</a></div>' +
      '</div></section>';
  }

  V.publicSite = {
    async load(ctx, params) {
      // A custom domain is resolved from the hostname, so the address a family
      // types has no slug in it. The platform host still uses #/site/:slug.
      const requestedSlug = params.slug || null;
      ctx.publicSlug = requestedSlug;
      ctx.publicEnquiry = {
        guardianName: '', guardianEmail: '', guardianPhone: '', childName: '', childDateOfBirth: '',
        requestedAgeGroup: '', preferredStartDate: '', message: '', website: '', branchId: ''
      };
      ctx.publicResult = null;
      ctx.publicError = null;
      ctx.siteMenuOpen = false;

      try {
        let payload;
        if (requestedSlug) {
          // On a verified custom domain pass the host so the API can build the
          // canonical address. The API only honours hosts owned by this org.
          const customHost = R.isPlatformHost && !R.isPlatformHost() ? location.hostname : null;
          const suffix = customHost ? '?host=' + encodeURIComponent(customHost) : '';
          payload = await R.api('GET', '/public/daycares/' + encodeURIComponent(requestedSlug) + suffix);
        } else {
          payload = await R.api('GET', '/public/daycares/by-domain/' + encodeURIComponent(location.hostname));
        }
        const data = payload.data || {};
        ctx.publicSlug = (data.organisation && data.organisation.slug) || requestedSlug || null;
        return data;
      } catch (error) {
        if (error instanceof R.ApiError && error.code === 'NOT_FOUND') {
          const host = location.hostname;
          return {
            missing: true,
            requestedHost: host,
            seo: {
              title: 'Website not found | Re-EL ECD',
              description: 'No daycare website is published at this address.',
              keywords: ['Re-EL ECD', 'daycare website'],
              organisationName: 'Re-EL ECD',
              canonical: 'https://' + host + '/'
            }
          };
        }
        throw error;
      }
    },

    render(ctx, params, page) {
      if (page && page.missing) {
        return missingSitePage(
          ctx,
          'No website at this address',
          'We could not find a daycare website for ' + (page.requestedHost || 'this address') + '. The address may have changed, or the centre may not have published its site yet.',
          'https://ecd.re-el.co.za',
          'About Re-EL ECD'
        );
      }

      const content = (page && page.content) || {};
      const org = (page && page.organisation) || { name: R.titleCase((params && params.slug) || 'Early learning centre') };
      const branches = (page && page.branches) || [];
      const branding = (page && page.branding) || {};
      const slug = (params && params.slug) || org.slug || (ctx && ctx.publicSlug) || '';
      const current = sitePage((params && params.page) || 'home');
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
          '<a class="btn btn-secondary" href="' + R.attr(parentHref()) + '">Parent sign-in</a></div></div></section>');
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
      try {
        const payload = await R.api('GET', '/public/daycares/' + encodeURIComponent(params.slug) +
          (R.isPlatformHost && !R.isPlatformHost() ? '?host=' + encodeURIComponent(location.hostname) : ''));
        const form = await R.api('GET', '/public/daycares/' + encodeURIComponent(params.slug) + '/enquiry-form');
        return { site: payload.data, form: form.data };
      } catch (error) {
        if (error instanceof R.ApiError && error.code === 'NOT_FOUND') {
          return { missing: true };
        }
        throw error;
      }
    },

    render(ctx, params, page) {
      if (page && page.missing) {
        return missingSitePage(
          ctx,
          'We could not load the enquiry form',
          'The daycare website at this address is unavailable or has not been published yet. Please try again later, or contact the centre directly.',
          siteHref(params.slug, 'home'),
          'Back to website'
        );
      }
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

  V.publicForms = {
    async load(ctx, params) {
      ctx.publicSlug = params.slug;
      ctx.siteMenuOpen = false;
      ctx.publicResult = null;
      ctx.publicError = null;
      try {
        const payload = await R.api('GET', '/public/daycares/' + encodeURIComponent(params.slug));
        return payload.data || {};
      } catch (error) {
        if (error instanceof R.ApiError && error.code === 'NOT_FOUND') {
          return { missing: true };
        }
        throw error;
      }
    },

    render(ctx, params, page) {
      if (page && page.missing) {
        return missingSitePage(
          ctx,
          'We could not load the forms',
          'The daycare website at this address is unavailable or has not been published yet. Please try again later, or contact the centre directly.',
          siteHref(params.slug, 'home'),
          'Back to website'
        );
      }
      const org = page.organisation || {};
      const branding = page.branding || {};
      const content = page.content || {};
      const forms = page.forms || [];
      const slug = params.slug || org.slug || '';
      const card = (form) => {
        const payment = form.payment || {};
        return '<article class="public-card site-form-card">' +
          '<div class="site-eyebrow">' + R.esc(R.titleCase(form.formType || 'form')) + '</div>' +
          '<h3>' + R.esc(form.name) + '</h3>' +
          '<p class="muted small">' + R.esc(form.description || 'Complete this form online. The centre will review your response.') + '</p>' +
          (payment.enabled
            ? '<div class="site-pay-summary">' + R.icon('credit-card') + '<span>Pay ' +
              R.esc(R.money(payment.amount, payment.currency || 'ZAR')) + ' with PayFast</span></div>'
            : '<span class="badge badge-muted">No payment required</span>') +
          '<div class="site-form-foot"><a class="btn btn-primary" href="#/site/' + R.attr(slug) + '/forms/' +
            R.attr(form.slug) + '">Open form</a></div></article>';
      };
      return '<div class="public site" ' + R.themeStyle(branding) + '>' +
        siteNav(slug, 'forms', org) +
        '<section class="site-section"><div class="site-wrap">' +
        sectionHead('Forms', 'Complete a form online',
          'Enrolment, medical updates, consent and payments in one place. Everything you submit goes straight to the centre office.') +
        (forms.length
          ? '<div class="site-form-list">' + forms.map(card).join('') + '</div>'
          : '<div class="site-empty">There are no public forms available right now. Please contact the centre and the team will help you.</div>') +
        '<div class="site-section-foot"><a class="btn btn-secondary" href="' + R.attr(siteHref(slug, 'admissions')) + '">Admissions</a>' +
        '<a class="btn btn-primary" href="' + R.attr(siteHref(slug, 'home')) + '">Back to home</a></div>' +
        '</div></section>' + siteFooter(slug, org, content) + '</div>';
    }
  };

  V.publicForm = {
    async load(ctx, params) {
      try {
        const payload = await R.api('GET', '/public/forms/' + encodeURIComponent(params.slug) + '/' + encodeURIComponent(params.formSlug));
        const data = payload.data || {};
        const fields = ((data.form && data.form.schema_json) || {}).fields || [];
        ctx.publicFormData = {};
        ctx.publicFormSchema = fields;
        ctx.publicUploads = {};
        fields.forEach((f) => {
          ctx.publicFormData[f.key] = f.type === 'checkboxes' ? [] : '';
        });
        ctx.publicPayerEmail = '';
        ctx.publicPayerName = '';
        ctx.publicCheckout = null;
        ctx.publicResult = (ctx.query && ctx.query.payment === 'return')
          ? 'Thank you. If your payment completed, the centre will confirm it shortly.'
          : null;
        ctx.publicError = null;
        ctx.siteMenuOpen = false;
        return data;
      } catch (error) {
        if (error instanceof R.ApiError && error.code === 'NOT_FOUND') {
          return { missing: true };
        }
        throw error;
      }
    },
    render(ctx, params, page) {
      if (page && page.missing) {
        return missingSitePage(
          ctx,
          'We could not find that form',
          'This form is unavailable. It may not have been published yet, or the link may be incorrect. Please contact the centre and the team will help you.',
          siteHref(params.slug, 'forms'),
          'View all forms'
        );
      }
      const form = page.form || {};
      const fields = (form.schema_json && form.schema_json.fields) || [];
      const payment = form.payment || {};
      const branding = page.branding || {};
      const org = page.organisation || {};
      const input = (field) => {
        const model = 'publicFormData.' + field.key;
        const required = field.required ? ' required' : '';
        const key = R.attr(field.key);
        if (field.type === 'textarea') return '<textarea class="textarea" x-model="' + model + '"' + required + '></textarea>';
        if (field.type === 'radio') {
          return '<div class="radio-group">' + (field.options || []).map((option, index) =>
            '<label class="check"><input type="radio" name="' + key + '" value="' + R.attr(option) + '" x-model="' + model + '"' + (field.required && index === 0 ? ' required' : '') + '><span>' + R.esc(option) + '</span></label>'
          ).join('') + '</div>';
        }
        if (field.type === 'checkboxes') {
          return '<div class="radio-group">' + (field.options || []).map((option) =>
            '<label class="check"><input type="checkbox" value="' + R.attr(option) + '" :checked="(publicFormData.' + field.key + ' || []).includes(' + R.attr(JSON.stringify(option)) + ')" @change="togglePublicChoice(\'' + key + '\', ' + R.attr(JSON.stringify(option)) + ', $event.target.checked)"><span>' + R.esc(option) + '</span></label>'
          ).join('') + '</div>';
        }
        if (field.type === 'select') return '<select class="select" x-model="' + model + '"' + required + '><option value="">Select…</option>' + (field.options || []).map((o) => '<option value="' + R.attr(o) + '">' + R.esc(o) + '</option>').join('') + '</select>';
        if (field.type === 'checkbox') {
          // Yes/no is a real choice, not a lone tick box. It stores "true" or
          // "false" so the API can coerce it to a boolean.
          return '<div class="radio-group">' +
            '<label class="check"><input type="radio" name="' + key + '" value="true" x-model="' + model + '"' + required + '><span>Yes</span></label>' +
            '<label class="check"><input type="radio" name="' + key + '" value="false" x-model="' + model + '"><span>No</span></label>' +
            '</div>';
        }
        if (field.type === 'date') return '<input class="input" type="date" x-model="' + model + '"' + required + '>';
        if (field.type === 'number') return '<input class="input" type="number" x-model="' + model + '"' + required + '>';
        if (field.type === 'email') return '<input class="input" type="email" x-model="' + model + '"' + required + '>';
        if (field.type === 'phone') return '<input class="input" type="tel" x-model="' + model + '" autocomplete="tel"' + required + '>';
        if (field.type === 'file') {
          return '<div class="file-field">' +
            '<input class="input" type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.txt,.csv" @change="uploadPublicFormFile($event, \'' + key + '\', \'' + R.attr(params.slug) + '\', \'' + R.attr(params.formSlug) + '\')">' +
            '<div class="hint" x-show="publicUploads[\'' + key + '\']">Uploading…</div>' +
            '<div class="hint" x-show="publicFormData.' + field.key + '"><a :href="publicFormData.' + field.key + '" target="_blank" rel="noopener">View uploaded file</a> · <button type="button" class="btn btn-sm btn-ghost" @click="removePublicFormFile(\'' + key + '\')">Remove</button></div>' +
            '</div>';
        }
        if (field.type === 'signature') return '<input class="input" type="text" x-model="' + model + '" autocomplete="name" placeholder="Type your full name to sign"' + required + '>';
        return '<input class="input" type="text" x-model="' + model + '"' + required + '>';
      };
      const hasEmailField = fields.some((field) => field.type === 'email');
      return '<div class="public site" ' + R.themeStyle(branding) + '>' +
        siteNav(params.slug, 'forms', org) +
        '<section class="site-section"><div class="site-wrap site-narrow">' +
        '<a href="' + R.attr(siteHref(params.slug, 'forms')) + '" class="muted small">← All forms</a>' +
        '<div style="margin-top:20px"><div class="site-eyebrow">Form</div></div>' +
        '<h1>' + R.esc(form.name) + '</h1><p class="lede">' + R.esc(form.description || '') + '</p>' +
        (payment.enabled
          ? '<div class="site-pay-summary" style="margin-top:12px">' + R.icon('credit-card') +
            '<span>' + R.esc(R.money(payment.amount, payment.currency || 'ZAR')) +
            (payment.required === false ? ' · optional payment' : ' · payment required') + ' · secure PayFast checkout</span></div>'
          : '') +
        '<div class="alert alert-success" x-show="publicResult" style="margin-top:12px"><i data-lucide="check-circle"></i><span x-text="publicResult"></span></div>' +
        '<div class="alert alert-danger" x-show="publicError" style="margin-top:12px"><i data-lucide="alert-circle"></i><span x-text="publicError"></span></div>' +
        '<div class="card glass site-form-card" style="margin-top:16px"><form @submit.prevent="submitPublicForm($event, \'' + R.attr(params.slug) + '\', \'' + R.attr(params.formSlug) + '\')">' +
        (fields.length ? fields.map((f) => '<div class="field"><label>' + R.esc(f.label) + (f.required ? ' *' : '') + '</label>' + input(f) + (f.helpText ? '<div class="hint">' + R.esc(f.helpText) + '</div>' : '') + '</div>').join('') : '<p class="muted">This form has no fields yet.</p>') +
        (payment.enabled && payment.available && !hasEmailField
          ? '<div class="form-grid"><div class="field"><label>Email for the receipt</label><input class="input" type="email" x-model="publicPayerEmail" placeholder="you@example.com"></div>' +
            '<div class="field"><label>Name on the payment</label><input class="input" x-model="publicPayerName" placeholder="Your name"></div></div>'
          : '') +
        '<div class="field span-2" style="position:absolute;left:-9999px" aria-hidden="true"><label>Website</label><input class="input" tabindex="-1" autocomplete="off" x-model="publicFormData.website"></div>' +
        '<button class="btn btn-primary" type="submit">' + (payment.enabled && payment.available ? 'Submit and pay' : 'Submit') + '</button>' +
        '</form>' +
        (payment.enabled && !payment.available
          ? '<div class="alert alert-warning" style="margin-top:12px"><i data-lucide="alert-triangle"></i><span>Online payment is not available yet. Submit the form and the centre will send a payment link.</span></div>'
          : '') +
        '<div x-show="publicCheckout" style="margin-top:12px"><button type="button" class="btn btn-primary" @click="submitCheckout(publicCheckout)">' + R.icon('credit-card') + ' Pay now with PayFast</button></div>' +
        '</div>' +
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
      return platformShell(ctx, platformNav(ctx) +
        '<section class="public-section" style="max-width:520px;margin:40px auto"><h1>Choose a new password</h1><p class="lede">Use at least 10 characters. Signing in elsewhere will be required again.</p>' +
        '<div class="card glass" style="margin-top:16px">' + body + '</div></section>');
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
      return platformShell(ctx, platformNav(ctx) +
        '<section class="public-section" style="max-width:520px;margin:40px auto"><h1>Join your centre</h1><p class="lede">Set your name and a password to activate your Re-EL ECD account.</p>' +
        '<div class="card glass" style="margin-top:16px">' + body + '</div></section>');
    }
  };

  V.signup = {
    async load(ctx) {
      ctx.signupBusy = false;
      ctx.signupError = null;
      ctx.signupDone = false;
      try {
        const payload = await R.api('GET', '/public/platform');
        const data = (payload && payload.data) || {};
        ctx.signupEnabled = data.allowTenantSignup === true;
        ctx.signupPlans = Array.isArray(data.plans) ? data.plans : [];
      } catch {
        ctx.signupEnabled = false;
        ctx.signupPlans = [];
      }
      return {};
    },
    render(ctx, params, page) {
      const enabled = ctx.signupEnabled === true;
      const plans = (ctx.signupPlans || []).map((p) =>
        '<option value="' + R.attr(p.plan_key) + '">' + R.esc(p.name) + ' — R' + R.esc(String(p.monthly_price)) + '/mo</option>'
      ).join('');
      const body = enabled
        ? '<div class="alert alert-success" x-show="signupDone"><i data-lucide="check-circle"></i><span>Your centre is created. Sign in with the email and password you chose — a welcome email is on its way.</span></div>' +
        '<div class="alert alert-danger" x-show="signupError" style="margin-top:10px"><i data-lucide="alert-circle"></i><span x-text="signupError"></span></div>' +
        '<form @submit.prevent="submitSignup($event)" x-show="!signupDone">' +
        '<div class="field"><label for="signup-centre">Centre name</label><input class="input" id="signup-centre" name="centreName" autocomplete="organization" required minlength="2" maxlength="200" placeholder="e.g. Little Sprouts Early Learning"></div>' +
        '<div class="field"><label for="signup-owner">Your name</label><input class="input" id="signup-owner" name="ownerName" autocomplete="name" required minlength="2" maxlength="120" placeholder="Owner / principal name"></div>' +
        '<div class="field"><label for="signup-email">Email</label><input class="input" id="signup-email" name="ownerEmail" type="email" autocomplete="email" required placeholder="you@centre.co.za"></div>' +
        '<div class="field"><label for="signup-plan">Plan (30-day trial)</label><select class="select" id="signup-plan" name="planKey"><option value="">No plan yet — choose later</option>' + plans + '</select></div>' +
        '<div class="field"><label for="signup-password">Password</label><input class="input" id="signup-password" name="password" type="password" autocomplete="new-password" minlength="10" required placeholder="At least 10 characters"></div>' +
        '<div class="field"><label for="signup-confirm">Confirm password</label><input class="input" id="signup-confirm" name="confirm" type="password" autocomplete="new-password" minlength="10" required></div>' +
        '<label class="check-row"><input type="checkbox" name="agreed"> <span>I accept the <a href="#/legal/terms">Terms of Service</a> and <a href="#/legal/privacy">Privacy Policy</a></span></label>' +
        '<button class="btn btn-primary btn-block" type="submit" :disabled="signupBusy"><span class="spinner" x-show="signupBusy" style="width:15px;height:15px"></span><span x-text="signupBusy ? \'Creating…\' : \'Create my centre\'"></span></button></form>' +
        '<div class="row" style="margin-top:14px"><a class="muted small" href="#/login" x-show="signupDone">Go to sign in →</a></div>'
        : '<div class="alert alert-info"><i data-lucide="info"></i><span>New centres are currently created by invitation. Contact Re-EL ECD and we will set up your workspace.</span></div>' +
        '<a class="btn btn-primary" href="#/login">Back to sign in</a>';
      return platformShell(ctx, platformNav(ctx) +
        '<section class="public-section" style="max-width:520px;margin:40px auto"><h1>Create your centre</h1><p class="lede">Start a 30-day trial. You become the owner of your workspace and can invite your team.</p>' +
        '<div class="card glass" style="margin-top:16px">' + body + '</div></section>');
    }
  };

  /* --- Legal pages (South Africa) -----------------------------------------
   * Platform policies. These pages are templates for a South African SaaS
   * operator: POPIA, ECTA, CPA, PAIA and ECD-sector obligations are
   * referenced throughout. They are not legal advice. Before relying on
   * them in production the Information Officer details, registration
   * numbers and DSD/DOE registrations on a tenant site must be verified
   * by a South African attorney and kept current.
   */

  const LEGAL_ENTITY = 'Re-EL ECD Technologies (Pty) Ltd';
  const LEGAL_UPDATED = '13 November 2026';
  const LEGAL_NAV = [
    ['/legal', 'Legal hub'],
    ['/legal/terms', 'Terms of Service'],
    ['/legal/privacy', 'Privacy Policy'],
    ['/legal/cookies', 'Cookie Policy'],
    ['/legal/acceptable-use', 'Acceptable Use'],
    ['/legal/safeguarding', 'Safeguarding']
  ];

  const LEGAL_PAGES = {
    terms: {
      title: 'Terms of Service',
      eyebrow: 'Terms',
      lede: 'The agreement between you, your centre and Re-EL ECD for using the platform.',
      intro: [
        'These Terms of Service (the “Terms”) govern your use of Re-EL ECD (the “Service”), provided by ' + LEGAL_ENTITY + ' (“we”, “us”). By creating an account, signing in, or using the Service you accept these Terms. If you use the Service for a centre, you warrant that you are authorised to bind that centre. If you do not agree, do not use the Service.',
        'This page is a general template in plain language for a South African operator. It is not legal advice. Have a South African attorney review these Terms for your exact facts before you rely on them.'
      ],
      sections: [
        ['1. The Service', ['Re-EL ECD is a multi-tenant software platform for early childhood development (ECD) centres: enrolments, attendance, learning records, parent communication, fees, media and a public website. Access is provided “as is” on a subscription basis. We do not provide childcare, medical advice, or early-learning assessment outcomes. All pedagogical, safeguarding, health and safety decisions remain those of the centre and its registered practitioners.']],
        ['2. Who may use the Service', ['You must be 18 or older, or use the Service with a parent or guardian’s consent. Tenant staff must hold the role and permissions granted by the centre administrator. Parent accounts are limited to children linked to that account. Any use that breaches the Children’s Act 38 of 2005, the Domestic Violence Act, or applicable DSD/Department of Basic Education (DBE) requirements is prohibited (see Safeguarding).']],
        ['3. Accounts and security', ['You are responsible for keeping your credentials secret and for all activity under your account. Use a strong, unique password and enable MFA where offered. You must notify us and your centre administrator immediately if you suspect unauthorised use. We may suspend or terminate an account for a material breach, suspected fraud, unlawful use, or to protect children or the Service.']],
        ['4. Subscription, billing and taxes (South Africa)', ['Centres choose a plan (Seedling, Sapling or a custom plan) priced in rand (ZAR). Subscriptions are billed via PayFast or, where the centre collects fees through the platform, settled to the centre by EFT after deducting the platform fee disclosed in the centre’s fee settings. Prices are quoted exclusive of VAT; VAT, if applicable, will be charged at the prevailing rate (currently 15% for most domestic supplies) and reflected on a tax invoice. Past-due subscriptions may be suspended after reasonable notice. All fees are non-refundable once the billing period has started, except where the Consumer Protection Act 68 of 2008 (CPA) requires a refund or where we agree in writing.']],
        ['5. Your data and content', ['You own the data you enter (learner records, photos, documents). You grant us a limited licence to host, transmit and display it solely to operate the Service, provide support and comply with the law. We apply role-based access, tenant isolation and encryption, but you are the responsible party for the accuracy of the records you keep and for obtaining any required consents from parents/guardians (see Privacy Policy for POPIA processing). On termination you may export your data; we will delete residual copies within 30 days, subject to legal retention duties.']],
        ['6. Acceptable use', ['You must not upload illegal, infringing or harmful content; attempt to access another tenant’s data; reverse-engineer, scrape or overload the Service; or use it to send spam or conduct fraud. Abusive behaviour may lead to immediate suspension and referral to the authorities. The Acceptable Use Policy gives the detailed rules.']],
        ['7. Platform support and “View as” access', ['To resolve a support case we may, on a short-lived and audited basis, impersonate a tenant user (“View as”). Every impersonation start and stop is written to the audit log with the acting administrator’s identity, and you can return to the platform console at any time. We do not read passwords, and we do not download data wholesale for our own purposes.']],
        ['8. Availability and liability', ['We aim for reliable service but do not guarantee uninterrupted availability. To the extent permitted by the CPA and the common law, our liability for any claim is limited to the fees you paid us in the three months before the claim, and we are not liable for indirect, consequential or loss-of-profit damages arising from use or non-use of the Service. Nothing in these Terms excludes liability for fraud, or for any liability that cannot be excluded under South African law.']],
        ['9. Termination', ['Either party may terminate a subscription on 30 days’ written notice (or immediately for a material breach). On termination, access ends, final fees fall due, and the export/delete duties in clause 5 apply. Survivals include amounts due, IP, confidentiality and liability clauses.']],
        ['10. Changes, law and disputes', ['We may update these Terms on reasonable notice; continued use is acceptance. These Terms are governed by the laws of the Republic of South Africa. Any dispute will first be addressed in good faith; if unresolved, it will be subject to the non-exclusive jurisdiction of the courts of the Republic of South Africa and, where the CPA applies, to the remedies it provides.']],
        ['11. Contact and company details', [LEGAL_ENTITY + ' · Registration 2026/000001/07 · South Africa. For legal notices: legal@re-el.co.za. For privacy: privacy@re-el.co.za (see Privacy Policy for the Information Officer). For billing: support@re-el.co.za.']]
      ],
    },
    privacy: {
      title: 'Privacy Policy',
      eyebrow: 'POPIA',
      lede: 'How we process personal information in line with South Africa’s Protection of Personal Information Act (POPIA).',
      intro: [
        'This Privacy Policy explains how ' + LEGAL_ENTITY + ' (“we”) processes personal information as a responsible party under the Protection of Personal Information Act 4 of 2013 (POPIA). Centres using the Service are also responsible parties for the learner, guardian and staff information they enter; guardians and staff are data subjects for both. This policy is a template, not legal advice. Confirm the Information Officer details and keep this policy current with a South African attorney.'
      ],
      sections: [
        ['1. Who we are and who to contact', ['Responsible Party: ' + LEGAL_ENTITY + ' (registration 2026/000001/07), platform operator of Re-EL ECD. Information Officer (PAIA Manual s14): the Information Officer named in our PAIA Manual, reachable at privacy@re-el.co.za. We will respond to verified requests within a reasonable time and, where PAIA requires it, within the statutory period.']],
        ['2. What we process and why (POPIA s11–s12)', ['We process only what is needed for the purpose, under a lawful basis: consent, contract, legal obligation, legitimate interests, vital interests, or public interest. Categories: account identity (name, email, phone, avatar); centre and branch data; learner data (name, date of birth, learner reference, classroom, attendance, allergies/medical notes, photos); guardian and staff data; communications; financial data (invoices, PayFast references — never full card numbers); device, IP and audit logs. Special personal information (health, biometrics, children’s data) is processed only with an applicable POPIA s27–s35 basis, normally explicit guardian consent, and with heightened safeguards.']],
        ['3. Children’s information', ['Children’s personal information is processed only where the parent/guardian has consented or another POPIA s35 basis applies, and only for enrolment, care, learning, safety and communication. Photos and videos are shared only with the consent recorded in the centre’s media settings. Guardians may withdraw consent at any time (withdrawal does not affect prior lawful processing).']],
        ['4. Sharing and processors', ['We share information only as instructed by the centre or required by law: with Cloudflare R2 (object storage for media — URLs and metadata are stored in our database), Resend (email delivery), PayFast (payments), and our hosting/database providers. Every operator is bound by contract to POPIA-grade confidentiality and security. We do not sell personal information. Cross-border transfers (s72) occur only under contract and for countries with substantially similar protection, or with your informed consent.']],
        ['5. Security and breach notification (s19–s22)', ['We apply administrative, technical and physical safeguards proportionate to the risk: encryption in transit and at rest, role-based tenant isolation, audit logging, short-lived sessions and least-privilege access. If a breach is likely to cause serious harm we will notify the Information Regulator and affected data subjects without unreasonable delay, as POPIA requires.']],
        ['6. Retention', ['We keep information only as long as needed for the purpose or as required by law (for example tax and accounting records for five years under the Tax Administration Act, and ECD records under DSD requirements). Centres set their own retention; on termination we delete or anonymise residual copies within 30 days.']],
        ['7. Your POPIA rights', ['You may request access to, correction of, or deletion of your personal information; object to or restrict certain processing; request portability where applicable; and lodge a complaint with the Information Regulator (inforeg.org.za). To exercise a right contact the centre (for centre-held records) or privacy@re-el.co.za (for platform account data). We will verify identity before acting and may refuse a request only on a lawful POPIA ground.']],
        ['8. Marketing and cookies', ['We do not send marketing to parents without opt-in consent, and every message offers an opt-out. Cookies are described in our Cookie Policy. You can withdraw consent for non-essential cookies at any time from your browser or our consent banner.']],
        ['9. Changes', ['We will publish changes to this policy with a new “last updated” date and, for material changes, reasonable advance notice.']]
      ],
    },
    cookies: {
      title: 'Cookie Policy',
      eyebrow: 'Cookies',
      lede: 'Which cookies we use, why, and how to control them under POPIA.',
      intro: ['Re-EL ECD uses cookies and similar storage to keep you signed in, remember your workspace, and understand aggregate usage. This policy explains the categories, in line with POPIA s11 and the Electronic Communications and Transactions Act 25 of 2002 (ECTA).'],
      sections: [
        ['Essential (always on)', ['Session cookie (reel_session): keeps you signed in. CSRF cookie (reel_csrf): protects forms. Impersonation cookie (reel_impersonation, HttpOnly, 30 minutes): only present for audited support sessions. These are strictly necessary and do not require consent, but you can sign out to clear them.']],
        ['Functional', ['Workspace and theme preferences (for example your last organisation and light/dark choice) stored in local storage. You can clear them from your browser at any time.']],
        ['Analytics (consent-based)', ['Anonymous, aggregate usage statistics that help us fix bugs and improve the product. We do not use advertising trackers, cross-site profiling, or sale of browsing data. You can withdraw consent by clearing storage or declining the optional analytics banner, without affecting sign-in.']],
        ['Third-party and media', ['Videos and images load from our own hosted storage (Cloudflare R2 via media.re-el.co.za) or the centre’s configured public base. No social-media pixels are embedded on sign-in.']],
        ['Managing cookies', ['Most browsers let you block or delete cookies in Settings → Privacy. Blocking essential cookies will sign you out. Withdrawing consent for analytics is effective immediately; past lawful processing is unaffected. Questions: privacy@re-el.co.za.']]
      ],
    },
    'acceptable-use': {
      title: 'Acceptable Use Policy',
      eyebrow: 'Acceptable use',
      lede: 'What you may and may not do on Re-EL ECD.',
      intro: ['This Acceptable Use Policy (AUP) forms part of the Terms of Service. It protects children, families and the shared platform. Breaches may lead to suspension and, where required, reporting to the authorities.'],
      sections: [
        ['1. Children and safeguarding come first', ['Never use the Service in a way that harms, exploits or sexualises a child, or that breaches the Children’s Act 38 of 2005. Do not attempt to access a child’s record unless you are that child’s parent/guardian or authorised staff. Report suspected abuse through your centre’s safeguarding lead and, where required, the Child Protection Register and SAPS processes — the Service does not replace those duties.']],
        ['2. Respect privacy and consent', ['Do not upload or share photos, medical details or other personal information without the required consent. Do not download bulk records for side purposes, scrape the Service, or share credentials. Treat POPIA special personal information (health, biometrics) as confidential.']],
        ['3. Platform integrity', ['Do not attempt to bypass tenant isolation or role-based permissions, reverse-engineer the Service, overload it (including bots and denial-of-service), or interfere with PayFast, email or storage providers. Do not upload malware, illegal content, or material that infringes copyright.']],
        ['4. Fair use of communication', ['Do not send spam, unsolicited marketing, or messages that misrepresent the centre. Parent communication must be truthful, non-discriminatory and respect opt-outs.']],
        ['5. Enforcement', ['We may warn, suspend, terminate or report breaches, and may preserve evidence for the authorities. You are liable for breaches by anyone using your account.']]
      ],
    },
    safeguarding: {
      title: 'Safeguarding and Child Protection Policy',
      eyebrow: 'Safeguarding',
      lede: 'How the platform and centres keep children safe, in line with South Africa’s Children’s Act and ECD duties.',
      intro: ['Re-EL ECD is software, not a childcare provider. This policy explains how the Service supports — but does not replace — a centre’s statutory safeguarding duties under the Children’s Act 38 of 2005, the Criminal Law (Sexual Offences) Act 32 of 2007, and applicable DSD/DBE Early Childhood Development requirements. Centres must adopt and publish their own safeguarding policy; this document is a platform template, not legal advice.'],
      sections: [
        ['1. Roles and responsibility', ['Each tenant centre must appoint a designated safeguarding lead and deputy, keep a current Child Protection Register check for all staff/volunteers, and ensure every adult working with children has been vetted and trained. Platform administrators enforce tenant-level access controls; they do not supervise children.']],
        ['2. Safe recruitment and training', ['Centres must verify identity, check the Child Protection Register and National Register for Sex Offenders where required, obtain police clearance where applicable, and complete induction covering abuse recognition, reporting, record-keeping and online safety. Re-EL ECD stores the resulting checks and expiry dates with role-gated visibility.']],
        ['3. Incident logging and reporting', ['The Health and Safety module logs incidents, corrective actions and follow-up with time-stamped audit trails. Suspected abuse must be reported immediately to the designated social worker and, where required, to SAPS and the DSD — not only recorded in the Service. The “View as” impersonation feature never delays a mandatory report.']],
        ['4. Health, food and premises safety', ['Centres must register and operate under DSD/DBE requirements for premises, staff-child ratios, nutrition (including the Regulations relating to Foodstuffs and the National Food Security duties), medication, transport, fire safety and emergency plans. The Service helps with checklists and records; compliance itself is the centre’s duty.']],
        ['5. Online and media safety', ['Photos and videos are shared only where the centre has recorded guardian consent, are stored on encrypted R2 with signed access, and are never used for platform marketing without separate written consent. Staff must not exchange private messages with children or store child images on personal devices.']],
        ['6. Review', ['This policy and each centre’s policy must be reviewed at least annually and after any incident. Workers who breach safeguarding rules may face disciplinary action, withdrawal of access, and referral to the authorities.']]
      ]
    }
  };

  function legalNavHtml(current) {
    return '<nav class="legal-nav">' + LEGAL_NAV.map((entry) =>
      '<a class="' + (entry[0] === current ? 'active' : '') + '" href="#' + entry[0] + '">' + R.esc(entry[1]) + '</a>'
    ).join('') + '</nav>';
  }

  async function loadLegalDoc(slug) {
    // Legal pages are editable by the super admin in the database (see
    // Platform → Configuration → Documents). Fall back to the static
    // template below until the first edit is saved.
    try {
      const payload = await R.api('GET', '/public/documents/' + encodeURIComponent(slug));
      const doc = (payload && payload.data) || null;
      if (!doc || !doc.sections || !doc.sections.length) return null;
      return {
        title: doc.title,
        eyebrow: doc.category === 'legal' ? 'Legal' : 'Document',
        lede: doc.lede || '',
        intro: doc.intro || [],
        sections: (doc.sections || []).map((s) => [s.heading || 'Section', (s.paragraphs || []).concat((s.steps || []).map((step) => step))])
      };
    } catch { return null; }
  }

  function legalDocViews(slug) {
    return {
      async load(ctx) { return { override: await loadLegalDoc(slug) }; },
      render(ctx, params, page) {
        const base = LEGAL_PAGES[slug];
        const doc = (page && page.override) || base;
        return renderLegalPage(ctx, slug, doc);
      }
    };
  }

  function renderLegalPage(ctx, slug, docOverride) {
    const doc = docOverride || LEGAL_PAGES[slug];
    if (!doc) return '<section class="site-section"><div class="site-wrap site-narrow"><h1>Legal page not found</h1><p><a href="#/legal">Back to the legal hub</a></p></div></section>';
    const sections = doc.sections.map((section) =>
      '<h2>' + R.esc(section[0]) + '</h2><div class="legal-body">' + section[1].map((p) => '<p>' + R.esc(p) + '</p>').join('') + '</div>'
    ).join('');
    return platformShell(ctx, platformNav(ctx, '<a href="#/login">Sign in</a><a href="#/legal">Legal</a>') +
      '<header class="site-page-hero"><div class="site-wrap site-page-hero-inner"><div class="site-eyebrow">' + R.esc(doc.eyebrow) + '</div><h1>' + R.esc(doc.title) + '</h1><p class="lede">' + R.esc(doc.lede) + '</p><p class="small muted">Last updated ' + R.esc(LEGAL_UPDATED) + ' · ' + R.esc(LEGAL_ENTITY) + '</p></div></header>' +
      '<section class="public-section"><div class="site-wrap legal-layout">' + legalNavHtml('#/legal/' + slug) +
      '<article class="legal-article">' + doc.intro.map((p) => '<p>' + R.esc(p) + '</p>').join('') + sections +
      '<hr><p class="small muted">Questions about this document? Email legal@re-el.co.za. For personal information requests use privacy@re-el.co.za (see Privacy Policy).</p>' +
      '</article></div></section>' +
      '<footer class="public-footer site-footer"><div class="site-wrap site-footer-base"><span>© ' + new Date().getFullYear() + ' ' + R.esc(LEGAL_ENTITY) + '. All rights reserved.</span><span class="spacer"></span><a href="#/legal/terms">Terms</a><a href="#/legal/privacy">Privacy</a><a href="#/legal/cookies">Cookies</a><a href="#/login">Sign in</a></div></footer>');
  }

  function renderLegalIndex(ctx) {
    const cards = LEGAL_NAV.slice(1).map((entry) => {
      const slug = entry[0].replace('/legal/', '');
      const doc = LEGAL_PAGES[slug];
      return '<article class="site-card legal-card"><div class="site-card-body"><div class="site-pill">' + R.esc(doc.eyebrow) + '</div><h3>' + R.esc(doc.title) + '</h3><p>' + R.esc(doc.lede) + '</p><a href="#' + entry[0] + '">Read policy →</a></div></article>';
    }).join('');
    return platformShell(ctx, platformNav(ctx) +
      '<header class="site-page-hero"><div class="site-wrap site-page-hero-inner"><div class="site-eyebrow">Legal</div><h1>Legal hub</h1><p class="lede">Terms, privacy, cookies and the policies that govern Re-EL ECD in South Africa. Last updated ' + R.esc(LEGAL_UPDATED) + '.</p></div></header>' +
      '<section class="public-section"><div class="site-wrap">' + legalNavHtml('#/legal') + '<div class="site-card-grid" style="margin-top:18px">' + cards + '</div></div></section>' +
      '<footer class="public-footer site-footer"><div class="site-wrap site-footer-base"><span>© ' + new Date().getFullYear() + ' ' + R.esc(LEGAL_ENTITY) + '. All rights reserved.</span><span class="spacer"></span><a href="#/legal/terms">Terms</a><a href="#/legal/privacy">Privacy</a><a href="#/legal/cookies">Cookies</a></div></footer>');
  }

  V.legalIndex = { render(ctx) { return renderLegalIndex(ctx); } };
  V.legalTerms = legalDocViews('terms');
  V.legalPrivacy = legalDocViews('privacy');
  V.legalCookies = legalDocViews('cookies');
  V.legalAcceptableUse = legalDocViews('acceptable-use');
  V.legalSafeguarding = legalDocViews('safeguarding');
})();
