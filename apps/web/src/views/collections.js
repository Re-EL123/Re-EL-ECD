'use strict';

/* The Gate — sign-in, pickup, release. One tap each. */
(function () {
  const R = window.Reel;
  const V = R.views;

  V.collectionGate = {
    async load(ctx) {
      const [gate, scans] = await Promise.all([
        R.api('GET', '/collections/gate').then((p) => p.data).catch(() => ({ children: [], lateMode: false, cutoff: '17:30', timezone: 'Africa/Johannesburg' })),
        R.api('GET', '/gate/scans').then((p) => p.data).catch(() => ({ pending: [] }))
      ]);
      return { gate, scans };
    },

    render(ctx, params, page) {
      const gate = page.gate || {};
      const scans = (page.scans || {}).pending || [];
      const awaiting = (gate.children || []).filter((c) => !scans.find((s) => s.learner_id === c.id));
      const holds = (gate.children || []).filter((c) => c.collection_hold_reason);
      const pending = scans.filter((s) => !s.released_at);
      const lateBanner = gate.lateMode
        ? '<div class="alert alert-sun" style="margin-bottom:16px;align-items:center">' + R.icon('clock') + '<div style="flex:1"><strong>Past the cutoff — releases are tagged late</strong><div class="muted small">Auto-flagged after ' + R.esc(gate.cutoff || '17:30') + ' ' + R.esc(gate.timezone || 'Africa/Johannesburg') + '</div></div></div>'
        : '';
      return R.pageHead('Collection gate', 'Children collect with the right adult. Tap Release when they walk out.',
          '<span class="badge badge-sun">Cutoff ' + R.esc(gate.cutoff || '17:30') + ' ' + R.esc(gate.timezone || 'Africa/Johannesburg') + '</span>') +
        lateBanner +
        '<div class="grid grid-4 section">' +
        R.statCard({ label: 'At the gate', value: R.number(pending.length), icon: 'door-open', tone: pending.length ? 'sun' : 'green', foot: 'Waiting for release' }) +
        R.statCard({ label: 'Waiting', value: R.number(awaiting.length), icon: 'users', tone: awaiting.length ? 'sun' : 'green', foot: 'Checked in' }) +
        R.statCard({ label: 'Holds', value: R.number(holds.length), icon: 'shield-alert', tone: holds.length ? 'danger' : 'green', foot: 'DO NOT RELEASE' }) +
        R.statCard({ label: 'Timezone', value: R.esc(gate.timezone || 'Africa/Johannesburg'), icon: 'globe', foot: 'As the organisation sets it' }) +
        '</div>' +
        '<div class="split section"><div class="stack">' +
        (pending.length
          ? R.card('Waiting at the gate', '<div class="stack" style="gap:8px">' + pending.map((s) => this.scanCard(s)).join('') + '</div>', '')
          : R.card('Waiting at the gate', '<p class="muted small" style="margin:0 0 8px">No-one has tapped their way through the gate yet. Parents and drivers sign in with the gate QR; staff sees their name here.</p><div class="empty-state" style="padding:12px"><i data-lucide="smartphone"></i><div><h4>No scans yet</h4><p class="muted small">Children are signed in and ready.</p></div></div>', '')) +
        '<div class="section"></div>' +
        R.card('Children signed in', '<div class="grid grid-2">' + (gate.children || []).map((child) =>
          '<div class="row" style="gap:10px;padding:10px;border:1px solid var(--border-subtle);border-radius:12px">' +
            '<div class="avatar">' + R.initials(child.first_name + ' ' + child.last_name) + '</div>' +
            '<div style="flex:1;min-width:0"><div class="strong" style="font-size:0.88rem">' + R.esc(child.first_name + ' ' + child.last_name) + '</div>' +
            '<div class="muted small">' + R.esc(child.classroom_name || '') + (child.collection_hold_reason ? ' · <span style="color:var(--danger)">ON HOLD</span>' : '') + '</div></div>' +
          '</div>').join('') + '</div>') +
        '</div><div class="stack">' +
        R.card('How it works', '<div class="stack" style="gap:10px">' +
          '<div class="row" style="gap:10px;align-items:flex-start"><div class="avatar" style="background:var(--forest-600);color:#fff;width:32px;height:32px;font-size:0.9rem;display:flex;align-items:center;justify-content:center">1</div><div><div class="strong">Collector scans the gate QR</div><div class="muted small">The parent or driver opens the gate page on their phone from the entrance tablet.</div></div></div>' +
          '<div class="row" style="gap:10px;align-items:flex-start"><div class="avatar" style="background:var(--forest-600);color:#fff;width:32px;height:32px;font-size:0.9rem;display:flex;align-items:center;justify-content:center">2</div><div><div class="strong">They tap their name + PIN</div><div class="muted small">The system verifies them against the cleared list instantly.</div></div></div>' +
          '<div class="row" style="gap:10px;align-items:flex-start"><div class="avatar" style="background:var(--forest-600);color:#fff;width:32px;height:32px;font-size:0.9rem;display:flex;align-items:center;justify-content:center">3</div><div><div class="strong">You release the child</div><div class="muted small">Confirm eye contact, tap Release, and the record closes.</div></div></div>' +
        '</div>') +
        '</div></div>';
    },

    scanCard(scan) {
      return '<div class="row" style="gap:12px;align-items:center;padding:10px;border:1px solid var(--border-subtle);border-radius:14px;background:var(--surface-2)">' +
        '<div class="avatar" style="width:52px;height:52px;font-size:1.2rem;background:var(--forest-100);color:var(--forest-700)">' + R.esc((scan.first_name || '?')[0].toUpperCase()) + '</div>' +
        '<div style="flex:1;min-width:0">' +
          '<div class="strong">' + R.esc(scan.collector_name || 'Cleared adult') + '</div>' +
          '<div class="muted small">' + R.esc(scan.first_name + ' ' + (scan.last_name || '')) + (scan.classroom_name ? ' · ' + R.esc(scan.classroom_name) : '') + '</div>' +
          '<div class="muted small">' + (scan.collector_type === 'driver' ? 'Pickup driver' : 'Trusted person') + (scan.confirmed_at ? ' · ' + R.time(scan.confirmed_at) : '') + '</div>' +
        '</div>' +
        '<button class="btn btn-primary" @click="releaseScan(\'' + R.attr(scan.id) + '\')">Release</button>' +
      '</div>';
    },

    async releaseScan(scanId) {
      try {
        await R.api('POST', '/gate/scans/' + encodeURIComponent(scanId) + '/release', {});
        this.toast('Child released.');
        await this.navigate(true);
      } catch (error) {
        this.toast(error.message || 'Release failed.', 'error');
      }
    }
  };
})();
