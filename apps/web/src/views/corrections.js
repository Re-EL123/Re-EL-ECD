'use strict';

(function () {
  const R = window.Reel;
  const V = R.views;

  function diff(before, after) {
    const keys = Object.keys(after || {}).filter((key) =>
      JSON.stringify((before || {})[key]) !== JSON.stringify(after[key]));
    if (!keys.length) return '<p class="muted small">No value changes recorded.</p>';
    return keys.map((key) =>
      '<div class="correction-diff">' +
        '<span class="correction-field">' + R.esc(R.titleCase(key)) + '</span>' +
        '<code>' + R.esc(JSON.stringify((before || {})[key] === undefined ? '—' : (before || {})[key])) + '</code>' +
        R.icon('arrow-right') +
        '<code class="is-new">' + R.esc(JSON.stringify(after[key])) + '</code>' +
      '</div>').join('');
  }

  V.corrections = {
    async load(ctx) {
      const [response, types] = await Promise.all([
        R.api('GET', '/corrections?pageSize=100').catch(() => null),
        R.api('GET', '/corrections/resources').catch(() => null)
      ]);
      return {
        corrections: (response && response.data) || [],
        resourceTypes: (types && types.data) || [],
        canApprove: ctx.has('records.approve.daycare')
      };
    },

    render(ctx, params, page) {
      const rows = page.corrections || [];
      const cards = rows.length ? rows.map((row) => {
        const changes = row.changes || {};
        const pending = row.status === 'pending';
        const actions = pending && page.canApprove
          ? '<button class="btn btn-sm btn-primary" @click="reviewCorrection(\'' + R.attr(row.id) + '\',\'approved\')">' + R.icon('check') + ' Apply correction</button>' +
            '<button class="btn btn-sm btn-ghost" @click="reviewCorrection(\'' + R.attr(row.id) + '\',\'rejected\')">Reject</button>'
          : R.badge(row.status);
        return R.card(row.resourceLabel + ' · ' + R.esc(row.requested_by_name || 'Staff member'),
          '<div class="correction-row">' +
            '<div class="correction-detail">' +
              '<div class="row" style="gap:6px;flex-wrap:wrap">' + R.badge(row.status) +
                '<span class="muted small">Requested ' + R.date(row.created_at) + '</span></div>' +
              '<div><strong>Reason:</strong> ' + R.esc(row.reason) + '</div>' +
              diff(changes.before, changes.after) +
              (row.resolution_notes ? '<p class="muted small">' + R.esc(row.resolution_notes) + '</p>' : '') +
            '</div>' +
            '<div class="row" style="gap:6px;flex-wrap:wrap;justify-content:flex-end">' + actions + '</div>' +
          '</div>');
      }).join('') : R.emptyState('No corrections yet', 'When something needs fixing, request a correction with a reason. An authorised colleague then applies it, and the original value is kept in the audit trail.', '', 'file-pen');

      const options = (page.resourceTypes || []).map((type) =>
        '<option value="' + R.attr(type.type) + '">' + R.esc(type.label) + '</option>').join('');
      const editor = '<template x-for="field in correction.fields" :key="field.key"><div class="field">' +
        '<label x-text="field.label"></label>' +
        '<template x-if="field.type === \'select\'"><select class="select" x-model="correction.values[field.key]">' +
          '<template x-for="option in field.options" :key="option"><option :value="option" x-text="option"></option></template>' +
        '</select></template>' +
        '<template x-if="field.type === \'json\'"><textarea class="textarea" rows="4" x-model="correction.values[field.key]"></textarea></template>' +
        '<template x-if="field.type !== \'select\' && field.type !== \'json\'"><input class="input" type="text" x-model="correction.values[field.key]"></template>' +
        '</div></template>';
      const form = R.card('Request a correction',
        '<div class="form-grid">' +
          '<div class="field"><label>Record type</label><select class="select" x-model="correction.type" @change="loadCorrectionFields()">' +
            '<option value="">Choose a record type…</option>' + options + '</select></div>' +
          '<div class="field"><label>Record ID</label><input class="input" type="text" placeholder="Paste the record ID" x-model="correction.resourceId" @change="loadCorrectionFields()"></div>' +
        '</div>' +
        '<template x-if="correction.fields && correction.fields.length"><div class="section">' +
          '<p class="muted small">Current values for this <span x-text="correction.label"></span> — change only what is wrong.</p>' +
          editor + '</div></template>' +
        '<div class="field section"><label>Why is this correction needed?</label>' +
          '<textarea class="textarea" rows="3" placeholder="Describe the mistake and the correct information" x-model="correction.reason"></textarea></div>' +
        '<p class="alert alert-danger" x-show="correction.error" x-text="correction.error"></p>' +
        '<button class="btn btn-primary btn-sm" @click="submitCorrection()">' + R.icon('send') + ' Submit for approval</button>');

      return R.pageHead('Record corrections',
        'Fix inaccurate records without losing history — every change needs a reason and an approval.') +
        '<div class="section"><div class="alert alert-info"><i data-lucide="shield-check"></i><span>' +
        'Corrections do not overwrite the past silently. The previous value, your reason and the approver are kept in the audit log.</span></div></div>' +
        '<div class="section">' + form + '</div>' +
        '<h2 class="section">Correction history</h2><div class="stack section">' + cards + '</div>';
    }
  };
})();
