// Google Meet rooms (database: public.meet_rooms, migration 0028).
//   Team Meet       one permanent room for the team (admins can change its code)
//   My room         each employee's own reusable consultation room, with the client
//                   link /consultation/meet/?d=<slug> that greets the client and opens it
//   Everyone's      the whole team's rooms, to copy a colleague's client link
// Meet can't run inside the dashboard (Google blocks embedding), so rooms open in a
// new tab, on the employee's work Google account (?authuser=<their email>).
DLDash.register({
    id: 'meet', label: 'Google Meet', order: 41,
    icon: '<rect x="2" y="6" width="13" height="12" rx="2"/><path d="m15 10 6-4v12l-6-4"/><circle cx="8.5" cy="12" r="2"/>',
    mount: function (el, ctx) {
        var esc = ctx.esc, rooms = [];
        var CODE_RE = /([a-z]{3}-[a-z]{4}-[a-z]{3})/i;
        var isAdmin = ctx.has('admin');
        var email = (ctx.user && ctx.user.email) || '';

        function codeFrom(s) { var m = CODE_RE.exec(String(s || '').trim()); return m ? m[1].toLowerCase() : null; }
        function slugify(s) { return String(s || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').replace(/^[^a-z]+/, '').slice(0, 40); }
        function meetUrl(code) { return 'https://meet.google.com/' + code + (email ? '?authuser=' + encodeURIComponent(email) : ''); }
        function clientLink(slug) { return location.origin + '/consultation/meet/?d=' + encodeURIComponent(slug); }
        function mine() { return rooms.filter(function (r) { return r.kind === 'personal' && r.profile_id === ctx.user.id; })[0]; }
        function team() { return rooms.filter(function (r) { return r.kind === 'team'; })[0]; }

        el.innerHTML =
            '<div class="grid grid-2">' +
                '<section class="card"><div class="card-head"><h2>Team Meet</h2></div><div class="card-body" id="mt-team"></div></section>' +
                '<section class="card"><div class="card-head"><h2>My consultation room</h2></div><div class="card-body" id="mt-mine"></div></section>' +
            '</div>' +
            '<section class="card"><div class="card-head"><h2>Everyone\'s rooms</h2><span class="sp"></span><span class="muted small" id="mt-count"></span></div><ul class="list" id="mt-all"></ul></section>' +
            '<p class="muted small">Rooms come from repeating Google Calendar events with Google Meet added, so their links never expire. ' +
            'Don\'t delete those events. Meet opens in a new tab on your work account (' + esc(email || 'your sign-in email') + ').</p>';

        function codeForm(id, value, extra) {
            return '<form class="mt-form" data-form="' + id + '" style="display:grid;gap:10px;margin-top:12px">' + (extra || '') +
                '<label class="field">Meet link or code<input name="code" placeholder="https://meet.google.com/abc-defg-hij" value="' + esc(value || '') + '" autocomplete="off" required></label>' +
                '<p class="form-error" hidden></p>' +
                '<div><button class="btn btn-primary btn-sm" type="submit">Save</button> <button class="btn btn-sm" type="button" data-act="cancel">Cancel</button></div></form>';
        }

        function renderTeam() {
            var t = team(), box = el.querySelector('#mt-team');
            if (!t) {
                box.innerHTML = '<p class="muted">No team room yet.</p>' + (isAdmin ? codeForm('team-new') : '<p class="muted small">Ask an admin to add it.</p>');
                return;
            }
            box.innerHTML =
                '<p style="margin:0 0 4px">One permanent room for team meetings.</p>' +
                '<p class="muted small" style="margin:0 0 14px">Code <b>' + esc(t.meet_code) + '</b></p>' +
                '<div class="chips"><a class="btn btn-primary" href="' + esc(meetUrl(t.meet_code)) + '" target="_blank" rel="noopener">Join Team Meet</a>' +
                '<button class="btn" type="button" data-act="copy-team">Copy link</button>' +
                (isAdmin ? '<button class="btn" type="button" data-act="edit-team">Change code</button>' : '') + '</div>' +
                '<div data-slot="team-edit"></div>';
        }

        function renderMine() {
            var m = mine(), box = el.querySelector('#mt-mine'), first = ctx.firstName || '';
            if (!m) {
                box.innerHTML =
                    '<p style="margin:0">Your own reusable room for client consultations. Make it once:</p>' +
                    '<ol class="muted small" style="margin:10px 0 0;padding-left:18px;line-height:1.7">' +
                        '<li>In Google Calendar on your work account, create an event like "' + esc(first || 'My') + '\'s Consultation Room".</li>' +
                        '<li>Set it to repeat weekly, never ending, Show as Available.</li>' +
                        '<li>Click Add Google Meet video conferencing, save, then paste the link below.</li></ol>' +
                    codeForm('mine-new', '',
                        '<label class="field">Name clients see<input name="label" value="' + esc(first) + '" maxlength="60" required></label>' +
                        '<label class="field">Link name<input name="slug" value="' + esc(slugify(first)) + '" maxlength="40" required>' +
                        '<span class="muted small">Your client link: ' + esc(location.host) + '/consultation/meet/?d=<b data-slug-preview>' + esc(slugify(first)) + '</b></span></label>');
                return;
            }
            box.innerHTML =
                '<p style="margin:0 0 4px">Send clients this link. They get a Design Lab welcome page with a Join button, then knock and you let them in.</p>' +
                '<div class="field" style="margin:12px 0"><input readonly value="' + esc(clientLink(m.slug)) + '" aria-label="Your client link" onclick="this.select()"></div>' +
                '<div class="chips"><button class="btn btn-primary" type="button" data-act="copy-mine">Copy client link</button>' +
                '<a class="btn" href="' + esc(meetUrl(m.meet_code)) + '" target="_blank" rel="noopener">Open my room</a>' +
                '<a class="btn" href="' + esc(clientLink(m.slug)) + '" target="_blank" rel="noopener">Preview client page</a>' +
                '<button class="btn" type="button" data-act="edit-mine">Change code</button></div>' +
                '<div data-slot="mine-edit"></div>';
        }

        function renderAll() {
            var people = rooms.filter(function (r) { return r.kind === 'personal'; });
            el.querySelector('#mt-count').textContent = people.length + ' room' + (people.length === 1 ? '' : 's');
            el.querySelector('#mt-all').innerHTML = people.length ? people.map(function (r) {
                var who = r.profiles && r.profiles.full_name ? r.profiles.full_name : r.label;
                return '<li data-id="' + r.id + '"><div class="grow"><div class="t">' + esc(who) + (r.profile_id === ctx.user.id ? ' <span class="pill">You</span>' : '') + '</div>' +
                    '<div class="d">/consultation/meet/?d=' + esc(r.slug) + ' · ' + esc(r.meet_code) + '</div></div>' +
                    '<button class="btn btn-sm" data-act="copy-client" data-slug="' + esc(r.slug) + '">Copy client link</button>' +
                    (isAdmin && r.profile_id !== ctx.user.id ? '<button class="btn btn-sm btn-danger" data-act="remove" aria-label="Remove ' + esc(who) + '\'s room">Remove</button>' : '') + '</li>';
            }).join('') : '<li class="empty-state">No personal rooms yet.</li>';
        }

        function load() {
            return ctx.sb.from('meet_rooms').select('id,kind,profile_id,slug,label,meet_code,profiles:profile_id(full_name)').order('label')
                .then(function (r) {
                    if (r.error) {
                        el.querySelector('#mt-team').innerHTML = '<p class="form-error">Couldn\'t load rooms. (Has migration 0028 been applied?)</p>';
                        return;
                    }
                    rooms = r.data || [];
                    renderTeam(); renderMine(); renderAll();
                });
        }

        function fail(form, msg) { var e = form.querySelector('.form-error'); e.textContent = msg; e.hidden = false; }
        function friendly(err) {
            var m = (err && err.message) || '';
            if (/meet_rooms_slug_key|duplicate key.*slug/.test(m)) return 'That link name is taken. Try another.';
            if (/row-level security/.test(m)) return 'You don\'t have permission to change that room.';
            return 'Couldn\'t save. Check the link and try again.';
        }

        el.addEventListener('input', function (e) {
            if (e.target.name === 'label' && e.target.closest('[data-form="mine-new"]')) {
                var f = e.target.form, s = slugify(e.target.value);
                f.slug.value = s; f.querySelector('[data-slug-preview]').textContent = s;
            } else if (e.target.name === 'slug') {
                var p = e.target.form.querySelector('[data-slug-preview]'); if (p) p.textContent = slugify(e.target.value);
            }
        });

        el.addEventListener('submit', function (e) {
            var form = e.target.closest('.mt-form'); if (!form) return;
            e.preventDefault();
            var code = codeFrom(form.code.value);
            if (!code) return fail(form, 'That doesn\'t look like a Meet link. It should end in a code like abc-defg-hij.');
            var kind = form.dataset.form, q;
            if (kind === 'team-new') q = ctx.sb.from('meet_rooms').insert({ kind: 'team', slug: 'team', label: 'Team Meet', meet_code: code });
            else if (kind === 'team-edit') q = ctx.sb.from('meet_rooms').update({ meet_code: code }).eq('id', team().id);
            else if (kind === 'mine-edit') q = ctx.sb.from('meet_rooms').update({ meet_code: code }).eq('id', mine().id);
            else if (kind === 'mine-new') {
                var slug = slugify(form.slug.value), label = form.label.value.trim();
                if (!label) return fail(form, 'Add the name clients will see.');
                if (!/^[a-z][a-z0-9-]{1,39}$/.test(slug)) return fail(form, 'The link name needs at least 2 letters or numbers, starting with a letter.');
                q = ctx.sb.from('meet_rooms').insert({ kind: 'personal', profile_id: ctx.user.id, slug: slug, label: label, meet_code: code });
            }
            var btn = form.querySelector('[type=submit]'); btn.disabled = true;
            q.then(function (r) {
                btn.disabled = false;
                if (r.error) return fail(form, friendly(r.error));
                ctx.toast('Saved.');
                load();
            });
        });

        el.addEventListener('click', function (e) {
            var b = e.target.closest('[data-act]'); if (!b) return;
            var act = b.dataset.act;
            if (act === 'copy-team') ctx.copy('https://meet.google.com/' + team().meet_code, b);
            else if (act === 'copy-mine') ctx.copy(clientLink(mine().slug), b);
            else if (act === 'copy-client') ctx.copy(clientLink(b.dataset.slug), b);
            else if (act === 'edit-team') el.querySelector('[data-slot="team-edit"]').innerHTML = codeForm('team-edit', team().meet_code);
            else if (act === 'edit-mine') el.querySelector('[data-slot="mine-edit"]').innerHTML = codeForm('mine-edit', mine().meet_code);
            else if (act === 'cancel') { var f = b.closest('.mt-form'); if (f && f.parentNode.dataset.slot) f.parentNode.innerHTML = ''; }
            else if (act === 'remove') {
                var li = b.closest('[data-id]');
                if (confirm('Remove this room from the site? Their client link stops working. The Google Calendar event is not touched.')) {
                    ctx.sb.from('meet_rooms').delete().eq('id', li.dataset.id).then(function (r) {
                        if (r.error) ctx.toast(friendly(r.error), 'bad'); else load();
                    });
                }
            }
        });

        return { show: load };
    }
});
