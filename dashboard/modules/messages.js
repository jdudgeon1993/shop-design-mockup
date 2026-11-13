// Messages: what visitors send from the storefront's Connect page (/connect/).
// Table public.contact_messages (database/migrations/0031_contact_messages.sql). Employees read
// them and mark them handled; the badge counts new ones.
DLDash.register({
    id: 'messages', label: 'Messages', order: 55,
    icon: '<path d="M4 5h16v11H8l-4 4z"/><path d="M8 9h8M8 12h5"/>',
    mount: function (el, ctx) {
        var esc = ctx.esc, rows = [], filter = 'new', missing = false;
        var TOPIC = { project: 'Start a project', designer: 'Video call with a designer', samples: 'Door samples', order: 'An order', other: 'Something else' };
        el.innerHTML =
            '<section class="card"><div class="card-head"><div class="toolbar" style="flex:1;gap:8px">' +
                '<button class="btn btn-sm" type="button" data-f="new" aria-pressed="true">New</button>' +
                '<button class="btn btn-sm" type="button" data-f="handled" aria-pressed="false">Handled</button>' +
                '<button class="btn btn-sm" type="button" data-f="all" aria-pressed="false">All</button></div>' +
                '<button class="btn btn-sm" id="ms-csv" type="button">Export CSV</button></div>' +
                '<div id="ms-list"></div><p class="empty-state" id="ms-empty" hidden></p></section>';
        function list() { return rows.filter(function (r) { return filter === 'all' || r.status === filter; }); }
        function paint() {
            var l = list();
            el.querySelector('#ms-list').innerHTML = l.map(function (r) {
                var reach = r.prefer === 'phone' && r.phone ? 'Call ' + r.phone : 'Email ' + r.email;
                return '<article style="padding:16px 20px;border-top:1px solid var(--line, rgba(0,0,0,.08));display:grid;gap:6px">' +
                    '<div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:space-between">' +
                        '<div><b>' + esc(r.name) + '</b> <span class="muted small">' + esc(r.role) + ' · ' + esc(ctx.timeAgo ? ctx.timeAgo(r.created_at) : ctx.fmtDate(r.created_at)) + '</span></div>' +
                        '<span class="pill ' + (r.status === 'new' ? 'gold' : 'ok') + '">' + (r.status === 'new' ? 'New' : 'Handled') + '</span></div>' +
                    '<div class="small"><span class="pill info">' + esc(TOPIC[r.topic] || r.topic) + '</span> <span class="muted">Prefers: ' + esc(reach) + '</span></div>' +
                    '<p style="margin:4px 0;white-space:pre-wrap;overflow-wrap:anywhere">' + esc(r.message) + '</p>' +
                    '<div style="display:flex;flex-wrap:wrap;gap:8px">' +
                        '<a class="btn btn-sm" href="mailto:' + encodeURIComponent(r.email) + '?subject=' + encodeURIComponent('Your message to Design Lab') + '">Reply by email</a>' +
                        (r.phone ? '<a class="btn btn-sm" href="tel:' + esc(r.phone.replace(/[^\d+]/g, '')) + '">Call ' + esc(r.phone) + '</a>' : '') +
                        '<button class="btn btn-sm" type="button" data-toggle="' + r.id + '">' + (r.status === 'new' ? 'Mark handled' : 'Mark as new') + '</button>' +
                    '</div></article>';
            }).join('');
            var empty = el.querySelector('#ms-empty');
            empty.hidden = l.length > 0;
            empty.textContent = missing ? 'Messages aren’t switched on yet (the database table hasn’t been added).' :
                filter === 'new' ? 'No new messages. Messages from the Connect page show up here.' : 'Nothing here.';
            ctx.setBadge('messages', rows.filter(function (r) { return r.status === 'new'; }).length);
        }
        el.querySelectorAll('[data-f]').forEach(function (b) {
            b.addEventListener('click', function () {
                filter = b.dataset.f;
                el.querySelectorAll('[data-f]').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
                paint();
            });
        });
        el.addEventListener('click', function (e) {
            var b = e.target.closest('[data-toggle]');
            if (!b) return;
            var r = rows.filter(function (x) { return String(x.id) === b.dataset.toggle; })[0];
            if (!r) return;
            var next = r.status === 'new' ? 'handled' : 'new';
            b.disabled = true;
            ctx.sb.from('contact_messages').update({ status: next, handled_at: next === 'handled' ? new Date().toISOString() : null }).eq('id', r.id).then(function (res) {
                b.disabled = false;
                if (res.error) { ctx.toast('Couldn’t update that message. Try again.', 'bad'); return; }
                r.status = next; paint();
            });
        });
        el.querySelector('#ms-csv').addEventListener('click', function () {
            ctx.csv([['Received', 'Name', 'Email', 'Phone', 'Role', 'Topic', 'Prefers', 'Status', 'Message']].concat(list().map(function (r) {
                return [r.created_at, r.name, r.email, r.phone || '', r.role, TOPIC[r.topic] || r.topic, r.prefer, r.status, r.message];
            })), 'design-lab-messages.csv');
        });
        function load() {
            return ctx.sb.from('contact_messages').select('id,name,email,phone,role,topic,message,prefer,status,created_at').order('created_at', { ascending: false }).limit(1000)
                .then(function (r) { missing = !!(r.error && /relation|does not exist|schema cache/i.test(r.error.message || '')); rows = r.data || []; paint(); });
        }
        load();
        return { show: load };
    }
});
