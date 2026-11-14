'use strict';

/* The Gate — one QR for the whole centre.
   Scan with your phone. Type your name + PIN. Tap your child(ren).
   Tap "Arriving" for drop-off (attendance marked Present instantly) or
   "Collecting" for pickup (staff taps Release on the reception screen). */
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
      // Honeycomb of children — tap to pick, then tap arriving/collecting.
      return '<div class="section" style="max-width:460px;margin:0 auto;padding:32px 20px;text-align:center">' +
        '<div class="gate-brand" style="margin-bottom:28px">' +
          '<div style="width:72px;height:72px;border-radius:50%;background:linear-gradient(135deg,var(--forest-600),var(--forest-800));display:inline-flex;align-items:center;justify-content:center;font-size:1.8rem;color:#fff;margin-bottom:16px">' + R.esc((orgName[0] || 'R').toUpperCase()) + '</div>' +
          '<h1 style="font-family:var(--heading-font,Georgia,serif);font-size:1.4rem;margin:0 0 8px;color:var(--text)">' + R.esc(orgName) + '</h1>' +
        '</div>' +
        '<div class="card" style="padding:28px;margin:0;text-align:left" x-data="{' +
          'name: \'\', pin: \'\', step: \'signin\', children: [], busy: false, error: null, action: \'\',' +
          'actionDone: \'\',' +
          'signin() { const self = this; self.busy = true; self.error = null; fetch(\'/api/v1/gate/' + slug + '/signin\', { method: \'POST\', headers: { \'Content-Type\': \'application/json\' }, body: JSON.stringify({ name: self.name, pin: self.pin }) }).then(r => r.json()).then(p => { if (p.error) { self.error = p.error.message || \'That name or PIN is not on the list.\'; self.busy = false; return; } self.children = p.data.children || []; self.step = \'pickup\'; self.busy = false; }); },' +
          'act(childId, action) { const self = this; if (!action) return; self.busy = true; self.error = null; self.action = action; const path = action === \'arrive\' ? \'arrive\' : \'collect\'; fetch(\'/api/v1/gate/' + slug + '/\' + path, { method: \'POST\', headers: { \'Content-Type\': \'application/json\' }, body: JSON.stringify({ name: self.name, pin: self.pin, learnerId: childId }) }).then(r => r.json()).then(p => { if (p.error) { self.error = p.error.message; self.busy = false; return; } self.actionDone = action; self.step = \'done\'; }); },' +
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
            '<h2 style="margin-top:0;font-size:1.05rem">Pick your child</h2>' +
            '<p class="muted small" style="margin:0 0 14px">Tap Arriving to bring them in, or Collecting to take them home.</p>' +
            '<div class="stack" style="gap:8px">' +
              '<template x-for="child in children" :key="child.id">' +
                '<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px;border:1px solid var(--border-subtle);border-radius:14px">' +
                  '<div style="min-width:0;flex:1">' +
                    '<div class="strong" x-text="child.first_name + \' \' + child.last_name"></div>' +
                    '<div class="muted small" x-text="child.classroom_name || \'\'"></div>' +
                  '</div>' +
                  '<div class="btn-group" style="flex-wrap:nowrap">' +
                    '<button class="btn btn-primary btn-sm" style="padding:10px 12px" @click="$data.act(child.id, \'arrive\')" :disabled="busy"><span class="spinner" x-show="busy && action === \'arrive\'" style="width:12px;height:12px"></span>Arriving</button>' +
                    '<button class="btn btn-secondary btn-sm" style="padding:10px 12px" @click="$data.act(child.id, \'collect\')" :disabled="busy && action === \'collect\'"><span class="spinner" x-show="busy && action === \'collect\'" style="width:12px;height:12px"></span>Collecting</button>' +
                  '</div>' +
                '</div>' +
              '</template>' +
            '</div>' +
          '</div>' +
          '<div x-show="step === \'done\'" style="text-align:center;padding:20px 0">' +
            '<div style="font-size:2.4rem;margin-bottom:12px">✓</div>' +
            '<h2 style="margin:0 0 6px;font-size:1.1rem" x-text="actionDone === \'arrive\' ? \'Sent in — the centre recorded your arrival.\' : \'Confirmed — reception will release your child now.\'"></h2>' +
            '<p class="muted small">Thank you.</p>' +
          '</div>' +
          '<div class="alert alert-danger" x-show="error" style="margin-top:12px"><i data-lucide="alert-triangle"></i><span x-text="error"></span></div>' +
        '</div>' +
        '<p class="muted small" style="text-align:center;margin-top:18px">Not cleared? The centre can add you — ask at reception.</p>' +
      '</div>';
    }
  };
})();
