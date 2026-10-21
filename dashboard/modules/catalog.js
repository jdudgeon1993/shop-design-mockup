// Catalog: what's live in the store per maker, the "show pricing" switch for this
// browser, and links to where the catalog is edited.
DLDash.register({
    id: 'catalog', label: 'Catalog', order: 50,
    icon: '<path d="M4 4h16v6H4zM4 14h7v6H4zM15 14h5v6h-5z"/>',
    mount: function (el, ctx) {
        var esc = ctx.esc;
        el.innerHTML =
            '<div class="kpis" id="ca-kpis"></div>' +
            '<div class="grid grid-2">' +
                '<section class="card"><div class="card-head"><h2>By maker</h2></div><div class="table-wrap"><table class="table"><thead><tr><th>Maker</th><th>Lines</th><th class="r">Door styles</th><th class="r">Finishes</th></tr></thead><tbody id="ca-makers"></tbody></table></div></section>' +
                '<div class="grid">' +
                    '<section class="card"><div class="card-head"><h2>Pricing</h2></div><div class="card-body" style="display:grid;gap:10px">' +
                        '<p class="muted small" style="margin:0">Customers see “Pricing coming soon”. Turn pricing on to see prices in the DIY Shop, Collections and cart in this browser while you\'re signed in.</p>' +
                        '<label class="avail"><input type="checkbox" id="ca-prices"><span class="switch" aria-hidden="true"></span><span>Show pricing in this browser</span></label>' +
                    '</div></section>' +
                    '<section class="card"><div class="card-head"><h2>Open</h2></div><ul class="list">' +
                        link('/diy-wizard/', 'DIY Shop', 'What customers see, step by step') +
                        link('/collections/', 'Curated Collections', 'The Denver, The Aspen…') +
                        link('/cart/', 'Cart', 'Your own test cart in this browser') +
                        link('https://supabase.com/dashboard/project/nutgbxgnkvvruaoloqch/editor', 'Supabase tables', 'Products, prices, finishes and collections are edited here') +
                        link('/proto/diy-wizard/index.html', 'Prototype: DIY Wizard', 'Early sandbox, for reference') +
                        link('/proto/vendors/index.html', 'Prototype: Vendor showcase', 'Early sandbox, for reference') +
                    '</ul></section>' +
                '</div>' +
            '</div>';
        function link(href, t, d) {
            return '<li><div class="grow"><a class="t" href="' + href + '" target="_blank" rel="noopener" style="color:var(--ink);text-decoration:none">' + esc(t) + ' ↗</a><div class="d">' + esc(d) + '</div></div></li>';
        }
        var toggle = el.querySelector('#ca-prices');
        // The database only sends prices with the See pricing tag.
        if (!ctx.has('pricing')) {
            toggle.disabled = true; DL.prices.set(false);
            toggle.closest('.card-body').insertAdjacentHTML('beforeend', '<p class="muted small" style="margin:0">You need the See pricing tag for this. Ask an admin.</p>');
        }
        toggle.checked = DL.prices.shown();
        toggle.addEventListener('change', function () { DL.prices.set(toggle.checked); ctx.toast(toggle.checked ? 'Prices are showing in this browser.' : 'Prices are hidden again.'); });

        function count(table, active) {
            var q = ctx.sb.from(table).select('id', { count: 'exact', head: true });
            if (active) q = q.eq('is_active', true);
            return q.then(function (r) { return r.count || 0; });
        }
        function load() {
            Promise.all([
                count('products', true), count('product_families', true), count('door_styles', true), count('finishes', true),
                ctx.sb.from('vendors').select('id,name').order('id'),
                ctx.sb.from('product_lines').select('id,name,vendor_id'),
                ctx.sb.from('door_styles').select('id,line_id').eq('is_active', true),
                ctx.sb.from('finishes').select('id,door_style_id').eq('is_active', true)
            ]).then(function (r) {
                var k = function (v, label, sub) { return '<div class="kpi"><div class="k">' + label + '</div><div class="v">' + v.toLocaleString() + '</div><div class="s">' + sub + '</div></div>'; };
                el.querySelector('#ca-kpis').innerHTML = k(r[0], 'Products', 'cabinets, panels, parts') + k(r[1], 'Families', 'cards in the DIY Shop') +
                    k(r[2], 'Door styles', 'live in the store') + k(r[3], 'Finishes', 'across all styles');
                var lines = r[5].data || [], styles = r[6].data || [], fins = r[7].data || [];
                el.querySelector('#ca-makers').innerHTML = (r[4].data || []).map(function (v) {
                    var myLines = lines.filter(function (l) { return l.vendor_id === v.id; });
                    var lineIds = myLines.map(function (l) { return l.id; });
                    var myStyles = styles.filter(function (s) { return lineIds.indexOf(s.line_id) >= 0; });
                    var styleIds = myStyles.map(function (s) { return s.id; });
                    var myFins = fins.filter(function (f) { return styleIds.indexOf(f.door_style_id) >= 0; });
                    return '<tr style="cursor:default"><td><strong>' + esc(v.name) + '</strong></td><td>' + esc(myLines.map(function (l) { return l.name; }).join(', ') || '—') +
                        '</td><td class="r">' + myStyles.length + '</td><td class="r">' + myFins.length + '</td></tr>';
                }).join('');
            });
        }
        return { show: load };
    }
});
