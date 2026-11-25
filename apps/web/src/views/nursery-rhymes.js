'use strict';

/* Nursery rhymes: a classroom-first library with one shared player, a
 * focused lyrics reader, curation, lesson-prep tools and org-owned songs. */
(function () {
  const R = window.Reel;
  const V = R.views;
  const meta = () => R.rhymeMeta || {};

  function chip(label, count, field, value, active) {
    return '<button type="button" class="btn btn-sm rhyme-chip' + (active ? ' is-active' : '') +
      '" @click="setFilter(\'' + field + '\',\'' + R.attr(value) + '\')">' +
      R.esc(label) + (count === undefined ? '' : ' <span class="chip-count">' + R.number(count) + '</span>') + '</button>';
  }

  function chipRow(label, chips, field) {
    return '<div class="rhyme-filter-row"><span class="rhyme-filter-label">' + R.esc(label) + '</span>' +
      '<div class="rhyme-chip-scroll scroll-edge">' + chips.join('') + '</div></div>';
  }

  function compactCard(rhyme) {
    return '<button type="button" class="rhyme-compact" @click="openRhymeReader(\'' + R.attr(rhyme.id) + '\')">' +
      R.icon('music-2') + '<span>' + R.esc(rhyme.title) + '</span></button>';
  }

  V.nurseryRhymes = {
    async load(ctx) {
      let audio = {};
      let custom = [];
      if (ctx.has('curriculum.read.daycare') || ctx.has('organisation.read.daycare')) {
        try {
          const [sharedRes, settingsRes] = await Promise.all([
            R.api('GET', '/nursery-rhyme-audio').catch(() => null),
            R.api('GET', '/organisations/current/settings').catch(() => null)
          ]);
          const settings = (settingsRes && settingsRes.data) || {};
          // Every uploaded recording is shared across centres by default.
          audio = (sharedRes && sharedRes.data && sharedRes.data.audio) || settings.nurseryRhymeAudio || {};
          custom = Array.isArray(settings.nurseryRhymes) ? settings.nurseryRhymes : [];
          // Stored media URLs are API-relative (/api/v1/media/object?…).
          // Resolve them against the API origin so <audio> works from the
          // separately hosted GitHub Pages frontend too.
          const origin = R.apiBase ? R.apiBase() : '';
          Object.keys(audio).forEach((id) => {
            let url = String(audio[id] || '');
            if (url.startsWith('/')) url = origin + (url.startsWith('/api/') ? url : '/api/v1' + url);
            // Stream through the cookie-free public endpoint so mobile Safari
            // and in-app browsers can play without third-party cookies. The
            // captured value is the already-encoded query parameter, so decode
            // once before re-encoding to avoid a double-encoded `key`.
            const match = /\/api\/v1\/media\/object\?key=([^&]+)/.exec(url);
            if (match) {
              const rawKey = decodeURIComponent(match[1]);
              url = origin + '/api/v1/public/rhyme-audio?key=' + encodeURIComponent(rawKey);
            }
            audio[id] = url;
          });
        } catch { /* teachers still get the lyrics without org settings access */ }
      }
      if (R.nurseryRhymes && typeof R.nurseryRhymes.setCustom === 'function') R.nurseryRhymes.setCustom(custom);
      return {
        rhymeAudio: audio,
        rhymeCustom: custom,
        rhymeRequests: meta().requests ? meta().requests().length : 0
      };
    },

    render(ctx, params, page) {
      const lib = R.nurseryRhymes;
      const m = meta();
      const audio = (page && page.rhymeAudio) || {};
      const filters = ctx.filters || {};
      const query = String(filters.q || '').trim().toLowerCase();
      const category = String(filters.category || '');
      const use = String(filters.use || '');
      const duration = String(filters.duration || '');
      const sort = String(filters.sort || 'popular');
      const manage = Boolean(ctx.rhymeManage);
      const selecting = Boolean(ctx.rhymeSelect);
      const selected = Array.isArray(ctx.rhymeSelection) ? ctx.rhymeSelection : [];
      const canManage = ctx.has('organisation.settings.manage');

      let list = lib.all.slice();
      if (category) list = list.filter((r) => r.category === category);
      if (use) list = list.filter((r) => m.tagsFor(r).indexOf(use) !== -1);
      if (duration) list = list.filter((r) => m.bandFor(r) === duration);
      if (query) list = list.filter((r) => (r.title + ' ' + (r.lyrics || []).join(' ') + ' ' + r.category + ' ' + (r.actions || '')).toLowerCase().includes(query));
      if (sort === 'az') list.sort((a, b) => String(a.title).localeCompare(String(b.title)));
      else if (sort === 'newest') list.reverse();
      else list.sort((a, b) => m.popularRank(a, lib.all) - m.popularRank(b, lib.all));

      // ---- Head ------------------------------------------------------------
      const headActions =
        (canManage ? '<button class="btn btn-sm btn-primary" @click="openNamedModal(\'rhymeAdd\')">' + R.icon('plus') + ' Add a rhyme</button>' : '') +
        '<button class="btn btn-sm ' + (selecting ? 'btn-primary' : 'btn-secondary') + '" @click="toggleRhymeSelect()">' + R.icon('check-square') + ' ' + (selecting ? 'Done selecting' : 'Select for songbook') + '</button>' +
        (canManage ? '<button class="btn btn-sm ' + (manage ? 'btn-primary' : 'btn-secondary') + '" @click="toggleRhymeManage()">' + R.icon('settings-2') + ' Manage' +
          ((page && page.rhymeRequests) ? ' <span class="badge badge-warn">' + R.number(page.rhymeRequests) + '</span>' : '') + '</button>' : '') +
        (selected.length ? '<button class="btn btn-sm btn-primary" @click="printRhymeSongbook()">' + R.icon('printer') + ' Print songbook (' + R.number(selected.length) + ')</button>' +
          '<button class="btn btn-sm btn-ghost" @click="clearRhymeSelection()">Clear</button>' : '') +
        '<button class="btn btn-sm btn-ghost" @click="rhymeMoreMenu($event.currentTarget)">' + R.icon('more-horizontal') + ' More</button>' +
        R.refreshButton();
      let html = R.pageHead('Nursery rhymes',
        'Traditional songs for singing, clapping and calm moments — ' + R.number(lib.all.length) + ' complete rhymes with lyrics you can read, print and play.',
        headActions);
      html += R.teachingNav(ctx, 'nursery-rhymes');

      // ---- Filters ---------------------------------------------------------
      const categoryChips = [chip('All', lib.all.length, 'category', '', !category)]
        .concat(lib.categories.map((c) => chip(c, lib.all.filter((r) => r.category === c).length, 'category', c, category === c)));
      const useChips = [chip('Any', undefined, 'use', '', !use)]
        .concat(m.TAGS.map((t) => chip(t, lib.all.filter((r) => m.tagsFor(r).indexOf(t) !== -1).length, 'use', t, use === t)));
      const durationChips = [chip('Any length', undefined, 'duration', '', !duration)]
        .concat(m.BANDS.map((b) => chip(b, lib.all.filter((r) => m.bandFor(r) === b).length, 'duration', b, duration === b)));

      html += '<div class="card glass section rhyme-filters">' +
        '<div class="rhyme-filter-top">' + R.searchFilter(ctx, 'q', 'Search rhymes or lyrics…') +
          '<label class="rhyme-sort"><span class="muted small">Sort</span>' +
            '<select class="select" @change="setFilter(\'sort\', $event.target.value)">' +
              '<option value="popular"' + (sort === 'popular' ? ' selected' : '') + '>Most used</option>' +
              '<option value="az"' + (sort === 'az' ? ' selected' : '') + '>A–Z</option>' +
              '<option value="newest"' + (sort === 'newest' ? ' selected' : '') + '>Recently added</option>' +
            '</select></label>' +
        '</div>' +
        chipRow('Topic', categoryChips, 'category') +
        chipRow('Mood', useChips, 'use') +
        chipRow('Length', durationChips, 'duration') +
      '</div>';

      // ---- Pinned personal sections ----------------------------------------
      const favIds = typeof m.favourites === 'function' ? m.favourites() : [];
      const recentIds = typeof m.recents === 'function' ? m.recents() : [];
      const favs = favIds.map((id) => lib.find(id)).filter(Boolean);
      const recents = recentIds.map((id) => lib.find(id)).filter(Boolean);
      if (favs.length || recents.length) {
        html += '<div class="rhyme-pinned">';
        if (favs.length) html += '<div class="card glass section rhyme-pin"><div class="pin-head"><h2>' + R.icon('star') + ' Your favourites</h2><span class="muted small">' + R.number(favs.length) + ' pinned</span></div><div class="rhyme-compact-row">' + favs.map(compactCard).join('') + '</div></div>';
        if (recents.length) html += '<div class="card glass section rhyme-pin"><div class="pin-head"><h2>' + R.icon('history') + ' Recently used</h2><span class="muted small">Pick up where you left off</span></div><div class="rhyme-compact-row">' + recents.map(compactCard).join('') + '</div></div>';
        html += '</div>';
      }

      if (!list.length) {
        html += R.emptyState('No rhymes found', 'Try another word or clear the filters.', '<button class="btn btn-primary" @click="setFilter(\'q\',\'\');setFilter(\'category\',\'\');setFilter(\'use\',\'\');setFilter(\'duration\',\'\')">Clear filters</button>', 'search');
        return html;
      }

      // ---- Cards -----------------------------------------------------------
      html += '<div class="grid grid-2 section rhyme-grid">';
      list.forEach((rhyme) => {
        const id = R.attr(rhyme.id);
        const url = audio[rhyme.id] || '';
        const isFav = favIds.indexOf(rhyme.id) !== -1;
        const isSelected = selected.indexOf(rhyme.id) !== -1;
        const preview = (rhyme.lyrics || []).filter(Boolean).slice(0, 2).join(' ');
        const tags = m.tagsFor(rhyme);
        html += '<div class="card glass rhyme-card" data-rhyme-id="' + id + '">' +
          '<div class="card-head">' +
            '<h2>' + R.icon('music-2') + ' ' + R.esc(rhyme.title) +
              (rhyme.custom ? ' <span class="badge badge-muted">Yours</span>' : '') + '</h2>' +
            '<div class="card-actions">' +
              '<button type="button" class="btn btn-ghost btn-icon btn-sm rhyme-star' + (isFav ? ' is-fav' : '') + '" @click="toggleRhymeFav(\'' + id + '\')" aria-label="' + (isFav ? 'Remove from favourites' : 'Add to favourites') + '">' + R.icon('star') + '</button>' +
              '<span class="badge badge-muted">' + R.esc(rhyme.category) + '</span>' +
            '</div>' +
          '</div>' +
          (tags.length ? '<div class="rhyme-tags">' + tags.map((t) => '<span class="rhyme-tag">' + R.esc(t) + '</span>').join('') +
            '<span class="rhyme-tag">' + R.icon('clock') + ' ' + R.esc(m.bandFor(rhyme)) + '</span></div>' : '') +
          '<p class="muted small rhyme-preview">' + R.esc(R.truncate(preview, 110)) + '…</p>' +
          (rhyme.actions ? '<div class="rhyme-action muted small">' + R.icon('hand') + ' ' + R.esc(rhyme.actions) + '</div>' : '') +
          '<a class="rhyme-licence small" href="' + R.attr(rhyme.source || '#') + '" target="_blank" rel="noopener noreferrer">' + R.icon('external-link') + ' Get audio / sheet music</a>' +
          '<div class="rhyme-status" data-rhyme-status="' + id + '"></div>' +
          (url
            ? '<div class="rhyme-controls">' +
                '<button type="button" class="btn btn-sm btn-primary rhyme-play" data-rhyme-play="' + id + '" @click="playRhyme(\'' + id + '\')"><span class="rhyme-play-icon">' + R.icon('play') + '</span><span class="rhyme-play-label">Play</span></button>' +
                '<button type="button" class="btn btn-sm btn-secondary" @click="openRhymeReader(\'' + id + '\')">' + R.icon('book-open') + ' Read lyrics</button>' +
                '<button type="button" class="btn btn-sm btn-ghost rhyme-more" @click="rhymeMenu(\'' + id + '\', $event.currentTarget)" aria-label="More options for ' + R.attr(rhyme.title) + '">' + R.icon('more-horizontal') + '</button>' +
              '</div>'
            : '<div class="rhyme-no-audio">' +
                '<span>' + R.icon('headphones') + ' No recording yet — add one to share it with every centre.</span>' +
                '<div class="row" style="gap:8px;flex-wrap:wrap">' +
                  '<button type="button" class="btn btn-sm btn-secondary" @click="requestRhyme(\'' + id + '\')">' + R.icon('bell') + ' Request this song</button>' +
                  '<button type="button" class="btn btn-sm btn-ghost" @click="recordRhymeAudio(\'' + id + '\')">' + R.icon('mic') + ' Record your own</button>' +
                  '<button type="button" class="btn btn-sm btn-ghost" @click="openRhymeReader(\'' + id + '\')">' + R.icon('book-open') + ' Read lyrics</button>' +
                '</div>' +
              '</div>') +
          (selecting ? '<label class="rhyme-select"><input type="checkbox" ' + (isSelected ? 'checked' : '') + ' @change="toggleRhymeSelected(\'' + id + '\')"> Include in songbook</label>' : '') +
          (manage && canManage ? '<div class="rhyme-manage">' +
            '<label class="btn btn-sm btn-secondary" style="cursor:pointer">' + R.icon('upload') + ' ' + (url ? 'Replace audio' : 'Attach audio') +
              '<input type="file" accept="audio/*" style="display:none" @change="attachRhymeAudio($event,\'' + id + '\')"></label>' +
            (url ? '<button class="btn btn-sm btn-ghost" @click="removeRhymeAudio(\'' + id + '\')">' + R.icon('trash-2') + ' Remove audio</button>' : '') +
            (rhyme.custom ? '<button class="btn btn-sm btn-ghost" @click="openNamedModal(\'rhymeEdit\',\'' + id + '\')">' + R.icon('pencil') + ' Edit rhyme</button>' +
              '<button class="btn btn-sm btn-ghost is-danger" @click="deleteRhyme(\'' + id + '\')">' + R.icon('trash-2') + ' Delete rhyme</button>' : '') +
            '<span class="muted small rhyme-shared-hint">' + R.icon('users') + ' Shared with every centre</span>' +
          '</div>' : '') +
        '</div>';
      });
      html += '</div>';

      html += '<div class="card section rhyme-about"><h2>About these lyrics &amp; the audio links</h2>' +
        '<p class="muted small">Every verse is written out in full from the traditional public-domain wording (variations exist by region). Recordings and sheet music are licensed separately — the links below take you to the source collections. Your centre can also add its own rhymes from the <strong>Add a rhyme</strong> button.</p>' +
        '<div class="row" style="gap:8px;flex-wrap:wrap">' + lib.collections.map((c) =>
          '<a class="btn btn-sm btn-secondary" href="' + R.attr(c.url) + '" target="_blank" rel="noopener noreferrer">' + R.icon('external-link') + ' ' + R.esc(c.label) + '</a>').join('') +
        '</div></div>';
      return html;
    },

    /** Custom rhymes get their own form, handled by the shared modal system. */
    openModal(ctx, name, id) {
      if (name !== 'rhymeAdd' && name !== 'rhymeEdit') return false;
      const lib = R.nurseryRhymes || {};
      const m = R.rhymeMeta || {};
      const existing = id ? lib.find(id) : null;
      const custom = Array.isArray((ctx.page || {}).rhymeCustom) ? ctx.page.rhymeCustom : [];
      const categories = (lib.categories || []).concat(['Other']);
      ctx.openModal({
        title: existing ? 'Edit ' + existing.title : 'Add a rhyme',
        description: 'Write the words your centre uses. One lyric line per row; leave a blank row between verses. Your rhyme will be available to every teacher at this centre.',
        size: 'wide',
        submitLabel: existing ? 'Save rhyme' : 'Add rhyme',
        fields: [
          { name: 'title', label: 'Title', required: true, value: existing ? existing.title : '' },
          { name: 'category', label: 'Topic', type: 'select', options: categories, value: existing ? existing.category : 'Classics' },
          { name: 'tags', label: 'When do you use it?', type: 'checkboxes', options: (m.TAGS || []), value: existing && existing.tags ? existing.tags.slice() : [] },
          { name: 'minutes', label: 'Approximate length (minutes)', type: 'number', value: existing && existing.minutes ? existing.minutes : 3, help: 'Used for the length filter.' },
          { name: 'lyrics', label: 'Lyrics', type: 'textarea', required: true, span: 2, value: existing ? (existing.lyrics || []).join('\n') : '',
            placeholder: 'Line one\nLine two\n\nNext verse…', help: 'Public-domain or centre-owned words only, please.' },
          { name: 'actions', label: 'Actions / movements', span: 2, value: existing ? (existing.actions || '') : '',
            placeholder: 'Clap on every second line…' },
          { name: 'source', label: 'Audio / sheet music link', type: 'url', value: existing ? (existing.source || '') : '',
            placeholder: 'https://…' },
          { name: 'audioUrl', label: 'Recording (optional)', type: 'media', accept: 'audio/*', scope: 'nursery-rhyme',
            value: ((ctx.page || {}).rhymeAudio || {})[existing && existing.id] || '' }
        ],
        transform(data) {
          const lines = String(data.lyrics || '').replace(/\r/g, '').split('\n');
          while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
          return {
            id: existing ? existing.id : 'custom-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6),
            title: data.title,
            category: data.category || 'Other',
            tags: data.tags || [],
            minutes: Number(data.minutes) || 2,
            lyrics: lines,
            actions: data.actions || '',
            source: data.source || '',
            audioUrl: data.audioUrl || ''
          };
        },
        onSubmit(body) {
          return saveCustomRhymes(ctx, body, custom, existing);
        },
        onSuccess() {
          ctx.navigate(true);
        }
      });
      return true;
    }
  };

  async function saveCustomRhymes(ctx, rhyme, current, existing) {
    const list = current.slice();
    const at = list.findIndex((r) => r.id === rhyme.id);
    if (at === -1) list.push(rhyme); else list[at] = rhyme;
    await R.api('PATCH', '/organisations/current/settings', { settings: { nurseryRhymes: list } });
    if (rhyme.audioUrl) {
      await R.api('PATCH', '/nursery-rhyme-audio', { id: rhyme.id, url: rhyme.audioUrl });
    }
    ctx.toast(existing ? 'Rhyme saved.' : 'Rhyme added to your centre’s library.');
    if (R.rhymePlayer && R.rhymePlayer.subscribe && R.feedback) R.feedback.cue('success');
    return { ok: true };
  }
})();
