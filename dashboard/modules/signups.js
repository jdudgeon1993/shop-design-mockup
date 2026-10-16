// Launch sign-ups: people who asked to hear when a line launches (launch_signups).
DLDash.register({
    id: 'signups', label: 'Sign-ups', order: 60,
    icon: '<path d="M4 4h16v16H4z"/><path d="m4 7 8 6 8-6"/>',
    mount: function (el, ctx) {
        var esc = ctx.esc, rows = [], query = '';
        el.innerHTML =
            '<section class="card"><div class="card-head"><div class="toolbar" style="flex:1"><label class="sr-only" for="su-q">Search</label>' +
                '<input class="input" id="su-q" type="search" placeholder="Search email"></div>' +
                '<button class="btn btn-sm" id="su-copy" type="button">Copy emails</button><button class="btn btn-sm" id="su-csv" type="button">Export CSV</button></div>' +
                '<div class="table-wrap"><table class="table"><thead><tr><th>Email</th><th>Line</th><th>Where</th><th>Signed up</th></tr></thead><tbody id="su-rows"></tbody></table></div>' +
                '<p class="empty-state" id="su-empty" hidden></p></section>';
        function list() { return rows.filter(function (r) { return !query || (r.email || '').toLowerCase().indexOf(query) >= 0; }); }
        function paint() {
            var l = list();
            el.querySelector('#su-rows').innerHTML = l.map(function (r) {
                return '<tr style="cursor:default"><td>' + esc(r.email) + '</td><td>' + esc((r.line || '').replace(/-/g, ' ')) + '</td><td class="muted">' + esc(r.source || '—') +
                    '</td><td>' + esc(ctx.fmtDate(r.created_at)) + '</td></tr>';
            }).join('');
            el.querySelector('#su-empty').hidden = l.length > 0;
            el.querySelector('#su-empty').textContent = rows.length ? 'No matches.' : 'No sign-ups yet.';
        }
        el.querySelector('#su-q').addEventListener('input', function (e) { query = e.target.value.trim().toLowerCase(); paint(); });
        el.querySelector('#su-copy').addEventListener('click', function (e) { ctx.copy(list().map(function (r) { return r.email; }).join(', '), e.target); });
        el.querySelector('#su-csv').addEventListener('click', function () {
            ctx.csv([['Email', 'Line', 'Source', 'Signed up']].concat(list().map(function (r) { return [r.email, r.line, r.source, r.created_at]; })), 'design-lab-signups.csv');
        });
        return {
            show: function () {
                ctx.sb.from('launch_signups').select('email,line,source,created_at').order('created_at', { ascending: false }).limit(2000)
                    .then(function (r) { rows = r.data || []; ctx.setBadge('signups', 0); paint(); });
            }
        };
    }
});
