// Tags: the labels that can be put on things. Built-in tags unlock parts of the site
// (Admin, See pricing, See real makers); the database checks them, so they can't be
// deleted. Other tags are labels for now, ready for whatever uses them next.
// Today tags go on team members; "Products" is there so a tag can be meant for them
// once products can be tagged (a product_tags table, like profile_tags).
// Everyone on the team can look; admins add, edit, delete and hand tags out.
DLDash.register({
    id: 'tags', label: 'Tags', order: 75,
    icon: '<path d="M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9z"/><circle cx="7.5" cy="7.5" r="1.5"/>',
    mount: function (el, ctx) {
        var esc = ctx.esc, tags = [], people = [], held = [], panel = null;
        var isAdmin = ctx.has('admin');
        var KINDS = [{ key: 'member', label: 'Team members' }, { key: 'product', label: 'Products', later: true }];
        var COLORS = [{ key: '', label: 'Plain' }, { key: 'gold', label: 'Gold' }, { key: 'ok', label: 'Green' }, { key: 'info', label: 'Blue' }, { key: 'warn', label: 'Amber' }, { key: 'bad', label: 'Red' }];
        // What each built-in tag does in the code.
        var UNLOCKS = {
            admin: 'Team → Add member, everyone\'s tags, and editing tags here.',
            pricing: 'Prices from the database in the DIY Shop, Collections, cart and order totals.',
            makers: 'The real maker on orders and the partner portal sheet.'
        };
        el.innerHTML =
            '<section class="card"><div class="card-head"><h2>Tags</h2><span class="sp"></span><span class="muted small" id="tg-count"></span>' +
                (isAdmin ? '<button class="btn btn-primary btn-sm" type="button" id="tg-add">New tag</button>' : '') + '</div>' +
                '<div class="card-body" style="padding-bottom:0"><p class="muted small" style="margin:0">Built-in tags unlock parts of the site. Your own tags are labels for now; they\'re ready to be connected to features later.' +
                (isAdmin ? '' : ' Only admins can change tags.') + '</p></div>' +
                '<div class="table-wrap"><table class="table"><thead><tr><th>Tag</th><th>What it\'s for</th><th>Goes on</th><th class="r">Members</th></tr></thead><tbody id="tg-rows"></tbody></table></div>' +
            '</section>';

        function holders(slug) { return held.filter(function (h) { return h.tag === slug; }).map(function (h) { return h.profile_id; }); }
        function nameOf(id) { var p = people.filter(function (x) { return x.id === id; })[0]; return p ? p.full_name || 'Team member' : 'Former member'; }
        function paint() {
            el.querySelector('#tg-count').textContent = tags.length + (tags.length === 1 ? ' tag' : ' tags');
            el.querySelector('#tg-rows').innerHTML = tags.map(function (t) {
                var on = t.applies_to.map(function (k) { return (KINDS.filter(function (x) { return x.key === k; })[0] || { label: k }).label; }).join(', ');
                return '<tr data-slug="' + esc(t.slug) + '" tabindex="0"><td>' + ctx.tagPill(t) + (t.is_system ? '<br><span class="muted small">Built-in</span>' : '') + '</td>' +
                    '<td><span class="small">' + esc(t.description || '') + '</span>' + (UNLOCKS[t.slug] ? '<br><span class="muted small">Unlocks: ' + esc(UNLOCKS[t.slug]) + '</span>' : '') + '</td>' +
                    '<td class="small">' + esc(on) + '</td><td class="r">' + (t.applies_to.indexOf('member') >= 0 ? holders(t.slug).length : '—') + '</td></tr>';
            }).join('') || '<tr><td colspan="4" class="empty-state">No tags yet.</td></tr>';
        }
        function load() {
            return Promise.all([
                ctx.tagList(true),
                ctx.sb.from('profiles').select('id,full_name').in('role', ['employee', 'admin']).order('full_name'),
                ctx.sb.from('profile_tags').select('profile_id,tag')
            ]).then(function (r) { tags = r[0]; people = r[1].data || []; held = r[2].data || []; paint(); });
        }
        function slugify(s) {
            var x = s.toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
            return /^[a-z]/.test(x) ? x : ('t-' + x).slice(0, 40);
        }
        function friendly(msg) {
            if (/duplicate key|tags_pkey/.test(msg)) return 'There\'s already a tag with that name.';
            if (/at least one admin/.test(msg)) return 'There has to be at least one admin.';
            return msg;
        }

        // One tag: details (admins can edit) and who has it.
        function openTag(slug) {
            var t = slug ? tags.filter(function (x) { return x.slug === slug; })[0] : null;
            if (slug && !t) return;
            var edit = isAdmin, isNew = !t;
            t = t || { slug: '', label: '', description: '', color: '', applies_to: ['member'], is_system: false };
            if (panel) panel.close();
            panel = ctx.drawer(isNew ? 'New tag' : t.label);
            panel.onClose = function () { panel = null; };
            var who = holders(t.slug);
            panel.body.innerHTML =
                '<form class="card card-pad" style="display:grid;gap:12px" id="tg-form">' +
                    (edit ? '<label class="field">Name<input id="tg-label" required maxlength="40" placeholder="e.g. Installer, Trade partner, Showroom"></label>' +
                        '<label class="field">What it\'s for<textarea id="tg-desc" maxlength="300" style="min-height:70px"></textarea></label>' +
                        '<div class="field">Color<div class="chips color-chips" id="tg-colors" role="group" aria-label="Color" style="margin-top:4px">' +
                            COLORS.map(function (c) { return '<button type="button" class="chip" data-c="' + c.key + '" aria-pressed="' + (t.color === c.key) + '"><span class="pill ' + c.key + '">' + c.label + '</span></button>'; }).join('') +
                        '</div></div>' +
                        '<div class="field">Goes on<div style="display:grid;gap:8px;margin-top:4px">' +
                            KINDS.map(function (k) {
                                return '<label style="display:flex;gap:10px;align-items:center;font-weight:400;cursor:pointer"><input type="checkbox" name="kind" value="' + k.key + '"' + (t.applies_to.indexOf(k.key) >= 0 ? ' checked' : '') + '>' +
                                    esc(k.label) + (k.later ? ' <span class="muted small">(products can\'t be tagged yet; this marks the tag for them)</span>' : '') + '</label>';
                            }).join('') +
                        '</div></div>' +
                        '<p class="muted small" id="tg-preview" style="margin:0"></p>' +
                        '<p class="form-error" id="tg-error" role="alert" hidden></p>' +
                        '<div class="toolbar"><button class="btn btn-primary" type="submit">' + (isNew ? 'Make tag' : 'Save') + '</button>' +
                            (!isNew && !t.is_system ? '<span class="sp"></span><button class="btn btn-sm btn-danger" type="button" id="tg-del">Delete tag</button>' : '') + '</div>'
                    : '<div>' + ctx.tagPill(t) + '</div><p style="margin:0">' + esc(t.description || '') + '</p>' +
                        (UNLOCKS[t.slug] ? '<p class="muted small" style="margin:0">Unlocks: ' + esc(UNLOCKS[t.slug]) + '</p>' : '')) +
                    (t.is_system && edit ? '<p class="muted small" style="margin:0">Built-in: ' + esc(UNLOCKS[t.slug] || '') + ' It can be renamed and recolored, not deleted.</p>' : '') +
                '</form>' +
                (isNew || t.applies_to.indexOf('member') < 0 ? '' :
                '<section class="card"><div class="card-head"><h2>Who has it</h2><span class="sp"></span><span class="muted small" id="tg-who">' + who.length + ' of ' + people.length + '</span></div><ul class="list">' +
                    people.map(function (p) {
                        var has = who.indexOf(p.id) >= 0;
                        return '<li><span class="avatar">' + esc(ctx.initials(p.full_name || '?')) + '</span><div class="grow"><div class="t">' + esc(p.full_name || 'Team member') + (p.id === ctx.user.id ? ' <span class="muted small">(you)</span>' : '') + '</div></div>' +
                            (edit ? '<label class="avail"><input type="checkbox" data-pid="' + esc(p.id) + '"' + (has ? ' checked' : '') + '><span class="switch" aria-hidden="true"></span><span class="sr-only">' + esc(t.label) + ' for ' + esc(p.full_name || '') + '</span></label>'
                                  : (has ? '<span class="pill ok">Has it</span>' : '<span class="muted small">—</span>')) + '</li>';
                    }).join('') + '</ul></section>');
            if (!edit) return;

            var form = panel.body.querySelector('#tg-form'), err = form.querySelector('#tg-error'), color = t.color;
            var label = form.querySelector('#tg-label');
            label.value = t.label; form.querySelector('#tg-desc').value = t.description || '';
            function preview() {
                form.querySelector('#tg-preview').innerHTML = (label.value.trim() ? 'Looks like: ' + ctx.tagPill({ label: label.value.trim(), color: color }) : '') +
                    (isNew && label.value.trim() ? ' <span class="muted">· id: ' + esc(slugify(label.value)) + '</span>' : '');
            }
            label.addEventListener('input', preview); preview();
            label.focus();
            form.querySelector('#tg-colors').addEventListener('click', function (e) {
                var b = e.target.closest('[data-c]'); if (!b) return;
                color = b.dataset.c;
                form.querySelectorAll('[data-c]').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
                preview();
            });
            form.addEventListener('submit', function (e) {
                e.preventDefault();
                var kinds = Array.prototype.map.call(form.querySelectorAll('input[name=kind]:checked'), function (c) { return c.value; });
                if (!kinds.length) { err.hidden = false; err.textContent = 'Pick at least one thing it goes on.'; return; }
                if (!isNew && t.applies_to.indexOf('member') >= 0 && kinds.indexOf('member') < 0 && who.length) {
                    err.hidden = false; err.textContent = 'Take it off the ' + who.length + ' member' + (who.length === 1 ? '' : 's') + ' who have it first.'; return;
                }
                var row = { label: label.value.trim(), description: form.querySelector('#tg-desc').value.trim() || null, color: color, applies_to: kinds };
                var q = isNew ? ctx.sb.from('tags').insert(Object.assign({ slug: slugify(row.label) }, row)) : ctx.sb.from('tags').update(row).eq('slug', t.slug);
                err.hidden = true;
                q.then(function (r) {
                    if (r.error) { err.hidden = false; err.textContent = friendly(r.error.message); return; }
                    ctx.toast(isNew ? 'Tag made.' : 'Saved.');
                    panel.close(); load();
                });
            });
            var del = form.querySelector('#tg-del');
            if (del) del.addEventListener('click', function () {
                if (!confirm('Delete "' + t.label + '"?' + (who.length ? ' It comes off the ' + who.length + ' member' + (who.length === 1 ? '' : 's') + ' who have it.' : ''))) return;
                ctx.sb.from('tags').delete().eq('slug', t.slug).then(function (r) {
                    if (r.error) { err.hidden = false; err.textContent = friendly(r.error.message); return; }
                    ctx.toast('Tag deleted.'); panel.close(); load();
                });
            });
            // Hand the tag out, or take it back, one person at a time (saves right away).
            panel.body.querySelectorAll('[data-pid]').forEach(function (box) {
                box.addEventListener('change', function () {
                    var pid = box.dataset.pid, on = box.checked;
                    if (!on && pid === ctx.user.id && t.slug === 'admin' && !confirm('Take Admin off yourself? You won\'t be able to change tags after this.')) { box.checked = true; return; }
                    var q = on ? ctx.sb.from('profile_tags').insert({ profile_id: pid, tag: t.slug }) : ctx.sb.from('profile_tags').delete().eq('profile_id', pid).eq('tag', t.slug);
                    box.disabled = true;
                    q.then(function (r) {
                        box.disabled = false;
                        if (r.error) { box.checked = !on; ctx.toast(friendly(r.error.message), 'bad'); return; }
                        ctx.toast((on ? 'Gave ' : 'Took ') + t.label + (on ? ' to ' : ' from ') + nameOf(pid) + '.');
                        load().then(function () { who = holders(t.slug); var c = panel && panel.body.querySelector('#tg-who'); if (c) c.textContent = who.length + ' of ' + people.length; });
                    });
                });
            });
        }

        var rows = el.querySelector('#tg-rows');
        rows.addEventListener('click', function (e) { var tr = e.target.closest('[data-slug]'); if (tr) openTag(tr.dataset.slug); });
        rows.addEventListener('keydown', function (e) { var tr = e.target.closest('[data-slug]'); if (tr && e.key === 'Enter') openTag(tr.dataset.slug); });
        if (isAdmin) el.querySelector('#tg-add').addEventListener('click', function () { openTag(null); });
        return { show: load };
    }
});
