'use strict';

/**
 * Unified "Today" workspace: one home for the day that brings together
 * management attention (dashboard/alerts/KPIs), the teaching timeline
 * (schedule, plans/activities/modules/guides), classroom/gate context,
 * in-flow evidence capture and end-of-day wrap-up.
 */
(function () {
  const R = window.Reel;
  const V = R.views;

  function esc(s) { return R.esc(s == null ? '' : String(s)); }
  function time(iso) { return R.time ? R.time(iso) : (iso ? new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'); }

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

  function statPill(label, value, icon) {
    return '<div class="row today-pill" style="gap:8px;align-items:center;padding:8px 12px;border-radius:12px">' +
      R.icon(icon) + '<div><div class="strong" style="font-size:0.95rem;line-height:1.1">' + esc(value) + '</div><div class="muted small">' + esc(label) + '</div></div></div>';
  }

  function timeOfDay(now) {
    const h = (now instanceof Date ? now : new Date()).getHours();
    if (h < 5) return { greeting: 'Good evening', label: 'Night', icon: 'moon', tone: 'A quiet close to the day.', phase: 'night' };
    if (h < 8) return { greeting: 'Good morning', label: 'Early morning', icon: 'sunrise', tone: 'A calm start to the day.', phase: 'dawn' };
    if (h < 12) return { greeting: 'Good morning', label: 'Morning', icon: 'sunrise', tone: 'A calm start to the day.', phase: 'morning' };
    if (h < 15) return { greeting: 'Good afternoon', label: 'Midday', icon: 'sun', tone: 'Keep the momentum going.', phase: 'midday' };
    if (h < 18) return { greeting: 'Good afternoon', label: 'Afternoon', icon: 'sun', tone: 'Keep the momentum going.', phase: 'afternoon' };
    if (h < 20) return { greeting: 'Good evening', label: 'Sunset', icon: 'sunset', tone: 'A good moment to wrap up.', phase: 'dusk' };
    return { greeting: 'Good evening', label: 'Night', icon: 'moon', tone: 'A quiet close to the day.', phase: 'night' };
  }

  function clockDisplay(now) {
    const pad = (n) => String(n).padStart(2, '0');
    return pad(now.getHours()) + ':' + pad(now.getMinutes());
  }

  V.today = {
    async load(ctx) {
      const canDashboard = ctx.has('reports.read.daycare');
      const teachingPerms = ctx.has(['curriculum.create.daycare', 'assessments.create.assigned', 'attendance.record.assigned', 'attendance.record.own', 'staff_attendance.record.assigned', 'staff_attendance.record.own']);
      let billingLockError = null;
      function captureBillingLock(err) {
        if (err && (err.code === 'FORBIDDEN' || err.status === 403) &&
          (err.details && err.details.billingLock || /subscription payment is overdue/i.test(err.message || ''))) {
          billingLockError = err;
        }
        return null;
      }
      const settled = await Promise.allSettled([
        teachingPerms ? R.api('GET', '/staff/today').catch(captureBillingLock) : Promise.resolve(null),
        canDashboard ? R.api('GET', '/dashboard').catch(captureBillingLock) : Promise.resolve(null),
        R.api('GET', '/tasks?status=open').catch(captureBillingLock),
        R.api('GET', '/notifications?pageSize=6').catch(captureBillingLock),
        ctx.has('curriculum.read.daycare')
          ? R.api('GET', '/curriculum/calendar?from=' + R.today() + '&to=' + R.today()).catch(captureBillingLock) : Promise.resolve(null),
        R.api('GET', '/curriculum/domains').catch(captureBillingLock),
        ctx.has('organisation.read.daycare')
          ? R.api('GET', '/organisations/current/settings').catch(captureBillingLock) : Promise.resolve(null)
      ]);
      // A billing lock must stop the page, not degrade it into empty numbers.
      if (billingLockError) throw billingLockError;
      const [todayRes, dashRes, tasksRes, notifRes, calRes, domainsRes, settingsRes] = settled;
      const today = todayRes.status === 'fulfilled' && todayRes.value ? todayRes.value.data : null;
      const dashboard = dashRes.status === 'fulfilled' && dashRes.value ? dashRes.value.data : null;
      const tasks = tasksRes.status === 'fulfilled' && tasksRes.value ? tasksRes.value.data : [];
      const notifications = notifRes.status === 'fulfilled' && notifRes.value ? notifRes.value.data : [];
      const calendarToday = calRes.status === 'fulfilled' && calRes.value ? calRes.value.data : [];
      const domains = domainsRes.status === 'fulfilled' && domainsRes.value ? domainsRes.value.data : [];
      const orgSettings = settingsRes.status === 'fulfilled' && settingsRes.value ? settingsRes.value.data : {};
      // Day-scene weather: never blocks Today — races a short timeout so a slow
      // network still renders instantly, and a failure simply omits the widget.
      const weather = await Promise.race([
        Reel.weather.load({ location: orgSettings.weather }).catch(() => null),
        new Promise((resolve) => setTimeout(() => resolve(null), 2500))
      ]);
      const now = new Date();
      return {
        today: today || { expected: 0, present: 0, recorded: 0, children: [], timeline: [], absentees: [], focusChildren: [], unverifiedDropoffs: [], gateScans: [], unopened: [], unfinished: {}, dailyReports: { children: [], missing: 0, draft: 0, presentCount: 0 }, wrapUp: { unfinishedBlocks: [], unfinishedCount: 0 }, unmarkedIds: [] },
        dashboard,
        tasks: tasks || [],
        notifications: notifications || [],
        calendarToday: calendarToday || [],
        domains: domains || [],
        canDashboard,
        teachingPerms,
        weather,
        nowIso: now.toISOString(),
        date: R.today()
      };
    },

    render(ctx, params, page) {
      const t = page.today || {};
      const timeline = t.timeline || [];
      const now = new Date(page.nowIso || Date.now());
      const nowMs = now.getTime();
      const tod = timeOfDay(now);
      const firstName = (ctx.session && ctx.session.user && ctx.session.user.displayName ? String(ctx.session.user.displayName).split(' ')[0] : 'there');
      const next = timeline.find((b) => b.status === 'scheduled' || b.status === 'in_progress') || null;
      const nextIdx = next ? timeline.indexOf(next) : -1;

      // Charts for manager dashboard
      const d = page.dashboard || {};
      const trend = d.attendanceTrend || [];
      const revenue = d.revenueByMonth || [];
      if (page.canDashboard) {
        ctx.chart('attendance-trend', 'line', {
          labels: trend.map((x) => new Date(x.attendance_date).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' })),
          datasets: [
            { label: 'Present', data: trend.map((x) => x.present), borderColor: '#3A7D44', backgroundColor: 'rgba(58,125,68,0.12)', fill: true, tension: 0.35, pointRadius: 2 },
            { label: 'Marked', data: trend.map((x) => x.marked), borderColor: '#E89A2B', backgroundColor: 'transparent', borderDash: [4, 4], tension: 0.35, pointRadius: 0 }
          ]
        });
        ctx.chart('revenue-chart', 'bar', {
          labels: revenue.map((r) => r.month),
          datasets: [
            { label: 'Invoiced', data: revenue.map((r) => r.invoiced), backgroundColor: '#A8D5AE', borderRadius: 6 },
            { label: 'Collected', data: revenue.map((r) => r.collected), backgroundColor: '#3A7D44', borderRadius: 6 }
          ]
        });
      }

      // Teaching day charts (rings & progress)
      const rings = t.rings || {};
      const hasDayData = (t.expected || 0) > 0 || page.teachingPerms;
      if (hasDayData) {
        const present = Number(t.present || 0);
        const away = Math.max(0, Number(t.expected || 0) - present);
        ctx.chart('today-register', 'doughnut', {
          labels: ['Present', 'Away / not in yet'],
          datasets: [{ data: [present, away || (present ? 0 : 1)], backgroundColor: ['#3A7D44', '#E8E3D8'], borderWidth: 0 }]
        }, { cutout: '70%' });
        ctx.chart('today-progress', 'bar', {
          labels: ['Register', 'Observations', 'Daily reports'],
          datasets: [{ label: 'Progress %', data: [Number(rings.registerPct || 0), Number(rings.observationsPublishedPct || 0), Number(rings.dailyReportsPct || 0)], backgroundColor: ['#3D8FAE', '#81599B', '#E89A2B'], borderRadius: 8, barThickness: 22 }]
        }, { scales: { y: { beginAtZero: true, max: 100, ticks: { callback: (v) => v + '%' } } }, plugins: { legend: { display: false } } });
        const doneBlocks = timeline.filter((b) => b.status === 'completed').length;
        const inProg = timeline.filter((b) => b.status === 'in_progress').length;
        const remaining = Math.max(0, timeline.length - doneBlocks - inProg);
        ctx.chart('today-blocks', 'doughnut', {
          labels: ['Completed', 'In progress', 'Remaining'],
          datasets: [{ data: [doneBlocks, inProg, remaining || (timeline.length ? 0 : 1)], backgroundColor: ['#3A7D44', '#E89A2B', '#E8E3D8'], borderWidth: 0 }]
        }, { cutout: '68%' });
      }

      const headerSub = timeline.length
        ? (next ? ('Up next: ' + next.title + ' at ' + time(next.startsAt) + '.') : 'All planned blocks are complete — nice work.')
        : (page.canDashboard ? 'Your centre at a glance for ' + R.date(page.date) + '.' : 'Nothing scheduled on the calendar yet. Schedule your day and it will appear here.');

      const timeLine = '<span class="today-time-badge">' + R.icon(tod.icon) + ' ' + esc(tod.label) + ' · ' + R.time(now.toISOString()) + '</span>';

      let html = '<div class="today-wrap" id="today-root">';
      html += R.pageHead(tod.greeting + ', ' + esc(firstName), headerSub + ' ' + esc(tod.tone) + '<div style="margin-top:6px">' + timeLine + ' · ' + R.date(page.date) + '</div>',
        '<button class="btn btn-secondary btn-sm" @click="openNamedModal(\'quickMoment\')">' + R.icon('camera') + ' Quick moment</button>' +
        '<button class="btn btn-secondary btn-sm" onclick="window.print()">' + R.icon('printer') + ' Prep list</button>' +
        (page.canDashboard && ctx.has('learners.create.daycare') ? '<button class="btn btn-secondary btn-sm" @click="openNamedModal(\'learner\')">' + R.icon('user-plus') + ' Add learner</button>' : '') +
        '<button class="btn btn-primary btn-sm" @click="navigate(true)">' + R.icon('refresh-cw') + ' Refresh</button>'
      );

      // Manager dashboard (alerts, KPIs, charts, lists) — merged from Overview
      html += this.renderDayScene(ctx, page);
      html += this.renderSuggestions(ctx, page);
      if (page.canDashboard) {
        html += this.renderDashboard(ctx, page);
      }

      // Teaching day: people/context + insights + timeline + wrap-up
      html += this.renderPeopleStrip(ctx, page);
      html += this.renderInsights(ctx, page);
      html += this.renderFocus(ctx, page);
      html += this.renderUpNext(ctx, page, next);
      html += this.renderTimeline(ctx, page, timeline, nextIdx, nowMs);
      html += this.renderWrapUp(ctx, page);
      html += this.renderPrepList(page);

      html += '</div>';
      return html;
    },

    /**
     * The day scene: a neon-glass landscape card that breathes with the time
     * of day — dawn, morning, midday, afternoon, dusk or night — with a
     * travelling sun (or moon), drifting clouds, hills and trees, live weather
     * for the centre's location and the day's most valuable numbers beneath.
     */
    renderDayScene(ctx, page) {
      const t = page.today || {};
      const now = new Date(page.nowIso || Date.now());
      const tod = timeOfDay(now);
      const w = page.weather || null;
      const timeline = t.timeline || [];
      const next = timeline.find((b) => b.status === 'scheduled' || b.status === 'in_progress') || null;
      const dr = t.dailyReports || { missing: 0, draft: 0 };
      const tasksDue = ((t.unfinished || {}).tasksDueToday) || 0;
      const orgName = (ctx.activeOrganisation && ctx.activeOrganisation.name) || '';
      const place = (w && w.city) || orgName || 'Your centre';
      const h = now.getHours() + now.getMinutes() / 60;

      // Sun (or moon) position: when the forecast gives us sunrise/sunset, ride
      // the real arc; otherwise fall back to a 06:00–19:00 sweep.
      let frac = Math.max(0, Math.min(1, (h - 6) / 13));
      if (w && w.sunrise && w.sunset) {
        const rise = w.sunrise.slice(-5).split(':');
        const set = w.sunset.slice(-5).split(':');
        const riseMin = Number(rise[0]) * 60 + Number(rise[1]);
        const setMin = Number(set[0]) * 60 + Number(set[1]);
        const nowMin = now.getHours() * 60 + now.getMinutes();
        if (setMin > riseMin) frac = Math.max(0, Math.min(1, (nowMin - riseMin) / (setMin - riseMin)));
      }
      const orbLeft = (6 + frac * 82).toFixed(1);
      const orbBottom = (14 + Math.sin(frac * Math.PI) * 46).toFixed(1);
      const isNight = tod.phase === 'night';

      const info = [];
      info.push({
        icon: 'user-check', tone: 'green', label: 'Register',
        value: R.number(t.present || 0) + ' / ' + R.number(t.expected || 0) + ' present' + (t.registerPct ? ' · ' + R.percent(t.registerPct) + ' recorded' : '')
      });
      if (next) info.push({ icon: 'clock', tone: 'sky', label: 'Next block', value: esc(next.title) + ' at ' + time(next.startsAt) });
      else info.push({ icon: 'check-circle', tone: 'green', label: 'Schedule', value: timeline.length ? 'All planned blocks complete' : 'Nothing scheduled yet' });
      if (w) {
        if (!isNight && w.sunset) {
          info.push({
            icon: 'sun', tone: 'sun', label: 'Outdoor play window',
            value: 'until ' + esc(String(w.sunset).slice(-5)) + ' · UV ' + (w.uv === null ? '—' : R.number(w.uv)) + ' · ' + R.number(w.wind || 0) + ' km/h wind'
          });
        } else {
          info.push({
            icon: 'moon', tone: 'sky', label: 'Evening conditions',
            value: (w.sunrise ? 'Sunrise ' + esc(String(w.sunrise).slice(-5)) + ' · ' : '') + 'feels like ' + R.number(w.feels !== null ? w.feels : w.temp) + '°C'
          });
        }
      }
      if (dr.missing || tasksDue) {
        info.push({ icon: 'list-checks', tone: 'clay', label: 'Wrap-up', value: (dr.missing ? R.number(dr.missing) + ' report' + (dr.missing === 1 ? '' : 's') + ' to write' : '') + (dr.missing && tasksDue ? ' · ' : '') + (tasksDue ? R.number(tasksDue) + ' task' + (tasksDue === 1 ? '' : 's') + ' due' : '') });
      }

      let html = '<div class="card day-card" data-phase="' + esc(tod.phase) + '">';
      html += '<div class="day-scene" role="img" aria-label="' + R.attr(tod.label + ' — ' + (w ? w.label : place)) + '">';
      html += '<div class="scene-sky"></div>';
      if (isNight) html += '<div class="scene-stars"></div>';
      html += '<div class="scene-orb ' + (isNight ? 'scene-moon' : 'scene-sun') + '" style="left:' + orbLeft + '%;bottom:' + orbBottom + '%"></div>';
      html += '<div class="scene-cloud c1"></div><div class="scene-cloud c2"></div>';
      html += '<div class="scene-hill h1"></div><div class="scene-hill h2"></div><div class="scene-hill h3"></div>';
      html += '<div class="scene-tree t1"></div><div class="scene-tree t2"></div><div class="scene-tree t3"></div>';
      html += '<div class="scene-meadow"><i class="shimmer s1"></i><i class="shimmer s2"></i><i class="shimmer s3"></i></div>';
      html += '<div class="scene-veil"></div>';
      html += '<div class="scene-overlay">' +
        '<div class="scene-left">' +
          '<div class="scene-clock">' + esc(clockDisplay(now)) + '</div>' +
          '<div class="scene-phase">' + R.icon(tod.icon) + ' ' + esc(tod.label) + '<span class="scene-tone">' + esc(tod.tone) + '</span></div>' +
        '</div>' +
        '<div class="scene-right">' +
          (w
            ? '<div class="scene-temp">' + R.number(w.temp) + '°</div>' +
              '<div class="scene-cond">' + R.icon(w.icon) + ' ' + esc(w.label) + '</div>' +
              '<div class="scene-place">' + R.icon('map-pin') + ' ' + esc(place) + '</div>'
            : '<div class="scene-place" style="margin-top:auto">' + R.icon('map-pin') + ' ' + esc(place) + '</div>') +
        '</div>' +
      '</div>';
      html += '</div>';
      html += '<div class="day-info">' + info.map((row, index) =>
        (index ? '<div class="day-info-sep" aria-hidden="true"></div>' : '') +
        '<div class="day-info-row"><span class="day-info-ico tone-' + esc(row.tone) + '">' + R.icon(row.icon) + '</span>' +
        '<div style="min-width:0"><div class="day-info-label">' + esc(row.label) + '</div>' +
        '<div class="day-info-value">' + row.value + '</div></div></div>').join('') + '</div>';
      html += '</div>';
      return html;
    },

    renderSuggestions(ctx, page) {
      const t = page.today || {};
      const timeline = t.timeline || [];
      const dr = t.dailyReports || { missing: 0, draft: 0, children: [] };
      const gate = t.gateScans || [];
      const unverified = t.unverifiedDropoffs || [];
      const unmarked = (t.unmarkedIds || []).length;
      const focus = t.focusChildren || [];
      const tasksDue = ((t.unfinished || {}).tasksDueToday) || 0;

      const suggestions = [];
      if (gate.length) suggestions.push({ icon: 'door-open', tone: 'sun', text: R.number(gate.length) + (gate.length === 1 ? ' collector is' : ' collectors are') + ' waiting at the gate', foot: gate.slice(0, 2).map((g) => g.collectorName + ' for ' + g.childFirst).join(' · ') + (gate.length > 2 ? '…' : ''), href: '#/app/learner-attendance', action: 'Release' });
      if (unverified.length) suggestions.push({ icon: 'user-plus', tone: 'clay', text: 'Verify ' + R.number(unverified.length) + ' unverified drop-off' + (unverified.length === 1 ? '' : 's'), foot: unverified.map((d) => d.childFirst + ' with ' + d.broughtByName).join(' · '), href: '#/app/learner-attendance', action: 'Fix' });
      if (unmarked) suggestions.push({ icon: 'clipboard-check', tone: 'sun', text: 'Finish marking the register', foot: R.number(unmarked) + (unmarked === 1 ? ' child' : ' children') + ' not marked yet', href: '#/app/learner-attendance', action: 'Open register' });
      if (dr.missing) suggestions.push({ icon: 'file-text', tone: 'clay', text: 'Write ' + R.number(dr.missing) + ' daily report' + (dr.missing === 1 ? '' : 's'), foot: 'Guardians are waiting for today’s news', go: 'today-wrapup', action: 'Wrap up' });
      else if (dr.draft) suggestions.push({ icon: 'send', tone: 'sun', text: 'Share ' + R.number(dr.draft) + ' draft report' + (dr.draft === 1 ? '' : 's'), foot: 'Drafts don’t reach guardians until shared', go: 'today-wrapup', action: 'Wrap up' });
      if (focus.length) suggestions.push({ icon: 'eye', tone: 'sky', text: 'Capture a moment for ' + esc(focus[0].firstName || focus[0].name), foot: 'No fresh observation in a while', click: 'openNamedModal(\'quickMomentFor\',\'' + R.attr(focus[0].id) + '\')', action: 'Quick moment' });
      if (tasksDue) suggestions.push({ icon: 'list-checks', tone: 'clay', text: 'Complete ' + R.number(tasksDue) + (tasksDue === 1 ? ' task' : ' tasks') + ' due today', foot: 'Due by end of day', href: '#/app/tasks', action: 'Open tasks' });
      if (!timeline.length && (page.teachingPerms || t.expected)) suggestions.push({ icon: 'calendar-days', tone: 'sky', text: 'Nothing is scheduled yet today', foot: 'Plan the day so the team knows what’s next', href: '#/app/calendar', action: 'Plan the day' });

      if (!suggestions.length) {
        if (!(t.expected || page.teachingPerms)) return '';
        return '<div class="card glass section today-suggest anim-in"><div class="row" style="gap:10px;align-items:center;padding:6px 2px">' +
          '<span class="suggest-ico suggest-ok">' + R.icon('check-circle') + '</span>' +
          '<div style="flex:1"><div class="strong" style="font-size:0.9rem">All caught up</div><div class="muted small">Nothing needs your attention right now — nice work.</div></div></div></div>';
      }

      return '<div class="card glass section today-suggest anim-in"><div class="card-head"><h3>' + R.icon('sparkles') + ' Suggested next steps</h3><span class="muted small">Picked up from today’s register, reports and tasks</span></div>' +
        '<div class="stack" style="gap:8px">' + suggestions.slice(0, 5).map((s) =>
          '<div class="suggest-row">' +
            '<span class="suggest-ico suggest-' + esc(s.tone) + '">' + R.icon(s.icon) + '</span>' +
            '<div style="flex:1;min-width:0"><div class="strong" style="font-size:0.9rem">' + esc(s.text) + '</div>' + (s.foot ? '<div class="muted small">' + esc(s.foot) + '</div>' : '') + '</div>' +
            (s.href
              ? '<a class="btn btn-sm btn-secondary" href="' + R.attr(s.href) + '">' + esc(s.action) + ' ' + R.icon('arrow-right') + '</a>'
              : '<button class="btn btn-sm btn-secondary" @click="' + R.attr(s.click) + '">' + esc(s.action) + '</button>') +
          '</div>').join('') + '</div></div>';
    },

    renderDashboard(ctx, page) {
      const d = page.dashboard || {};
      const finance = d.finance || {};
      const attendance = d.attendance || {};
      const learners = d.learners || {};
      const alerts = d.alerts || [];
      const tasks = (page.tasks || []).slice(0, 6);
      const upcoming = d.upcoming || page.calendarToday || [];
      const notifications = page.notifications || [];

      let html = '';
      if (alerts.length) {
        html += '<div class="stack section">' + alerts.map((a) => '<div class="alert ' + (a.severity === 'critical' || a.severity === 'warning' ? 'alert-warn' : 'alert-info') + '">' + R.icon('info') + '<span>' + esc(a.message) + '</span>' + (a.link ? '<a class="btn btn-sm btn-ghost row-end" href="' + R.attr(a.link) + '">Open</a>' : '') + '</div>').join('') + '</div>';
      }

      html += '<div class="grid grid-4 section">' +
        R.statCard({ label: 'Enrolled learners', value: R.number(learners.enrolled), icon: 'users', foot: learners.waitlisted ? learners.waitlisted + ' waitlisted' : 'All places confirmed' }) +
        R.statCard({ label: 'Attendance today', value: R.percent(attendance.rate), icon: 'calendar-check', tone: 'sky', foot: (attendance.present || 0) + ' present · ' + (attendance.absent || 0) + ' absent' }) +
        R.statCard({ label: 'Outstanding fees', value: R.money(finance.outstanding), icon: 'wallet', tone: 'clay', foot: 'Collected today ' + R.money(finance.collected) }) +
        R.statCard({ label: 'Open incidents', value: R.number((d.incidents || {}).total), icon: 'shield-alert', tone: (d.incidents || {}).total ? 'danger' : 'green', foot: 'Health and safety register' }) +
        '</div>';

      html += '<div class="split section"><div class="stack">' +
        R.card('Attendance trend', '<div style="position:relative;height:270px"><canvas id="attendance-trend"></canvas></div>', '<a class="btn btn-sm btn-ghost" href="#/app/learner-attendance">Open register ' + R.icon('arrow-right') + '</a>') +
        R.card('Revenue and collections', '<div style="position:relative;height:250px"><canvas id="revenue-chart"></canvas></div>', '<a class="btn btn-sm btn-ghost" href="#/app/finance">Finance ' + R.icon('arrow-right') + '</a>') +
        R.card('Tasks needing attention', tasks.length ? '<div class="stack">' + tasks.map((t) => '<div class="row" style="gap:10px;align-items:flex-start"><span class="badge ' + R.priorityTone(t.priority) + '">' + esc(t.priority) + '</span><div style="flex:1;min-width:0"><div class="strong" style="font-size:0.88rem">' + esc(t.title) + '</div><div class="muted small">' + esc(t.assignee_name || 'Unassigned') + ' · due ' + R.date(t.due_at) + '</div></div><button class="btn btn-sm btn-secondary" @click="act(\'PATCH\',\'/tasks/' + R.attr(t.id) + '\',{status:\'done\'},{successMessage:\'Task completed\'})">Done</button></div>').join('') + '</div>' : R.emptyState('No open tasks', 'Everything assigned is complete.', '', 'check-circle'), '<a class="btn btn-sm btn-ghost" href="#/app/tasks">All tasks ' + R.icon('arrow-right') + '</a>') +
        '</div><div class="stack">' +
        R.card('Coming up', upcoming.length ? '<div class="timeline">' + upcoming.map((event) => '<div class="timeline-item"><div class="t-time">' + R.time(event.starts_at) + ' · ' + esc(event.classroom_name || '') + '</div><div class="t-title">' + esc(event.title) + '</div><div class="t-body">' + esc(R.titleCase(event.status || 'scheduled')) + '</div></div>').join('') + '</div>' : R.emptyState('Nothing scheduled', 'The calendar is clear for now.', '<a class="btn btn-sm btn-secondary" href="#/app/calendar">Open calendar</a>', 'calendar'), '<a class="btn btn-sm btn-ghost" href="#/app/calendar">Calendar ' + R.icon('arrow-right') + '</a>') +
        R.card('At a glance', '<div class="kpi-list">' +
          '<div class="kpi-row"><span class="kpi-label">Staff on record</span><span class="kpi-value">' + R.number((d.staff || {}).total) + '</span></div>' +
          '<div class="kpi-row"><span class="kpi-label">Applications in progress</span><span class="kpi-value">' + R.number((d.applications || {}).total) + '</span></div>' +
          '<div class="kpi-row"><span class="kpi-label">Published observations</span><span class="kpi-value">' + R.number((d.observations || {}).total) + '</span></div>' +
          '<div class="kpi-row"><span class="kpi-label">Unread notifications</span><span class="kpi-value">' + R.number(ctx.unread) + '</span></div>' +
          '</div>') +
        R.card('Latest notifications', notifications.length ? '<ul class="list-clean">' + notifications.map((n) => '<li><span class="dot ' + (n.read_at ? 'muted' : '') + '"></span><div style="flex:1"><div class="strong" style="font-size:0.86rem">' + esc(n.title) + '</div><div class="muted small">' + esc(R.truncate(n.body, 90)) + '</div><div class="muted" style="font-size:0.72rem">' + R.relative(n.created_at) + '</div></div></li>').join('') + '</ul>' : R.emptyState('All caught up', 'No notifications right now.', '', 'bell'), '<a class="btn btn-sm btn-ghost" href="#/app/communications">Open ' + R.icon('arrow-right') + '</a>') +
        '</div></div>';
      return html;
    },

    renderPeopleStrip(ctx, page) {
      const t = page.today || {};
      const absentees = t.absentees || [];
      const unverified = t.unverifiedDropoffs || [];
      const gate = t.gateScans || [];
      const expected = t.expected || 0;
      return '<div class="card glass today-strip section anim-in">' +
        '<div class="today-strip-stats">' +
          statPill('Present', R.number(t.present || 0) + ' / ' + R.number(expected), 'user-check') +
          statPill('Absent', R.number(absentees.length), 'user-x') +
          statPill('Unmarked', R.number((t.unmarkedIds || []).length), 'help-circle') +
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
    },

    renderInsights(ctx, page) {
      const t = page.today || {};
      const timeline = t.timeline || [];
      const rings = t.rings || {};
      const dr = t.dailyReports || { presentCount: 0, missing: 0, draft: 0 };
      const doneBlocks = timeline.filter((b) => b.status === 'completed').length;
      const moments = t.moments || { children: [], streak: 0 };
      const momentsDone = (moments.children || []).filter((c) => c.done).length;
      if (!(t.expected || 0) && !page.teachingPerms && !timeline.length) return '';
      return '<div class="grid grid-3 section today-insights">' +
        R.card('Classroom now', '<div style="position:relative;height:190px"><canvas id="today-register"></canvas></div>' +
          '<div class="kpi-list" style="margin-top:8px">' +
            '<div class="kpi-row"><span class="kpi-label">Present</span><span class="kpi-value">' + R.number(t.present || 0) + ' / ' + R.number(t.expected || 0) + '</span></div>' +
            '<div class="kpi-row"><span class="kpi-label">Recorded</span><span class="kpi-value">' + R.percent(t.registerPct || 0) + '</span></div>' +
          '</div>') +
        R.card('Today’s progress', '<div style="position:relative;height:190px"><canvas id="today-progress"></canvas></div>' +
          '<div class="muted small" style="margin-top:8px">' + esc(rings.label || 'This month') + ' · observations ' + R.percent(rings.observationsPublishedPct || 0) + ' · reports ' + R.percent(rings.dailyReportsPct || 0) + '</div>') +
        R.card('Blocks & moments', '<div style="position:relative;height:190px"><canvas id="today-blocks"></canvas></div>' +
          '<div class="kpi-list" style="margin-top:8px">' +
            '<div class="kpi-row"><span class="kpi-label">Blocks completed</span><span class="kpi-value">' + R.number(doneBlocks) + ' / ' + R.number(timeline.length) + '</span></div>' +
            '<div class="kpi-row"><span class="kpi-label">Moments this week</span><span class="kpi-value">' + R.number(momentsDone) + ' / ' + R.number((moments.children || []).length) + (moments.streak ? ' · ' + R.number(moments.streak) + ' wk streak' : '') + '</span></div>' +
          '</div>') +
        '</div>';
    },

    renderFocus(ctx, page) {
      const focus = ((page.today || {}).focusChildren) || [];
      if (!focus.length) return '';
      return '<div class="card glass section anim-in"><div class="card-head"><h3>' + R.icon('eye') + ' Observe today</h3><span class="muted small">Children who could use a fresh observation</span></div>' +
        '<div class="stack">' + focus.map((c) => '<div class="row" style="gap:10px;justify-content:space-between;padding:8px 10px;background:var(--surface-2);border-radius:12px">' +
          '<div class="row" style="gap:10px;min-width:0">' + R.avatar(c, c.name, { size: 'xs', tip: c.name + ' · ' + (c.lastObservation ? 'last observed ' + R.date(c.lastObservation) : 'no observation yet') }) +
          '<div style="min-width:0"><div class="strong" style="font-size:0.88rem">' + esc(c.name) + '</div><div class="muted small">' + esc(c.classroom || 'Classroom') + (c.lastObservation ? ' · last ' + R.date(c.lastObservation) : ' · no observation yet') + '</div></div></div>' +
          '<div class="btn-group"><button class="btn btn-sm btn-secondary" @click="openNamedModal(\'quickMomentFor\',\'' + R.attr(c.id) + '\')">' + R.icon('camera') + ' Moment</button>' +
          '<button class="btn btn-sm btn-primary" @click="openNamedModal(\'observationFor\',\'' + R.attr(c.id) + '\')">' + R.icon('plus') + ' Observe</button></div></div>').join('') + '</div></div>';
    },

    renderUpNext(ctx, page, next) {
      if (!next) return '';
      const nowMs = new Date(page.nowIso || Date.now()).getTime();
      const mins = Math.round((new Date(next.startsAt).getTime() - nowMs) / 60000);
      let nudge = '';
      if (next.status === 'in_progress') nudge = 'In progress now — keep the guide handy.';
      else if (mins <= 0) nudge = 'It’s time — start this block when you’re ready.';
      else if (mins <= 10) nudge = 'Starting in ' + mins + ' min — time for a smooth transition.';
      else nudge = 'Up next at ' + time(next.startsAt) + '.';
      const nextMod = next.module || null;
      return '<div class="card glass today-next section anim-in pulse-now" style="border-left:4px solid var(--reel-green-500)"><div class="row" style="justify-content:space-between;gap:12px;align-items:flex-start">' +
        '<div><div class="muted small">Up next</div><div class="strong" style="font-size:1.05rem">' + esc(next.title) + '</div>' +
        '<div class="muted small">' + esc(nudge) + (next.classroom ? ' · ' + esc(next.classroom) : '') + (nextMod && nextMod.title ? ' · ' + esc(nextMod.title) : '') + '</div></div>' +
        '<div class="btn-group">' +
          (next.lessonPlanId ? '<button class="btn btn-sm btn-secondary" @click="openGuide(\'' + R.attr(next.lessonPlanId) + '\')">' + R.icon('book-open') + ' Teach / Guide</button>' : '') +
          (nextMod && nextMod.id ? '<button class="btn btn-sm btn-ghost" @click="downloadExport(\'/learning-modules/' + R.attr(nextMod.id) + '/teacher-guide\')">' + R.icon('file-down') + ' Teacher guide</button>' : '') +
          (next.status === 'scheduled' ? '<button class="btn btn-sm btn-primary" @click="act(\'POST\',\'/curriculum/calendar/events/' + R.attr(next.id) + '/start\',{},{successMessage:\'Block started — enjoy teaching.\'})">' + R.icon('play') + ' Start</button>' : '') +
          (next.status === 'in_progress' ? '<button class="btn btn-sm btn-primary" @click="openNamedModal(\'completeBlock\',\'' + R.attr(next.id) + '\')">' + R.icon('check') + ' Complete</button>' : '') +
        '</div></div></div>';
    },

    renderTimeline(ctx, page, timeline, nextIdx, nowMs) {
      let html = '<div class="section"><div class="row" style="justify-content:space-between;align-items:center;margin-bottom:10px"><h2 style="font-size:1.1rem;margin:0">Today’s timeline</h2>' +
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
          html += this.renderBlock(page, b, { isNext, current });
        });
        html += '</div>';
      }
      html += '</div>';
      return html;
    },

    renderBlock(page, b, flags) {
      const isNext = flags && flags.isNext;
      const current = flags && flags.current;
      const plan = b.plan;
      const act = b.activity;
      const mod = b.module;
      const part = b.participation || [];
      const learners = participationLearners(page.today || {}, b);
      const absentInScope = learners.filter((l) => !l.present);
      const materials = materialList(act && act.materials);
      const safety = act && act.safetyNotes ? String(act.safetyNotes).trim() : '';
      const border = b.status === 'completed' ? 'var(--reel-green-500)' : b.status === 'in_progress' ? 'var(--reel-sun-500)' : (isNext ? 'var(--reel-sky-500)' : 'var(--border-subtle)');
      const bg = b.status === 'completed' ? 'rgba(58,125,68,0.04)' : (current ? 'rgba(232,154,43,0.06)' : 'var(--surface-1)');

      let h = '<div class="card glass today-block anim-in" data-block="' + R.attr(b.id) + '" style="border-left:4px solid ' + border + ';--block-bg:' + bg + '">';
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
          (mod && mod.id ? '<button class="btn btn-sm btn-ghost" @click="downloadExport(\'/learning-modules/' + R.attr(mod.id) + '/teacher-guide\')" title="Download module teacher guide (PDF)">' + R.icon('file-down') + ' Teacher guide</button>' : '') +
          (b.status === 'scheduled' ? '<button class="btn btn-sm btn-primary" @click="act(\'POST\',\'/curriculum/calendar/events/' + R.attr(b.id) + '/start\',{},{successMessage:\'Block started — enjoy teaching.\'})">' + R.icon('play') + ' Start</button>' : '') +
          (b.status === 'in_progress' ? '<button class="btn btn-sm btn-primary" @click="openNamedModal(\'completeBlock\',\'' + R.attr(b.id) + '\')">' + R.icon('check-circle') + ' Complete</button>' : '') +
          (b.status === 'completed' ? '<button class="btn btn-sm btn-ghost" @click="openNamedModal(\'completeBlock\',\'' + R.attr(b.id) + '\')" title="Edit participation">' + R.icon('edit-2') + ' Participation</button>' : '') +
        '</div></div>';

      if (mod && (mod.title || mod.position)) {
        h += '<div class="row" style="gap:8px;flex-wrap:wrap;margin-top:10px">' +
          '<a class="badge badge-muted" href="#/app/modules/' + R.attr(mod.id) + '">' + R.icon('blocks') + ' ' + esc(mod.title || 'Module') + '</a>' +
          (mod.position ? '<span class="muted small">Plan ' + R.number(mod.position) + (mod.total ? ' of ' + R.number(mod.total) : '') + ' in the sequence</span>' : '') +
          (mod.theme ? '<span class="muted small">· ' + esc(mod.theme) + '</span>' : '') +
        '</div>';
      }

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

      if (act || materials.length || safety) {
        h += '<div class="grid grid-2" style="margin-top:10px;gap:10px">';
        h += '<div style="background:var(--surface-2);border-radius:12px;padding:10px"><div class="strong small" style="margin-bottom:4px">' + R.icon('package') + ' Materials & setup</div>';
        if (materials.length) h += '<ul style="margin:0;padding-left:18px" class="small">' + materials.slice(0, 10).map((m) => '<li>' + esc(m) + '</li>').join('') + '</ul>';
        else if (act && act.description) h += '<div class="muted small">' + esc(R.truncate(act.description, 140)) + '</div>';
        else h += '<div class="muted small">No materials listed — <a href="#/app/activities">add them to the activity</a>.</div>';
        if (act && act.durationMinutes) h += '<div class="muted small" style="margin-top:4px">~' + R.number(act.durationMinutes) + ' min' + (act.type ? ' · ' + esc(R.titleCase(act.type)) : '') + '</div>';
        h += '</div>';
        h += '<div style="background:var(--surface-2);border-radius:12px;padding:10px"><div class="strong small" style="margin-bottom:4px">' + R.icon('shield') + ' Safety & notes</div>';
        h += safety ? '<div class="small">' + esc(safety) + '</div>' : '<div class="muted small">No specific safety notes. Supervise as usual.</div>';
        h += '</div></div>';
      }

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

      h += '<div class="row" style="gap:8px;flex-wrap:wrap;margin-top:12px;padding-top:10px;border-top:1px solid var(--border-subtle)">' +
        (b.lessonPlanId ? '<a class="btn btn-sm btn-ghost" href="#/app/curriculum?tab=plans">Plan</a>' : '') +
        (mod ? '<a class="btn btn-sm btn-ghost" href="#/app/modules/' + R.attr(mod.id) + '">Module</a>' : '') +
        (b.activityId ? '<a class="btn btn-sm btn-ghost" href="#/app/activities">Activity</a>' : '') +
        '<a class="btn btn-sm btn-ghost" href="#/app/calendar">Calendar</a>' +
      '</div>';
      h += '</div>';
      return h;
    },

    renderWrapUp(ctx, page) {
      const t = page.today || {};
      const unfinished = (t.wrapUp && t.wrapUp.unfinishedBlocks) || [];
      const dr = t.dailyReports || { children: [], missing: 0, draft: 0, presentCount: 0 };
      const drafts = ((t.unfinished || {}).draftObservations) || 0;
      const tasksDue = ((t.unfinished || {}).tasksDueToday) || 0;
      const unopened = t.unopened || [];

      let html = '<div class="card glass section today-wrapup anim-in" id="today-wrapup"><div class="card-head"><h3>' + R.icon('sunset') + ' Wrap up the day</h3><span class="muted small">Close the loop before you go</span></div>';
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
              R.avatar(c, c.name, { size: 'xs', tip: c.name + ' · ' + (c.reportId ? (c.reportShared ? 'report shared' : 'draft report') : 'no report yet') }) +
              '<div style="min-width:0"><div class="strong" style="font-size:0.88rem">' + esc(c.name) + ' ' + badge + '</div><div class="muted small">' + esc(c.classroom || 'Classroom') + '</div>' + hint + '</div>' +
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
      html += '</div>';
      return html;
    },

    renderPrepList(page) {
      const timeline = ((page.today || {}).timeline) || [];
      const materials = [];
      const seen = new Set();
      timeline.forEach((b) => {
        materialList(b.activity && b.activity.materials).forEach((m) => {
          const k = m.toLowerCase();
          if (!seen.has(k)) { seen.add(k); materials.push(m); }
        });
      });
      let h = '<div class="card glass section today-prep anim-in" id="today-prep"><div class="card-head"><h3>' + R.icon('clipboard-list') + ' Prep list for today</h3><span class="muted small">Materials, safety notes and schedule — handy to print</span></div>';
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
      const t = page.today || {};
      if (name === 'completeBlock' || name === 'blockObserve') {
        const b = findBlock(t, id);
        if (name === 'blockObserve') {
          // fall through to quick capture with block context
          const learners = blockClassroomLearners(t, b || {});
          const options = learners.map((c) => ({ value: c.id, label: c.name + (c.classroom ? ' · ' + c.classroom : '') }));
          const domains = page.domains || [];
          ctx.openModal({
            title: b ? 'Capture a moment — ' + b.title : 'Capture a moment',
            description: 'One photo, one tag, one sentence — shared with the family in moments.' + (b && b.plan && b.plan.objectives && b.plan.objectives.length ? ' This block works towards: ' + b.plan.objectives.map((o) => o.code).filter(Boolean).join(', ') + '.' : ''),
            endpoint: '/assessments/quick-moments',
            submitLabel: 'Share with the family',
            successMessage: 'Moment shared — the family will see it shortly.',
            fields: [
              { name: 'learnerId', label: 'Child', type: 'select', required: true, options, value: options.length === 1 ? options[0].value : undefined },
              { name: 'domainId', label: 'What was it about? (optional)', type: 'select', options: domains.map((d) => ({ value: d.id, label: d.name })), placeholder: 'Pick the domain it showed' },
              { name: 'photoUrls', label: 'Photo', type: 'media', multiple: true, accept: 'image/*', capture: 'environment', scope: 'observation', ownerType: 'learner' },
              { name: 'note', label: 'One sentence', type: 'textarea', span: 2, placeholder: b ? ('During ' + b.title + ', …') : 'A lovely moment from today…' }
            ]
          });
          return;
        }
        if (!b) return;
        const learners = participationLearners(t, b);
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
          description: 'Capture who took part and any notes. This feeds daily reports and the evidence loop.',
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
      if (name === 'dailyReport') {
        const dr = (((t.dailyReports || {}).children) || []).find((c) => c.id === id);
        const child = dr || (((t.children || []).find((c) => c.id === id)) || { id: id, name: 'child' });
        const prefill = buildPrefillSummary(child);
        ctx.openModal({
          title: 'Daily report — ' + (child.name || 'Child'),
          endpoint: '/learners/' + child.id + '/daily-reports',
          submitLabel: 'Save report',
          successMessage: 'Daily report saved.',
          size: 'wide',
          description: 'Prefilled from today’s participation where possible — edit and share when ready.',
          fields: [
            { name: 'reportDate', label: 'Date', type: 'date', value: t.date || R.today(), required: true },
            { name: 'mood', label: 'Mood', type: 'select', options: ['Happy', 'Calm', 'Curious', 'Tired', 'Upset', 'Energetic'], placeholder: 'How was their day?' },
            { name: 'meals', label: 'Meals', type: 'textarea', span: 2 },
            { name: 'naps', label: 'Naps / rest', type: 'textarea', span: 2 },
            { name: 'toileting', label: 'Toileting', type: 'textarea', span: 2 },
            { name: 'activitiesSummary', label: 'Activities & highlights', type: 'textarea', span: 2, value: prefill },
            { name: 'notes', label: 'Notes for family', type: 'textarea', span: 2 },
            { name: 'photoUrls', label: 'Photos', type: 'media', multiple: true, accept: 'image/*', capture: 'environment', scope: 'daily_report', ownerType: 'learner', ownerId: child.id },
            { name: 'sharedWithGuardians', label: 'Share with guardians now', type: 'checkbox', value: false }
          ]
        });
        return;
      }
      if (name === 'learner') {
        ctx.openModal({
          title: 'Add a learner',
          endpoint: '/learners',
          submitLabel: 'Create learner',
          fields: [
            { name: 'firstName', label: 'First name', required: true },
            { name: 'lastName', label: 'Last name', required: true },
            { name: 'dateOfBirth', label: 'Date of birth', type: 'date', required: true },
            { name: 'branchId', label: 'Branch', type: 'select', required: true, options: ctx.branches.map((b) => ({ value: b.id, label: b.name })) },
            { name: 'gender', label: 'Gender', type: 'select', options: ['female', 'male', 'other', 'prefer not to say'] },
            { name: 'homeLanguage', label: 'Home language' },
            { name: 'enrolmentDate', label: 'Enrolment date', type: 'date', value: R.today() },
            { name: 'notes', label: 'Notes', type: 'textarea', span: 2 }
          ]
        });
        return;
      }
      if (name === 'task') {
        ctx.openModal({ title: 'New task', endpoint: '/tasks', submitLabel: 'Create task', fields: [
          { name: 'title', label: 'Task title', required: true, span: 2 },
          { name: 'description', label: 'Description', type: 'textarea', span: 2 },
          { name: 'priority', label: 'Priority', type: 'select', options: ['low', 'medium', 'high', 'urgent'], value: 'medium' },
          { name: 'dueAt', label: 'Due date', type: 'date' }
        ] });
        return;
      }
    }
  };
})();
