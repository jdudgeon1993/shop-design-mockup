// Live quote help, customer side. Load after dl-core.js.
//
// A customer asks for help -> they wait in the lobby (Supabase Realtime presence on
// 'dl-help-lobby') -> an agent accepts from /help-desk/ -> both join the session
// channel 'dl-help-s-<sid>'. The customer's cart is sent on every change; the agent
// sends edits back ('op'), which go through DL.cart like any other edit, so the
// one-look rule still applies. Nothing is stored in the database: when the session
// ends the channel is simply gone.
//
// DL.help.mount(el)  renders the "Get live help" box into el (cart page).
// Any page that loads this file keeps an active session going (and shows its bar).
(function () {
    if (!window.DL || !DL.supabase) return;
    var sb = DL.supabase, esc = DL.escapeHtml;
    var LOBBY = 'dl-help-lobby';
    var KEY = 'dl_help_session_v1';
    var JITSI_DOMAIN = '8x8.vc';
    var APP_ID = 'vpaas-magic-cookie-f0a0399c162749f2805d91eef3967b80';

    var state = { sid: null, name: '', status: 'idle', agent: null, agentId: null, video: null };
    var lobby = null, session = null, agentsOnline = 0, boxes = [], bar = null, videoApi = null;
    var agentHere = false; // set by the agent's messages and presence join/leave

    function saved() { try { return JSON.parse(sessionStorage.getItem(KEY) || 'null'); } catch (e) { return null; } }
    function save() {
        try {
            if (state.sid) sessionStorage.setItem(KEY, JSON.stringify({ sid: state.sid, name: state.name, agent: state.agent, agentId: state.agentId, video: state.video }));
            else sessionStorage.removeItem(KEY);
        } catch (e) {}
    }
    function newSid() { return Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4); }
    function cartSummary() {
        var look = DL.cart.look();
        return { items: DL.cart.count(), lines: DL.cart.lines().length, look: look ? look.label : '' };
    }

    // ---------- styles ----------
    var css = document.createElement('style');
    css.textContent =
        '.dlh-box{border:1px solid rgba(212,175,55,.35);border-radius:12px;padding:14px 16px;margin-top:16px;background:rgba(212,175,55,.05)}' +
        '.dlh-box h3{margin:0 0 4px;font-size:16px}.dlh-box p{margin:0 0 10px;font-size:14px;line-height:1.5;color:rgba(255,255,255,.8)}' +
        '.dlh-dot{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:6px;background:#8a8a8a;vertical-align:1px}.dlh-dot.on{background:#5fbf77}' +
        '.dlh-status{font-size:13px;color:rgba(255,255,255,.75);margin-bottom:10px}' +
        '.dlh-form{display:flex;gap:8px;flex-wrap:wrap}.dlh-form input{flex:1 1 140px;min-width:0;padding:10px 12px;border-radius:8px;border:1px solid rgba(255,255,255,.2);background:rgba(0,0,0,.25);color:inherit;font:inherit}' +
        '.dlh-btn{padding:10px 16px;border-radius:999px;border:1px solid var(--gold,#d4af37);background:var(--gold,#d4af37);color:#111;font-weight:700;cursor:pointer;font:inherit;font-weight:700}' +
        '.dlh-btn.ghost{background:transparent;color:var(--gold,#d4af37)}.dlh-btn:disabled{opacity:.5;cursor:default}' +
        '.dlh-bar{position:fixed;left:0;right:0;margin:0 auto;width:fit-content;bottom:16px;z-index:900;display:flex;align-items:center;gap:12px;flex-wrap:wrap;justify-content:center;' +
        'max-width:calc(100% - 24px);padding:10px 12px 10px 18px;border-radius:999px;background:#151515;border:1px solid var(--gold,#d4af37);box-shadow:0 8px 30px rgba(0,0,0,.5);font-size:14px;color:#f5f1ea}' +
        '.dlh-bar .dlh-btn{padding:7px 14px;font-size:13px}' +
        '.dlh-toast{position:fixed;left:0;right:0;margin:0 auto;width:fit-content;bottom:84px;z-index:901;background:#f5f1ea;color:#111;padding:10px 16px;border-radius:10px;font-size:14px;box-shadow:0 8px 30px rgba(0,0,0,.4);max-width:calc(100% - 24px)}' +
        '.dlh-video{position:fixed;right:16px;bottom:84px;z-index:899;width:min(420px,calc(100% - 32px));height:min(300px,45vh);border-radius:14px;overflow:hidden;border:1px solid var(--gold,#d4af37);background:#000;box-shadow:0 10px 40px rgba(0,0,0,.6)}' +
        '.dlh-video>iframe{position:absolute;inset:0;width:100%!important;height:100%!important;border:0}' +
        '.dlh-video .dlh-x{position:absolute;top:6px;right:6px;z-index:2;background:rgba(0,0,0,.6);color:#fff;border:0;border-radius:999px;width:30px;height:30px;cursor:pointer;font-size:16px}' +
        '.dlh-bar>span{white-space:nowrap}' +
        '@media (max-width:600px){.dlh-bar{border-radius:14px;bottom:10px}.dlh-toast{bottom:auto;top:12px}.dlh-video{left:8px;right:8px;width:auto;bottom:auto;top:8px;height:38vh}}';
    document.head.appendChild(css);

    function toast(msg) {
        var t = document.createElement('div');
        t.className = 'dlh-toast'; t.setAttribute('role', 'status'); t.textContent = msg;
        document.body.appendChild(t);
        setTimeout(function () { t.remove(); }, 4500);
    }

    // ---------- lobby: agents online, and waiting ----------
    function joinLobby() {
        if (lobby) return lobby;
        // One presence key per page view; a help request is the tracked payload (with its sid).
        lobby = sb.channel(LOBBY, { config: { presence: { key: 'visitor-' + newSid() } } });
        lobby.on('presence', { event: 'sync' }, function () {
            var st = lobby.presenceState();
            agentsOnline = Object.keys(st).filter(function (k) { return k.indexOf('agent-') === 0; }).length;
            paint();
        });
        lobby.subscribe(function (s) { if (s === 'SUBSCRIBED' && state.status === 'waiting') trackWaiting(); });
        return lobby;
    }
    function trackWaiting() {
        if (!lobby || state.status !== 'waiting') return;
        var sum = cartSummary();
        lobby.track({ role: 'customer', sid: state.sid, name: state.name || 'Customer', items: sum.items, look: sum.look, since: state.since || Date.now() });
    }

    // ---------- session ----------
    function joinSession() {
        if (session) return;
        session = sb.channel('dl-help-s-' + state.sid, { config: { broadcast: { self: false }, presence: { key: 'customer' } } });
        session.on('broadcast', { event: 'accept' }, function (m) {
            var p = m.payload || {};
            if (state.agentId && state.agentId !== p.agentId) { send('taken', { agentId: p.agentId, by: state.agent }); return; }
            var first = !state.agentId;
            state.agentId = p.agentId; state.agent = p.agentName || 'Design Lab';
            state.status = 'connected'; agentHere = true; save();
            if (lobby) lobby.untrack();
            send('accepted', { agentId: p.agentId, name: state.name });
            sendCart();
            if (first) toast(state.agent + ' from Design Lab is here. They can see your cart now.');
            paint();
        });
        session.on('broadcast', { event: 'hello' }, function () { if (state.agentId) sendCart(); });
        session.on('broadcast', { event: 'op' }, function (m) { agentHere = true; applyOp(m.payload || {}); });
        session.on('broadcast', { event: 'video' }, function (m) {
            state.video = (m.payload || {}).room || null; save();
            if (state.video) toast(state.agent + ' invited you to a video call.');
            else closeVideo();
            paint();
        });
        session.on('broadcast', { event: 'end' }, function () { finish(state.agent + ' ended the session. Your cart is just as you left it.'); });
        session.on('presence', { event: 'join' }, function (e) { if (e.key === 'agent') { agentHere = true; paint(); } });
        session.on('presence', { event: 'leave' }, function (e) {
            if (e.key === 'agent' && !session.presenceState().agent) { agentHere = false; paint(); }
        });
        session.subscribe(function (s) {
            if (s !== 'SUBSCRIBED') return;
            session.track({ role: 'customer', name: state.name });
            if (state.agentId) { send('back', {}); sendCart(); }
        });
    }
    function send(event, payload) { if (session) session.send({ type: 'broadcast', event: event, payload: payload }); }
    function sendCart() {
        if (!session || !state.agentId) return;
        send('cart', { lines: DL.cart.lines(), look: DL.cart.look(), name: state.name, page: location.pathname });
    }
    function agentOnline() { return !!session && agentHere; }

    // An agent's edit, through the same cart functions the customer uses.
    function applyOp(o) {
        var who = state.agent || 'Your agent';
        var line = o.id && DL.cart.lines().filter(function (l) { return l.id === o.id; })[0];
        var name = function (l) { return (l && l.display && l.display.title) || 'an item'; };
        if (o.op === 'qty' && line) {
            DL.cart.setQuantity(o.id, o.qty);
            toast(who + ' changed ' + name(line) + ' to ' + Math.max(1, o.qty | 0) + '.');
        } else if (o.op === 'remove' && line) {
            DL.cart.remove(o.id);
            toast(who + ' removed ' + name(line) + '.');
        } else if (o.op === 'add' && o.line) {
            if (DL.cart.add(o.line)) toast(who + ' added ' + (o.line.quantity || 1) + ' × ' + name(o.line) + '.');
            else send('op-result', { ok: false, reason: 'That item is in a different finish than the cart.' });
        }
    }

    function request(name) {
        state.sid = newSid(); state.name = (name || '').trim().slice(0, 40); state.status = 'waiting'; state.since = Date.now();
        state.agent = state.agentId = state.video = null;
        save();
        joinLobby(); trackWaiting(); joinSession(); paint();
    }
    function finish(msg) {
        if (session) {
            // Let the goodbye go out before the channel closes.
            var ch = session; session = null;
            ch.send({ type: 'broadcast', event: 'end', payload: {} });
            setTimeout(function () { sb.removeChannel(ch); }, 400);
        }
        if (lobby) {
            // Tell agents right away; presence catches up a few seconds later.
            if (state.status === 'waiting') lobby.send({ type: 'broadcast', event: 'gone', payload: { sid: state.sid } });
            lobby.untrack();
        }
        closeVideo();
        state = { sid: null, name: state.name, status: 'idle', agent: null, agentId: null, video: null };
        save(); paint();
        if (msg) toast(msg);
    }

    // ---------- video, docked on the page ----------
    function openVideo() {
        if (!state.video || document.querySelector('.dlh-video')) return;
        var box = document.createElement('div');
        box.className = 'dlh-video';
        box.innerHTML = '<button class="dlh-x" type="button" aria-label="Leave video call">✕</button>';
        document.body.appendChild(box);
        box.querySelector('.dlh-x').addEventListener('click', closeVideo);
        function start() {
            videoApi = new JitsiMeetExternalAPI(JITSI_DOMAIN, {
                roomName: APP_ID + '/' + state.video, parentNode: box, width: '100%', height: '100%',
                userInfo: { displayName: state.name || 'Customer' },
                configOverwrite: { prejoinPageEnabled: false, prejoinConfig: { enabled: false }, disableInviteFunctions: true },
                interfaceConfigOverwrite: { DISABLE_INVITE_FUNCTIONS: true }
            });
            videoApi.addEventListener('readyToClose', closeVideo);
        }
        if (window.JitsiMeetExternalAPI) start();
        else {
            var s = document.createElement('script');
            s.src = 'https://' + JITSI_DOMAIN + '/' + APP_ID + '/external_api.js';
            s.onload = start;
            s.onerror = function () { box.remove(); toast('Could not reach the video service.'); };
            document.body.appendChild(s);
        }
    }
    function closeVideo() {
        if (videoApi) { try { videoApi.dispose(); } catch (e) {} videoApi = null; }
        var box = document.querySelector('.dlh-video');
        if (box) box.remove();
    }

    // ---------- UI ----------
    function boxHtml() {
        if (state.status === 'waiting') {
            return '<h3>Connecting you…</h3><p>You\'re in line for a Design Lab agent. Keep this page open; they\'ll see your cart as soon as they join.</p>';
        }
        if (state.status === 'connected') {
            return '<h3>Connected with ' + esc(state.agent) + '</h3><p>They can see your cart and make changes with you. Every change shows up here right away.</p>';
        }
        var on = agentsOnline > 0;
        return '<h3>Want a hand with your order?</h3>' +
            '<p>A Design Lab agent can look at your cart with you, live, and fix anything that\'s missing. Add a video call if it helps.</p>' +
            '<div class="dlh-status"><span class="dlh-dot' + (on ? ' on' : '') + '"></span>' +
            (on ? 'An agent is available now' : 'No agents online right now. You can still ask; someone will pick it up when they\'re back.') + '</div>' +
            '<form class="dlh-form" data-dlh-request><label class="sr-only" for="dlh-name">Your first name</label>' +
            '<input id="dlh-name" name="name" placeholder="Your first name" autocomplete="given-name" value="' + esc(state.name || '') + '">' +
            '<button class="dlh-btn" type="submit">Get live help</button></form>';
    }
    function paint() {
        boxes.forEach(function (el) {
            el.innerHTML = boxHtml();
            var f = el.querySelector('[data-dlh-request]');
            if (f) f.addEventListener('submit', function (e) { e.preventDefault(); request(f.elements.name.value); });
        });
        if (state.status === 'idle') { if (bar) { bar.remove(); bar = null; } return; }
        if (!bar) { bar = document.createElement('div'); bar.className = 'dlh-bar'; bar.setAttribute('role', 'status'); document.body.appendChild(bar); }
        var html;
        if (state.status === 'waiting') {
            html = '<span><span class="dlh-dot' + (agentsOnline ? ' on' : '') + '"></span>Waiting for a Design Lab agent…</span>' +
                '<button class="dlh-btn ghost" type="button" data-dlh-end>Cancel</button>';
        } else {
            var here = agentOnline();
            html = '<span><span class="dlh-dot' + (here ? ' on' : '') + '"></span>' + (here ? esc(state.agent) + ' can see your cart' : esc(state.agent) + ' stepped away…') + '</span>' +
                (state.video && !document.querySelector('.dlh-video') ? '<button class="dlh-btn" type="button" data-dlh-video>Join video call</button>' : '') +
                '<button class="dlh-btn ghost" type="button" data-dlh-end>End</button>';
        }
        bar.innerHTML = html;
        var end = bar.querySelector('[data-dlh-end]');
        if (end) end.addEventListener('click', function () { finish(state.status === 'waiting' ? 'Help request cancelled.' : 'Session ended. Your cart is just as you left it.'); });
        var v = bar.querySelector('[data-dlh-video]');
        if (v) v.addEventListener('click', function () { openVideo(); paint(); });
    }

    DL.cart.onChange(function () {
        if (state.status === 'connected') sendCart();
        else if (state.status === 'waiting') trackWaiting();
    });

    DL.help = {
        mount: function (el) { if (el && boxes.indexOf(el) < 0) { boxes.push(el); joinLobby(); paint(); } }
    };

    // Pick an open session back up after a reload or a page change.
    var s = saved();
    if (s && s.sid) {
        state.sid = s.sid; state.name = s.name || ''; state.agent = s.agent; state.agentId = s.agentId; state.video = s.video;
        state.status = s.agentId ? 'connected' : 'waiting'; state.since = Date.now(); agentHere = !!s.agentId;
        joinLobby(); joinSession(); paint();
    }
})();
