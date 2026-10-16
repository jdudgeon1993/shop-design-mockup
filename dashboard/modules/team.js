// Team: who's on the team, who's available for live help right now, and the shared
// team calendar (restricted to Design Lab Google accounts).
DLDash.register({
    id: 'team', label: 'Team', order: 70,
    icon: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6 6 0 0 1 3.5 6"/>',
    mount: function (el, ctx) {
        var esc = ctx.esc, people = [], live = { agents: [] };
        el.innerHTML =
            '<section class="card"><div class="card-head"><h2>Team</h2><span class="sp"></span><span class="muted small" id="tm-live"></span></div><ul class="list" id="tm-list"></ul></section>' +
            '<section class="card"><div class="card-head"><h2>Team calendar</h2></div><div class="card-body">' +
                '<iframe id="tm-cal" title="Design Lab team calendar" style="width:100%;height:560px;border:0;border-radius:8px;background:#fff"></iframe>' +
                '<p class="muted small" style="margin:10px 0 0">Shown with your Design Lab Google account. If it looks empty, sign into that account (not a personal one) in this browser.</p>' +
            '</div></section>';
        function paint() {
            var here = {}; live.agents.forEach(function (a) { if (a.uid) here[a.uid] = true; here[(a.name || '').toLowerCase()] = true; });
            el.querySelector('#tm-live').textContent = live.agents.length + ' available for live help';
            el.querySelector('#tm-list').innerHTML = people.length ? people.map(function (p) {
                var name = p.full_name || 'Team member', first = name.split(' ')[0].toLowerCase(), on = here[p.id] || here[first];
                return '<li><span class="avatar">' + esc(ctx.initials(name)) + '</span><div class="grow"><div class="t">' + esc(name) + (p.id === ctx.user.id ? ' <span class="muted small">(you)</span>' : '') + '</div>' +
                    '<div class="d">' + esc(p.role === 'admin' ? 'Admin' : 'Team') + (p.phone ? ' · ' + esc(p.phone) : '') + '</div></div>' +
                    '<span class="pill ' + (on ? 'ok' : '') + '"><span class="dot' + (on ? ' on' : '') + '"></span>' + (on ? 'Available' : 'Away') + '</span></li>';
            }).join('') : '<li class="empty-state">No team members found.</li>';
        }
        ctx.lobby.onChange(function (l) { live = l; paint(); });
        var calLoaded = false;
        return {
            show: function () {
                ctx.sb.from('profiles').select('id,full_name,role,phone').in('role', ['employee', 'admin']).order('full_name').then(function (r) { people = r.data || []; paint(); });
                if (!calLoaded) {
                    calLoaded = true;
                    el.querySelector('#tm-cal').src = 'https://calendar.google.com/calendar/embed?src=' + encodeURIComponent(ctx.CALENDAR_ID) + '&authuser=' + encodeURIComponent(ctx.user.email);
                }
            }
        };
    }
});
