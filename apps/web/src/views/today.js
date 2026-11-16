'use strict';

/**
 * Unified "Today" teacher workspace: one timeline for the day that brings
 * together schedule, plans/activities/modules/guides, classroom context,
 * in-flow evidence capture and end-of-day wrap-up.
 */
(function () {
  const R = window.Reel;
  const V = R.views;

  function esc(s) { return R.esc(s == null ? '' : String(s)); }
  function time(iso) { return R.time ? R.time(iso) : (iso ? new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'); }
  function clockHM(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }

  function statusLabel(s) {
    return ({ scheduled: 'Scheduled', in_progress: 'In progress', completed: 'Completed', cancelled: 'Cancelled' })[s] || R.titleCase(s || '');
  }
  function statusTone(s) {
    return ({ scheduled: 'badge-sky', in_progress: 'badge-sun', completed: 'badge-green', cancelled: 'badge-muted' })[s] || 'badge-muted';
  }

  function findBlock(page, id) {
    return ((page && page.timeline) || []).find((b) => b.id === id) || null;
  }

  function blockClassroomLearners(page, block) {
    const all = (page && page.children) || [];
    if (!block || !block.classroomId) return all;
    const scoped = all.filter((c) => c.classroomId === block.classroomId);
    return scoped.length ? scoped : all;
  }

  function presentSet(page) {
    const reports = ((page && page.dailyReports) || {}).children || [];
    return new Set(reports.map((c) => c.id));
  }

  function participationLearners(page, block) {
    const present = presentSet(page);
    return blockClassroomLearners(page, block).map((c) => Object.assign({}, c, { present: present.has(c.id) }));
  }

  function materialList(text) {
    if (!text) return [];
    return String(text).split(/\n|,|•|·/).map((s) => s.trim()).filter(Boolean);
  }

  function buildPrefillSummary(child) {
    const acts = (child && child.todayActivities) || [];
    if (acts.length) return 'Today we enjoyed: ' + acts.join(', ') + '.';
    return child && child.activitiesSummary ? child.activitiesSummary : '';
  }

  V.today = {
    async load(ctx) {
      const data = await R.api('GET', '/staff/today').then((p) => p.data).catch(() => null);
      // Domains for quick moments (best-effort).
      let domains = [];
      try { domains = (await R.api('GET', '/curriculum/domains')).data || []; } catch {}
      const now = new Date();
      return Object.assign({ domains, nowIso: now.toISOString() }, data || {});
    },

    render(ctx, params, page) {
      if (!page || page.expected === undefined) {
        return R.pageHead('Today', 'Your teaching day, in one place.') +
          R.emptyState('Could not load today', 'We couldn’t load your day right now. Try again.', '<button class="btn btn-primary" @click="navigate(true)">Retry</button>', 'alert-circle');
      }
      const p = page;
      const timeline = p.timeline || [];
      const now = new Date(p.nowIso || Date.now());
      const nowMs = now.getTime();

      const next = timeline.find((b) => b.status === 'scheduled' || b.status === 'in_progress') || null;
      const nextIdx = next ? timeline.indexOf(next) : -1;
      const unfinished = (p.wrapUp && p.wrapUp.unfinishedBlocks) || [];
      const dr = p.dailyReports || { children: [], missing: 0, draft: 0, presentCount: 0 };
      const focus = p.focusChildren || [];
      const absentees = p.absentees || [];
      const unverified = p.unverifiedDropoffs || [];
      const gate = p.gateScans || [];
      const unopened = p.unopened || [];
      const tasksDue = ((p.unfinished || {}).tasksDueToday) || 0;
      const drafts = ((p.unfinished || {}).draftObservations) || 0;

      const headerSub = timeline.length
        ? (next ? ('Up next: ' + next.title + ' at ' + time(next.startsAt) + '.') : 'All planned blocks are complete — nice work.')
        : 'Nothing scheduled on the calendar yet. Schedule your day and it will appear here.';

      let html = '<div class="today-wrap" id="today-root">';
      html += R.pageHead('Today', headerSub,
        '<button class="btn btn-secondary btn-sm" @click="openNamedModal(\'quickMoment\')">' + R.icon('camera') + ' Quick moment</button>' +
        '<button class="btn btn-secondary btn-sm" onclick="window.print()">' + R.icon('printer') + ' Prep list</button>' +
        '<button class="btn btn-primary btn-sm" @click="navigate(true)">' + R.icon('refresh-cw') + ' Refresh</button>'
      );

      // People / classroom context strip
      html += '<div class="card today-strip section">' +
        '<div class="today-strip-stats">' +
          statPill('Present', R.number(p.present) + ' / ' + R.number(p.expected), 'user-check') +
          statPill('Absent', R.number(absentees.length), 'user-x') +
          statPill('Unmarked', R.number((p.unmarkedIds || []).length), 'help-circle') +
          (gate.length ? statPill('Gate releases', R.number(gate.length), 'door-open') : '') +
          (unverified.length ? statPill('Unverified drop-offs', R.number(unverified.length), 'alert-triangle') : '') +
        '</div>' +
        '<div class="today-strip-links row" style="gap:8px;flex-wrap:wrap;margin-top:10px">' +
          '<a class="btn btn-sm btn-secondary" href="#/app/learner-attendance">' + R.icon('clipboard-check') + ' Register & gate</a>' +
          '<a class="btn btn-sm btn-secondary" href="#/app/calendar">' + R.icon('calendar-days') + ' Full calendar</a>' +
          '<a class="btn btn-sm btn-secondary" href="#/app/modules">' + R.icon('blocks') + ' Modules</a>' +
        '</div>' +
        (absentees.length ? '<div class="row" style="gap:8px;flex-wrap:wrap;margin-top:12px"><span class="muted small">Away today:</span>' +
          absentees.map((a) => '<span class="badge badge-danger">' + esc(a.name) + (a.reason ? ' · ' + esc(R.truncate(a.reason, 30)) : '') + '</span>').join('') + '</div>' : '') +
        (unverified.length ? '<div class="alert alert-sun" style="margin:12px 0 0;align-items:center">' + R.icon('user-plus') +
          '<div style="flex:1"><strong>Who brought these?</strong><div class="muted small">' + unverified.map((d) => '<strong>' + esc(d.childFirst) + '</strong> — ' + esc(d.broughtByName)).join(' · ') + '</div></div>' +
          '<a class="btn btn-sm btn-secondary" href="#/app/learner-attendance">Fix on register</a></div>' : '') +
        (gate.length ? '<div class="alert alert-info" style="margin:12px 0 0;align-items:center">' + R.icon('door-open') +
          '<div style="flex:1"><strong>' + R.number(gate.length) + ' waiting for release</strong><div class="muted small">' +
          gate.slice(0,3).map((g) => esc(g.collectorName) + ' for ' + esc(g.childFirst)).join(' · ') + (gate.length > 3 ? '…' : '') + '</div></div>' +
          '<a class="btn btn-sm btn-primary" href="#/app/learner-attendance">Release</a></div>' : '') +
        '</div>';

      // Focus / observe today prompts
      if (focus.length) {
        html += '<div class="card section"><div class="card-head"><h3>' + R.icon('eye') + ' Observe today</h3><span class="muted small">Children who could use a fresh observation</span></div>' +
          '<div class="stack">' + focus.map((c) => '<div class="row" style="gap:10px;justify-content:space-between;padding:8px 10px;background:var(--surface-2);border-radius:12px">' +
            '<div class="row" style="gap:10px;min-width:0"><span class="avatar avatar-xs">' + esc((c.firstName || c.name || '?')[0] || '?') + '</span>' +
            '<div style="min-width:0"><div class="strong" style="font-size:0.88rem">' + esc(c.name) + '</div><div class="muted small">' + esc(c.classroom || 'Classroom') + (c.lastObservation ? ' · last ' + R.date(c.lastObservation) : ' · no observation yet') + '</div></div></div>' +
            '<div class="btn-group"><button class="btn btn-sm btn-secondary" @click="openNamedModal(\'quickMomentFor\',\'' + R.attr(c.id) + '\')">' + R.icon('camera') + ' Moment</button>' +
            '<button class="btn btn-sm btn-primary" @click="openNamedModal(\'observationFor\',\'' + R.attr(c.id) + '\')">' + R.icon('plus') + ' Observe</button></div></div>').join('') + '</div></div>';
      }

      // Up next nudge
      if (next) {
        const mins = Math.round((new Date(next.startsAt).getTime() - nowMs) / 60000);
        let nudge = '';
        if (next.status === 'in_progress') nudge = 'In progress now — keep the guide handy.';
        else if (mins <= 0) nudge = 'It’s time — start this block when you’re ready.';
        else if (mins <= 10) nudge = 'Starting in ' + mins + ' min — time for a smooth transition.';
        else nudge = 'Up next at ' + time(next.startsAt) + '.';
        html += '<div class="card section today-next" style="border-left:4px solid var(--reel-green-500)"><div class="row" style="justify-content:space-between;gap:12px;align-items:flex-start">' +
          '<div><div class="muted small">Up next</div><div class="strong" style="font-size:1.05rem">' + esc(next.title) + '</div>' +
          '<div class="muted small">' + esc(nudge) + (next.classroom ? ' · ' + esc(next.classroom) : '') + '</div></div>' +
          '<div class="btn-group">' +
            (next.lessonPlanId ? '<button class="btn btn-sm btn-secondary" @click="openGuide(\'' + R.attr(next.lessonPlanId) + '\')">' + R.icon('book-open') + ' Guide</button>' : '') +
            (next.status === 'scheduled' ? '<button class="btn btn-sm btn-primary" @click="act(\'POST\',\'/curriculum/calendar/events/' + R.attr(next.id) + '/start\',{},{successMessage:\'Block started — enjoy teaching.\'})">' + R.icon('play') + ' Start</button>' : '') +
            (next.status === 'in_progress' ? '<button class="btn btn-sm btn-primary" @click="openNamedModal(\'completeBlock\',\'' + R.attr(next.id) + '\')">' + R.icon('check') + ' Complete</button>' : '') +
          '</div></div></div>';
      }

      // Timeline
      html += '<div class="section"><div class="row" style="justify-content:space-between;align-items:center;margin-bottom:10px"><h2 style="font-size:1.1rem;margin:0">Today’s timeline</h2>' +
        '<span class="muted small">' + R.number(timeline.length) + ' block' + (timeline.length === 1 ? '' : 's') + '</span></div>';

      if (!timeline.length) {
        html += R.emptyState('No blocks scheduled for today', 'Plan your day from the calendar — link lesson plans and activities so everything shows up here, ready to teach.',
          '<a class="btn btn-primary" href="#/app/calendar">' + R.icon('calendar-plus') + ' Schedule the day</a>', 'calendar-days');
      } else {
        html += '<div class="stack today-timeline">';
        timeline.forEach((b, i) => {
          const isNext = i === nextIdx;
          const startMs = b.startsAt ? new Date(b.startsAt).getTime() : 0;
          const endMs = b.endsAt ? new Date(b.endsAt).getTime() : 0;
          const current = b.status === 'in_progress' || (b.status === 'scheduled' && startMs <= nowMs && (endMs ? nowMs < endMs : nowMs - startMs < 45 * 60000));
          html += this.renderBlock(ctx, page, b, { isNext, current });
        });
        html += '</div>';
      }
      html += '</div>';

      // End-of-day wrap-up
      html += '<div class="card section today-wrapup"><div class="card-head"><h3>' + R.icon('sunset') + ' Wrap up the day</h3><span class="muted small">Close the loop before you go</span></div>';

      html += '<div class="grid grid-3" style="margin-bottom:14px">' +
        R.statCard({ label: 'Unfinished blocks', value: R.number(unfinished.length), icon: 'clock', tone: unfinished.length ? 'sun' : 'green', foot: unfinished.length ? 'Not yet completed' : 'All done' }) +
        R.statCard({ label: 'Daily reports', value: R.number(dr.missing) + ' / ' + R.number(dr.presentCount), icon: 'file-text', tone: dr.missing ? 'clay' : 'green', foot: dr.missing ? (dr.missing + ' still to write') : (dr.draft ? (dr.draft + ' draft to share') : 'All present children covered') }) +
        R.statCard({ label: 'Drafts & tasks', value: R.number(drafts) + ' · ' + R.number(tasksDue), icon: 'check-square', tone: (drafts + tasksDue) ? 'sun' : 'green', foot: 'Observation drafts · tasks due today' }) +
        '</div>';

      if (unfinished.length) {
        html += '<div class="muted small" style="margin-bottom:6px">Blocks to finish or mark:</div><div class="stack" style="margin-bottom:14px">' +
          unfinished.map((u) => '<div class="row" style="gap:10px;justify-content:space-between;padding:8px 10px;background:var(--surface-2);border-radius:12px">' +
            '<div><span class="strong" style="font-size:0.88rem">' + esc(u.title) + '</span><div class="muted small">' + time(u.startsAt) + ' · ' + esc(statusLabel(u.status)) + '</div></div>' +
            '<button class="btn btn-sm btn-secondary" @click="openNamedModal(\'completeBlock\',\'' + R.attr(u.id) + '\')">Complete</button></div>').join('') + '</div>';
      }

      if (dr.presentCount) {
        html += '<div class="muted small" style="margin-bottom:6px">Daily reports for children present today (prefilled from today’s participation):</div><div class="stack">' +
          (dr.children || []).map((c) => {
            const badge = c.reportId ? (c.reportShared ? '<span class="badge badge-green">Shared</span>' : '<span class="badge badge-sun">Draft</span>') : '<span class="badge badge-danger">Missing</span>';
            const btn = c.reportId
              ? '<a class="btn btn-sm btn-secondary" href="#/app/learners/' + R.attr(c.id) + '?tab=reports">' + R.icon('edit-2') + ' ' + (c.reportShared ? 'View' : 'Finish') + '</a>'
              : '<button class="btn btn-sm btn-primary" @click="openNamedModal(\'dailyReport\',\'' + R.attr(c.id) + '\')">' + R.icon('plus') + ' Write report</button>';
            const hint = c.todayActivities && c.todayActivities.length ? '<div class="muted small">Today: ' + esc(R.truncate(c.todayActivities.join(', '), 70)) + '</div>' : '';
            return '<div class="row" style="gap:10px;justify-content:space-between;padding:8px 10px;background:var(--surface-2);border-radius:12px;align-items:flex-start">' +
              '<div class="row" style="gap:10px;min-width:0"><span class="avatar avatar-xs">' + esc((c.firstName || c.name || '?')[0] || '?') + '</span>' +
              '<div style="min-width:0"><div class="strong" style="font-size:0.88rem">' + esc(c.name) + ' ' + badge + '</div><div class="muted small">' + esc(c.classroom || 'Classroom') + '</div>' + hint + '</div></div>' +
              '<div class="btn-group">' + btn + '</div></div>';
          }).join('') + '</div>';
      } else {
        html += '<p class="muted small">Mark attendance first — daily report shortcuts will appear for children present today.</p>';
      }

      if (unopened.length) {
        html += '<div class="section"></div><div class="muted small" style="margin-bottom:6px">Families who haven’t seen recent shares:</div><div class="stack">' +
          unopened.map((u) => '<div class="row" style="gap:10px;justify-content:space-between;padding:8px 10px;background:var(--surface-2);border-radius:12px">' +
            '<div style="min-width:0"><span class="strong" style="font-size:0.86rem">' + esc(u.guardianFirst) + '</span><div class="muted small">' + esc(R.truncate(u.detail || '', 90)) + '</div></div>' +
            '<span class="badge ' + (u.kind === 'digest' ? 'badge-sky' : 'badge-sun') + '">' + (u.kind === 'digest' ? 'Digest' : 'Shared') + '</span></div>').join('') + '</div>';
      }

      if (tasksDue) {
        html += '<div class="section"></div><a class="btn btn-sm btn-secondary" href="#/app/tasks">' + R.icon('list-checks') + ' View ' + R.number(tasksDue) + ' task' + (tasksDue === 1 ? '' : 's') + ' due today</a>';
      }
      html += '</div>'; // wrap-up

      // Print / prep list (visible in print)
      html += this.renderPrepList(page);

      html += '</div>'; // today-wrap
      return html;
    },

    renderBlock(ctx, page, b, flags) {
      const isNext = flags && flags.isNext;
      const current = flags && flags.current;
      const plan = b.plan;
      const act = b.activity;
      const mod = b.module;
      const part = b.participation || [];
      const learners = participationLearners(page, b);
      const absentInScope = learners.filter((l) => !l.present);

      const materials = materialList(act && act.materials);
      const safety = act && act.safetyNotes ? String(act.safetyNotes).trim() : '';

      const border = b.status === 'completed' ? 'var(--reel-green-500)' : b.status === 'in_progress' ? 'var(--reel-sun-500)' : (isNext ? 'var(--reel-sky-500)' : 'var(--border-subtle)');
      const bg = b.status === 'completed' ? 'rgba(58,125,68,0.04)' : (current ? 'rgba(232,154,43,0.06)' : 'var(--surface-1)');

      let h = '<div class="card today-block" data-block="' + R.attr(b.id) + '" style="border-left:4px solid ' + border + ';background:' + bg + '">';
      // header
      h += '<div class="row" style="justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap">' +
        '<div style="min-width:0;flex:1">' +
          '<div class="row" style="gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:4px">' +
            '<span class="strong">' + esc(time(b.startsAt)) + (b.endsAt ? ' – ' + esc(time(b.endsAt)) : '') + '</span>' +
            '<span class="badge ' + statusTone(b.status) + '">' + esc(statusLabel(b.status)) + '</span>' +
            (isNext && b.status === 'scheduled' ? '<span class="badge badge-sky">Up next</span>' : '') +
            (current && b.status === 'scheduled' ? '<span class="badge badge-sun">Now</span>' : '') +
          '</div>' +
          '<div class="strong" style="font-size:1.02rem">' + esc(b.title) + '</div>' +
          '<div class="muted small">' + esc(b.classroom || 'Whole centre') + (b.staffName ? ' · ' + esc(b.staffName) : '') + '</div>' +
        '</div>' +
        '<div class="btn-group" style="flex-wrap:wrap">' +
          (b.lessonPlanId ? '<button class="btn btn-sm btn-secondary" @click="openGuide(\'' + R.attr(b.lessonPlanId) + '\')">' + R.icon('book-open') + ' ' + (b.guide && b.guide.available ? 'Teach / Guide' : 'Guide') + '</button>' : '') +
          (b.status === 'scheduled' ? '<button class="btn btn-sm btn-primary" @click="act(\'POST\',\'/curriculum/calendar/events/' + R.attr(b.id) + '/start\',{},{successMessage:\'Block started — enjoy teaching.\'})">' + R.icon('play') + ' Start</button>' : '') +
          (b.status === 'in_progress' ? '<button class="btn btn-sm btn-primary" @click="openNamedModal(\'completeBlock\',\'' + R.attr(b.id) + '\')">' + R.icon('check-circle') + ' Complete</button>' : '') +
          (b.status === 'completed' ? '<button class="btn btn-sm btn-ghost" @click="openNamedModal(\'completeBlock\',\'' + R.attr(b.id) + '\')" title="Edit participation">' + R.icon('edit-2') + ' Participation</button>' : '') +
        '</div></div>';

      // Module / sequence context
      if (mod && (mod.title || mod.position)) {
        h += '<div class="row" style="gap:8px;flex-wrap:wrap;margin-top:10px">' +
          '<a class="badge badge-muted" href="#/app/modules/' + R.attr(mod.id) + '">' + R.icon('blocks') + ' ' + esc(mod.title || 'Module') + '</a>' +
          (mod.position ? '<span class="muted small">Plan ' + R.number(mod.position) + (mod.total ? ' of ' + R.number(mod.total) : '') + ' in the sequence</span>' : '') +
          (mod.theme ? '<span class="muted small">· ' + esc(mod.theme) + '</span>' : '') +
        '</div>';
      }

      // Plan & objectives
      if (plan) {
        h += '<div style="margin-top:10px"><div class="muted small" style="margin-bottom:4px">Lesson plan' + (plan.theme ? ': <strong>' + esc(plan.theme) + '</strong>' : '') + '</div>';
        if (plan.objectives && plan.objectives.length) {
          h += '<div class="row" style="gap:6px;flex-wrap:wrap">' + plan.objectives.slice(0, 8).map((o) => '<span class="badge badge-muted" title="' + R.attr(o.description) + '">' + esc(o.code || 'Objective') + (o.domain ? ' · ' + esc(R.truncate(o.domain, 18)) : '') + '</span>').join('') +
            (plan.objectives.length > 8 ? '<span class="muted small">+' + (plan.objectives.length - 8) + ' more</span>' : '') + '</div>';
        } else {
          h += '<div class="muted small">No objectives linked yet — <a href="#/app/curriculum">link objectives</a> to capture evidence in-flow.</div>';
        }
        if (plan.preparationNotes) h += '<div class="muted small" style="margin-top:6px"><strong>Prep:</strong> ' + esc(R.truncate(plan.preparationNotes, 160)) + '</div>';
      }

      // Activity: materials & safety inline
      if (act || materials.length || safety) {
        h += '<div class="grid grid-2" style="margin-top:10px;gap:10px">';
        h += '<div style="background:var(--surface-2);border-radius:12px;padding:10px"><div class="strong small" style="margin-bottom:4px">' + R.icon('package') + ' Materials & setup</div>';
        if (materials.length) {
          h += '<ul style="margin:0;padding-left:18px" class="small">' + materials.slice(0, 10).map((m) => '<li>' + esc(m) + '</li>').join('') + '</ul>';
        } else if (act && act.description) {
          h += '<div class="muted small">' + esc(R.truncate(act.description, 140)) + '</div>';
        } else {
          h += '<div class="muted small">No materials listed — <a href="#/app/activities">add them to the activity</a>.</div>';
        }
        if (act && act.durationMinutes) h += '<div class="muted small" style="margin-top:4px">~' + R.number(act.durationMinutes) + ' min' + (act.type ? ' · ' + esc(R.titleCase(act.type)) : '') + '</div>';
        h += '</div>';
        h += '<div style="background:var(--surface-2);border-radius:12px;padding:10px"><div class="strong small" style="margin-bottom:4px">' + R.icon('shield') + ' Safety & notes</div>';
        h += safety ? '<div class="small">' + esc(safety) + '</div>' : '<div class="muted small">No specific safety notes. Supervise as usual.</div>';
        h += '</div></div>';
      }

      // People context: participation / absentees in this block
      h += '<div style="margin-top:10px"><div class="row" style="justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">' +
        '<div class="muted small">' + R.number(part.length) + ' participation record' + (part.length === 1 ? '' : 's') + (absentInScope.length ? ' · ' + R.number(absentInScope.length) + ' away in this group' : '') + '</div>' +
        '<div class="btn-group"><button class="btn btn-sm btn-ghost" @click="openNamedModal(\'blockObserve\',\'' + R.attr(b.id) + '\')">' + R.icon('sparkles') + ' Capture moment</button></div></div>';

      if (absentInScope.length) {
        h += '<div class="row" style="gap:6px;flex-wrap:wrap;margin-top:6px"><span class="muted small">Away:</span>' +
          absentInScope.slice(0, 8).map((c) => '<span class="badge badge-muted">' + esc(c.firstName || c.name) + '</span>').join('') +
          (absentInScope.length > 8 ? '<span class="muted small">+' + (absentInScope.length - 8) + '</span>' : '') + '</div>';
      }
      if (part.length) {
        h += '<div class="row" style="gap:6px;flex-wrap:wrap;margin-top:6px">' +
          part.slice(0, 10).map((p) => '<span class="badge ' + (p.status === 'participated' ? 'badge-green' : p.status === 'partial' ? 'badge-sun' : 'badge-muted') + '">' + esc(p.name.split(' ')[0]) + ' · ' + esc(p.status) + '</span>').join('') +
          (part.length > 10 ? '<span class="muted small">+' + (part.length - 10) + '</span>' : '') + '</div>';
      }
      h += '</div>';

      // Deep links
      h += '<div class="row" style="gap:8px;flex-wrap:wrap;margin-top:12px;padding-top:10px;border-top:1px solid var(--border-subtle)">' +
        (b.lessonPlanId ? '<a class="btn btn-sm btn-ghost" href="#/app/curriculum?tab=plans">Plan</a>' : '') +
        (mod ? '<a class="btn btn-sm btn-ghost" href="#/app/modules/' + R.attr(mod.id) + '">Module</a>' : '') +
        (b.activityId ? '<a class="btn btn-sm btn-ghost" href="#/app/activities">Activity</a>' : '') +
        '<a class="btn btn-sm btn-ghost" href="#/app/calendar">Calendar</a>' +
      '</div>';

      h += '</div>';
      return h;
    },

    renderPrepList(page) {
      const timeline = (page && page.timeline) || [];
      const materials = [];
      const seen = new Set();
      timeline.forEach((b) => {
        materialList(b.activity && b.activity.materials).forEach((m) => {
          const k = m.toLowerCase();
          if (!seen.has(k)) { seen.add(k); materials.push(m); }
        });
      });
      let h = '<div class="card section today-prep" id="today-prep"><div class="card-head"><h3>' + R.icon('clipboard-list') + ' Prep list for today</h3><span class="muted small">Materials, safety notes and schedule — handy to print</span></div>';
      h += '<div class="grid grid-2" style="gap:16px"><div><div class="strong small" style="margin-bottom:6px">Schedule</div>' +
        (timeline.length ? '<ol style="margin:0;padding-left:18px">' + timeline.map((b) => '<li style="margin-bottom:6px"><strong>' + esc(time(b.startsAt)) + '</strong> — ' + esc(b.title) + (b.classroom ? ' <span class="muted">(' + esc(b.classroom) + ')</span>' : '') + '</li>').join('') + '</ol>' : '<p class="muted small">No blocks scheduled.</p>') +
        '</div><div><div class="strong small" style="margin-bottom:6px">Materials to gather</div>' +
        (materials.length ? '<ul style="margin:0;padding-left:18px">' + materials.map((m) => '<li>' + esc(m) + '</li>').join('') + '</ul>' : '<p class="muted small">No materials listed on today’s activities.</p>') +
        '</div></div>';
      const safetyBlocks = timeline.filter((b) => b.activity && b.activity.safetyNotes);
      if (safetyBlocks.length) {
        h += '<div style="margin-top:12px"><div class="strong small" style="margin-bottom:6px">Safety notes</div>' +
          safetyBlocks.map((b) => '<div class="alert alert-warn" style="margin:6px 0">' + R.icon('shield-alert') + '<span><strong>' + esc(b.title) + ':</strong> ' + esc(b.activity.safetyNotes) + '</span></div>').join('') + '</div>';
      }
      h += '</div>';
      return h;
    },

    openModal(ctx, name, id) {
      const page = ctx.page || {};
      if (name === 'startBlock') {
        const b = findBlock(page, id);
        if (!b) return;
        ctx.act('POST', '/curriculum/calendar/events/' + b.id + '/start', {}, { successMessage: 'Block started — enjoy teaching.' });
        return;
      }
      if (name === 'completeBlock') {
        const b = findBlock(page, id);
        if (!b) return;
        const learners = participationLearners(page, b);
        const existing = new Map((b.participation || []).map((p) => [p.learnerId, p]));
        const rows = learners.map((l) => {
          const prev = existing.get(l.id);
          return { learnerId: l.id, status: prev ? prev.status : (l.present ? 'participated' : 'absent'), summary: prev ? (prev.summary || '') : '' };
        });
        ctx.openModal({
          title: 'Complete: ' + (b.title || 'Block'),
          endpoint: '/curriculum/calendar/events/' + b.id + '/complete',
          method: 'POST',
          submitLabel: 'Mark complete',
          successMessage: 'Block completed and participation saved.',
          size: 'wide',
          description: 'Capture who took part and any notes. This also feeds daily reports and the evidence loop.',
          fields: [
            { name: 'notes', label: 'Overall notes', type: 'textarea', span: 2, value: b.notes || '' },
            { name: 'participation', label: 'Participation', type: 'repeater', itemLabel: 'Child', span: 2,
              columns: [
                { key: 'learnerId', label: 'Child', type: 'select', options: learners.map((l) => ({ value: l.id, label: l.name + (l.present ? '' : ' (away)') })) },
                { key: 'status', label: 'Status', type: 'select', options: [
                  { value: 'participated', label: 'Participated' },
                  { value: 'partial', label: 'Partial' },
                  { value: 'absent', label: 'Absent' },
                  { value: 'not_observed', label: 'Not observed' }
                ] },
                { key: 'summary', label: 'Notes', type: 'textarea', span: 2 }
              ],
              value: rows }
          ]
        });
        return;
      }
      if (name === 'quickMoment' || name === 'quickMomentFor' || name === 'blockObserve') {
        const b = name === 'blockObserve' ? findBlock(page, id) : null;
        const children = blockClassroomLearners(page, b || {});
        const options = children.map((c) => ({ value: c.id, label: c.name + (c.classroom ? ' · ' + c.classroom : '') }));
        const domains = page.domains || [];
        const presetChild = name === 'quickMomentFor' ? id : (options.length === 1 ? options[0].value : '');
        ctx.openModal({
          title: b ? 'Capture a moment — ' + b.title : 'Capture a moment',
          description: 'One photo, one tag, one sentence — shared with the family in moments.' + (b && b.plan && b.plan.objectives && b.plan.objectives.length ? ' This block works towards: ' + b.plan.objectives.map((o) => o.code).filter(Boolean).join(', ') + '.' : ''),
          endpoint: '/assessments/quick-moments',
          submitLabel: 'Share with the family',
          successMessage: 'Moment shared — the family will see it shortly.',
          fields: [
            { name: 'learnerId', label: 'Child', type: 'select', required: true, options, value: presetChild || undefined },
            { name: 'domainId', label: 'What was it about? (optional)', type: 'select', options: domains.map((d) => ({ value: d.id, label: d.name })), placeholder: 'Pick the domain it showed' },
            { name: 'photoUrls', label: 'Photo', type: 'media', multiple: true, accept: 'image/*', capture: 'environment', scope: 'observation', ownerType: 'learner' },
            { name: 'note', label: 'One sentence', type: 'textarea', span: 2, placeholder: b ? ('During ' + b.title + ', …') : 'A lovely moment from today…', help: 'Leave blank and we will write “Captured a lovely moment in the classroom.”' }
          ]
        });
        return;
      }
      if (name === 'observationFor') {
        Promise.all([
          R.api('GET', '/curriculum/objectives').then((p) => p.data).catch(() => []),
          R.api('GET', '/learners?pageSize=200').then((p) => p.data).catch(() => []),
          R.api('GET', '/templates?kind=observation').then((p) => (p.data && p.data.data) || []).catch(() => [])
        ]).then(([objectives, learners, observationTemplates]) => {
          V.assessments.observationModal({ ...ctx, page: Object.assign({}, ctx.page || {}, { objectives, learners, observationTemplates }) }, id);
        });
        return;
      }
      if (name === 'dailyReport') {
        const dr = ((page.dailyReports || {}).children || []).find((c) => c.id === id);
        const child = dr || ((page.children || []).find((c) => c.id === id)) || { id: id, name: 'child' };
        const prefill = buildPrefillSummary(child);
        ctx.openModal({
          title: 'Daily report — ' + (child.name || 'Child'),
          endpoint: '/learners/' + child.id + '/daily-reports',
          submitLabel: 'Save report',
          successMessage: 'Daily report saved.',
          size: 'wide',
          description: 'Prefilled from today’s participation where possible — edit and share when ready.',
          fields: [
            { name: 'reportDate', label: 'Date', type: 'date', value: page.date || R.today(), required: true },
            { name: 'mood', label: 'Mood', type: 'select', options: ['Happy', 'Calm', 'Curious', 'Tired', 'Upset', 'Energetic'], placeholder: 'How was their day?' },
            { name: 'meals', label: 'Meals', type: 'textarea', span: 2, placeholder: 'What and how they ate' },
            { name: 'naps', label: 'Naps / rest', type: 'textarea', span: 2 },
            { name: 'toileting', label: 'Toileting', type: 'textarea', span: 2 },
            { name: 'activitiesSummary', label: 'Activities & highlights', type: 'textarea', span: 2, value: prefill, placeholder: 'What they enjoyed and explored today' },
            { name: 'notes', label: 'Notes for family', type: 'textarea', span: 2 },
            { name: 'photoUrls', label: 'Photos', type: 'media', multiple: true, accept: 'image/*', capture: 'environment', scope: 'daily_report', ownerType: 'learner', ownerId: child.id },
            { name: 'sharedWithGuardians', label: 'Share with guardians now', type: 'checkbox', value: false }
          ]
        });
        return;
      }
    }
  };

  function statPill(label, value, icon) {
    return '<div class="row" style="gap:8px;align-items:center;background:var(--surface-2);padding:8px 12px;border-radius:12px">' +
      R.icon(icon) + '<div><div class="strong" style="font-size:0.95rem;line-height:1.1">' + esc(value) + '</div><div class="muted small">' + esc(label) + '</div></div></div>';
  }
})();
