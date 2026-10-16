// Video calls (8x8 JaaS). Employees get a moderator token from the Railway token
// service; customers join by invite link through the public /consultation/ page.
// The call runs inside this section and keeps going if you switch sections.
DLDash.register({
    id: 'video', label: 'Video Calls', order: 40,
    icon: '<rect x="2" y="6" width="14" height="12" rx="2"/><path d="m16 10 6-3v10l-6-3"/>',
    mount: function (el, ctx) {
        var esc = ctx.esc, api = null;
        el.innerHTML =
            '<div class="grid grid-2">' +
                '<section class="card"><div class="card-head"><h2>Start a call</h2></div><form class="card-body" id="vc-form" style="display:grid;gap:12px">' +
                    '<label class="field">Name the room<input id="vc-name" placeholder="e.g. Smith family kitchen" autocomplete="off" required></label>' +
                    '<p class="muted small" style="margin:0">You join as the host. Send the customer the invite link; they don\'t need an account.</p>' +
                    '<p class="form-error" id="vc-error" hidden></p>' +
                    '<div><button class="btn btn-primary" id="vc-start" type="submit">Start call</button></div>' +
                '</form></section>' +
                '<section class="card"><div class="card-head"><h2>Rooms</h2><span class="sp"></span><span class="muted small" id="vc-count"></span></div><ul class="list" id="vc-rooms"></ul></section>' +
            '</div>' +
            '<section class="card" id="vc-call" hidden><div class="card-head"><h2 id="vc-title">In a call</h2><span class="sp"></span>' +
                '<button class="btn btn-sm" id="vc-copy" type="button">Copy invite link</button><button class="btn btn-sm btn-danger" id="vc-leave" type="button">Leave call</button></div>' +
                '<div id="vc-frame" style="position:relative;height:min(72vh,720px);background:#000;border-radius:0 0 12px 12px;overflow:hidden"></div></section>';
        var room = null;

        function slugify(raw) {
            var s = raw.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
            return s ? 'dl-' + s : '';
        }
        function inviteUrl(name) {
            var u = new URL('/consultation/', location.origin); u.searchParams.set('room', name); return u.toString();
        }
        function loadRooms() {
            return ctx.sb.from('consultation_rooms').select('id,room_name,created_at,created_by,profiles(full_name)').order('created_at', { ascending: false }).limit(50)
                .then(function (r) {
                    var rows = r.data || [];
                    el.querySelector('#vc-count').textContent = rows.length + ' room' + (rows.length === 1 ? '' : 's');
                    el.querySelector('#vc-rooms').innerHTML = rows.length ? rows.map(function (x) {
                        var who = x.profiles && x.profiles.full_name ? x.profiles.full_name : 'Team';
                        return '<li data-room="' + esc(x.room_name) + '" data-id="' + x.id + '"><div class="grow"><div class="t">' + esc(x.room_name.replace(/^dl-/, '').replace(/-/g, ' ')) + '</div>' +
                            '<div class="d">' + esc(who) + ' · ' + esc(ctx.timeAgo(x.created_at)) + '</div></div>' +
                            '<button class="btn btn-sm" data-act="join">Join</button><button class="btn btn-sm" data-act="copy">Copy link</button>' +
                            '<button class="btn btn-sm btn-danger" data-act="delete" aria-label="Remove ' + esc(x.room_name) + '">Remove</button></li>';
                    }).join('') : '<li class="empty-state">No rooms yet. Start one.</li>';
                });
        }
        function token() {
            return ctx.sb.auth.getSession().then(function (r) {
                var s = r.data.session;
                if (!s) throw new Error('signed out');
                return fetch(ctx.TOKEN_ENDPOINT, { method: 'POST', headers: { Authorization: 'Bearer ' + s.access_token } });
            }).then(function (resp) { if (!resp.ok) throw new Error('token'); return resp.json(); }).then(function (b) { return b.jwt; });
        }
        function loadJitsi() {
            if (window.JitsiMeetExternalAPI) return Promise.resolve();
            return new Promise(function (ok, fail) {
                var s = document.createElement('script');
                s.src = 'https://' + ctx.JITSI_DOMAIN + '/' + ctx.APP_ID + '/external_api.js';
                s.onload = ok; s.onerror = fail; document.body.appendChild(s);
            });
        }
        function join(name) {
            if (api) leave();
            room = name;
            return Promise.all([token(), loadJitsi()]).then(function (r) {
                el.querySelector('#vc-call').hidden = false;
                el.querySelector('#vc-title').textContent = 'Call: ' + name.replace(/^dl-/, '').replace(/-/g, ' ');
                api = new JitsiMeetExternalAPI(ctx.JITSI_DOMAIN, {
                    roomName: ctx.APP_ID + '/' + name, parentNode: el.querySelector('#vc-frame'), width: '100%', height: '100%', jwt: r[0],
                    userInfo: { displayName: ctx.profile.full_name || ctx.firstName },
                    configOverwrite: { prejoinPageEnabled: false, prejoinConfig: { enabled: false }, disableInviteFunctions: true },
                    interfaceConfigOverwrite: { DISABLE_INVITE_FUNCTIONS: true }
                });
                api.addEventListener('readyToClose', leave);
                el.querySelector('#vc-call').scrollIntoView({ behavior: 'smooth' });
            }).catch(function () { ctx.toast('Could not start the video call. Try again in a moment.', 'bad'); room = null; });
        }
        function leave() {
            if (api) { try { api.dispose(); } catch (e) {} api = null; }
            el.querySelector('#vc-frame').innerHTML = '';
            el.querySelector('#vc-call').hidden = true;
            room = null;
        }

        el.querySelector('#vc-form').addEventListener('submit', function (e) {
            e.preventDefault();
            var name = slugify(el.querySelector('#vc-name').value), err = el.querySelector('#vc-error');
            err.hidden = true;
            if (!name) { err.textContent = 'Give the room a name.'; err.hidden = false; return; }
            var btn = el.querySelector('#vc-start'); btn.disabled = true; btn.textContent = 'Starting…';
            ctx.sb.from('consultation_rooms').insert({ room_name: name, created_by: ctx.user.id }).then(function () {
                el.querySelector('#vc-name').value = '';
                loadRooms();
                return join(name);
            }).finally(function () { btn.disabled = false; btn.textContent = 'Start call'; });
        });
        el.querySelector('#vc-rooms').addEventListener('click', function (e) {
            var b = e.target.closest('[data-act]'); if (!b) return;
            var li = b.closest('[data-room]'), name = li.dataset.room;
            if (b.dataset.act === 'join') join(name);
            if (b.dataset.act === 'copy') ctx.copy(inviteUrl(name), b);
            if (b.dataset.act === 'delete' && confirm('Remove "' + name + '" from the list? A call already in progress keeps going.')) {
                ctx.sb.from('consultation_rooms').delete().eq('id', li.dataset.id).then(loadRooms);
            }
        });
        el.querySelector('#vc-copy').addEventListener('click', function (e) { if (room) ctx.copy(inviteUrl(room), e.target); });
        el.querySelector('#vc-leave').addEventListener('click', leave);
        return { show: loadRooms };
    }
});
