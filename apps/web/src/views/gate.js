'use strict';

/* The Gate — one QR, one scan, one tap.
   This is the page we mount on the entrance tablet. Anyone cleared to
   collect children opens it on their phone, types their name + PIN,
   picks who is going home, taps "Here for pickup", and the centre
   sees them arrive with a photo and a tick. No dropdowns, no checklists. */
(function () {
  const R = window.Reel;
  const V = R.views;

  V.gate = {
    async load(ctx) {
      const slug = ctx.params.slug;
      const org = await R.api('GET', '/gate/' + encodeURIComponent(slug) + '/brand').then((p) => p.data).catch(() => null);
      return { org, slug };
    },

    render(ctx, params, page) {
      const org = page.org || {};
      const orgName = org.name || 'This centre';
      const slug = page.slug;
      return '<div class="section" style="max-width:460px;margin:0 auto;padding:32px 20px;text-align:center">' +
        '<div class="gate-brand" style="margin-bottom:28px">' +
          '<div style="width:72px;height:72px;border-radius:50%;background:linear-gradient(135deg,var(--forest-600),var(--forest-800));display:inline-flex;align-items:center;justify-content:center;font-size:1.8rem;color:#fff;margin-bottom:16px">' + R.esc((orgName[0] || 'R').toUpperCase()) + '</div>' +
          '<h1 style="font-family:var(--heading-font,Georgia,serif);font-size:1.4rem;margin:0 0 8px;color:var(--text)">' + R.esc(orgName) + '</h1>' +
        '</div>' +
        '<div class="card" style="padding:28px;margin:0;text-align:left" x-data="{' +
          'name: \'\', pin: \'\', step: \'signin\', children: [], selected: null, error: null, busy: false,' +
          'signin() { const self = this; self.busy = true; self.error = null; fetch(\'/api/v1/gate/' + slug + '/signin\', { method: \'POST\', headers: { \'Content-Type\': \'application/json\' }, body: JSON.stringify({ name: self.name, pin: self.pin }) }).then(r => r.json()).then(p => { if (p.error) { self.error = p.error.message || \'That name or PIN is not on the list.\'; self.busy = false; return; } self.children = p.data.children || []; self.step = \'ready\'; self.busy = false; }); },' +
          'confirm() { const self = this; if (!self.selected) return; self.busy = true; self.error = null; fetch(\'/api/v1/gate/' + slug + '/collect\', { method: \'POST\', headers: { \'Content-Type\': \'application/json\' }, body: JSON.stringify({ name: self.name, pin: self.pin, learnerId: self.selected }) }).then(r => r.json()).then(p => { if (p.error) { self.error = p.error.message || \'Could not sign in.\'; self.busy = false; return; } self.step = \'done\'; setTimeout(() => { window.location.hash = \'/gate/' + slug + '?fresh=\' + Date.now(); }, 2500); }); },' +
        '}">' +
          '<form x-show="step === \'signin\'" @submit.prevent="$data.signin()">' +
            '<div class="stack" style="gap:12px">' +
              '<h2 style="margin-top:0;font-size:1.05rem">Sign in to pick up</h2>' +
              '<p class="muted small" style="margin:0">Cleared collectors tap Continue — the centre sees you arrive.</p>' +
              '<label class="field" style="margin:0"><span class="field-label">Your name</span>' +
                '<input class="input" type="text" x-model="name" placeholder="Type your first name" autocomplete="name" required autofocus>' +
              '</label>' +
              '<label class="field" style="margin:0"><span class="field-label">Your PIN</span>' +
                '<input class="input" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="6" autocomplete="off" x-model="pin" placeholder="• • • • • •" required>' +
              '</label>' +
              '<button type="submit" class="btn btn-primary" style="width:100%;justify-content:center;padding:16px;font-size:1.05rem" :disabled="busy" x-text="busy ? \'Checking…\' : \'Continue\'"></button>' +
            '</div>' +
          '</form>' +
          '<div x-show="step === \'ready\'">' +
            '<h2 style="margin-top:0;font-size:1.05rem">Who are you picking up?</h2>' +
            '<p class="muted small" style="margin:0 0 14px">Tap each child then confirm at the gate — the centre will see your name.</p>' +
            '<div class="stack" style="gap:8px">' +
              '<template x-for="child in children" :key="child.id">' +
                '<label class="collector-pick" style="display:flex;gap:12px;align-items:center;padding:12px;border:1px solid var(--border-subtle);border-radius:14px;cursor:pointer" :style="selected === child.id ? \'border-color:var(--forest-500);background:var(--forest-50);\' : \'\'">' +
                  '<input type="radio" :value="child.id" x-model="selected" name="child-pick">' +
                  '<div style="min-width:0">' +
                    '<div class="strong" x-text="child.first_name + \' \' + child.last_name"></div>' +
                    '<div class="muted small" x-text="child.classroom_name || \'Classroom not set\'"></div>' +
                  '</div>' +
                '</label>' +
              '</template>' +
            '</div>' +
            '<button class="btn btn-primary" style="width:100%;justify-content:center;padding:14px;font-size:1rem;margin-top:12px" :disabled="busy || !selected" @click="$data.confirm()">' +
              '<span x-text="busy ? \'Confirming…\' : \'I am here — tap to confirm\'"></span>' +
            '</button>' +
          '</div>' +
          '<div x-show="step === \'done\'" style="text-align:center;padding:20px 0">' +
            '<div style="font-size:2.4rem;margin-bottom:12px">✓</div>' +
            '<h2 style="margin:0 0 6px;font-size:1.1rem">You\'re confirmed.</h2>' +
            '<p class="muted small">The centre is releasing ' + '' + ' now.</p>' +
          '</div>' +
          '<div class="alert alert-danger" x-show="error" style="margin-top:12px"><i data-lucide="alert-triangle"></i><span x-text="error"></span></div>' +
        '</div>' +
        '<p class="muted small" style="text-align:center;margin-top:18px">Not cleared? Ask the receptionist.</p>' +
      '</div>';
    }
  };
})();
