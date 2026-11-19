'use strict';

/* Nursery rhymes: traditional lyrics, instant .txt download, licensed audio links. */
(function () {
  const R = window.Reel;
  const V = R.views;

  V.nurseryRhymes = {
    render(ctx) {
      const lib = R.nurseryRhymes;
      const filters = ctx.filters || {};
      const query = String(filters.q || '').trim().toLowerCase();
      const category = String(filters.category || '');
      let list = lib.all.slice();
      if (category) list = list.filter((r) => r.category === category);
      if (query) list = list.filter((r) => (r.title + ' ' + r.lyrics.join(' ') + ' ' + r.category).toLowerCase().includes(query));

      let html = R.pageHead('Nursery rhymes',
        'Traditional songs for singing, clapping and calm moments — ' + R.number(lib.all.length) + ' rhymes with lyrics you can download as text.',
        '<button class="btn btn-sm btn-secondary" @click="downloadAllRhymeLyrics()">' + R.icon('file-down') + ' Download all lyrics</button>' +
        R.refreshButton());

      html += R.teachingNav(ctx, 'nursery-rhymes');

      html += '<div class="card glass section" style="padding:14px 16px">' +
        '<div class="row" style="gap:10px;flex-wrap:wrap">' +
          R.searchFilter(ctx, 'q', 'Search rhymes or lyrics…') +
          '<button class="btn btn-sm ' + (category ? 'btn-secondary' : 'btn-primary') + '" @click="setFilter(\'category\',\'\')">All (' + R.number(lib.all.length) + ')</button>' +
          lib.categories.map((c) => {
            const count = lib.all.filter((r) => r.category === c).length;
            return '<button class="btn btn-sm ' + (category === c ? 'btn-primary' : 'btn-secondary') + '" @click="setFilter(\'category\',\'' + R.attr(c) + '\')">' + R.esc(c) + ' (' + R.number(count) + ')</button>';
          }).join('') +
        '</div></div>';

      if (!list.length) {
        html += R.emptyState('No rhymes found', 'Try another word or clear the filters.', '<button class="btn btn-primary" @click="setFilter(\'q\',\'\');setFilter(\'category\',\'\')">Clear filters</button>', 'search');
        return html;
      }

      html += '<div class="grid grid-2 section">';
      list.forEach((rhyme, index) => {
        const preview = rhyme.lyrics.filter(Boolean).slice(0, 2).join(' ');
        html += '<div class="card glass rhyme-card anim-in anim-delay-' + (Math.min(index % 6 + 1, 6)) + '">' +
          '<div class="card-head"><h3>' + R.icon('music-2') + ' ' + R.esc(rhyme.title) + '</h3>' +
            '<div class="card-actions"><span class="badge badge-muted">' + R.esc(rhyme.category) + '</span></div></div>' +
          '<p class="muted small">' + R.esc(R.truncate(preview, 110)) + '…</p>' +
          (rhyme.actions ? '<div class="muted small" style="margin-bottom:8px">' + R.icon('hand') + ' ' + R.esc(rhyme.actions) + '</div>' : '') +
          '<details class="rhyme-lyrics"><summary>Read lyrics</summary><pre class="rhyme-text">' + R.esc(rhyme.lyrics.join('\n')) + '</pre>' +
            '<a class="btn btn-sm btn-ghost" href="' + R.attr(rhyme.source) + '" target="_blank" rel="noopener noreferrer">' + R.icon('external-link') + ' Licensed audio / sheet music</a>' +
          '</details>' +
          '<div class="row" style="gap:8px;margin-top:12px">' +
            '<button class="btn btn-sm btn-primary" @click="downloadRhymeLyrics(\'' + R.attr(rhyme.id) + '\')">' + R.icon('download') + ' Download lyrics (.txt)</button>' +
            '<button class="btn btn-sm btn-ghost" @click="printRhymeLyrics(\'' + R.attr(rhyme.id) + '\')">' + R.icon('printer') + ' Print</button>' +
          '</div>' +
        '</div>';
      });
      html += '</div>';

      html += '<div class="card section" style="padding:16px"><h3>About these lyrics & the audio links</h3>' +
        '<p class="muted small">The words above are the classic traditional verses (public domain — wording varies by region). TunePocket is linked as a source for royalty-free audio and backing tracks; their recordings and page content are licensed separately and are not reproduced here.</p>' +
        '<div class="row" style="gap:8px;flex-wrap:wrap">' + lib.collections.map((c) =>
          '<a class="btn btn-sm btn-secondary" href="' + R.attr(c.url) + '" target="_blank" rel="noopener noreferrer">' + R.icon('external-link') + ' ' + R.esc(c.label) + '</a>').join('') +
        '</div></div>';
      return html;
    }
  };
})();
