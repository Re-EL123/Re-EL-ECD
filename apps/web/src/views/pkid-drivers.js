'use strict';

/* Pkid Drivers: registered transport drivers per child. Parents add regular
   monthly cab drivers and ad-hoc quick cabs; each gets a name+PIN for the gate. */
(function () {
  const R = window.Reel;
  const V = R.views;

  function childLabel(child) { return child.firstName + ' ' + (child.lastName || ''); }

  V.pkidDrivers = {
    async load(ctx) {
      const children = await R.api('GET', '/parent/children').then((p) => p.data).catch(() => []);
      const childId = ctx.filters.childId || (children.length ? children[0].id : null);
      const drivers = childId
        ? await R.api('GET', '/parent/children/' + encodeURIComponent(childId) + '/collectors').then((p) => p.data).catch(() => [])
        : [];
      return { children: children || [], childId, drivers };
    },

    render(ctx, params, page) {
      const drivers = (page.drivers || []).filter((d) => d.collector_type === 'driver' || d.collector_type === 'taxi');
      const child = (page.children || []).find((c) => c.id === page.childId);
      const childName = child ? childLabel(child) : 'this child';
      return R.pageHead('Pickup drivers', 'Register regular drivers and quick cabs. They sign in at the gate with a name and PIN — safe, accountable and recorded.',
        '<a class="btn btn-primary btn-sm" href="#/parent/pkid-drivers" @click="openNamedModal(\'pkidDriverAdd\',\'' + R.attr(page.childId || '') + '\')">' + R.icon('plus') + ' Add driver</a>') +
        R.selectFilter(ctx, 'childId', (page.children || []).map((c) => ({ value: c.id, label: childLabel(c) })), 'Choose a child') +
        '<div class="section"></div>' +
        R.card('Drivers registered for ' + R.esc(childName), drivers.length ? '<div class="stack">' + drivers.map((d) =>
          '<div class="row" style="gap:12px;align-items:center;padding:10px;border:1px solid var(--border-subtle);border-radius:14px">' +
            '<div class="avatar" style="background:var(--forest-600);color:#fff;font-size:0.9rem">' + R.esc((d.name || '?')[0].toUpperCase()) + '</div>' +
            '<div style="flex:1;min-width:0"><div class="strong">' + R.esc(d.name) + '</div><div class="muted small">' +
              (d.numberPlate ? 'Plate: ' + R.esc(d.numberPlate) + ' · ' : '') +
              ((d.pkid_pickup_days || []).join(' ') || 'Unscheduled') +
            '</div></div></div>').join('') + '</div>' : '<p class="muted small">No drivers registered yet.</p>',
          '');
    },

    openModal(ctx, name, id) {
      if (name === 'pkidDriverAdd' && id) {
        ctx.openModal({
          title: 'Register a pickup driver',
          endpoint: '/parent/children/' + id + '/collectors',
          submitLabel: 'Save driver',
          successMessage: 'Driver saved. They can sign in at the gate with their name and PIN.',
          fields: [
            { name: 'name', label: 'Driver name', required: true, span: 2, placeholder: 'e.g. John Doe' },
            { name: 'relationship', label: 'Relationship', type: 'select', span: 1, options: ['Driver', 'Cab Driver', 'Chauffeur', 'Other'], value: 'Driver' },
            { name: 'contactPhone', label: 'Phone', placeholder: '+27 81 000 0000' },
            { name: 'vehicleDescription', label: 'Vehicle', span: 2, placeholder: 'e.g. Toyota Quantum · white' },
            { name: 'licencePlate', label: 'Licence plate', placeholder: 'CA 123-456' },
            { name: 'collectorType', label: 'Type', type: 'select', span: 1, options: [{ value: 'driver', label: 'Regular driver' }, { value: 'taxi', label: 'Quick cab' }], value: 'driver' },
            { name: 'pin', label: 'PIN for the gate', placeholder: '6-digit code — give this to the driver' }
          ]
        });
      }
    }
  };
})();
