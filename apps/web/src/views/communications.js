'use strict';

/* Communications: announcements, message threads and delivery health. */
(function () {
  const R = window.Reel;
  const V = R.views;

  const AUDIENCES = ['all', 'staff', 'parents', 'guardians', 'teachers'];

  V.communications = {
    async load(ctx) {
      const canManage = ctx.has('announcements.manage.daycare');
      const announcementQuery = new URLSearchParams();
      if (ctx.filters.audience) announcementQuery.set('audience', ctx.filters.audience);
      if (canManage && ctx.filters.status) announcementQuery.set('status', ctx.filters.status);
      if (ctx.filters.branchId) announcementQuery.set('branchId', ctx.filters.branchId);

      const [overview, announcements, conversations] = await Promise.all([
        R.api('GET', '/communications/overview').then((p) => p.data).catch(() => ({})),
        ctx.has('announcements.read.daycare') ? R.api('GET', '/announcements' + (announcementQuery.toString() ? '?' + announcementQuery : '')).then((p) => p.data).catch(() => []) : Promise.resolve([]),
        R.api('GET', '/conversations').then((p) => p.data).catch(() => [])
      ]);

      const selectedId = ctx.filters.conversationId || (conversations[0] && conversations[0].id) || null;
      let thread = null;
      if (selectedId) {
        thread = await R.api('GET', '/conversations/' + encodeURIComponent(selectedId))
          .then((p) => p.data).catch(() => null);
      }

      let members = [];
      if (ctx.has('access.read.daycare')) {
        members = await R.api('GET', '/access/memberships').then((p) => p.data).catch(() => []);
      } else if (ctx.has('staff.read.daycare')) {
        const staff = await R.api('GET', '/staff').then((p) => p.data).catch(() => []);
        members = staff.filter((s) => s.user_id).map((s) => ({
          id: 'staff-' + s.id, user_id: s.user_id, display_name: s.display_name, email: s.email
        }));
      }

      return {
        overview: overview || {}, announcements: announcements || [], conversations: conversations || [],
        thread, selectedId, members: members.filter((m) => m.user_id), canManage
      };
    },

    render(ctx, params, page) {
      const tab = ctx.tab || 'announcements';
      const o = page.overview || {};
      const canManage = page.canManage;
      return R.pageHead('Communications', 'One place for notices, conversations and the record of what families were told.',
        (canManage ? '<button class="btn btn-secondary btn-sm" @click="openNamedModal(\'announcement\')">' + R.icon('megaphone') + ' New announcement</button>' : '') +
        '<button class="btn btn-primary btn-sm" @click="openNamedModal(\'conversation\')">' + R.icon('message-square-plus') + ' New message</button>') +
        '<div class="grid grid-4 section">' +
        R.statCard({ label: 'Unread notifications', value: R.number(o.unread), icon: 'bell', tone: Number(o.unread) ? 'sun' : 'green', foot: 'Across your account' }) +
        R.statCard({ label: 'Announcements', value: R.number(o.recentAnnouncements), icon: 'megaphone', tone: 'sky', foot: 'Published in 30 days' }) +
        R.statCard({ label: 'Open conversations', value: R.number(o.openConversations), icon: 'messages-square', tone: 'plum', foot: 'You are a participant' }) +
        R.statCard({ label: 'Deliveries', value: R.number((o.deliveries || []).reduce((sum, d) => sum + Number(d.total || 0), 0)), icon: 'send', tone: 'clay', foot: 'Notification attempts' }) +
        '</div>' +
        R.tabs([{ key: 'announcements', label: 'Announcements (' + (page.announcements || []).length + ')' },
          { key: 'messages', label: 'Messages (' + (page.conversations || []).length + ')' },
          { key: 'deliveries', label: 'Delivery log' }], tab) +
        (tab === 'messages' ? this.renderMessages(ctx, page) : tab === 'deliveries' ? this.renderDeliveries(page) : this.renderAnnouncements(ctx, page));
    },

    renderAnnouncements(ctx, page) {
      const canManage = page.canManage;
      const rows = page.announcements || [];
      return R.filterBar(
        R.selectFilter(ctx, 'audience', AUDIENCES.map((a) => ({ value: a, label: R.titleCase(a) })), 'All audiences') +
        (canManage ? R.selectFilter(ctx, 'status', [{ value: 'draft', label: 'Draft' }, { value: 'published', label: 'Published' }, { value: 'archived', label: 'Archived' }], 'All statuses') : '') +
        R.selectFilter(ctx, 'branchId', R.branchOptions(ctx), 'All branches')) +
        (canManage ? R.bulkBar([
          { label: 'Publish selected', icon: 'megaphone', path: '/announcements/bulk', action: 'publish' },
          { label: 'Archive selected', icon: 'archive', path: '/announcements/bulk', action: 'archive', tone: 'danger' }
        ], { hint: 'Publishing notifies the audience immediately.' }) : '') +
        '<div class="stack section">' + rows.map((a) => R.card(a.title,
          '<div class="row" style="margin-bottom:8px">' + R.badge(a.status) +
          (canManage ? '<label class="check" style="gap:6px"><input type="checkbox" :checked="isSelected(' + R.attr(JSON.stringify(a.id)) + ')" @change="toggleSelect(' + R.attr(JSON.stringify(a.id)) + ', $event.target.checked)" aria-label="Select announcement"><span class="muted small">Select</span></label>' : '') +
          '<span class="badge badge-muted">' + R.esc(R.titleCase(a.audience_type)) + '</span>' +
          (a.branch_name ? '<span class="badge badge-sky">' + R.esc(a.branch_name) + '</span>' : '<span class="badge badge-muted">All branches</span>') +
          '<span class="muted small row-end">' + (a.published_at ? R.relative(a.published_at) : 'Created ' + R.relative(a.created_at)) + '</span></div>' +
          '<p class="muted" style="white-space:pre-wrap">' + R.esc(a.body) + '</p>' +
          (R.mediaList(a.attachment_urls).length ? '<div class="media-grid" style="margin:10px 0">' +
            R.mediaList(a.attachment_urls).map((url) => '<div class="media-card">' +
              R.mediaHtml(url, R.kindForUrl(url), { alt: a.title }) + '</div>').join('') + '</div>' : '') +
          '<div class="muted small">By ' + R.esc(a.created_by_name || 'System') + '</div>',
          canManage ? '<div class="btn-group">' +
            (a.status === 'draft' ? '<button class="btn btn-sm btn-primary" @click="act(\'POST\',\'/announcements/' + R.attr(a.id) + '/publish\',{},{successMessage:\'Announcement published\'})">Publish</button>' +
              '<button class="btn btn-sm btn-secondary" @click="openNamedModal(\'editAnnouncement\',\'' + R.attr(a.id) + '\')">Edit</button>' : '') +
            (a.status !== 'archived' ? '<button class="btn btn-sm btn-secondary" @click="confirmAction(\'Archive announcement\',\'It will no longer appear to its audience, but the record stays intact.\',\'/announcements/' + R.attr(a.id) + '/archive\',{submitLabel:\'Archive\',successMessage:\'Announcement archived\'})">Archive</button>' : '') +
            '</div>' : '')).join('') + '</div>' +
        (rows.length ? '' : R.emptyState('No announcements', 'Share news, reminders and celebrations with staff or families.',
          canManage ? '<button class="btn btn-primary" @click="openNamedModal(\'announcement\')">New announcement</button>' : '', 'megaphone'));
    },

    renderMessages(ctx, page) {
      const conversations = page.conversations || [];
      const thread = page.thread;
      const selectedId = page.selectedId;
      return '<div class="split"><div class="stack">' +
        R.card('Conversations', conversations.length ? '<div class="conversation-list">' + conversations.map((c) => {
          const active = c.id === selectedId;
          return '<button class="conversation-item' + (active ? ' active' : '') + '" @click="setFilter(\'conversationId\',\'' + R.attr(c.id) + '\')">' +
            '<div class="avatar">' + R.icon(c.conversation_type === 'group' ? 'users' : 'message-circle') + '</div>' +
            '<div style="flex:1;min-width:0;text-align:left">' +
            '<div class="strong" style="font-size:0.88rem">' + R.esc(c.subject || (c.learner_first_name ? c.learner_first_name + ' ' + c.learner_last_name : 'Conversation')) + '</div>' +
            '<div class="muted small truncate">' + R.esc(R.truncate(c.last_message || 'No messages yet', 60)) + '</div>' +
            '</div><div class="muted small">' + (c.last_message_at ? R.relative(c.last_message_at) : '') + '</div></button>';
        }).join('') + '</div>' : R.emptyState('No conversations', 'Start a message to a colleague or a family.',
          '<button class="btn btn-secondary" @click="openNamedModal(\'conversation\')">New message</button>', 'messages-square')) +
        '</div><div class="stack">' +
        (thread ? R.card(thread.subject || 'Conversation',
          '<div class="row" style="margin-bottom:12px">' + R.badge(thread.status) +
          '<span class="badge badge-muted">' + R.esc(R.titleCase(thread.conversation_type)) + '</span>' +
          '<span class="muted small">' + (thread.participants || []).length + ' participants</span>' +
          (thread.status !== 'closed' ? '<button class="btn btn-sm btn-ghost row-end" @click="confirmAction(\'Close conversation\',\'No further messages can be added after closing.\',\'/conversations/' + R.attr(thread.id) + '/close\',{submitLabel:\'Close\',successMessage:\'Conversation closed\'})">Close</button>' : '') + '</div>' +
          '<div class="message-thread">' + ((thread.messages || []).length ? thread.messages.map((m) => {
            const mine = ctx.session && ctx.session.user && m.sender_user_id === ctx.session.user.id;
            return '<div class="message' + (mine ? ' mine' : '') + '"><div class="message-meta">' + R.esc(m.sender_name || 'Unknown') + ' · ' + R.relative(m.created_at) + '</div>' +
              '<div class="message-body">' + R.esc(m.body) + '</div></div>';
          }).join('') : '<p class="muted small">No messages in this thread yet.</p>') + '</div>' +
          (thread.status === 'closed' ? '<div class="alert alert-info" style="margin-top:12px">This conversation is closed.</div>' :
            '<div class="message-compose"><textarea class="textarea" id="message-body" rows="3" placeholder="Write a reply…"></textarea>' +
            '<button class="btn btn-primary" @click="sendMessage(\'' + R.attr(thread.id) + '\')">' + R.icon('send') + ' Send</button></div>'),
          '<div class="muted small">' + (thread.participants || []).map((p) => R.esc(p.display_name)).join(', ') + '</div>') :
          R.card('Select a conversation', '<p class="muted small">Choose a thread on the left, or start a new one.</p>')) +
        '</div></div>';
    },

    renderDeliveries(page) {
      const rows = (page.overview || {}).deliveries || [];
      return R.card('Notification delivery log', R.table({ rows, columns: [
        { label: 'Channel', render: (d) => '<span class="badge badge-muted">' + R.esc(R.titleCase(d.channel)) + '</span>' },
        { label: 'Status', render: (d) => R.badge(d.delivery_status) },
        { label: 'Attempts', align: 'right', render: (d) => R.number(d.total) }
      ], emptyTitle: 'No deliveries recorded', emptyMessage: 'Delivery attempts for your notifications appear here.' }),
        '<a class="btn btn-sm btn-ghost" href="#/app/overview">Back to overview</a>');
    },

    openModal(ctx, name, id) {
      const page = ctx.page || {};
      const members = page.members || [];
      if (name === 'announcement') {
        ctx.openModal({
          title: 'New announcement', endpoint: '/announcements', submitLabel: 'Create announcement', size: 'wide',
          fields: [
            { name: 'title', label: 'Title', required: true, span: 2 },
            { name: 'audienceType', label: 'Audience', type: 'select', options: AUDIENCES.map((a) => ({ value: a, label: R.titleCase(a) })), value: 'all' },
            { name: 'branchId', label: 'Branch', type: 'select', options: R.branchOptions(ctx) },
            { name: 'body', label: 'Message', type: 'textarea', required: true, span: 2 },
            { name: 'attachmentUrls', label: 'Attachments', type: 'media', multiple: true, scope: 'announcement', accept: 'image/jpeg,image/png,image/webp,image/gif,image/avif,video/mp4,video/webm,video/quicktime,audio/mpeg,application/pdf,text/plain,text/csv', span: 2, help: 'Photos, video, audio or documents to include with this announcement.' },
            { name: 'publish', label: 'Publish immediately', type: 'checkbox', value: true, help: 'Notify the audience now' }
          ]
        });
      } else if (name === 'editAnnouncement' && id) {
        const a = (page.announcements || []).find((x) => x.id === id) || {};
        ctx.openModal({
          title: 'Edit announcement', endpoint: '/announcements/' + id, method: 'PATCH', submitLabel: 'Save changes', size: 'wide',
          fields: [
            { name: 'title', label: 'Title', value: a.title, required: true, span: 2 },
            { name: 'audienceType', label: 'Audience', type: 'select', value: a.audience_type, options: AUDIENCES.map((x) => ({ value: x, label: R.titleCase(x) })) },
            { name: 'body', label: 'Message', type: 'textarea', value: a.body, required: true, span: 2 },
            { name: 'attachmentUrls', label: 'Attachments', type: 'media', multiple: true, scope: 'announcement', accept: 'image/jpeg,image/png,image/webp,image/gif,image/avif,video/mp4,video/webm,video/quicktime,audio/mpeg,application/pdf,text/plain,text/csv', value: R.mediaList(a.attachment_urls), span: 2 }
          ]
        });
      } else if (name === 'conversation') {
        ctx.openModal({
          title: 'New message', endpoint: '/conversations', submitLabel: 'Start conversation',
          description: 'Choose a colleague to start a direct conversation. Families can be messaged from their child profile.',
          fields: [
            { name: 'subject', label: 'Subject', span: 2 },
            { name: 'participantUserId', label: 'Recipient', type: 'select', options: members.map((m) => ({ value: m.user_id, label: m.display_name + (m.email ? ' · ' + m.email : '') })) },
            { name: 'conversationType', label: 'Type', type: 'select', options: [{ value: 'direct', label: 'Direct' }, { value: 'group', label: 'Group' }], value: 'direct' },
            { name: 'message', label: 'Message', type: 'textarea', span: 2, placeholder: 'Say hello…' }
          ],
          transform: (data) => {
            const body = Object.assign({}, data);
            body.participantUserIds = body.participantUserId ? [body.participantUserId] : [];
            delete body.participantUserId;
            return body;
          }
        });
      }
    }
  };
})();
