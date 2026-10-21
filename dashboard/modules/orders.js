// Orders: filter, search, and work an order through its statuses. The detail panel has
// the customer, the items, internal notes, the QuickBooks invoice number, and a
// partner-portal sheet (items grouped by maker, with the maker's item numbers) to copy
// when entering the order on the maker's site.
// Routes: #orders, #orders/<number> (opens it), #orders/status-<key> (filters).
DLDash.register({
    id: 'orders', label: 'Orders', order: 30,
    icon: '<path d="M6 2h9l5 5v15H6z"/><path d="M14 2v6h6"/><path d="M9 13h7M9 17h5"/>',
    mount: function (el, ctx) {
        var esc = ctx.esc, orders = [], filter = 'open', query = '', openNumber = null, panel = null;
        el.innerHTML =
            '<section class="card">' +
                '<div class="card-head">' +
                    '<div class="toolbar" style="flex:1">' +
                        '<label class="sr-only" for="or-q">Search orders</label><input class="input" id="or-q" type="search" placeholder="Search name, email or order #">' +
                    '</div>' +
                    '<button class="btn btn-sm" id="or-csv" type="button">Export CSV</button>' +
                    '<button class="btn btn-sm" id="or-refresh" type="button">Refresh</button>' +
                '</div>' +
                '<div class="card-body" style="padding-bottom:0"><div class="chips" id="or-chips" role="group" aria-label="Filter by status"></div></div>' +
                '<div class="table-wrap"><table class="table"><thead><tr><th>Order</th><th>Customer</th><th>Placed</th><th>Items</th>' + (MAKERS ? '<th>Maker</th>' : '') + '<th class="r">Total</th><th>Status</th></tr></thead>' +
                '<tbody id="or-rows"></tbody></table></div>' +
                '<p class="empty-state" id="or-empty" hidden></p>' +
            '</section>';
        var rowsEl = el.querySelector('#or-rows');

        function load() {
            return ctx.sb.from('orders')
                .select('id,order_number,status,contact_name,contact_email,contact_phone,shipping_address,customer_notes,subtotal,internal_notes,quickbooks_invoice_id,created_at,updated_at,' +
                    'order_items(id,item_type,name_snapshot,sku_snapshot,mfg_sku_snapshot,finish_snapshot,hinge_side,mods_snapshot,unit_price,quantity,line_total)')
                .order('created_at', { ascending: false }).limit(500)
                .then(function (r) {
                    if (r.error) { ctx.toast('Could not load orders.', 'bad'); return; }
                    orders = r.data || [];
                    return withMakers(orders);
                }).then(function () {
                    if (!orders) return;
                    paint();
                    if (openNumber) openOrder(openNumber);
                });
        }
        // The real maker (vendor_snapshot) comes from order_makers(), only with the 'makers' tag.
        var MAKERS = ctx.has('makers');
        function withMakers(list) {
            if (!MAKERS || !list.length) return Promise.resolve();
            return ctx.sb.rpc('order_makers', { p_order_ids: list.map(function (o) { return o.id; }) }).then(function (r) {
                var by = {}; (r.data || []).forEach(function (m) { by[m.item_id] = m.maker; });
                list.forEach(function (o) { (o.order_items || []).forEach(function (i) { i.vendor_snapshot = by[i.id] || null; }); });
            });
        }
        function itemsOf(o) { return (o.order_items || []).reduce(function (n, i) { return n + (i.quantity || 0); }, 0); }
        function makersOf(o) {
            var m = {}; (o.order_items || []).forEach(function (i) { if (i.vendor_snapshot) m[i.vendor_snapshot] = true; });
            return Object.keys(m).join(', ');
        }
        function matches(o) {
            if (filter === 'open' && (o.status === 'completed' || o.status === 'cancelled')) return false;
            if (filter !== 'open' && filter !== 'all' && o.status !== filter) return false;
            if (!query) return true;
            var q = query.toLowerCase();
            return String(o.order_number).indexOf(q.replace('#', '')) >= 0 || (o.contact_name || '').toLowerCase().indexOf(q) >= 0 ||
                (o.contact_email || '').toLowerCase().indexOf(q) >= 0;
        }
        function paint() {
            var counts = { all: orders.length, open: 0 };
            orders.forEach(function (o) { counts[o.status] = (counts[o.status] || 0) + 1; if (o.status !== 'completed' && o.status !== 'cancelled') counts.open++; });
            var chips = [{ key: 'open', label: 'Open' }, { key: 'all', label: 'All' }].concat(ctx.STATUS);
            el.querySelector('#or-chips').innerHTML = chips.map(function (c) {
                return '<button type="button" class="chip" data-f="' + c.key + '" aria-pressed="' + (filter === c.key) + '">' + esc(c.label) + '<span class="n">' + (counts[c.key] || 0) + '</span></button>';
            }).join('');
            var list = orders.filter(matches);
            rowsEl.innerHTML = list.map(function (o) {
                return '<tr data-n="' + o.order_number + '" tabindex="0"><td><strong>#' + o.order_number + '</strong></td>' +
                    '<td>' + esc(o.contact_name) + '<div class="muted small">' + esc(o.contact_email || '') + '</div></td>' +
                    '<td>' + esc(ctx.fmtDate(o.created_at)) + '<div class="muted small">' + esc(ctx.timeAgo(o.created_at)) + '</div></td>' +
                    '<td>' + itemsOf(o) + '</td>' + (MAKERS ? '<td>' + esc(makersOf(o) || '—') + '</td>' : '') +
                    '<td class="r">' + (o.subtotal != null ? ctx.money.format(o.subtotal) : '—') + '</td><td>' + ctx.statusPill(o.status) + '</td></tr>';
            }).join('');
            var empty = el.querySelector('#or-empty');
            empty.hidden = list.length > 0;
            empty.textContent = orders.length ? 'No orders match.' : 'No orders yet. Submitted carts show up here.';
        }

        el.querySelector('#or-chips').addEventListener('click', function (e) {
            var c = e.target.closest('[data-f]'); if (!c) return;
            filter = c.dataset.f; paint();
        });
        el.querySelector('#or-q').addEventListener('input', function (e) { query = e.target.value.trim(); paint(); });
        el.querySelector('#or-refresh').addEventListener('click', function () { load().then(function () { ctx.toast('Orders refreshed.'); }); });
        el.querySelector('#or-csv').addEventListener('click', function () {
            var rows = [['Order', 'Status', 'Placed', 'Customer', 'Email', 'Phone', 'Items', 'Maker', 'Total', 'QuickBooks invoice']];
            orders.filter(matches).forEach(function (o) {
                rows.push([o.order_number, (ctx.statusOf[o.status] || {}).label || o.status, o.created_at, o.contact_name, o.contact_email, o.contact_phone,
                    itemsOf(o), makersOf(o), o.subtotal, o.quickbooks_invoice_id]);
            });
            ctx.csv(rows, 'design-lab-orders.csv');
        });
        rowsEl.addEventListener('click', function (e) { var tr = e.target.closest('[data-n]'); if (tr) ctx.go('#orders/' + tr.dataset.n); });
        rowsEl.addEventListener('keydown', function (e) { var tr = e.target.closest('[data-n]'); if (tr && e.key === 'Enter') ctx.go('#orders/' + tr.dataset.n); });

        // ---------- one order ----------
        function portalSheet(o) {
            var by = {};
            (o.order_items || []).forEach(function (i) {
                var maker = MAKERS ? i.vendor_snapshot || 'Maker not recorded' : 'Order sheet';
                (by[maker] = by[maker] || []).push(i);
            });
            return Object.keys(by).map(function (maker) {
                var lines = by[maker].map(function (i) {
                    var parts = [i.name_snapshot, i.finish_snapshot || '', i.hinge_side ? 'Hinge ' + i.hinge_side : ''];
                    var mods = (i.mods_snapshot || []).map(function (m) { return i.item_type === 'collection' ? m.quantity + ' × ' + m.mfg_sku : m.name; });
                    return i.quantity + ' × ' + (i.mfg_sku_snapshot || i.sku_snapshot || '(no item #)') + '  ·  ' + parts.filter(Boolean).join('  ·  ') + (mods.length ? '\n     ' + (i.item_type === 'collection' ? 'Includes: ' : 'Mods: ') + mods.join(', ') : '');
                });
                return { maker: maker, text: 'Design Lab order #' + o.order_number + ' · ' + maker + '\n' + lines.join('\n') };
            });
        }
        function openOrder(n) {
            var o = orders.filter(function (x) { return String(x.order_number) === String(n); })[0];
            if (!o) { if (orders.length) ctx.toast('Order #' + n + ' wasn\'t found.', 'bad'); return; }
            if (panel) panel.close();
            panel = ctx.drawer('Order #' + o.order_number);
            panel.onClose = function () { panel = null; openNumber = null; if (location.hash.indexOf('#orders/') === 0 && !/status-/.test(location.hash)) history.replaceState(null, '', '#orders'); };
            var idx = ctx.STATUS.map(function (s) { return s.key; }).indexOf(o.status);
            var flow = ctx.STATUS.filter(function (s) { return s.key !== 'cancelled'; });
            var next = o.status === 'cancelled' || o.status === 'completed' ? null : flow[Math.min(idx + 1, flow.length - 1)];
            var a = o.shipping_address || null;
            var addr = a ? [a.line1, [a.city, a.state].filter(Boolean).join(', '), a.zip].filter(Boolean).join(' · ') : '';
            var sheets = portalSheet(o);
            panel.body.innerHTML =
                '<section class="card card-pad" style="display:grid;gap:12px">' +
                    '<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">' + ctx.statusPill(o.status) +
                        '<span class="muted small">Placed ' + esc(ctx.fmtDate(o.created_at, true)) + (o.updated_at && o.updated_at !== o.created_at ? ' · updated ' + esc(ctx.timeAgo(o.updated_at)) : '') + '</span></div>' +
                    '<div class="muted small">' + esc((ctx.statusOf[o.status] || {}).hint || '') + '</div>' +
                    '<div class="toolbar">' +
                        (next && next.key !== o.status ? '<button class="btn btn-primary btn-sm" data-move="' + next.key + '">Move to ' + esc(next.label) + '</button>' : '') +
                        '<label class="sr-only" for="od-status">Set status</label><select class="input" id="od-status" style="width:auto">' +
                            ctx.STATUS.map(function (s) { return '<option value="' + s.key + '"' + (s.key === o.status ? ' selected' : '') + '>' + esc(s.label) + '</option>'; }).join('') +
                        '</select>' +
                    '</div>' +
                '</section>' +
                '<section class="card"><div class="card-head"><h2>Customer</h2></div><div class="card-body" style="display:grid;gap:6px">' +
                    '<strong>' + esc(o.contact_name) + '</strong>' +
                    (o.contact_email ? '<a href="mailto:' + esc(o.contact_email) + '">' + esc(o.contact_email) + '</a>' : '') +
                    (o.contact_phone ? '<a href="tel:' + esc(o.contact_phone) + '">' + esc(o.contact_phone) + '</a>' : '') +
                    (addr ? '<span class="muted">' + esc(addr) + '</span>' : '<span class="muted">No delivery address given.</span>') +
                    (o.customer_notes ? '<p style="margin:6px 0 0;padding:10px 12px;border-radius:8px;background:var(--surface-2)">“' + esc(o.customer_notes) + '”</p>' : '') +
                '</div></section>' +
                '<section class="card"><div class="card-head"><h2>Items</h2><span class="sp"></span><span class="muted small">' + itemsOf(o) + ' items' +
                    (o.subtotal != null ? ' · ' + ctx.money.format(o.subtotal) : '') + '</span></div><ul class="list">' +
                    (o.order_items || []).map(function (i) {
                        var detail = [i.finish_snapshot, i.hinge_side ? 'Hinge ' + i.hinge_side : '', i.sku_snapshot ? 'Our # ' + i.sku_snapshot : ''].filter(Boolean).join(' · ');
                        var mods = (i.mods_snapshot || []).map(function (m) { return i.item_type === 'collection' ? m.quantity + ' × ' + m.mfg_sku : m.name; }).join(', ');
                        return '<li><strong>' + i.quantity + '×</strong><div class="grow"><div class="t">' + esc(i.name_snapshot) + '</div><div class="d">' + esc(detail) +
                            (mods ? '<br>' + (i.item_type === 'collection' ? 'Includes: ' : 'Mods: ') + esc(mods) : '') +
                            (i.vendor_snapshot ? '<br><span style="color:var(--gold)">Order from ' + esc(i.vendor_snapshot) + (i.mfg_sku_snapshot ? ' # ' + esc(i.mfg_sku_snapshot) : '') + '</span>' : '') +
                            '</div></div><span class="small">' + (i.line_total != null ? ctx.money.format(i.line_total) : '') + '</span></li>';
                    }).join('') + '</ul></section>' +
                '<section class="card"><div class="card-head"><h2>' + (MAKERS ? 'Partner portal sheet' : 'Order sheet') + '</h2><span class="sp"></span><span class="muted small">' + (MAKERS ? 'Copy into the maker\'s ordering site' : 'Makers are shown with the See real makers tag') + '</span></div><div class="card-body" style="display:grid;gap:14px">' +
                    sheets.map(function (s, k) {
                        return '<div><div style="display:flex;align-items:center;gap:10px;margin-bottom:6px"><strong>' + esc(s.maker) + '</strong><span class="sp"></span>' +
                            '<button class="btn btn-sm" data-copy="' + k + '">Copy</button></div>' +
                            '<pre style="margin:0;white-space:pre-wrap;font-size:13px;line-height:1.6;padding:12px;border-radius:8px;background:#0e0e0e;border:1px solid var(--line)">' + esc(s.text) + '</pre></div>';
                    }).join('') +
                    '<div><button class="btn btn-sm" id="od-print" type="button">Print order</button></div>' +
                '</div></section>' +
                '<section class="card"><div class="card-head"><h2>Team notes</h2><span class="sp"></span><span class="muted small">Only the team sees these</span></div><div class="card-body" style="display:grid;gap:12px">' +
                    '<label class="field">Internal notes<textarea id="od-notes" placeholder="Called the customer, confirmed the sink base width…">' + esc(o.internal_notes || '') + '</textarea></label>' +
                    '<label class="field">QuickBooks invoice #<input id="od-qb" value="' + esc(o.quickbooks_invoice_id || '') + '" placeholder="e.g. 1042"></label>' +
                    '<div class="toolbar"><button class="btn btn-primary btn-sm" id="od-save" type="button">Save notes</button><span class="sp"></span>' +
                    '<button class="btn btn-sm btn-danger" id="od-delete" type="button">Delete order</button></div>' +
                '</div></section>';

            var b = panel.body;
            function update(fields, msg) {
                fields.updated_at = new Date().toISOString();
                return ctx.sb.from('orders').update(fields).eq('id', o.id).select('id').then(function (r) {
                    if (r.error || !r.data || !r.data.length) { ctx.toast('That didn\'t save. Try again.', 'bad'); return false; }
                    Object.keys(fields).forEach(function (k) { o[k] = fields[k]; });
                    ctx.toast(msg); paint(); ctx.orders.refresh();
                    return true;
                });
            }
            b.addEventListener('click', function (e) {
                var mv = e.target.closest('[data-move]');
                if (mv) update({ status: mv.dataset.move }, 'Order #' + o.order_number + ' → ' + ctx.statusOf[mv.dataset.move].label).then(function (ok) { if (ok) openOrder(o.order_number); });
                var cp = e.target.closest('[data-copy]');
                if (cp) ctx.copy(sheets[Number(cp.dataset.copy)].text, cp);
            });
            b.querySelector('#od-status').addEventListener('change', function (e) {
                var to = e.target.value;
                if (to === 'cancelled' && !confirm('Cancel order #' + o.order_number + '?')) { e.target.value = o.status; return; }
                update({ status: to }, 'Order #' + o.order_number + ' → ' + ctx.statusOf[to].label).then(function (ok) { if (ok) openOrder(o.order_number); });
            });
            b.querySelector('#od-save').addEventListener('click', function () {
                update({ internal_notes: b.querySelector('#od-notes').value.trim() || null, quickbooks_invoice_id: b.querySelector('#od-qb').value.trim() || null }, 'Notes saved.');
            });
            b.querySelector('#od-delete').addEventListener('click', function () {
                if (!confirm('Delete order #' + o.order_number + ' for good? Use this for test orders. Real orders should be Cancelled instead.')) return;
                ctx.sb.from('order_items').delete().eq('order_id', o.id).then(function () {
                    return ctx.sb.from('orders').delete().eq('id', o.id).select('id');
                }).then(function (r) {
                    if (r.error || !r.data || !r.data.length) { ctx.toast('Couldn\'t delete it.', 'bad'); return; }
                    orders = orders.filter(function (x) { return x.id !== o.id; });
                    panel.close(); paint(); ctx.orders.refresh(); ctx.toast('Order #' + o.order_number + ' deleted.');
                });
            });
            b.querySelector('#od-print').addEventListener('click', function () {
                var w = window.open('', '_blank');
                if (!w) return;
                w.document.write('<!doctype html><title>Order #' + o.order_number + '</title><style>body{font:14px/1.5 system-ui;margin:32px}pre{white-space:pre-wrap;font:13px/1.6 ui-monospace,monospace}</style>' +
                    '<h1>Design Lab · Order #' + o.order_number + '</h1><p>' + esc(o.contact_name) + ' · ' + esc(o.contact_email || '') + ' · ' + esc(o.contact_phone || '') + '<br>' + esc(addr) + '</p>' +
                    sheets.map(function (s) { return '<pre>' + esc(s.text) + '</pre>'; }).join('') + (o.customer_notes ? '<p>Customer notes: ' + esc(o.customer_notes) + '</p>' : ''));
                w.document.close(); w.focus(); w.print();
            });
        }

        ctx.orders.onChange(function () { if (!el.hidden && !panel) load(); });
        return {
            show: function (param) {
                if (param && param.indexOf('status-') === 0) { filter = param.slice(7); openNumber = null; }
                else if (param) openNumber = param;
                load();
            }
        };
    }
});
