'use strict';

/* The Gate — one QR for the whole centre.
   Scan with your phone. Type your name + PIN once. The page lists only the
   children you are cleared for, with today's live state:
   - "Arriving" marks them present instantly (drop-off, no staff action).
   - "Collecting" tells reception you are here; staff tap Release.
   Buttons disable themselves against the live state so a parent can never
   tap an impossible action (collecting a child not yet dropped off, or one
   who already went home). */
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
          'name: \'\', pin: \'\', step: \'signin\', children: [], collectorName: \'\', busy: false, error: null, note: \'\',' +
          'state(child) { if (child.check_out_at || child.attendance_status === \'collected\') return \'gone\'; if (child.check_in_at) return \'in\'; return \'not-in\'; },' +
          'signin() { const self = this; self.busy = true; self.error = null; fetch(\'/api/v1/gate/' + slug + '/signin\', { method: \'POST\', headers: { \'Content-Type\': \'application/json\' }, body: JSON.stringify({ name: self.name, pin: self.pin }) }).then(r => r.json()).then(p => { if (p.error) { self.error = p.error.message || \'That name or PIN is not on the list.\'; self.busy = false; return; } self.children = p.data.children || []; self.collectorName = (p.data.collector || {}).name || \'\'; self.step = self.children.length ? \'pickup\' : \'signin\'; if (!self.children.length) self.error = \'No children are linked to you yet — ask at reception to be added.\'; self.busy = false; }); },' +
          'act(childId, action) { const self = this; self.busy = true; self.error = null; self.note = \'\'; const path = action === \'arrive\' ? \'arrive\' : \'collect\'; fetch(\'/api/v1/gate/' + slug + '/\' + path, { method: \'POST\', headers: { \'Content-Type\': \'application/json\' }, body: JSON.stringify({ name: self.name, pin: self.pin, learnerId: childId }) }).then(r => r.json()).then(p => { if (p.error) { self.error = p.error.message; self.busy = false; return; } const child = self.children.find((c) => c.id === childId); if (action === \'arrive\') { child.check_in_at = new Date().toISOString(); child.attendance_status = \'present\'; child.check_out_at = null; self.note = child.first_name + (p.wasAlreadyIn ? \' is already signed in — bringer updated.\' : \' — arriving recorded. Have a good day!\'); } else { self.note = child.first_name + \' — reception has been told you are here. They will bring \' + child.first_name + \' out shortly.\'; } self.busy = false; }); },' +
        '}">' +
          '<form x-show="step === \'signin\'" @submit.prevent="$data.signin()">' +
            '<div class="stack" style="gap:12px">' +
              '<h2 style="margin-top:0;font-size:1.05rem">Welcome — sign in to check in or collect</h2>' +
              '<p class="muted small" style="margin:0">Cleared collectors tap Continue.</p>' +
              '<label class="field" style="margin:0"><span class="field-label">Your name</span>' +
                '<input class="input" type="text" x-model="name" placeholder="Type your first or last name" autocomplete="name" required>' +
              '</label>' +
              '<label class="field" style="margin:0"><span class="field-label">Your PIN</span>' +
                '<input class="input" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="6" autocomplete="off" x-model="pin" placeholder="• • • • • •" required>' +
              '</label>' +
              '<button type="submit" class="btn btn-primary" style="width:100%;justify-content:center;padding:16px;font-size:1.05rem" :disabled="busy" x-text="busy ? \'Checking…\' : \'Continue\'"></button>' +
            '</div>' +
          '</form>' +
          '<div x-show="step === \'pickup\'">' +
            '<h2 style="margin-top:0;font-size:1.05rem">Hello, <span x-text="collectorName"></span></h2>' +
            '<p class="muted small" style="margin:0 0 14px">Arriving marks them present. Collecting tells reception you are here.</p>' +
            '<div class="stack" style="gap:8px">' +
              '<template x-for="child in children" :key="child.id">' +
                '<div style="padding:12px;border:1px solid var(--border-subtle);border-radius:14px">' +
                  '<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:8px">' +
                    '<div style="min-width:0;flex:1">' +
                      '<div class="strong" x-text="child.first_name + \' \' + child.last_name"></div>' +
                      '<div class="muted small" x-text="(child.classroom_name || \'\') + (child.on_hold ? \' · collection hold at reception\' : \'\')"></div>' +
                    '</div>' +
                    '<span class="badge" :class="state(child) === \'in\' ? \'badge-green\' : (state(child) === \'gone\' ? \'badge-muted\' : \'badge-sun\')"' +
                      ' x-text="state(child) === \'in\' ? \'In now\' : (state(child) === \'gone\' ? \'Gone home\' : \'Not in yet\')"></span>' +
                  '</div>' +
                  '<div class="btn-group" style="flex-wrap:nowrap">' +
                    '<button class="btn btn-primary btn-sm" style="padding:10px 12px" @click="$data.act(child.id, \'arrive\')"' +
                      ' :disabled="busy || state(child) !== \'not-in\'"' +
                      ' x-text="state(child) === \'not-in\' ? \'Arriving\' : \'Signed in\'"></button>' +
                    '<button class="btn btn-secondary btn-sm" style="padding:10px 12px" @click="$data.act(child.id, \'collect\')"' +
                      ' :disabled="busy || state(child) === \'not-in\' || state(child) === \'gone\' || child.on_hold"' +
                      ' x-text="state(child) === \'gone\' ? \'Collected\' : \'Collecting\'"></button>' +
                  '</div>' +
                '</div>' +
              '</template>' +
            '</div>' +
            '<div class="alert alert-success" x-show="note" style="margin-top:12px"><span x-text="note"></span></div>' +
            '<button class="btn btn-ghost btn-sm" style="margin-top:10px" @click="step = \'signin\'; note = \'\'">Sign in as someone else</button>' +
          '</div>' +
          '<div class="alert alert-danger" x-show="error" style="margin-top:12px"><i data-lucide="alert-triangle"></i><span x-text="error"></span></div>' +
        '</div>' +
        '<p class="muted small" style="text-align:center;margin-top:18px">Not cleared? The centre can add you — ask at reception.</p>' +
      '</div>';
    }
  };
})();
