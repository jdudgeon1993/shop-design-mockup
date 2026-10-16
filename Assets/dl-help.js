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
    if (!window.DL || !DL.supabase || DL.agentMode) return; // not inside the Help Desk catalog
    var sb = DL.supabase, esc = DL.escapeHtml;
    var LOBBY = 'dl-help-lobby';
    var KEY = 'dl_help_session_v1';
    var JITSI_DOMAIN = '8x8.vc';
    var APP_ID = 'vpaas-magic-cookie-f0a0399c162749f2805d91eef3967b80';

    var state = { sid: null, name: '', topic: '', status: 'idle', agent: null, agentId: null, video: null, msgs: [] };
    var chatOpen = false, unread = 0;
    var lobby = null, session = null, agentsOnline = 0, boxes = [], bar = null, videoApi = null;
    var agentHere = false; // set by the agent's messages and presence join/leave

    function saved() { try { return JSON.parse(sessionStorage.getItem(KEY) || 'null'); } catch (e) { return null; } }
    function save() {
        try {
            if (state.sid) sessionStorage.setItem(KEY, JSON.stringify({ sid: state.sid, name: state.name, topic: state.topic, agent: state.agent, agentId: state.agentId, video: state.video, msgs: state.msgs.slice(-60) }));
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
        '.dlh-form textarea{flex:1 1 100%;min-height:58px;padding:10px 12px;border-radius:8px;border:1px solid rgba(255,255,255,.2);background:rgba(0,0,0,.25);color:inherit;font:inherit;resize:vertical}' +
        '.dlh-badge{display:inline-block;min-width:18px;padding:0 5px;margin-left:6px;border-radius:999px;background:#e5534b;color:#fff;font-size:11px;line-height:18px;text-align:center}' +
        '.dlh-chat{position:fixed;right:16px;bottom:84px;z-index:902;width:min(360px,calc(100% - 32px));height:min(440px,60vh);display:flex;flex-direction:column;border-radius:14px;overflow:hidden;' +
        'background:#151515;border:1px solid var(--gold,#d4af37);box-shadow:0 10px 40px rgba(0,0,0,.6);color:#f5f1ea;font-size:14px}' +
        '.dlh-chat header{display:flex;align-items:center;justify-content:space-between;padding:10px 12px;border-bottom:1px solid rgba(255,255,255,.12);font-weight:700}' +
        '.dlh-chat header button{background:none;border:0;color:inherit;font-size:18px;cursor:pointer}' +
        '.dlh-msgs{flex:1;overflow:auto;padding:12px;display:flex;flex-direction:column;gap:8px}' +
        '.dlh-msg{max-width:85%;padding:8px 11px;border-radius:12px;line-height:1.4;white-space:pre-wrap;word-wrap:break-word}' +
        '.dlh-msg.me{align-self:flex-end;background:var(--gold,#d4af37);color:#111;border-bottom-right-radius:4px}' +
        '.dlh-msg.them{align-self:flex-start;background:#2a2a2a;border-bottom-left-radius:4px}' +
        '.dlh-msg small{display:block;font-size:11px;opacity:.65;margin-top:2px}' +
        '.dlh-chat form{display:flex;gap:6px;padding:10px;border-top:1px solid rgba(255,255,255,.12)}' +
        '.dlh-chat input{flex:1;min-width:0;padding:9px 11px;border-radius:999px;border:1px solid rgba(255,255,255,.2);background:rgba(0,0,0,.3);color:inherit;font:inherit}' +
        '.dlh-video.with-chat{right:392px}@media (max-width:900px){.dlh-video.with-chat{right:16px;bottom:540px}}' +
        '@media (max-width:600px){.dlh-bar{border-radius:14px;bottom:10px}.dlh-toast{bottom:auto;top:12px}.dlh-chat{left:8px;right:8px;width:auto;bottom:76px;height:52vh}.dlh-video{left:8px;right:8px;width:auto;bottom:auto;top:8px;height:38vh}}';
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
        lobby.track({ role: 'customer', sid: state.sid, name: state.name || 'Customer', topic: state.topic || '', items: sum.items, look: sum.look, since: state.since || Date.now() });
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
            send('accepted', { agentId: p.agentId, name: state.name, msgs: state.msgs });
            sendCart();
            if (first) toast(state.agent + ' from Design Lab is here. They can see your cart now.');
            paint();
        });
        session.on('broadcast', { event: 'hello' }, function () { if (state.agentId) sendCart(); });
        session.on('broadcast', { event: 'op' }, function (m) { agentHere = true; applyOp(m.payload || {}); });
        session.on('broadcast', { event: 'msg' }, function (m) {
            var text = String((m.payload || {}).text || '').slice(0, 1000);
            if (!text) return;
            agentHere = true;
            state.msgs.push({ from: 'them', text: text, at: Date.now() }); save();
            if (!chatOpen) { unread++; toast(state.agent + ': ' + (text.length > 90 ? text.slice(0, 90) + '…' : text)); }
            paint(); paintChat();
        });
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

    function request(name, topic) {
        state.sid = newSid(); state.name = (name || '').trim().slice(0, 40); state.status = 'waiting'; state.since = Date.now();
        state.topic = (topic || '').trim().slice(0, 300);
        state.msgs = state.topic ? [{ from: 'me', text: state.topic, at: Date.now() }] : [];
        state.agent = state.agentId = state.video = null; unread = 0;
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
        closeVideo(); closeChat();
        state = { sid: null, name: state.name, topic: '', status: 'idle', agent: null, agentId: null, video: null, msgs: [] };
        save(); paint();
        if (msg) toast(msg);
    }

    // ---------- video, docked on the page ----------
    function openVideo() {
        if (!state.video || document.querySelector('.dlh-video')) return;
        var box = document.createElement('div');
        box.className = 'dlh-video';
        box.innerHTML = '<button class="dlh-x" type="button" aria-label="Leave video call">✕</button>';
        if (chatOpen) box.classList.add('with-chat');
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

    // ---------- chat ----------
    function openChat() {
        chatOpen = true; unread = 0;
        var box = document.querySelector('.dlh-chat');
        if (!box) {
            box = document.createElement('section');
            box.className = 'dlh-chat'; box.setAttribute('aria-label', 'Chat with Design Lab');
            box.innerHTML = '<header><span></span><button type="button" aria-label="Close chat">✕</button></header>' +
                '<div class="dlh-msgs" aria-live="polite"></div>' +
                '<form><label class="sr-only" for="dlh-chat-in">Message</label><input id="dlh-chat-in" autocomplete="off" maxlength="1000" placeholder="Type a message…">' +
                '<button class="dlh-btn" type="submit">Send</button></form>';
            document.body.appendChild(box);
            box.querySelector('header button').addEventListener('click', closeChat);
            box.querySelector('form').addEventListener('submit', function (e) {
                e.preventDefault();
                var inp = box.querySelector('input'), text = inp.value.trim();
                if (!text) return;
                state.msgs.push({ from: 'me', text: text, at: Date.now() }); save();
                send('msg', { text: text });
                inp.value = '';
                paintChat();
            });
        }
        var v = document.querySelector('.dlh-video'); if (v) v.classList.add('with-chat');
        paintChat(); paint();
        box.querySelector('input').focus();
    }
    function closeChat() {
        chatOpen = false;
        var box = document.querySelector('.dlh-chat'); if (box) box.remove();
        var v = document.querySelector('.dlh-video'); if (v) v.classList.remove('with-chat');
        if (bar) paint();
    }
    // Keep the chat just above the bar, however tall the bar wraps on a phone.
    function placeChat() {
        var box = document.querySelector('.dlh-chat');
        if (!box || !bar) return;
        var h = bar.getBoundingClientRect().height;
        box.style.bottom = Math.round(h + 26) + 'px';
        box.style.maxHeight = 'calc(100vh - ' + Math.round(h + 26 + 16) + 'px)';
    }
    window.addEventListener('resize', placeChat);
    function paintChat() {
        var box = document.querySelector('.dlh-chat');
        if (!box) return;
        placeChat();
        box.querySelector('header span').textContent = state.agent ? 'Chat with ' + state.agent : 'Chat with Design Lab';
        var list = box.querySelector('.dlh-msgs');
        list.innerHTML = state.msgs.length ? state.msgs.map(function (m) {
            return '<div class="dlh-msg ' + (m.from === 'me' ? 'me' : 'them') + '">' + esc(m.text) +
                '<small>' + new Date(m.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) + '</small></div>';
        }).join('') : '<p style="margin:auto;opacity:.6;text-align:center">Ask anything. Your agent sees it right away.</p>';
        list.scrollTop = list.scrollHeight;
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
            '<label class="sr-only" for="dlh-topic">What do you need help with?</label>' +
            '<textarea id="dlh-topic" name="topic" maxlength="300" placeholder="What do you need help with? (optional) e.g. I can\'t find the trim piece"></textarea>' +
            '<button class="dlh-btn" type="submit">Get live help</button></form>';
    }
    function paint() {
        boxes.forEach(function (el) {
            el.innerHTML = boxHtml();
            var f = el.querySelector('[data-dlh-request]');
            if (f) f.addEventListener('submit', function (e) { e.preventDefault(); request(f.elements.name.value, f.elements.topic.value); });
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
                '<button class="dlh-btn ghost" type="button" data-dlh-chat>' + (chatOpen ? 'Hide chat' : 'Chat') + (unread ? '<span class="dlh-badge">' + unread + '</span>' : '') + '</button>' +
                (state.video && !document.querySelector('.dlh-video') ? '<button class="dlh-btn" type="button" data-dlh-video>Join video call</button>' : '') +
                '<button class="dlh-btn ghost" type="button" data-dlh-end>End</button>';
        }
        bar.innerHTML = html;
        var end = bar.querySelector('[data-dlh-end]');
        if (end) end.addEventListener('click', function () { finish(state.status === 'waiting' ? 'Help request cancelled.' : 'Session ended. Your cart is just as you left it.'); });
        var c = bar.querySelector('[data-dlh-chat]');
        if (c) c.addEventListener('click', function () { if (chatOpen) closeChat(); else openChat(); });
        var v = bar.querySelector('[data-dlh-video]');
        if (v) v.addEventListener('click', function () { openVideo(); paint(); });
        placeChat();
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
        state.sid = s.sid; state.name = s.name || ''; state.topic = s.topic || ''; state.agent = s.agent; state.agentId = s.agentId; state.video = s.video;
        state.msgs = Array.isArray(s.msgs) ? s.msgs : [];
        state.status = s.agentId ? 'connected' : 'waiting'; state.since = Date.now(); agentHere = !!s.agentId;
        joinLobby(); joinSession(); paint();
    }
})();
