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
      const name = organisation.name || 'Re-EL ECD';
      const logo = organisation.logoUrl || R.PLATFORM_LOGO;
      const style = brand && brand.branding ? R.themeStyle(brand.branding) : '';
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

  V.publicSite = {
    async load(ctx, params) {
      const slug = params.slug || 'little-sprouts';
      ctx.publicSlug = slug;
      ctx.publicEnquiry = { guardianName: '', guardianEmail: '', guardianPhone: '', childName: '', childDateOfBirth: '', requestedAgeGroup: '', preferredStartDate: '', message: '', website: '' };
      ctx.publicResult = null;
      ctx.publicError = null;
      const payload = await R.api('GET', '/public/daycares/' + encodeURIComponent(slug));
      return payload.data;
    },

    render(ctx, params, page) {
      const content = (page && page.content) || {};
      const org = (page && page.organisation) || { name: R.titleCase(params.slug || 'Little Sprouts') };
      const branches = (page && page.branches) || [];
      const hero = content.hero || {};
      const programmes = content.programmes || [];
      const facilities = content.facilities || [];
      const routine = content.routine || [];
      const faqs = content.faqs || [];
      const theme = (page && page.theme) || 'nature';
      const branding = (page && page.branding) || {};
      const logo = logoMark(org, 38);

      const section = (id, title, body, alt) => '<section class="public-section ' + (alt ? 'alt' : '') + '" id="' + id + '"><h2>' + R.esc(title) + '</h2>' + body + '</section>';

      return '' +
        '<div class="public" data-site-theme="' + R.attr(theme) + '" ' + R.themeStyle(branding) + '>' +
        (!page || !page.published ? '<div class="site-banner">This daycare website is being prepared. Staff can sign in to manage it.</div>' : '') +
        '<nav class="public-nav">' +
        '<div class="row" style="gap:10px">' + logo + '<div><div class="brand-name">' + R.esc(org.name) + '</div><div class="brand-sub">Early learning centre</div></div></div>' +
        '<div class="links"><a href="#about">About</a><a href="#programmes">Programmes</a><a href="#routine">Our day</a><a href="#contact">Contact</a><a class="btn btn-primary btn-sm" href="#/site/' + R.attr(params.slug || 'little-sprouts') + '/apply">Enquire</a><a href="#/login" class="muted">Staff</a></div>' +
        '</nav>' +
        '<header class="hero">' +
        '<div><div class="badge badge-green" style="margin-bottom:14px">' + R.icon('sprout') + ' Registered ECD centre</div>' +
        '<h1>' + R.esc(hero.headline || 'A warm start for curious minds') + '</h1>' +
        '<p>' + R.esc(hero.subheadline || 'Play-based early learning, caring educators and a community where every child belongs.') + '</p>' +
        '<div class="row" style="margin-top:22px"><a class="btn btn-primary" href="#/site/' + R.attr(params.slug || 'little-sprouts') + '/apply">' + R.esc(hero.cta || 'Book a visit') + '</a><a class="btn btn-secondary" href="#programmes">Explore programmes</a></div>' +
        '<div class="row" style="margin-top:26px;gap:18px"><div><div class="strong">' + (branches.length || 1) + '</div><div class="muted small">' + (branches.length === 1 ? 'Campus' : 'Campuses') + '</div></div><div><div class="strong">18m – 6y</div><div class="muted small">Ages welcomed</div></div><div><div class="strong">Play-based</div><div class="muted small">Learning approach</div></div></div>' +
        '</div>' +
        '<div class="hero-art"><div class="hero-badge">' + R.icon('sun') + ' Learning through play</div><div class="hero-caption"><strong>Our promise</strong><div class="muted small">Safety, belonging and joyful discovery every single day.</div></div></div>' +
        '</header>' +
        section('about', 'About ' + org.name, '<p class="lede">' + R.esc(content.about || 'We are a registered early childhood development centre dedicated to the first six years of a child\'s life.') + '</p>' +
          '<div class="public-grid"><div class="public-card"><h3>Our approach</h3><p>' + R.esc(content.approach || 'Children learn through play, relationships and purposeful routines.') + '</p></div>' +
          '<div class="public-card"><h3>Qualified educators</h3><p>Our team is trained in early childhood development and first aid, with ongoing professional learning.</p></div>' +
          '<div class="public-card"><h3>Safe and secure</h3><p>Access control, supervised drop-off and collection, and clear health and safety routines.</p></div></div>', false) +
        section('programmes', 'Programmes', '<p class="lede">Age-appropriate rooms and routines that grow with your child.</p><div class="public-grid">' +
          (programmes.length ? programmes.map((p) => '<article class="public-card"><div class="age">' + R.esc(p.ages || '') + '</div><h3>' + R.esc(p.name) + '</h3><p>' + R.esc(p.description || '') + '</p></article>').join('') : '<div class="public-card"><h3>Programmes</h3><p>Contact us for the current programme offering.</p></div>') +
          '</div>', true) +
        section('routine', 'A day at our centre', '<div class="split"><div class="routine">' +
          (routine.length ? routine.map((r) => '<div class="routine-row"><span class="time">' + R.esc(r.time) + '</span><span>' + R.esc(r.activity) + '</span></div>').join('') : '<div class="routine-row"><span class="time">08:00</span><span>Morning ring, play and learning</span></div>') +
          '</div><div class="stack"><div class="public-card"><h3>What is included</h3><ul class="list-clean">' +
          (facilities.length ? facilities.map((f) => '<li>' + R.icon('check') + '<span>' + R.esc(f) + '</span></li>').join('') : '<li>' + R.icon('check') + '<span>Qualified educators</span></li>') +
          '</ul></div><div class="public-card"><h3>Fees</h3><p>' + R.esc(content.fees || 'Please contact us for current fee information.') + '</p></div></div></div>', false) +
        (faqs.length ? section('faqs', 'Questions families ask', '<div class="public-grid">' + faqs.map((f) => '<div class="public-card"><h3>' + R.esc(f.question) + '</h3><p>' + R.esc(f.answer) + '</p></div>').join('') + '</div>', true) : '') +
        '<section class="public-section" id="contact"><div class="split"><div><h2>Come and see us</h2><p class="lede">Book a visit or ask a question. We will reply by email.</p>' +
          '<div class="stack">' + (branches.length ? branches.map((b) => '<div class="public-card">' + (b.image_url ? '<img class="cover-image" src="' + R.attr(b.image_url) + '" alt="' + R.attr(b.name) + '" style="margin-bottom:10px">' : '') + '<h3>' + R.esc(b.name) + '</h3><p>' + R.esc(b.address || '') + '</p><p class="small"><strong>' + R.esc(b.contact_phone || '') + '</strong><br>' + R.esc(b.contact_email || '') + '</p></div>').join('') : '<div class="public-card"><h3>Contact</h3><p>Use the enquiry form and we will be in touch.</p></div>') + '</div></div>' +
          '<div class="card glass"><h3>Send an enquiry</h3><div class="alert alert-success" x-show="publicResult" style="margin-bottom:12px"><i data-lucide="check-circle"></i><span x-text="publicResult"></span></div>' +
          '<div class="alert alert-danger" x-show="publicError" style="margin-bottom:12px"><i data-lucide="alert-circle"></i><span x-text="publicError"></span></div>' +
          '<form @submit.prevent="submitPublicEnquiry($event, \'' + R.attr(params.slug || 'little-sprouts') + '\')">' +
          '<div class="form-grid"><div class="field"><label>Your name *</label><input class="input" name="guardianName" required x-model="publicEnquiry.guardianName"></div>' +
          '<div class="field"><label>Email *</label><input class="input" type="email" name="guardianEmail" required x-model="publicEnquiry.guardianEmail"></div>' +
          '<div class="field"><label>Phone</label><input class="input" name="guardianPhone" x-model="publicEnquiry.guardianPhone"></div>' +
          '<div class="field"><label>Child\'s name</label><input class="input" name="childName" x-model="publicEnquiry.childName"></div>' +
          '<div class="field"><label>Child\'s date of birth</label><input class="input" type="date" name="childDateOfBirth" x-model="publicEnquiry.childDateOfBirth"></div>' +
          '<div class="field"><label>Preferred start</label><input class="input" type="date" name="preferredStartDate" x-model="publicEnquiry.preferredStartDate"></div>' +
          '<div class="field span-2"><label>Message</label><textarea class="textarea" name="message" x-model="publicEnquiry.message" placeholder="Tell us a little about your family and what you are looking for."></textarea></div>' +
          '<div class="field span-2" style="position:absolute;left:-9999px" aria-hidden="true"><label>Website</label><input class="input" name="website" tabindex="-1" autocomplete="off" x-model="publicEnquiry.website"></div></div>' +
          '<button class="btn btn-primary" type="submit">Send enquiry</button></form></div></div></section>' +
        '<footer class="public-footer"><span>© ' + new Date().getFullYear() + ' ' + R.esc(org.name) + '</span><span class="spacer"></span><a href="#/login">Staff sign in</a><a href="#/site/' + R.attr(params.slug || 'little-sprouts') + '/apply">Enquire</a></footer>' +
        '</div>';
    }
  };

  V.publicApply = {
    async load(ctx, params) {
      ctx.publicSlug = params.slug;
      ctx.publicEnquiry = { guardianName: '', guardianEmail: '', guardianPhone: '', childName: '', childDateOfBirth: '', requestedAgeGroup: '', preferredStartDate: '', message: '', website: '' };
      ctx.publicResult = null;
      ctx.publicError = null;
      const payload = await R.api('GET', '/public/daycares/' + encodeURIComponent(params.slug));
      const form = await R.api('GET', '/public/daycares/' + encodeURIComponent(params.slug) + '/enquiry-form');
      return { site: payload.data, form: form.data };
    },
    render(ctx, params, page) {
      const org = page.site.organisation;
      const branding = page.site.branding || {};
      const branches = page.form.branches || [];
      const logo = logoMark(org, 36);
      return '<div class="public" ' + R.themeStyle(branding) + '><nav class="public-nav"><div class="row" style="gap:10px"><a href="#/site/' + R.attr(params.slug) + '" class="row" style="gap:10px;text-decoration:none">' + logo + '<div class="brand-name">' + R.esc(org.name) + '</div></a></div><div class="links"><a href="#/site/' + R.attr(params.slug) + '">Back to website</a><a href="#/login">Staff</a></div></nav>' +
        '<section class="public-section" style="max-width:760px;margin:0 auto"><a href="#/site/' + R.attr(params.slug) + '" class="muted small">← Back to website</a><h1 style="margin-top:14px">Enquire about a place</h1><p class="lede">Share a few details and the admissions team will be in touch. There is no obligation.</p>' +
        '<div class="alert alert-success" x-show="publicResult"><i data-lucide="check-circle"></i><span x-text="publicResult"></span></div>' +
        '<div class="alert alert-danger" x-show="publicError" style="margin-top:10px"><i data-lucide="alert-circle"></i><span x-text="publicError"></span></div>' +
        '<div class="card glass" style="margin-top:16px"><form @submit.prevent="submitPublicEnquiry($event, \'' + R.attr(params.slug) + '\')"><div class="form-grid">' +
        '<div class="field"><label>Your name *</label><input class="input" name="guardianName" required x-model="publicEnquiry.guardianName"></div>' +
        '<div class="field"><label>Email *</label><input class="input" type="email" name="guardianEmail" required x-model="publicEnquiry.guardianEmail"></div>' +
        '<div class="field"><label>Phone</label><input class="input" name="guardianPhone" x-model="publicEnquiry.guardianPhone"></div>' +
        '<div class="field"><label>Child\'s name</label><input class="input" name="childName" x-model="publicEnquiry.childName"></div>' +
        '<div class="field"><label>Child\'s date of birth</label><input class="input" type="date" name="childDateOfBirth" x-model="publicEnquiry.childDateOfBirth"></div>' +
        '<div class="field"><label>Preferred branch</label><select class="select" x-model="publicEnquiry.branchId"><option value="">Any branch</option>' + branches.map((b) => '<option value="' + R.attr(b.id) + '">' + R.esc(b.name) + '</option>').join('') + '</select></div>' +
        '<div class="field"><label>Age group</label><select class="select" x-model="publicEnquiry.requestedAgeGroup"><option value="">Select…</option>' + (page.form.ageGroups || []).map((g) => '<option value="' + R.attr(g) + '">' + R.esc(g) + '</option>').join('') + '</select></div>' +
        '<div class="field"><label>Preferred start date</label><input class="input" type="date" x-model="publicEnquiry.preferredStartDate"></div>' +
        '<div class="field span-2"><label>Message</label><textarea class="textarea" x-model="publicEnquiry.message"></textarea></div>' +
        '<div class="field span-2" style="position:absolute;left:-9999px" aria-hidden="true"><label>Website</label><input class="input" tabindex="-1" autocomplete="off" x-model="publicEnquiry.website"></div></div>' +
        '<button class="btn btn-primary" type="submit">Send enquiry</button></form></div></section>' +
        '<footer class="public-footer"><span>© ' + new Date().getFullYear() + ' ' + R.esc(org.name) + '</span></footer></div>';
    }
  };

  V.publicForm = {
    async load(ctx, params) {
      const payload = await R.api('GET', '/public/forms/' + encodeURIComponent(params.slug) + '/' + encodeURIComponent(params.formSlug));
      ctx.publicFormData = {};
      (payload.data.form.schema_json.fields || []).forEach((f) => { ctx.publicFormData[f.key] = f.type === 'checkbox' ? false : ''; });
      ctx.publicResult = null;
      ctx.publicError = null;
      return payload.data;
    },
    render(ctx, params, page) {
      const fields = (page.form.schema_json && page.form.schema_json.fields) || [];
      const branding = page.branding || {};
      const org = page.organisation || {};
      const logo = logoMark(org, 38);
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
      return '<div class="public" ' + R.themeStyle(branding) + '><nav class="public-nav"><div class="row" style="gap:10px">' + logo + '<div class="brand-name">' + R.esc(page.organisation.name) + '</div></div><div class="links"><a href="#/site/' + R.attr(params.slug) + '">Back to website</a></div></nav>' +
        '<section class="public-section" style="max-width:720px;margin:0 auto"><h1>' + R.esc(page.form.name) + '</h1><p class="lede">' + R.esc(page.form.description || '') + '</p>' +
        '<div class="alert alert-success" x-show="publicResult"><i data-lucide="check-circle"></i><span x-text="publicResult"></span></div>' +
        '<div class="alert alert-danger" x-show="publicError" style="margin-top:10px"><i data-lucide="alert-circle"></i><span x-text="publicError"></span></div>' +
        '<div class="card glass" style="margin-top:16px"><form @submit.prevent="submitPublicForm($event, \'' + R.attr(params.slug) + '\', \'' + R.attr(params.formSlug) + '\')">' +
        (fields.length ? fields.map((f) => '<div class="field"><label>' + R.esc(f.label) + (f.required ? ' *' : '') + '</label>' + input(f) + (f.helpText ? '<div class="hint">' + R.esc(f.helpText) + '</div>' : '') + '</div>').join('') : '<p class="muted">This form has no fields yet.</p>') +
        '<button class="btn btn-primary" type="submit">Submit</button></form></div></section></div>';
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
