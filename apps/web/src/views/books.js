'use strict';

(function () {
  const R = window.Reel;
  const V = R.views;
  const esc = (s) => R.esc(s == null ? '' : String(s));
  const attr = (s) => R.attr(s == null ? '' : String(s));

  const LOGO = 'https://bookdash.org/wp-content/themes/bd/assets/images/logo-bookdash.svg';

  function editions(book) {
    if (Array.isArray(book.editions) && book.editions.length) return book.editions;
    return book.pdfUrl ? [{ language: book.language || 'English', pdfUrl: book.pdfUrl, coverUrl: book.coverUrl }] : [];
  }
  function coverFor(book) {
    if (book.coverUrl && R.resolveMediaUrl(book.coverUrl)) return R.resolveMediaUrl(book.coverUrl);
    const withCover = (book.editions || []).find((e) => e.coverUrl);
    return withCover ? R.resolveMediaUrl(withCover.coverUrl) : '';
  }
  function pdfFor(book, language) {
    const list = editions(book);
    const found = language ? list.find((e) => e.language === language) : null;
    return R.resolveMediaUrl((found || list[0] || {}).pdfUrl) || '';
  }
  function allLanguages(books) {
    const set = new Set();
    books.forEach((b) => editions(b).forEach((e) => set.add(e.language || 'English')));
    return Array.from(set).sort();
  }
  function allThemes(books) {
    const set = new Set();
    books.forEach((b) => String(b.theme || '').split(',').map((t) => t.trim()).filter(Boolean).forEach((t) => set.add(t)));
    return Array.from(set).sort();
  }
  function media(url) {
    const safe = R.resolveMediaUrl(url);
    if (!safe) return '<div class="book-cover-empty">' + R.icon('book-open') + '</div>';
    return '<img class="book-cover-img" src="' + attr(safe) + '" alt="" loading="lazy" onerror="this.style.display=\'none\'">';
  }
  function attribution(book) {
    const credits = [['Writer', book.author], ['Illustrator', book.illustrator], ['Designer', book.designer], ['Editor', book.editor]]
      .filter(([, name]) => name)
      .map(([role, name]) => '<span><b>' + esc(role) + ':</b> ' + esc(name) + '</span>').join('');
    return '<div class="book-credit">' +
      (book.kind === 'bookdash' ? '<img class="book-credit-logo" src="' + attr(LOGO) + '" alt="Book Dash" onerror="this.style.display=\'none\'">' : '') +
      '<div class="book-credit-text">' + credits +
        (book.sourceUrl ? '<a href="' + attr(book.sourceUrl) + '" target="_blank" rel="noopener">Read at Book Dash ' + R.icon('external-link') + '</a>' : '') +
        '<span class="muted small">' + esc(book.licence || 'CC BY 4.0') + (book.kind === 'bookdash' ? ' · freely shared with credit to Book Dash and the creators' : '') + '</span>' +
      '</div></div>';
  }

  V.books = {
    async load(ctx) {
      let api = { platform: [], custom: [], canPublish: false };
      try {
        const res = await R.api('GET', '/books');
        api = (res && res.data) || api;
      } catch (e) { /* still show the bundled defaults */ }
      const defaults = (Array.isArray(api.platform) && api.platform.length)
        ? api.platform : (Array.isArray(R.bookDefaults) ? R.bookDefaults : []);
      const custom = Array.isArray(api.custom) ? api.custom : [];
      return {
        books: defaults.map((b) => Object.assign({}, b, { source: 'default' }))
          .concat(custom.map((b) => Object.assign({}, b, { source: 'custom' }))),
        canManage: ctx.has('organisation.settings.manage') || Boolean(api.canPublish),
        canPublish: Boolean(api.canPublish)
      };
    },

    render(ctx, params, page) {
      const books = (page && page.books) || [];
      const canManage = Boolean(page && page.canManage);
      let html = '<div class="page-head"><div><h1>Books</h1>' +
        '<div class="page-sub">A shared picture-book library for every centre — plus your own books.</div></div>' +
        '<div class="page-actions">' +
          (canManage ? '<button type="button" class="btn btn-primary btn-sm" @click="openNamedModal(\'bookAdd\')">' + R.icon('plus') + ' Add a book</button>' : '') +
          R.refreshButton() +
        '</div></div>';
      html += R.teachingNav(ctx, 'books');

      const languages = allLanguages(books), themes = allThemes(books);
      html += '<div class="book-toolbar">' +
        '<label class="book-search">' + R.icon('search') + '<input class="input" id="book-search" type="search" placeholder="Search books…" aria-label="Search books" @input="filterBooks()"></label>' +
        '<select class="wb-select" id="book-language" aria-label="Filter by language" @change="filterBooks()"><option value="">All languages</option>' +
          languages.map((l) => '<option value="' + attr(l) + '">' + esc(l) + '</option>').join('') + '</select>' +
        '<select class="wb-select" id="book-theme" aria-label="Filter by theme" @change="filterBooks()"><option value="">All themes</option>' +
          themes.map((t) => '<option value="' + attr(t) + '">' + esc(t) + '</option>').join('') + '</select>' +
        '<span class="muted small" id="book-count">' + books.length + ' books</span>' +
      '</div>';

      html += '<div class="book-grid" id="book-grid">' + books.map((b, i) => {
        const eds = editions(b);
        const bid = attr(b.id);
        return '<article class="book-card' + (b.source === 'custom' ? ' is-custom' : '') + '" data-index="' + i + '"' +
          ' data-search="' + attr(String(b.title || '') + ' ' + String(b.description || '') + ' ' + String(b.theme || '') + ' ' + eds.map((e) => e.language).join(' ')).toLowerCase() + '"' +
          ' data-language="' + attr(eds.map((e) => e.language).join('|')) + '" data-theme="' + attr(b.theme || '') + '">' +
          '<button type="button" class="book-cover" @click="openReader(' + i + ')" aria-label="Read ' + attr(b.title) + '">' + media(coverFor(b)) +
            '<span class="book-lang-count">' + R.icon('languages') + ' ' + eds.length + '</span></button>' +
          '<div class="book-card-body">' +
            '<h3>' + esc(b.title) + '</h3>' +
            '<p class="muted small">' + esc(R.truncate(b.description || b.theme || '', 90)) + '</p>' +
            '<div class="book-chips">' + eds.slice(0, 4).map((e) => '<span class="book-chip">' + esc(e.language) + '</span>').join('') +
              (eds.length > 4 ? '<span class="book-chip">+' + (eds.length - 4) + '</span>' : '') + '</div>' +
            '<div class="book-card-actions">' +
              '<button type="button" class="btn btn-sm btn-secondary" @click="openReader(' + i + ')">' + R.icon('book-open') + ' Read</button>' +
              '<a class="btn btn-sm btn-ghost" href="' + attr(pdfFor(b)) + '" target="_blank" rel="noopener" download>' + R.icon('download') + ' PDF</a>' +
              (b.source === 'custom' && canManage ? '<button type="button" class="btn btn-sm btn-ghost" @click="deleteBook(\'' + bid + '\')">' + R.icon('trash-2') + '</button>' : '') +
            '</div>' +
          '</div></article>';
      }).join('') + '</div>';

      html += '<div class="book-footer">' + R.icon('info') + ' The default books are shared by <a href="https://bookdash.org" target="_blank" rel="noopener">Book Dash</a> under CC BY 4.0. Creator credits are shown with each book.</div>';
      return html;
    },

    openModal(ctx, name, id) {
      if (name === 'bookEditionAdd') {
        const book = ((ctx.page || {}).books || []).find((b) => b.id === id);
        if (!book) return false;
        const languages = ['Afrikaans', 'English', 'isiNdebele', 'isiXhosa', 'isiZulu', 'Sepedi',
          'Sesotho', 'Setswana', 'SiSwati', 'Tshivenḓa', 'Xitsonga'];
        ctx.openModal({
          title: 'Add a language — ' + book.title,
          description: 'Upload another PDF for a different language of this book. It will appear beside the existing languages for every centre that can see this book.',
          size: 'wide',
          submitLabel: 'Add language',
          fields: [
            { name: 'language', label: 'Language', type: 'select', options: languages, required: true },
            { name: 'pdfUrl', label: 'Book PDF for this language', type: 'media', accept: 'application/pdf', scope: 'book', required: true },
            { name: 'coverUrl', label: 'Cover image for this language (optional)', type: 'media', accept: 'image/*', scope: 'book' }
          ],
          transform(data) {
            return {
              language: data.language,
              pdfUrl: data.pdfUrl || '', coverUrl: data.coverUrl || ''
            };
          },
          async onSubmit(body) {
            const res = await R.api('GET', '/books');
            const all = [].concat((res.data && res.data.platform) || [], (res.data && res.data.custom) || []);
            const fresh = all.find((b) => b.id === book.id) || book;
            const list = (fresh.editions || []).slice();
            const at = list.findIndex((e) => e.language === body.language);
            if (at >= 0) list[at] = body; else list.push(body);
            list.sort((a, b) => String(a.language).localeCompare(String(b.language)));
            return R.api('PATCH', '/books/' + encodeURIComponent(book.id), { book: { editions: list } });
          },
          onSuccess() { ctx.navigate(true); }
        });
        return true;
      }
      if (name !== 'bookAdd') return false;
      ctx.openModal({
        title: 'Add a book',
        description: 'Upload a PDF and its details. You can add more language versions afterwards from the book. Platform admins publish for every centre; other books stay at your centre.',
        size: 'wide',
        submitLabel: 'Add book',
        fields: [
          { name: 'title', label: 'Title', required: true },
          { name: 'description', label: 'Short description', type: 'textarea' },
          { name: 'language', label: 'Language', value: 'English' },
          { name: 'theme', label: 'Theme / topic' },
          { name: 'author', label: 'Author' },
          { name: 'illustrator', label: 'Illustrator' },
          { name: 'pdfUrl', label: 'Book PDF', type: 'media', accept: 'application/pdf', scope: 'book', required: true },
          { name: 'coverUrl', label: 'Cover image (optional)', type: 'media', accept: 'image/*', scope: 'book' }
        ],
        transform(data) {
          return {
            id: 'custom-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6),
            title: data.title, description: data.description || '', language: data.language || 'English',
            theme: data.theme || '', author: data.author || '', illustrator: data.illustrator || '',
            pdfUrl: data.pdfUrl || '', coverUrl: data.coverUrl || '', kind: 'custom', licence: 'Centre-owned'
          };
        },
        onSubmit(body) { return R.api('POST', '/books', { book: body }); },
        onSuccess() { ctx.navigate(true); }
      });
      return true;
    }
  };
})();
