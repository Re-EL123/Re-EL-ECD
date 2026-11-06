'use strict';

/* User manuals with SOPs and legal documents, downloadable as branded PDFs. */
(function () {
  const R = window.Reel;
  const V = R.views;

  function categoryLabel(category) {
    return category === 'legal' ? 'Legal' : 'Manual';
  }

  function docCard(doc) {
    const slug = R.attr(doc.slug);
    const route = R.attr(doc._route || '/app/manuals/' + slug);
    return '<article class="site-card legal-card">' +
      '<div class="site-card-body">' +
      '<div class="site-pill">' + R.esc(categoryLabel(doc.category)) + (doc.role_key ? ' · ' + R.esc(R.titleCase(doc.role_key)) : '') + '</div>' +
      '<h3>' + R.esc(doc.title) + '</h3>' +
      '<p>' + R.esc(doc.lede || '') + '</p>' +
      '<p class="small muted">Version ' + R.esc(doc.version) + ' · Updated ' + R.esc(R.date(doc.updated_at)) + '</p>' +
      '<div class="row" style="gap:8px;flex-wrap:wrap;margin-top:10px">' +
      '<a class="btn btn-sm btn-primary" href="#' + route + '">' + R.icon('book-open') + ' Read online</a>' +
      '<button type="button" class="btn btn-sm btn-secondary" @click="downloadExport(\'/documents/' + slug + '/pdf\')">' + R.icon('download') + ' Download PDF</button>' +
      '</div></div></article>';
  }

  V.manuals = {
    async load(ctx) {
      const [docsResult] = await Promise.all([
        R.api('GET', '/documents?pageSize=100').catch(() => ({ data: [] }))
      ]);
      const docs = docsResult.data || [];
      const myRoles = new Set();
      if (ctx.session && ctx.session.memberships) {
        for (const membership of ctx.session.memberships) {
          for (const role of (membership.roles || [])) myRoles.add(role);
        }
      }
      const routePrefix = ctx.area === 'parent' ? '/parent/manuals' : '/app/manuals';
      const decorated = docs.map((doc) => ({ ...doc, _route: routePrefix + '/' + doc.slug, _mine: myRoles.has(doc.role_key) }));
      return {
        docs: decorated,
        mine: decorated.filter((doc) => doc._mine),
        legal: decorated.filter((doc) => doc.category === 'legal'),
        manuals: decorated.filter((doc) => doc.category !== 'legal')
      };
    },

    render(ctx, params, page) {
      const docs = page.docs || [];
      const mine = page.mine || [];
      const legal = page.legal || [];
      const manuals = page.manuals || [];
      return R.pageHead('Manuals and policies', 'Step-by-step guides and SOPs for your role, plus the legal documents that govern the platform.',
        '<a class="btn btn-secondary btn-sm" href="#/legal">' + R.icon('scale') + ' Legal hub</a>') +
        (mine.length ?
          '<section class="section"><h2>Your role manual</h2><div class="site-card-grid">' + mine.map(docCard).join('') + '</div></section>' : '') +
        '<section class="section"><h2>All role manuals</h2><div class="site-card-grid">' + manuals.map(docCard).join('') + '</div></section>' +
        (legal.length ?
          '<section class="section"><h2>Legal documents</h2><div class="site-card-grid">' + legal.map(docCard).join('') + '</div></section>' : '') +
        '<section class="section"><div class="card"><h3>How to get the best results</h3><ol class="legal-steps">' +
        '<li>Follow the SOPs in your role manual every day — they exist because skipping them creates the incidents and chasing you see later.</li>' +
        '<li>Keep records in the platform (not in chat or personal phones) so they are searchable, auditable and POPIA-safe.</li>' +
        '<li>Export reports (CSV/Excel/PDF) every Friday and file them; your audit log is your protection.</li>' +
        '<li>When a rule is unclear, ask your principal or admin before you invent a workaround.</li></ol></div></section>' +
        '<div class="muted small">Found ' + R.number(docs.length) + ' documents. PDFs are branded with your centre and the document version.</div>';
    }
  };

  V.manualDetail = {
    async load(ctx, params) {
      const doc = await R.api('GET', '/documents/' + encodeURIComponent(params.slug)).then((p) => p.data);
      return { doc };
    },

    render(ctx, params, page) {
      const doc = (page && page.doc) || {};
      const sections = (doc.sections || []).map((section) =>
        '<h2>' + R.esc(section.heading || 'Section') + '</h2>' +
        (section.paragraphs || []).map((p) => '<p>' + R.esc(p) + '</p>').join('') +
        ((section.steps || []).length ? '<ol class="legal-steps">' + (section.steps || []).map((s) => '<li>' + R.esc(s) + '</li>').join('') + '</ol>' : '')
      ).join('');
      const intro = (doc.intro || []).map((p) => '<p>' + R.esc(p) + '</p>').join('');
      const back = (ctx.area === 'parent' ? '#/parent/manuals' : '#/app/manuals');
      return R.pageHead(doc.title || 'Manual', doc.lede || '',
        '<a class="btn btn-secondary btn-sm" href="' + R.attr(back) + '">' + R.icon('arrow-left') + ' All manuals</a>' +
        '<button class="btn btn-primary btn-sm" @click="downloadExport(\'/documents/' + R.attr(doc.slug) + '/pdf\')">' + R.icon('download') + ' Download branded PDF</button>') +
        '<section class="section"><article class="legal-article">' +
        '<p class="small muted">Version ' + R.esc(doc.version) + ' · Updated ' + R.esc(R.date(doc.updated_at)) + (doc.role_key ? ' · ' + R.esc(R.titleCase(doc.role_key)) : '') + '</p>' +
        intro + sections +
        '<hr><p class="small muted">This manual is platform guidance. Centre-specific rules (your principal\'s instructions, DSD/DBE requirements) always take precedence where they are stricter.</p>' +
        '</article></section>';
    }
  };

  // (PDF downloads use the Alpine downloadExport handler on each button.)
})();
