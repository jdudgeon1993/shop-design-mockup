// Employee dashboard core. Runs the shell in index.html and gives every section the
// same toolkit. A section is one file in modules/ that calls:
//
//   DLDash.register({
//       id: 'orders', label: 'Orders', order: 30,
//       icon: '<path d="..."/>',            // 24x24 stroke icon, drawn in the sidebar
//       mount: function (el, ctx) {         // first visit only; el is the section's own box
//           ...build the section in el...
//           return { show: function (param) {}, hide: function () {} };   // optional
//       }
//   });
//
// Sections stay mounted once opened (switching away only hides them), so a live help
// session or a video call keeps running while you look at something else.
// Routes are #<id> or #<id>/<param>, e.g. #orders/1005 opens order 1005.
(function () {
    var sb = DL.supabase, esc = DL.escapeHtml;
    var modules = [], views = {}, current = null;
    var AVAIL_KEY = 'dl_dash_avail_v1', BELL_KEY = 'dl_dash_bell_v1';
    var $ = function (id) { return document.getElementById(id); };

    // Order statuses, in workflow order (matches the orders_status_check constraint).
    var STATUS = [
        { key: 'submitted', label: 'New', tone: 'bad', hint: 'Just came in. Review it.' },
        { key: 'reviewing', label: 'Reviewing', tone: 'warn', hint: 'Checking items, sizes and finish.' },
        { key: 'invoiced', label: 'Invoiced', tone: 'info', hint: 'Invoice sent to the customer.' },
        { key: 'paid', label: 'Paid', tone: 'ok', hint: 'Payment received.' },
        { key: 'ordered_from_vendor', label: 'Ordered from maker', tone: 'gold', hint: 'Entered on the partner portal.' },
        { key: 'in_production', label: 'In production', tone: 'gold', hint: 'The maker is building it.' },
        { key: 'shipped', label: 'Shipped', tone: 'info', hint: 'On its way.' },
        { key: 'completed', label: 'Completed', tone: 'ok', hint: 'Delivered and done.' },
        { key: 'cancelled', label: 'Cancelled', tone: '', hint: 'Not going ahead.' }
    ];
    var statusOf = {}; STATUS.forEach(function (s) { statusOf[s.key] = s; });

    // ---------- small helpers every section uses ----------
    var money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
    function fmtDate(v, withTime) {
        var d = new Date(v);
        return withTime ? d.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
            : d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
    }
    function timeAgo(v) {
        var s = Math.max(0, (Date.now() - new Date(v).getTime()) / 1000);
        if (s < 60) return 'just now';
        if (s < 3600) return Math.round(s / 60) + ' min ago';
        if (s < 86400) return Math.round(s / 3600) + ' hr ago';
        if (s < 86400 * 7) { var d = Math.round(s / 86400); return d + (d === 1 ? ' day ago' : ' days ago'); }
        return fmtDate(v);
    }
    function toast(msg, tone) {
        var t = document.createElement('div');
        t.className = 'toast' + (tone ? ' ' + tone : ''); t.textContent = msg;
        $('toasts').appendChild(t);
        setTimeout(function () { t.remove(); }, 5000);
    }
    function copy(text, btn) {
        return navigator.clipboard.writeText(text).then(function () {
            if (btn) { var o = btn.textContent; btn.textContent = 'Copied!'; setTimeout(function () { btn.textContent = o; }, 1600); }
            else toast('Copied.');
        });
    }
    function csv(rows, filename) {
        var text = rows.map(function (r) {
            return r.map(function (c) { var v = c == null ? '' : String(c); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }).join(',');
        }).join('\n');
        var a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv' }));
        a.download = filename; document.body.appendChild(a); a.click(); a.remove();
    }
    function statusPill(key) {
        var s = statusOf[key] || { label: key, tone: '' };
        return '<span class="pill ' + s.tone + '">' + esc(s.label) + '</span>';
    }
    function initials(name) {
        return (name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(function (p) { return p[0].toUpperCase(); }).join('');
    }
    // A side panel; returns { body, close }.
    function drawer(title) {
        var bg = document.createElement('div'); bg.className = 'drawer-bg';
        var d = document.createElement('section'); d.className = 'drawer'; d.setAttribute('role', 'dialog'); d.setAttribute('aria-modal', 'true');
        d.innerHTML = '<div class="drawer-head"><h2></h2><span class="sp"></span><button class="icon-btn" type="button" aria-label="Close">' +
            '<svg viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12"/></svg></button></div><div class="drawer-body"></div>';
        d.querySelector('h2').textContent = title;
        document.body.appendChild(bg); document.body.appendChild(d);
        var opener = document.activeElement;
        function close() { bg.remove(); d.remove(); document.removeEventListener('keydown', onKey); if (opener && opener.focus) opener.focus(); if (api.onClose) api.onClose(); }
        function onKey(e) { if (e.key === 'Escape') close(); }
        bg.addEventListener('click', close);
        d.querySelector('.drawer-head button').addEventListener('click', close);
        document.addEventListener('keydown', onKey);
        d.querySelector('.drawer-head button').focus();
        var api = { el: d, body: d.querySelector('.drawer-body'), setTitle: function (t) { d.querySelector('h2').textContent = t; }, close: close };
        return api;
    }

    // ---------- notifications ----------
    var bell = [];
    try { bell = JSON.parse(localStorage.getItem(BELL_KEY) || '[]'); } catch (e) { bell = []; }
    var unseen = 0, audio = null;
    function chime() {
        try {
            audio = audio || new (window.AudioContext || window.webkitAudioContext)();
            [880, 1320].forEach(function (f, i) {
                var o = audio.createOscillator(), g = audio.createGain(), t = audio.currentTime + i * 0.16;
                o.frequency.value = f; o.type = 'sine';
                g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.18, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
                o.connect(g); g.connect(audio.destination); o.start(t); o.stop(t + 0.4);
            });
        } catch (e) {}
    }
    // notify({ title, text, href, loud }): bell list + toast; loud adds a sound and a desktop pop-up.
    function notify(n) {
        bell.unshift({ title: n.title, text: n.text || '', href: n.href || '', at: Date.now() });
        bell = bell.slice(0, 30);
        try { localStorage.setItem(BELL_KEY, JSON.stringify(bell)); } catch (e) {}
        unseen++; paintBell();
        toast(n.title + (n.text ? ': ' + n.text : ''));
        if (n.loud) {
            chime();
            if (document.hidden && window.Notification && Notification.permission === 'granted') {
                var pop = new Notification(n.title, { body: n.text || '', icon: '/Assets/Logos/apple-touch-icon.png', tag: n.tag || undefined });
                pop.onclick = function () { window.focus(); if (n.href) location.hash = n.href; pop.close(); };
            }
            if (document.hidden) document.title = '● ' + n.title + ' - Design Lab';
        }
    }
    document.addEventListener('visibilitychange', function () { if (!document.hidden) document.title = (current ? current.label + ' - ' : '') + 'Dashboard - Design Lab'; });
    function paintBell() {
        $('bell-count').hidden = !unseen; $('bell-count').textContent = unseen;
        $('bell-list').innerHTML = bell.length ? bell.map(function (b) {
            return '<li><a href="' + esc(b.href || '#overview') + '">' + esc(b.title) + (b.text ? ' · ' + esc(b.text) : '') + '<small>' + esc(timeAgo(b.at)) + '</small></a></li>';
        }).join('') : '<li class="empty">Nothing new.</li>';
    }
    $('bell').addEventListener('click', function (e) {
        e.stopPropagation();
        var open = $('bell-menu').hidden;
        $('bell-menu').hidden = !open; $('bell').setAttribute('aria-expanded', String(open));
        if (open) { unseen = 0; paintBell(); }
    });
    $('bell-clear').addEventListener('click', function () { bell = []; try { localStorage.removeItem(BELL_KEY); } catch (e) {} paintBell(); });
    document.addEventListener('click', function (e) { if (!e.target.closest('.bell-wrap')) { $('bell-menu').hidden = true; $('bell').setAttribute('aria-expanded', 'false'); } });

    // ---------- live help: the queue, and being available ----------
    // Customers wait in the 'dl-help-lobby' presence channel (Assets/dl-help.js). The
    // dashboard watches it for counts and alerts; when you're available it also shows up
    // there as an agent, so customers see "An agent is available".
    var lobby = null, lobbyKey = 'agent-dash-' + Math.random().toString(36).slice(2, 8), waiting = [], agents = [], gone = {}, seen = {};
    var lobbyListeners = [], firstSync = true;
    function onLobby(fn) { lobbyListeners.push(fn); fn({ waiting: waiting, agents: agents }); }
    function joinLobby() {
        lobby = sb.channel('dl-help-lobby', { config: { presence: { key: lobbyKey } } });
        lobby.on('presence', { event: 'sync' }, readLobby);
        lobby.on('broadcast', { event: 'gone' }, function (m) { var sid = (m.payload || {}).sid; if (sid) { gone[sid] = Date.now(); readLobby(); } });
        lobby.subscribe(function (s) { if (s === 'SUBSCRIBED' && available()) trackMe(); });
    }
    function readLobby() {
        var st = lobby.presenceState(), w = [], a = {};
        Object.keys(st).forEach(function (k) {
            var m = st[k][0] || {};
            if (m.role === 'customer' && m.sid && !(gone[m.sid] > Date.now() - 15000)) w.push(m);
            if (m.role === 'agent') a[m.uid || m.name || k] = { name: m.name || 'Agent', uid: m.uid || null };
        });
        waiting = w.sort(function (x, y) { return x.since - y.since; });
        agents = Object.keys(a).map(function (k) { return a[k]; });
        waiting.forEach(function (c) {
            if (seen[c.sid]) return;
            seen[c.sid] = true;
            if (!firstSync) notify({ title: (c.name || 'A customer') + ' wants live help', text: c.topic || (c.items + ' item' + (c.items === 1 ? '' : 's') + (c.look ? ' · ' + c.look : '')),
                href: '#live-help', loud: available(), tag: 'help-' + c.sid });
        });
        firstSync = false;
        setBadge('live-help', waiting.length);
        lobbyListeners.forEach(function (fn) { fn({ waiting: waiting, agents: agents }); });
    }
    function available() { try { return localStorage.getItem(AVAIL_KEY) === '1'; } catch (e) { return false; } }
    function trackMe() { if (lobby) lobby.track({ role: 'agent', name: ctx.firstName, uid: ctx.user.id }); }
    $('avail').addEventListener('change', function () {
        var on = $('avail').checked;
        try { if (on) localStorage.setItem(AVAIL_KEY, '1'); else localStorage.removeItem(AVAIL_KEY); } catch (e) {}
        if (on) {
            trackMe(); chime(); // the click unlocks sound for later alerts
            if (window.Notification && Notification.permission === 'default') Notification.requestPermission();
            toast('You\'re available. You\'ll get an alert when a customer asks for help.');
        } else if (lobby) lobby.untrack();
    });

    // New orders: checked every minute (no database change needed for this).
    var lastOrderAt = null;
    function watchOrders() {
        sb.from('orders').select('order_number,contact_name,created_at,status').order('created_at', { ascending: false }).limit(20).then(function (r) {
            var rows = r.data || [];
            var fresh = rows.filter(function (o) { return o.status === 'submitted'; }).length;
            setBadge('orders', fresh);
            if (lastOrderAt) rows.filter(function (o) { return o.created_at > lastOrderAt; }).reverse().forEach(function (o) {
                notify({ title: 'New order #' + o.order_number, text: o.contact_name, href: '#orders/' + o.order_number, loud: true, tag: 'order-' + o.order_number });
            });
            if (rows[0]) lastOrderAt = rows[0].created_at > (lastOrderAt || '') ? rows[0].created_at : lastOrderAt;
            else lastOrderAt = lastOrderAt || new Date(0).toISOString();
            ordersListeners.forEach(function (fn) { fn(); });
        });
    }
    var ordersListeners = [];

    // ---------- sections ----------
    function register(mod) { modules.push(mod); }
    function setBadge(id, n, soft) {
        var el = document.querySelector('[data-nav="' + id + '"] .count');
        if (!el) return;
        el.hidden = !n; el.textContent = n; el.classList.toggle('soft', !!soft);
    }
    function buildNav() {
        modules.sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
        $('nav').innerHTML = modules.map(function (m) {
            return '<a href="#' + m.id + '" data-nav="' + m.id + '"><svg viewBox="0 0 24 24" aria-hidden="true">' + m.icon + '</svg><span>' + esc(m.label) +
                '</span><span class="count" hidden></span></a>';
        }).join('');
    }
    function route() {
        var parts = (location.hash || '#overview').slice(1).split('/');
        var mod = modules.filter(function (m) { return m.id === parts[0]; })[0] || modules[0];
        var param = parts.slice(1).join('/') || null;
        if (current && current !== mod && views[current.id]) {
            views[current.id].el.hidden = true;
            if (views[current.id].api && views[current.id].api.hide) views[current.id].api.hide();
        }
        current = mod;
        if (!views[mod.id]) {
            var el = document.createElement('div');
            el.className = 'section-view'; el.dataset.section = mod.id;
            $('content').appendChild(el);
            views[mod.id] = { el: el, api: mod.mount(el, ctx) || {} };
        }
        views[mod.id].el.hidden = false;
        if (views[mod.id].api.show) views[mod.id].api.show(param);
        document.querySelectorAll('[data-nav]').forEach(function (a) {
            if (a.dataset.nav === mod.id) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
        });
        $('page-title').textContent = mod.label;
        document.title = mod.label + ' - Dashboard - Design Lab';
    }

    // Shared with every section.
    var ctx = {
        sb: sb, esc: esc, money: money, fmtDate: fmtDate, timeAgo: timeAgo, toast: toast, copy: copy, csv: csv, notify: notify,
        drawer: drawer, initials: initials, STATUS: STATUS, statusOf: statusOf, statusPill: statusPill, setBadge: setBadge,
        go: function (hash) { location.hash = hash; },
        lobby: { onChange: onLobby, available: available },
        orders: { onChange: function (fn) { ordersListeners.push(fn); }, refresh: function () { watchOrders(); } },
        TOKEN_ENDPOINT: 'https://shop-design-railway.up.railway.app/api/jitsi-token',
        JITSI_DOMAIN: '8x8.vc', APP_ID: 'vpaas-magic-cookie-f0a0399c162749f2805d91eef3967b80',
        CALENDAR_ID: 'c_9089d8c980992d45cb984c6a34f591828f33a49387d17a67496e669859499399@group.calendar.google.com',
        user: null, profile: null, firstName: ''
    };

    // ---------- sign in ----------
    // Employee or admin profiles only; anyone else is signed back out.
    function employeeFor(user) {
        return sb.from('profiles').select('role,full_name,phone').eq('id', user.id).maybeSingle().then(function (r) {
            var p = r.data;
            return p && (p.role === 'employee' || p.role === 'admin') ? p : null;
        });
    }
    function showSignin(msg) {
        $('app').hidden = true; $('signin').hidden = false;
        $('si-error').hidden = !msg; $('si-error').textContent = msg || '';
        $('si-email').focus();
    }
    $('signin-form').addEventListener('submit', function (e) {
        e.preventDefault();
        $('si-submit').disabled = true; $('si-error').hidden = true;
        sb.auth.signInWithPassword({ email: $('si-email').value.trim(), password: $('si-password').value }).then(function (r) {
            if (r.error || !r.data.user) throw new Error('That email and password didn\'t match.');
            return employeeFor(r.data.user).then(function (p) {
                if (!p) return sb.auth.signOut().then(function () { throw new Error('This account isn\'t set up as a Design Lab employee.'); });
                start2(r.data.user, p);
            });
        }).catch(function (err) { showSignin(err.message); }).finally(function () { $('si-submit').disabled = false; });
    });
    $('signout').addEventListener('click', function () {
        if (lobby) lobby.untrack();
        try { DL.prices.set(false); } catch (e) {}
        sb.auth.signOut().then(function () { location.hash = ''; location.reload(); });
    });

    function start2(user, profile) {
        ctx.user = user; ctx.profile = profile;
        var full = profile.full_name || user.email.split('@')[0];
        ctx.firstName = full.split(' ')[0];
        $('me').innerHTML = '<span class="avatar">' + esc(initials(full)) + '</span><span class="who"><strong>' + esc(full) + '</strong><br><span class="muted">' +
            esc(profile.role === 'admin' ? 'Admin' : 'Team') + '</span></span>';
        $('signin').hidden = true; $('app').hidden = false;
        $('avail').checked = available();
        buildNav(); paintBell();
        joinLobby();
        watchOrders(); setInterval(watchOrders, 60000);
        window.addEventListener('hashchange', route);
        route();
    }

    window.DLDash = {
        register: register,
        ctx: ctx,
        start: function () {
            sb.auth.getSession().then(function (r) {
                var user = r.data.session && r.data.session.user;
                if (!user) return showSignin();
                employeeFor(user).then(function (p) {
                    if (p) start2(user, p);
                    else sb.auth.signOut().then(function () { showSignin('This account isn\'t set up as a Design Lab employee.'); });
                });
            });
        }
    };
})();
