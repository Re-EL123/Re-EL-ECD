'use strict';

/* The Collection Gate: photo, name, one verified handshake — and the family knows in a minute. */
(function () {
  const R = window.Reel;
  const V = R.views;

  V.collectionGate = {
    async load(ctx) {
      const canManage = ctx.has(['collections.manage.daycare', 'organisation.settings.manage']);
      const [gate, morning] = await Promise.all([
        R.api('GET', '/collections/gate').then((p) => p.data).catch(() => ({ children: [], lateMode: false, cutoff: '17:30', timezone: 'Africa/Johannesburg' })),
        R.api('GET', '/staff/morning').then((p) => p.data).catch(() => null)
      ]);
      return { gate, deniedToday: (morning && morning.deniedToday) || [], canManage };
    },

    render(ctx, params, page) {
      const gate = page.gate || {};
      const children = gate.children || [];
      const waiting = children.length;
      const holds = children.filter((c) => c.collection_hold_reason).length;
      const pendingCount = children.filter((c) => c.pendingRequest).length;
      const denied = page.deniedToday || [];
      const deniedBanner = denied.length
        ? '<div class="alert alert-danger" style="margin-bottom:16px;align-items:center">' + R.icon('alert-triangle') + '<div style="flex:1"><strong>Pickup blocked today</strong><div class="muted small">' +
            denied.map((d) => R.esc(d.collectorName) + ' was turned away for ' + R.esc(d.childFirst) + (d.reason ? ' — ' + R.esc(d.reason) : '')).join(' · ') + '</div></div></div>'
        : '';
      const lateBanner = gate.lateMode
        ? '<div class="alert alert-sun" style="margin-bottom:16px;align-items:center">' + R.icon('clock') + '<div style="flex:1"><strong>Past the cutoff — releases are tagged late</strong><div class="muted small">Auto-flagged after ' + R.esc(gate.cutoff || '17:30') + ' ' + R.esc(gate.timezone || 'Africa/Johannesburg') + '</div></div></div>'
        : '';
      return R.pageHead('Collection gate', 'Every child to the right adult — proven, not presumed.',
          '<span class="badge badge-sun">Cutoff ' + R.esc(gate.cutoff || '17:30') + ' ' + R.esc(gate.timezone || 'Africa/Johannesburg') + '</span>') +
        deniedBanner + lateBanner +
        '<div class="grid grid-4 section">' +
        R.statCard({ label: 'Waiting', value: R.number(waiting), icon: 'users', tone: waiting ? 'sun' : 'green', foot: 'Checked in, not out' }) +
        R.statCard({ label: 'Holds', value: R.number(holds), icon: 'shield-alert', tone: holds ? 'danger' : 'green', foot: 'DO NOT RELEASE flags' }) +
        R.statCard({ label: 'Awaiting parent', value: R.number(pendingCount), icon: 'smartphone', tone: pendingCount ? 'sun' : 'green', foot: 'Approval requests pending' }) +
        R.statCard({ label: 'Timezone', value: R.esc(gate.timezone || 'Africa/Johannesburg'), icon: 'globe', foot: 'As the organisation sets it' }) +
        '</div>' +
        (children.length
          ? '<div class="grid grid-2 section">' + children.map((child) => this.childCard(child, page.canManage)).join('') + '</div>'
          : R.emptyState('All quiet at the gate', 'Every checked-in child has gone home, or nobody is signed in yet.', '<a class="btn btn-secondary" href="#/app/collection-gate">Refresh</a>', 'shield-check'));
    },

    childCard(child, canManage) {
      const collectors = child.collectors || [];
      const hold = child.collection_hold_reason;
      const initial = (child.first_name || '?')[0].toUpperCase();
      const pending = child.pendingRequest;
      const childId = child.id;
      const guardianRow =
        '<label class="collector-pick" style="display:flex;gap:12px;align-items:center;padding:10px 12px;border:1px solid var(--border-subtle);border-radius:14px;cursor:pointer">' +
          '<input type="radio" name="collector-' + R.attr(childId) + '" value="__guardian__" x-model="collectorId">' +
          '<div class="avatar" style="width:56px;height:56px;border-radius:14px;font-size:1.2rem;background:#E8E3D8;color:#5d6b5f">G</div>' +
          '<span style="min-width:0"><span class="strong">A linked guardian</span><br><span class="muted small">A parent or caregiver with an account</span></span>' +
          '<span class="badge badge-green" style="margin-left:auto">Trusted</span>' +
        '</label>';
      const collectorRows = collectors.map((c) => {
        const notApproved = c.approvalStatus !== 'approved';
        const badge = c.isTrusted
          ? '<span class="badge badge-green" style="margin-left:auto;white-space:nowrap">Trusted</span>'
          : notApproved
            ? '<span class="badge badge-danger" style="margin-left:auto;white-space:nowrap">Not approved</span>'
            : c.needsApproval
              ? '<span class="badge badge-sun" style="margin-left:auto;white-space:nowrap">Parent approval</span>'
              : '<span class="badge badge-sky" style="margin-left:auto;white-space:nowrap">On the list</span>';
        const avatar = c.photoUrl
          ? '<img src="' + R.attr(c.photoUrl) + '" alt="' + R.attr(c.name) + '" style="width:56px;height:56px;border-radius:14px;object-fit:cover">'
          : '<div class="avatar" style="width:56px;height:56px;border-radius:14px;font-size:1.3rem;background:var(--forest-100);color:var(--forest-700)">' + R.esc((c.name[0] || '?').toUpperCase()) + '</div>';
        const approveButtons = (notApproved && canManage)
          ? '<div class="row" style="gap:4px;margin-left:auto">' +
              '<button class="btn btn-sm btn-secondary" @click.prevent="approveCollector(\'' + R.attr(c.id) + '\',\'' + R.attr(c.name) + '\',\'approved\')">Approve</button>' +
              '<button class="btn btn-sm btn-ghost" style="color:var(--danger)" @click.prevent="approveCollector(\'' + R.attr(c.id) + '\',\'' + R.attr(c.name) + '\',\'rejected\')">Reject</button>' +
            '</div>'
          : badge;
        return '<label class="collector-pick" style="display:flex;gap:12px;align-items:center;padding:10px 12px;border:1px solid var(--border-subtle);border-radius:14px;' + (notApproved ? 'opacity:.85' : 'cursor:pointer') + '">' +
          '<input type="radio" name="collector-' + R.attr(childId) + '" value="' + R.attr(c.id) + '" x-model="collectorId"' + (notApproved ? ' disabled' : '') + '>' +
          avatar +
          '<span style="min-width:0;flex:1"><span class="strong">' + R.esc(c.name) + '</span><br><span class="muted small">' + R.esc(c.relationship || '') + (c.policy ? ' · ' + R.esc(c.policy.replace(/_/g, ' ')) : '') + '</span></span>' +
          approveButtons +
        '</label>';
      }).join('');
      const holdBar = hold
        ? '<div class="alert alert-danger" style="margin:10px 0;align-items:center">' + R.icon('shield-alert') + '<div style="flex:1"><strong>DO NOT RELEASE</strong><div class="muted small">' + R.esc(hold) + ' — managers only.</div></div></div>'
        : '';
      const methods = ['photo_id', 'qr_code', 'pin', 'code_word', 'guardian_present', 'known_to_staff', 'guardian_approval', 'override'];
      const pendingPanel = pending
        ? '<div class="alert alert-sun" style="margin-top:10px;align-items:center">' + R.icon('smartphone') + '<div style="flex:1"><strong>Waiting for the parent</strong><div class="muted small">' + R.esc(pending.collectorName) + ' — the request was sent to all guardians. Approve on the phone, then tap release again.</div></div></div>'
        : '';
      return '<div class="card" style="margin:0;padding:18px 16px" x-data="{' +
        'collectorId: \'\', method: \'photo_id\', pin: \'\', matchId: false, signature: \'\', busy: false, status: \'idle\', requestId: null, overrideReason: \'\',' +
        'payload() { return { collectorType: this.collectorId === \'__guardian__\' ? \'guardian\' : \'authorised_collector\', collectorId: this.collectorId === \'__guardian__\' ? undefined : this.collectorId, verificationMethod: this.method, pin: this.pin || undefined, signatureData: this.signature || undefined, overrideReason: this.overrideReason || undefined }; },' +
        'release() { this.busy = true; window.Reel.api(\'POST\', \'/learners/' + R.attr(childId) + '/collections\', this.payload()).then((p) => { const d = p.data || {}; if (d.requiresApproval) { this.status = \'pending\'; this.requestId = d.requestId; this.busy = false; return; } toast(\'' + R.attr(child.first_name) + ' is home safe — the family has been told.\'); navigate(true); }).catch((e) => { this.busy = false; toast(e.message || \'Release failed.\', \'error\'); }); }' +
      '}">' +
        '<div class="row" style="justify-content:space-between;align-items:center;margin-bottom:10px;gap:10px">' +
          '<div class="row" style="gap:12px;min-width:0">' +
            '<div class="avatar" style="width:48px;height:48px;font-size:1.1rem;background:var(--forest-100);color:var(--forest-700)">' + R.esc(initial) + '</div>' +
            '<div style="min-width:0"><div class="strong">' + R.esc(child.first_name + ' ' + child.last_name) + '</div><div class="muted small">' + R.esc(child.classroom_name || 'No classroom') + (hold ? ' · <span style="color:var(--danger)">ON HOLD</span>' : '') + '</div></div>' +
          '</div>' +
          '<button class="btn btn-ghost btn-sm" style="color:var(--danger)" @click="openNamedModal(\'denyCollection\',\'' + R.attr(childId) + '\')">' + R.icon('shield-x') + ' Turn away</button>' +
        '</div>' +
        holdBar +
        '<div class="stack" style="gap:8px">' + guardianRow + collectorRows + '</div>' +
        '<div class="stack" style="gap:8px;margin-top:12px">' +
          '<select class="input" x-model="method" aria-label="Verification method">' +
            methods.map((m) => '<option value="' + m + '">' + R.titleCase(m.replace(/_/g, ' ')) + '</option>').join('') +
          '</select>' +
          '<input class="input" type="text" x-model="pin" x-show="[\'qr_code\',\'pin\',\'code_word\'].includes(method)" placeholder="Code the collector was given" autocomplete="off">' +
          '<label class="row" style="gap:8px;font-size:0.86rem;cursor:pointer"><input type="checkbox" x-model="matchId"><span>Face matches the ID / profile photo.</span></label>' +
          '<div><div class="muted small" style="margin-bottom:4px">Signature <span x-show="signature" style="color:var(--forest-600)">captured ✓</span></div>' +
            '<canvas class="signature-pad" x-ref="sig" width="320" height="72" style="border:1px dashed var(--border-subtle);border-radius:10px;touch-action:none;width:100%;background:#fff" x-init="(() => { const c = $refs.sig; const ctx2 = c.getContext(\'2d\'); ctx2.lineWidth = 2; ctx2.lineCap = \'round\'; ctx2.strokeStyle = \'#16211a\'; let drawing = false; const point = (e) => { const r = c.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }; c.addEventListener(\'pointerdown\', (e) => { drawing = true; const p = point(e); ctx2.beginPath(); ctx2.moveTo(p.x, p.y); c.setPointerCapture(e.pointerId); }); c.addEventListener(\'pointermove\', (e) => { if (!drawing) return; const p = point(e); ctx2.lineTo(p.x, p.y); ctx2.stroke(); }); c.addEventListener(\'pointerup\', () => { drawing = false; $data.signature = c.toDataURL(\'image/png\'); }); })()"></canvas>' +
            '<button type="button" class="btn btn-ghost btn-sm" style="margin-top:4px" @click="const c = $refs.sig; c.getContext(\'2d\').clearRect(0,0,c.width,c.height); signature = \'\'">Clear</button>' +
          '</div>' +
          '<textarea class="input" rows="2" x-model="overrideReason" x-show="method === &#39;override&#39;" placeholder="Override reason — at least ten characters, the parent sees this"></textarea>' +
          '<button class="btn btn-primary" style="width:100%;justify-content:center;padding:14px;font-size:1rem" :disabled="busy || !collectorId || !matchId" @click="$data.release()">' +
            '<span class="spinner" x-show="busy" style="width:16px;height:16px"></span>' +
            'Verify &amp; release ' + R.esc(child.first_name) +
          '</button>' +
          pendingPanel +
          '<div class="alert alert-sun" x-show="status === \'pending\'" style="align-items:center">' +
            '<span class="spinner" style="width:16px;height:16px"></span>' +
            '<div style="flex:1"><strong>Waiting for the parent\'s approval — sent to all guardians.</strong>' +
              '<div class="muted small" style="margin-top:6px">Once they approve, tap Verify &amp; release again — the PIN is no longer needed.</div>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>';
    },

    openModal(ctx, name, id) {
      if (name === 'denyCollection' && id) {
        ctx.openModal({
          title: 'Turn away a collection attempt',
          description: 'The child stays, you call the guardian, and the family is told immediately.',
          endpoint: '/learners/' + id + '/collections/deny',
          submitLabel: 'Hold the gate',
          successMessage: 'Attempt recorded and the guardians were notified.',
          fields: [
            { name: 'collectorName', label: 'Who was at the gate?', required: true, span: 2, placeholder: 'Name of the person turned away' },
            { name: 'reason', label: 'Reason', required: true, span: 2, placeholder: 'e.g. Not an approved collector for Amelia · No ID · Guardian did not recognise' }
          ]
        });
      }
    }
  };
})();
