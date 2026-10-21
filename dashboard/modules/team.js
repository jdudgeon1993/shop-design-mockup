// Team: who's on the team, their tags, who's available for live help right now, and
// the shared team calendar (restricted to Design Lab Google accounts).
// Admins (the 'admin' tag) add members here, change their tags, reset passwords and
// take people off the team. Adding a sign-in runs in the team-member edge function.
DLDash.register({
    id: 'team', label: 'Team', order: 70,
    icon: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6 6 0 0 1 3.5 6"/>',
    mount: function (el, ctx) {
        var esc = ctx.esc, people = [], dir = {}, held = {}, tags = [], live = { agents: [] }, panel = null;
        var isAdmin = ctx.has('admin');
        el.innerHTML =
            '<section class="card"><div class="card-head"><h2>Team</h2><span class="sp"></span><span class="muted small" id="tm-live"></span>' +
                (isAdmin ? '<button class="btn btn-primary btn-sm" type="button" id="tm-add">Add member</button>' : '') + '</div><ul class="list" id="tm-list"></ul></section>' +
            '<section class="card"><div class="card-head"><h2>Team calendar</h2></div><div class="card-body">' +
                '<iframe id="tm-cal" title="Design Lab team calendar" style="width:100%;height:560px;border:0;border-radius:8px;background:#fff"></iframe>' +
                '<p class="muted small" style="margin:10px 0 0">Shown with your Design Lab Google account. If it looks empty, sign into that account (not a personal one) in this browser.</p>' +
            '</div></section>';

        function memberTags() { return tags.filter(function (t) { return t.applies_to.indexOf('member') >= 0; }); }
        function pillsFor(id) {
            return memberTags().filter(function (t) { return (held[id] || []).indexOf(t.slug) >= 0; }).map(ctx.tagPill).join(' ');
        }
        function paint() {
            var here = {}; live.agents.forEach(function (a) { if (a.uid) here[a.uid] = true; here[(a.name || '').toLowerCase()] = true; });
            el.querySelector('#tm-live').textContent = live.agents.length ? 'Available for live help: ' + ctx.lobby.names(live.agents) : 'Nobody available for live help';
            el.querySelector('#tm-list').innerHTML = people.length ? people.map(function (p) {
                var d = dir[p.id] || {}, name = p.full_name || d.email || 'Team member', first = name.split(' ')[0].toLowerCase(), on = here[p.id] || here[first];
                var sub = [p.full_name ? d.email : '', d.last_sign_in_at ? 'signed in ' + ctx.timeAgo(d.last_sign_in_at) : 'never signed in', p.phone].filter(Boolean).join(' · ');
                return '<li' + (isAdmin ? ' data-id="' + esc(p.id) + '" tabindex="0" style="cursor:pointer"' : '') + '><span class="avatar">' + esc(ctx.initials(name)) + '</span><div class="grow"><div class="t">' + esc(name) + (p.id === ctx.user.id ? ' <span class="muted small">(you)</span>' : '') +
                    (p.full_name ? '' : ' <span class="pill warn">' + (isAdmin ? 'Add a name' : 'No name yet') + '</span>') + '</div>' +
                    '<div class="d">' + esc(sub) + '</div><div class="d" style="margin-top:4px">' + pillsFor(p.id) + '</div></div>' +
                    '<span class="pill ' + (on ? 'ok' : '') + '"><span class="dot' + (on ? ' on' : '') + '"></span>' + (on ? 'Available' : 'Away') + '</span></li>';
            }).join('') : '<li class="empty-state">No team members found.</li>';
        }
        function load() {
            return Promise.all([
                ctx.sb.from('profiles').select('id,full_name,role,phone').in('role', ['employee', 'admin']).order('full_name'),
                ctx.sb.from('profile_tags').select('profile_id,tag'),
                ctx.tagList(true),
                ctx.sb.rpc('team_directory')
            ]).then(function (r) {
                people = r[0].data || []; tags = r[2];
                dir = {}; (r[3].data || []).forEach(function (x) { dir[x.id] = x; });
                held = {}; (r[1].data || []).forEach(function (x) { (held[x.profile_id] = held[x.profile_id] || []).push(x.tag); });
                paint();
            });
        }

        // ---------- admin: add, edit, reset, remove ----------
        function call(body) {
            return ctx.sb.functions.invoke('team-member', { body: body }).then(function (r) {
                if (r.error) {
                    // The function's own message is in the response body.
                    var res = r.error.context;
                    return (res && res.json ? res.json() : Promise.resolve({})).then(function (j) { throw new Error(j.error || 'That didn\'t work. Try again.'); });
                }
                return r.data;
            });
        }
        function tagBoxes(chosen) {
            return memberTags().map(function (t) {
                return '<label style="display:flex;gap:10px;align-items:flex-start;font-weight:400;cursor:pointer"><input type="checkbox" name="tag" value="' + esc(t.slug) + '"' +
                    (chosen.indexOf(t.slug) >= 0 ? ' checked' : '') + ' style="margin-top:3px">' +
                    '<span>' + ctx.tagPill(t) + '<br><span class="muted small">' + esc(t.description || '') + '</span></span></label>';
            }).join('') || '<p class="muted small" style="margin:0">No tags yet. Make some in Tags.</p>';
        }
        function chosenTags(form) {
            return Array.prototype.map.call(form.querySelectorAll('input[name=tag]:checked'), function (c) { return c.value; });
        }
        function signinCard(name, email, password) {
            var text = 'Your Design Lab team sign-in:\n' + location.origin + '/dashboard/\nEmail: ' + email + '\nTemporary password: ' + password + '\nYou\'ll choose your own password when you sign in.';
            var box = document.createElement('section');
            box.className = 'card card-pad'; box.style.cssText = 'display:grid;gap:10px;border-color:var(--gold)';
            box.innerHTML = '<strong>Send ' + esc(name) + ' their sign-in</strong><p class="muted small" style="margin:0">This password is shown only once. Send it somewhere private (a text, not a group chat).</p>' +
                '<pre style="margin:0;white-space:pre-wrap;font-size:13px;line-height:1.6;padding:12px;border-radius:8px;background:#0e0e0e;border:1px solid var(--line)">' + esc(text) + '</pre>' +
                '<div class="toolbar"><button class="btn btn-primary btn-sm" type="button">Copy</button></div>';
            box.querySelector('button').addEventListener('click', function (e) { ctx.copy(text, e.target); });
            return box;
        }

        function addMember() {
            if (panel) panel.close();
            panel = ctx.drawer('Add a team member');
            panel.onClose = function () { panel = null; };
            panel.body.innerHTML =
                '<form class="card card-pad" style="display:grid;gap:12px" id="am-form">' +
                    '<label class="field">Name<input id="am-name" autocomplete="off" required maxlength="80"></label>' +
                    '<label class="field">Email<input id="am-email" type="email" autocomplete="off" required></label>' +
                    '<label class="field">Phone <span class="muted small">(optional)</span><input id="am-phone" type="tel" autocomplete="off" maxlength="30"></label>' +
                    '<div class="field">Tags<div style="display:grid;gap:10px;margin-top:4px">' + tagBoxes([]) + '</div></div>' +
                    '<p class="muted small" style="margin:0">They\'ll get a sign-in for this dashboard with a temporary password you pass on.</p>' +
                    '<p class="form-error" id="am-error" role="alert" hidden></p>' +
                    '<div class="toolbar"><button class="btn btn-primary" type="submit" id="am-submit">Add to the team</button></div>' +
                '</form>';
            var form = panel.body.querySelector('#am-form');
            form.querySelector('#am-name').focus();
            form.addEventListener('submit', function (e) {
                e.preventDefault();
                var btn = form.querySelector('#am-submit'), err = form.querySelector('#am-error');
                var name = form.querySelector('#am-name').value.trim();
                btn.disabled = true; err.hidden = true;
                call({ action: 'add', full_name: name, email: form.querySelector('#am-email').value.trim(), phone: form.querySelector('#am-phone').value.trim(), tags: chosenTags(form) })
                    .then(function (d) {
                        load();
                        if (d.existing) { ctx.toast(name + ' already had an account and is now on the team. They sign in with their own password.'); panel.close(); return; }
                        form.replaceWith(signinCard(name, d.email, d.password));
                        if (d.error) ctx.toast(d.error, 'bad');
                    })
                    .catch(function (x) { err.hidden = false; err.textContent = x.message; btn.disabled = false; });
            });
        }

        function openMember(id) {
            var p = people.filter(function (x) { return x.id === id; })[0];
            if (!p) return;
            var me = p.id === ctx.user.id, mine = (held[id] || []).slice();
            if (panel) panel.close();
            var email = (dir[id] || {}).email || '';
            panel = ctx.drawer(p.full_name || email || 'Team member');
            panel.onClose = function () { panel = null; };
            panel.body.innerHTML =
                '<form class="card card-pad" style="display:grid;gap:12px" id="mm-form">' +
                    (email ? '<div class="muted small">Signs in as <strong style="color:var(--ink)">' + esc(email) + '</strong></div>' : '') +
                    '<label class="field">Name<input id="mm-name" required maxlength="80" placeholder="First and last name"></label>' +
                    '<label class="field">Phone<input id="mm-phone" type="tel" maxlength="30"></label>' +
                    '<div class="field">Tags<div style="display:grid;gap:10px;margin-top:4px">' + tagBoxes(mine) + '</div></div>' +
                    '<p class="form-error" id="mm-error" role="alert" hidden></p>' +
                    '<div class="toolbar"><button class="btn btn-primary" type="submit">Save</button></div>' +
                '</form>' +
                '<section class="card card-pad" style="display:grid;gap:10px" id="mm-more">' +
                    '<strong>Sign-in</strong>' +
                    '<p class="muted small" style="margin:0">Forgot their password? Make a new temporary one to send them.</p>' +
                    '<div class="toolbar"><button class="btn btn-sm" type="button" id="mm-reset">Reset password</button>' +
                    (me ? '' : '<span class="sp"></span><button class="btn btn-sm btn-danger" type="button" id="mm-remove">Remove from team</button>') + '</div>' +
                '</section>';
            var form = panel.body.querySelector('#mm-form'), err = form.querySelector('#mm-error');
            form.querySelector('#mm-name').value = p.full_name || '';
            form.querySelector('#mm-phone').value = p.phone || '';
            form.addEventListener('submit', function (e) {
                e.preventDefault();
                var want = chosenTags(form);
                var add = want.filter(function (t) { return mine.indexOf(t) < 0; }), drop = mine.filter(function (t) { return want.indexOf(t) < 0; });
                if (me && drop.indexOf('admin') >= 0 && !confirm('Take Admin off yourself? You won\'t be able to add people or change tags after this.')) return;
                err.hidden = true;
                var steps = [ctx.sb.from('profiles').update({ full_name: form.querySelector('#mm-name').value.trim(), phone: form.querySelector('#mm-phone').value.trim() || null }).eq('id', id)];
                if (add.length) steps.push(ctx.sb.from('profile_tags').insert(add.map(function (t) { return { profile_id: id, tag: t }; })));
                if (drop.length) steps.push(ctx.sb.from('profile_tags').delete().eq('profile_id', id).in('tag', drop));
                Promise.all(steps).then(function (r) {
                    var bad = r.filter(function (x) { return x.error; })[0];
                    if (bad) throw new Error(/at least one admin/.test(bad.error.message) ? 'There has to be at least one admin.' : bad.error.message);
                    ctx.toast('Saved.');
                    if (me && (add.length || drop.length)) ctx.toast('Your own tags changed. Reload the dashboard to see the difference.');
                    panel.close(); load();
                }).catch(function (x) { err.hidden = false; err.textContent = x.message; load(); });
            });
            panel.body.querySelector('#mm-reset').addEventListener('click', function (e) {
                if (!confirm('Make a new temporary password for ' + (p.full_name || 'them') + '? Their current password stops working.')) return;
                e.target.disabled = true;
                call({ action: 'reset', id: id }).then(function (d) {
                    var box = panel.body.querySelector('#mm-more');
                    box.replaceWith(signinCard(p.full_name || 'them', d.email, d.password));
                }).catch(function (x) { ctx.toast(x.message, 'bad'); e.target.disabled = false; });
            });
            var rm = panel.body.querySelector('#mm-remove');
            if (rm) rm.addEventListener('click', function () {
                if (!confirm('Remove ' + (p.full_name || 'them') + ' from the team? They lose the dashboard and all their tags. Their account stays, as a regular customer.')) return;
                ctx.sb.rpc('team_remove_member', { p_id: id }).then(function (r) {
                    if (r.error) { ctx.toast(r.error.message, 'bad'); return; }
                    ctx.toast((p.full_name || 'They') + ' is off the team.');
                    panel.close(); load();
                });
            });
        }
        if (isAdmin) {
            el.querySelector('#tm-add').addEventListener('click', addMember);
            var list = el.querySelector('#tm-list');
            list.addEventListener('click', function (e) { var li = e.target.closest('[data-id]'); if (li) openMember(li.dataset.id); });
            list.addEventListener('keydown', function (e) { var li = e.target.closest('[data-id]'); if (li && e.key === 'Enter') openMember(li.dataset.id); });
        }

        ctx.lobby.onChange(function (l) { live = l; paint(); });
        var calLoaded = false;
        return {
            show: function () {
                load();
                if (!calLoaded) {
                    calLoaded = true;
                    el.querySelector('#tm-cal').src = 'https://calendar.google.com/calendar/embed?src=' + encodeURIComponent(ctx.CALENDAR_ID) + '&authuser=' + encodeURIComponent(ctx.user.email);
                }
            }
        };
    }
});
