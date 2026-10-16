// Overview: today at a glance, what needs attention, and recent activity.
DLDash.register({
    id: 'overview', label: 'Overview', order: 10,
    icon: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
    mount: function (el, ctx) {
        var esc = ctx.esc, live = { waiting: [], agents: [] };
        el.innerHTML =
            '<section class="card card-pad" style="display:flex;flex-wrap:wrap;gap:12px 20px;align-items:center">' +
                '<div><p class="kicker" id="ov-date"></p><h2 style="margin:0;font-size:22px" id="ov-hello"></h2></div><span class="sp"></span>' +
                '<div class="toolbar"><a class="btn" href="#video">Start a video call</a><a class="btn" href="#live-help">Live help</a><a class="btn btn-primary" href="#orders/status-submitted">New orders</a></div>' +
            '</section>' +
            '<div class="kpis" id="ov-kpis"></div>' +
            '<div class="grid grid-2">' +
                '<section class="card"><div class="card-head"><h2>Orders by status</h2><span class="sp"></span><a class="small" href="#orders">All orders →</a></div><div class="card-body bars" id="ov-status"></div></section>' +
                '<section class="card"><div class="card-head"><h2>Recent activity</h2></div><ul class="list" id="ov-activity"></ul></section>' +
            '</div>';
        var data = { orders: [], rooms: [], signups: [] };

        function hello() {
            var h = new Date().getHours();
            el.querySelector('#ov-hello').textContent = (h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening') + ', ' + ctx.firstName;
            el.querySelector('#ov-date').textContent = new Date().toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
        }
        function load() {
            hello();
            return Promise.all([
                ctx.sb.from('orders').select('order_number,status,contact_name,created_at,subtotal').order('created_at', { ascending: false }).limit(500),
                ctx.sb.from('consultation_rooms').select('id,room_name,created_at').order('created_at', { ascending: false }).limit(50),
                ctx.sb.from('launch_signups').select('email,line,created_at').order('created_at', { ascending: false }).limit(500)
            ]).then(function (r) {
                data = { orders: r[0].data || [], rooms: r[1].data || [], signups: r[2].data || [] };
                paint();
            });
        }
        function paint() {
            var week = Date.now() - 7 * 86400000;
            var o = data.orders, fresh = o.filter(function (x) { return x.status === 'submitted'; }).length;
            var thisWeek = o.filter(function (x) { return new Date(x.created_at).getTime() > week; }).length;
            var open = o.filter(function (x) { return x.status !== 'completed' && x.status !== 'cancelled'; }).length;
            var suWeek = data.signups.filter(function (x) { return new Date(x.created_at).getTime() > week; }).length;
            var w = live.waiting.length;
            el.querySelector('#ov-kpis').innerHTML = [
                kpi('#live-help', 'Waiting for help', w, w ? 'Someone needs you now' : live.agents.length + ' agent' + (live.agents.length === 1 ? '' : 's') + ' available', w > 0),
                kpi('#orders/status-submitted', 'New orders', fresh, fresh ? 'Ready to review' : 'All caught up', fresh > 0),
                kpi('#orders', 'Open orders', open, thisWeek + ' this week'),
                kpi('#video', 'Video rooms', data.rooms.length, data.rooms[0] ? 'Last ' + ctx.timeAgo(data.rooms[0].created_at) : 'None yet'),
                kpi('#signups', 'Launch sign-ups', data.signups.length, '+' + suWeek + ' this week')
            ].join('');
            var max = 1, counts = {};
            o.forEach(function (x) { counts[x.status] = (counts[x.status] || 0) + 1; });
            ctx.STATUS.forEach(function (s) { max = Math.max(max, counts[s.key] || 0); });
            el.querySelector('#ov-status').innerHTML = o.length ? ctx.STATUS.map(function (s) {
                var n = counts[s.key] || 0;
                return '<a class="bar-row" href="#orders/status-' + s.key + '"><span>' + esc(s.label) + '</span><span class="bar"><i style="width:' + (n / max * 100) +
                    '%"></i></span><strong class="r">' + n + '</strong></a>';
            }).join('') : '<p class="muted" style="margin:0">No orders yet. Submitted carts show up here.</p>';
            var feed = []
                .concat(o.slice(0, 8).map(function (x) { return { at: x.created_at, t: 'Order #' + x.order_number + ' · ' + x.contact_name, d: (ctx.statusOf[x.status] || {}).label, href: '#orders/' + x.order_number }; }))
                .concat(data.signups.slice(0, 5).map(function (x) { return { at: x.created_at, t: 'Launch sign-up', d: x.email, href: '#signups' }; }))
                .concat(data.rooms.slice(0, 5).map(function (x) { return { at: x.created_at, t: 'Video room: ' + x.room_name.replace(/^dl-/, '').replace(/-/g, ' '), d: 'Created', href: '#video' }; }))
                .sort(function (a, b) { return a.at < b.at ? 1 : -1; }).slice(0, 10);
            el.querySelector('#ov-activity').innerHTML = feed.length ? feed.map(function (f) {
                return '<li><div class="grow"><a class="t" href="' + f.href + '" style="color:var(--ink);text-decoration:none">' + esc(f.t) + '</a><div class="d">' + esc(f.d || '') + '</div></div><span class="muted small">' + esc(ctx.timeAgo(f.at)) + '</span></li>';
            }).join('') : '<li class="empty-state">Nothing yet.</li>';
        }
        function kpi(href, k, v, s, alert) {
            return '<a class="kpi' + (alert ? ' alert' : '') + '" href="' + href + '"><div class="k">' + esc(k) + '</div><div class="v">' + v + '</div><div class="s">' + esc(s) + '</div></a>';
        }
        ctx.lobby.onChange(function (l) { live = l; if (data) paint(); });
        ctx.orders.onChange(function () { if (!el.hidden) load(); });
        return { show: load };
    }
});
