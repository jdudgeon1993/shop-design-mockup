// Shared storefront helpers: Supabase client, money formatting, paged fetches and the
// cart. Load after supabase-js:
//   <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
//   <script src="/Assets/dl-core.js"></script>
//
// The cart lives in localStorage until the customer submits it. Prices stored on a cart
// line are for display only: public.place_order() re-prices every line on the server.
(function () {
    var SUPABASE_URL = 'https://nutgbxgnkvvruaoloqch.supabase.co';
    var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im51dGdieGdua3Z2cnVhb2xvcWNoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ2NDEzNDgsImV4cCI6MjEwMDIxNzM0OH0.v9hXYtxOslhyXOu-mZVjm_EFaUIdTqTWKn9P3B7BY64';
    var CART_KEY = 'dl_cart_v2';

    var supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    var money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
    function formatMoney(n) { return money.format(Number(n) || 0); }

    // Supabase returns at most 1000 rows per request; fetch every page of a query.
    // build(from, to) must return a fresh query with .range(from, to) applied.
    function fetchAll(build, pageSize) {
        pageSize = pageSize || 1000;
        var rows = [];
        function page(from) {
            return build(from, from + pageSize - 1).then(function (res) {
                if (res.error) throw res.error;
                rows = rows.concat(res.data);
                return res.data.length === pageSize ? page(from + pageSize) : rows;
            });
        }
        return page(0);
    }

    function escapeHtml(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }

    // ---------- cart ----------
    var listeners = [];

    function readCart() {
        try {
            var lines = JSON.parse(localStorage.getItem(CART_KEY) || '[]');
            return Array.isArray(lines) ? lines : [];
        } catch (e) { return []; }
    }
    function writeCart(lines) {
        try { localStorage.setItem(CART_KEY, JSON.stringify(lines)); } catch (e) {}
        listeners.forEach(function (fn) { fn(lines); });
    }
    function lineId() {
        return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    }
    // Two lines are the "same item" when everything but quantity matches.
    function sameItem(a, b) {
        return a.type === b.type && a.product_id === b.product_id && a.collection_id === b.collection_id &&
            a.finish_id === b.finish_id && (a.upgrade_id || null) === (b.upgrade_id || null) &&
            (a.hinge_side || null) === (b.hinge_side || null) &&
            JSON.stringify((a.modification_ids || []).slice().sort()) === JSON.stringify((b.modification_ids || []).slice().sort());
    }

    var cart = {
        lines: readCart,
        count: function () {
            return readCart().reduce(function (n, l) { return n + (l.quantity || 0); }, 0);
        },
        subtotal: function () {
            return readCart().reduce(function (n, l) { return n + (l.display.unit_price || 0) * (l.quantity || 0); }, 0);
        },
        // line: { type:'product', product_id, finish_id, upgrade_id?, hinge_side?, modification_ids?, quantity,
        //         display:{ title, detail, image, unit_price } }
        //    or { type:'collection', collection_id, finish_id, quantity, display:{...} }
        add: function (line) {
            var lines = readCart();
            var existing = lines.filter(function (l) { return sameItem(l, line); })[0];
            if (existing) {
                existing.quantity = Math.min(999, existing.quantity + (line.quantity || 1));
                existing.display = line.display;
            } else {
                line.id = lineId();
                line.quantity = line.quantity || 1;
                lines.push(line);
            }
            writeCart(lines);
        },
        setQuantity: function (id, qty) {
            var lines = readCart();
            lines.forEach(function (l) { if (l.id === id) l.quantity = Math.max(1, Math.min(999, qty | 0)); });
            writeCart(lines);
        },
        // fn(line) mutates a line in place (e.g. refreshed price); listeners fire once.
        update: function (id, fn) {
            var lines = readCart();
            lines.forEach(function (l) { if (l.id === id) fn(l); });
            writeCart(lines);
        },
        remove: function (id) {
            writeCart(readCart().filter(function (l) { return l.id !== id; }));
        },
        clear: function () { writeCart([]); },
        onChange: function (fn) { listeners.push(fn); }
    };

    // Keep other tabs in sync.
    window.addEventListener('storage', function (e) {
        if (e.key === CART_KEY) listeners.forEach(function (fn) { fn(readCart()); });
    });

    // Any element with [data-cart-count] shows the live item count.
    function paintCartCount() {
        var n = cart.count();
        document.querySelectorAll('[data-cart-count]').forEach(function (el) {
            el.textContent = n;
            el.hidden = n === 0;
        });
    }
    cart.onChange(paintCartCount);
    document.addEventListener('DOMContentLoaded', paintCartCount);

    // ---------- door style drawings ----------
    // Until product photos arrive, door styles are drawn: a drawer front over a door, in the
    // chosen finish color. door: 'shaker' | 'raised'; drawer: 'slab' | 'shaker'.
    function shade(hex, pct) {
        var n = parseInt(String(hex || '#8a8a8a').slice(1), 16);
        var r = n >> 16, g = (n >> 8) & 255, b = n & 255;
        var t = pct < 0 ? 0 : 255, p = Math.abs(pct) / 100;
        function mix(c) { return Math.round((t - c) * p + c); }
        return 'rgb(' + mix(r) + ',' + mix(g) + ',' + mix(b) + ')';
    }
    function panel(x, y, w, h, frame, kind, base, edge) {
        var out = '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="1.5" fill="' + base + '" stroke="' + edge + '" stroke-width="1.2"/>';
        if (kind === 'slab') {
            return out + '<line x1="' + (x + 2) + '" y1="' + (y + 1.6) + '" x2="' + (x + w - 2) + '" y2="' + (y + 1.6) + '" stroke="' + shade(base, 35) + '" stroke-width="0.8" stroke-opacity="0.7"/>';
        }
        var ix = x + frame, iy = y + frame, iw = w - frame * 2, ih = h - frame * 2;
        out += '<rect x="' + ix + '" y="' + iy + '" width="' + iw + '" height="' + ih + '" fill="' + shade(base, -10) + '" stroke="' + edge + '" stroke-width="0.9"/>';
        // light catching the lower/right edge of the recess gives it depth
        out += '<path d="M' + (ix + iw) + ' ' + iy + ' V' + (iy + ih) + ' H' + ix + '" fill="none" stroke="' + shade(base, 40) + '" stroke-width="0.9" stroke-opacity="0.8"/>';
        if (kind === 'raised') {
            var b2 = Math.min(iw, ih) * 0.16, fx = ix + b2, fy = iy + b2, fw = iw - b2 * 2, fh = ih - b2 * 2;
            out += '<rect x="' + fx + '" y="' + fy + '" width="' + fw + '" height="' + fh + '" fill="' + shade(base, 8) + '" stroke="' + edge + '" stroke-width="0.7"/>';
            out += '<path d="M' + ix + ' ' + iy + ' L' + fx + ' ' + fy + ' M' + (ix + iw) + ' ' + iy + ' L' + (fx + fw) + ' ' + fy +
                ' M' + ix + ' ' + (iy + ih) + ' L' + fx + ' ' + (fy + fh) + ' M' + (ix + iw) + ' ' + (iy + ih) + ' L' + (fx + fw) + ' ' + (fy + fh) +
                '" stroke="' + edge + '" stroke-width="0.6" stroke-opacity="0.8"/>';
        }
        return out;
    }
    function doorSvg(door, drawer, hex, opts) {
        opts = opts || {};
        var base = hex || '#9a8a76', edge = 'rgba(0,0,0,0.45)', pull = '#a7adb3';
        var svg = '<svg viewBox="0 0 100 150" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="' + escapeHtml(opts.label || 'Door style drawing') + '"' +
            (opts.className ? ' class="' + opts.className + '"' : '') + '>';
        if (opts.drawerOnly) {
            svg = '<svg viewBox="0 0 100 40" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="' + escapeHtml(opts.label || 'Drawer front drawing') + '"' +
                (opts.className ? ' class="' + opts.className + '"' : '') + '>';
            svg += panel(5, 5, 90, 30, 6, drawer, base, edge);
            svg += '<rect x="40" y="18.5" width="20" height="3" rx="1.5" fill="' + pull + '" stroke="rgba(0,0,0,0.35)" stroke-width="0.5"/>';
            return svg + '</svg>';
        }
        svg += panel(5, 5, 90, 32, 6, drawer, base, edge);
        svg += '<rect x="40" y="19.5" width="20" height="3" rx="1.5" fill="' + pull + '" stroke="rgba(0,0,0,0.35)" stroke-width="0.5"/>';
        svg += panel(5, 42, 90, 103, 11, door, base, edge);
        svg += '<rect x="80" y="50" width="3" height="20" rx="1.5" fill="' + pull + '" stroke="rgba(0,0,0,0.35)" stroke-width="0.5"/>';
        return svg + '</svg>';
    }

    // ---------- door style guide (modal) ----------
    // DL.doorGuide.open({ styles: [...door_styles rows], finishesByStyle: { styleId: [finishes] }, upgrade: row })
    var GLOSSARY = [
        ['Shaker', 'A door with a flat center panel set inside a simple square frame. Clean and timeless; works in almost any kitchen.', 'shaker', 'shaker'],
        ['Raised panel', 'The center panel is raised and beveled at the edges for a more traditional, detailed look.', 'raised', 'shaker'],
        ['Slab drawer front', 'A smooth, one-piece drawer front with no frame. Simple and easy to clean.', null, 'slab'],
        ['5-piece drawer front', 'A drawer front built like a small shaker door (frame plus center panel), so drawers match the doors.', null, 'shaker'],
        ['Overlay', 'How much of the cabinet box the doors cover. Full overlay hides the frame for a seamless look; standard overlay shows a little of the frame around each door.', null, null]
    ];
    var guideEl = null;
    function ensureGuide() {
        if (guideEl) return guideEl;
        var css = document.createElement('style');
        css.textContent =
            '.dlg-overlay[hidden]{display:none!important}' +
            '.dlg-overlay{position:fixed;inset:0;z-index:60;background:rgba(0,0,0,.75);display:flex;align-items:flex-end;justify-content:center}' +
            '@media(min-width:760px){.dlg-overlay{align-items:center;padding:24px}}' +
            '.dlg{position:relative;width:100%;max-width:1040px;max-height:92vh;overflow-y:auto;background:#1a1a1a;color:#fff;border:1px solid rgba(255,255,255,.15);border-radius:14px 14px 0 0;padding:28px 24px 32px;font-family:Montserrat,sans-serif}' +
            '@media(min-width:760px){.dlg{border-radius:14px;padding:34px 36px}}' +
            '.dlg h2{margin:0 0 6px;font-family:"Playfair Display",serif;font-weight:600;font-size:30px}' +
            '.dlg .dlg-sub{margin:0 0 24px;color:rgba(255,255,255,.6);font-size:14px}' +
            '.dlg-close{position:absolute;top:14px;right:14px;width:36px;height:36px;border-radius:50%;border:none;background:rgba(255,255,255,.08);color:#fff;font-size:20px;cursor:pointer}' +
            '.dlg-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:16px}' +
            '.dlg-card{border:1px solid rgba(255,255,255,.13);border-radius:12px;padding:18px;background:rgba(255,255,255,.03)}' +
            '.dlg-card svg{width:92px;height:auto;display:block;margin:0 auto 14px;filter:drop-shadow(0 4px 10px rgba(0,0,0,.4))}' +
            '.dlg-card h3{margin:0 0 4px;font-size:17px}.dlg-card .dlg-tag{margin:0 0 10px;color:#d4af37;font-size:12.5px;font-weight:700}' +
            '.dlg-card p{margin:0 0 12px;font-size:13px;line-height:1.55;color:rgba(255,255,255,.75)}' +
            '.dlg-fins{display:flex;flex-wrap:wrap;gap:6px 12px;font-size:12px;color:rgba(255,255,255,.65)}' +
            '.dlg-fins span{display:inline-flex;align-items:center;gap:5px}.dlg-fins i{width:12px;height:12px;border-radius:50%;display:inline-block;border:1px solid rgba(0,0,0,.4)}' +
            '.dlg h4{margin:30px 0 12px;font-size:12px;letter-spacing:1.5px;text-transform:uppercase;color:rgba(255,255,255,.55)}' +
            '.dlg-gloss{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px}' +
            '.dlg-term{display:flex;gap:12px;align-items:flex-start;font-size:13px;line-height:1.5;color:rgba(255,255,255,.75)}' +
            '.dlg-term svg{width:40px;flex-shrink:0}.dlg-term b{display:block;color:#fff;font-size:14px;margin-bottom:2px}' +
            '.dlg-term .dlg-nosvg{width:40px;flex-shrink:0}';
        document.head.appendChild(css);
        guideEl = document.createElement('div');
        guideEl.className = 'dlg-overlay';
        guideEl.hidden = true;
        guideEl.innerHTML = '<div class="dlg" role="dialog" aria-modal="true" aria-labelledby="dlg-title"><button class="dlg-close" type="button" aria-label="Close">&times;</button>' +
            '<h2 id="dlg-title">Door Style Guide</h2><p class="dlg-sub">Every style below is shown in one of its finishes. Real product photos are coming soon.</p>' +
            '<div class="dlg-grid" data-styles></div><h4>Cabinet words, explained</h4><div class="dlg-gloss" data-gloss></div></div>';
        document.body.appendChild(guideEl);
        function close() { guideEl.hidden = true; document.body.style.overflow = guideEl._prevOverflow || ''; }
        guideEl.addEventListener('click', function (e) { if (e.target === guideEl || e.target.closest('.dlg-close')) close(); });
        document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !guideEl.hidden) close(); });
        return guideEl;
    }
    var doorGuide = {
        open: function (o) {
            var el = ensureGuide();
            el.querySelector('[data-styles]').innerHTML = (o.styles || []).map(function (s) {
                var fins = (o.finishesByStyle && o.finishesByStyle[s.id]) || [];
                var hex = fins.length ? fins[Math.min(1, fins.length - 1)].swatch_hex : null;
                return '<div class="dlg-card">' + doorSvg(s.door_profile, s.drawer_profile, hex, { label: s.name + ' door style' }) +
                    '<h3>' + escapeHtml(s.name) + '</h3><p class="dlg-tag">' + escapeHtml(s.tagline || '') + '</p>' +
                    '<p>' + escapeHtml(s.customer_description || '') + '</p>' +
                    '<div class="dlg-fins">' + fins.map(function (f) {
                        return '<span><i style="background:' + escapeHtml(f.swatch_hex || '#777') + '"></i>' + escapeHtml(f.name) + '</span>';
                    }).join('') + '</div></div>';
            }).join('');
            el.querySelector('[data-gloss]').innerHTML = GLOSSARY.map(function (g) {
                var art = g[2] ? doorSvg(g[2], g[3], '#b9a589', { label: g[0] })
                    : g[3] ? doorSvg(null, g[3], '#b9a589', { drawerOnly: true, label: g[0] }) : '<span class="dlg-nosvg"></span>';
                return '<div class="dlg-term">' + art + '<div><b>' + escapeHtml(g[0]) + '</b>' + escapeHtml(g[1]) + '</div></div>';
            }).join('');
            el._prevOverflow = document.body.style.overflow;
            document.body.style.overflow = 'hidden';
            el.hidden = false;
            el.querySelector('.dlg-close').focus();
        }
    };

    // ---------- Product photos ----------
    // Photos live in the PRIVATE `product-images` bucket. public.product_images says
    // which photo belongs to which product / door style / finish; the `image-urls`
    // Edge Function signs short-lived URLs for them. Photos are painted as CSS
    // backgrounds under a transparent cover (no <img> to right-click/drag/long-press
    // save). This deters casual saving; screenshots can't be blocked, which is why the
    // uploaded copies carry a watermark and the full-size originals never go online.
    var PHOTO_CACHE_KEY = 'dl_photo_urls_v1';
    var photoIndex = null;   // Promise<rows>
    var photoUrls = {};      // path -> { url, exp }
    try { photoUrls = JSON.parse(sessionStorage.getItem(PHOTO_CACHE_KEY) || '{}'); } catch (e) { photoUrls = {}; }

    var photoCss = document.createElement('style');
    photoCss.textContent =
        '.dl-photo{position:relative;background:#fff center/contain no-repeat;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none}' +
        '.dl-photo::after{content:"";position:absolute;inset:0}' +
        '.dl-photo.is-loading{background-color:#f4f4f4}';
    document.head.appendChild(photoCss);
    ['contextmenu', 'dragstart'].forEach(function (type) {
        document.addEventListener(type, function (e) {
            if (e.target.closest && e.target.closest('.dl-photo')) e.preventDefault();
        });
    });

    function loadPhotoIndex() {
        if (!photoIndex) {
            photoIndex = fetchAll(function (a, b) {
                return supabase.from('product_images')
                    .select('product_id,family_id,door_style_id,finish_id,kind,media,view,hinge,storage_path,sort_order')
                    .order('sort_order').order('id').range(a, b);
            }).catch(function () { return []; });
        }
        return photoIndex;
    }

    // Best photo for a product (or family, or a door sample with doorSample:true) in a door style + finish. Falls back from the
    // exact finish -> any-finish drawing -> another finish of the same style.
    function pickPhoto(rows, o) {
        function score(r) {
            if (o.styleId != null && r.door_style_id !== o.styleId) return -1;
            if (o.media && r.media !== o.media) return -1;
            var s = 0;
            if (o.finishId != null && r.finish_id === o.finishId) s += 40;
            else if (r.finish_id == null) s += 20;
            else if (o.strictFinish) return -1;
            if ((r.view === '5p') === !!o.fivePiece) s += 8;
            if (!r.hinge) s += 2;
            return s;
        }
        function best(list) {
            var top = null, topScore = -1;
            list.forEach(function (r) { var s = score(r); if (s > topScore) { top = r; topScore = s; } });
            return top;
        }
        var hit = null;
        if (o.doorSample) return best(rows.filter(function (r) { return r.kind === 'door_sample'; }));
        if (o.productId != null) hit = best(rows.filter(function (r) { return r.kind === 'product' && r.product_id === o.productId; }));
        if (!hit && o.familyId != null) hit = best(rows.filter(function (r) { return r.kind === 'family' && r.family_id === o.familyId; }));
        return hit;
    }
    function pickPhotoPath(rows, o) { var r = pickPhoto(rows, o); return r ? r.storage_path : null; }

    function signPhotos(paths) {
        var now = Date.now();
        var need = paths.filter(function (p, i) {
            return p && paths.indexOf(p) === i && !(photoUrls[p] && photoUrls[p].exp > now + 60000);
        });
        var batches = [];
        for (var i = 0; i < need.length; i += 100) batches.push(need.slice(i, i + 100));
        return Promise.all(batches.map(function (batch) {
            return supabase.functions.invoke('image-urls', { body: { paths: batch } }).then(function (res) {
                var urls = (res.data && res.data.urls) || {};
                var exp = Date.now() + ((res.data && res.data.expiresIn) || 3600) * 1000;
                Object.keys(urls).forEach(function (p) { photoUrls[p] = { url: urls[p], exp: exp }; });
            }).catch(function () {});
        })).then(function () {
            try { sessionStorage.setItem(PHOTO_CACHE_KEY, JSON.stringify(photoUrls)); } catch (e) {}
            var out = {};
            paths.forEach(function (p) { if (p && photoUrls[p]) out[p] = photoUrls[p].url; });
            return out;
        });
    }

    // Paint every [data-photo] element under root. Elements whose photo can't be signed
    // keep whatever fallback they already show.
    function paintPhotos(root) {
        var els = Array.prototype.slice.call((root || document).querySelectorAll('[data-photo]'));
        if (!els.length) return Promise.resolve();
        return signPhotos(els.map(function (el) { return el.getAttribute('data-photo'); })).then(function (urls) {
            els.forEach(function (el) {
                var url = urls[el.getAttribute('data-photo')];
                el.classList.remove('is-loading');
                if (!url) return;
                el.classList.add('dl-photo');
                el.style.backgroundImage = 'url("' + url + '")';
                el.dispatchEvent(new CustomEvent('dl-photo-painted', { bubbles: true }));
            });
        });
    }

    var photos = { load: loadPhotoIndex, pick: pickPhotoPath, pickRow: pickPhoto, sign: signPhotos, paint: paintPhotos };

    // ---------- "Your kitchen so far" ----------
    // A simple front view of the cabinets in the cart, drawn to scale in the chosen
    // finish: base cabinets along the floor under a countertop, wall cabinets above,
    // tall cabinets at the end. Pieces added since the last draw drop in.
    var KITCHEN_SEEN_KEY = 'dl_kitchen_seen_v1';
    var kitchenProducts = {}, kitchenFinishes = null;

    var kitchenCss = document.createElement('style');
    kitchenCss.textContent =
        '.dl-kitchen{display:block;width:100%;height:auto;border-radius:6px;overflow:hidden}' +
        '.dl-kitchen .kp-new{animation:dlKitchenIn .6s cubic-bezier(.2,.8,.3,1.2) both}' +
        '@keyframes dlKitchenIn{from{opacity:0;transform:translateY(-14px)}to{opacity:1;transform:none}}' +
        '@media (prefers-reduced-motion:reduce){.dl-kitchen .kp-new{animation:none}}';
    document.head.appendChild(kitchenCss);

    // Resolve cart lines to drawable pieces (cabinets only; parts and collections are skipped).
    function kitchenPieces(lines) {
        var ids = lines.filter(function (l) { return l.type === 'product' && !kitchenProducts[l.product_id]; })
            .map(function (l) { return l.product_id; });
        var needProducts = ids.length
            ? supabase.from('products').select('id,kind,space,room_type,subtype,width,height,doors,drawers').in('id', ids)
                .then(function (r) { (r.data || []).forEach(function (p) { kitchenProducts[p.id] = p; }); })
            : Promise.resolve();
        var needFinishes = kitchenFinishes ? Promise.resolve() : supabase.from('finishes').select('id,swatch_hex')
            .then(function (r) { kitchenFinishes = {}; (r.data || []).forEach(function (f) { kitchenFinishes[f.id] = f.swatch_hex; }); });
        return Promise.all([needProducts, needFinishes]).then(function () {
            var pieces = [];
            lines.forEach(function (l) {
                var p = l.type === 'product' && kitchenProducts[l.product_id];
                if (!p || p.kind !== 'cabinet' || !(Number(p.width) > 0)) return;
                for (var i = 0; i < Math.min(l.quantity || 1, 12); i++) {
                    pieces.push({
                        key: l.id + '#' + i, space: p.space === 'Bath' ? 'Bath' : 'Kitchen', room: p.room_type,
                        medicine: /Medicine/.test(p.subtype || ''), w: Number(p.width),
                        h: Number(p.height) || (p.room_type === 'Wall' ? 30 : 34.5),
                        doors: p.doors || 0, drawers: p.drawers || 0, hex: kitchenFinishes[l.finish_id] || '#cfc8bd'
                    });
                }
            });
            return pieces;
        });
    }

    function kitchenFront(x, y, w, h, piece, edge) {
        // Drawers stacked on top, doors side by side below; each gets a shaker-style inset.
        var out = '', inset = Math.min(2, w / 8), gap = 0.4;
        var drawers = piece.drawers, doors = piece.doors;
        if (!drawers && !doors) doors = w > 24 ? 2 : 1;
        var drawerH = drawers ? (doors ? Math.min(6, h / 4) : (h - gap) / drawers) : 0;
        for (var d = 0; d < drawers; d++) {
            var dy = y + gap + d * drawerH, dh = drawerH - gap;
            out += '<rect x="' + (x + gap) + '" y="' + dy + '" width="' + (w - 2 * gap) + '" height="' + dh + '" fill="none" stroke="' + edge + '" stroke-width=".35"/>' +
                '<rect x="' + (x + w / 2 - 2) + '" y="' + (dy + dh / 2 - 0.3) + '" width="4" height=".6" rx=".3" fill="' + edge + '"/>';
        }
        if (doors) {
            var top = y + gap + drawers * drawerH, dw = (w - gap) / doors, dh2 = h - (top - y) - gap;
            for (var k = 0; k < doors; k++) {
                var dx = x + gap + k * dw;
                out += '<rect x="' + dx + '" y="' + top + '" width="' + (dw - gap) + '" height="' + dh2 + '" fill="none" stroke="' + edge + '" stroke-width=".35"/>' +
                    '<rect x="' + (dx + inset) + '" y="' + (top + inset) + '" width="' + Math.max(0, dw - gap - 2 * inset) + '" height="' + Math.max(0, dh2 - 2 * inset) + '" fill="none" stroke="' + edge + '" stroke-width=".25" opacity=".7"/>';
                var hx = doors === 1 ? (dx + dw - gap - inset / 1.5) : (k === 0 ? dx + dw - gap - inset / 1.5 : dx + inset / 1.5);
                var hy = piece.room === 'Wall' ? top + dh2 - 4 : top + 1.2;
                out += '<rect x="' + (hx - 0.3) + '" y="' + hy + '" width=".6" height="3" rx=".3" fill="' + edge + '"/>';
            }
        }
        return out;
    }

    function kShade(hex, f) {
        var n = parseInt((hex || '#cccccc').slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
        function c(v) { return Math.max(0, Math.min(255, Math.round(f < 0 ? v * (1 + f) : v + (255 - v) * f))); }
        return 'rgb(' + c(r) + ',' + c(g) + ',' + c(b) + ')';
    }

    // Returns an SVG string for one space ('Kitchen' or 'Bath'), or '' when it has no pieces.
    function kitchenSvg(pieces, space, seen) {
        var list = pieces.filter(function (p) { return p.space === space; });
        if (!list.length) return '';
        var counterTop = space === 'Bath' ? 33 : 36, upperBottom = space === 'Bath' ? 50 : 54;
        var base = list.filter(function (p) { return p.room !== 'Wall' && p.room !== 'Tall' && !p.medicine; });
        var upper = list.filter(function (p) { return p.room === 'Wall' || p.medicine; });
        var tall = list.filter(function (p) { return p.room === 'Tall'; });
        var baseW = base.reduce(function (n, p) { return n + p.w; }, 0);
        var upperW = upper.reduce(function (n, p) { return n + p.w; }, 0);
        var talls = tall.reduce(function (n, p) { return n + p.w; }, 0);
        var runW = Math.max(baseW, upperW);
        // At least a 12' wall, with the cabinets centered on it, so small carts still read as a room.
        var contentW = runW + talls, totalW = Math.max(contentW, 144), H = 100, pad = 4, x0 = (totalW - contentW) / 2;
        var body = '';
        function piece(p, x, yTop) {
            var edge = kShade(p.hex, -0.35), cls = seen[p.key] ? '' : ' class="kp-new"';
            return '<g' + cls + '><rect x="' + x + '" y="' + yTop + '" width="' + p.w + '" height="' + p.h + '" fill="' + p.hex + '" stroke="' + edge + '" stroke-width=".4"/>' +
                kitchenFront(x, yTop, p.w, p.h, p, edge) + '</g>';
        }
        var x = x0;
        base.forEach(function (p) {
            var cabH = Math.min(p.h, counterTop - 1.5), toe = 4;
            var edge = kShade(p.hex, -0.35), cls = seen[p.key] ? '' : ' class="kp-new"';
            body += '<g' + cls + '><rect x="' + (x + 0.6) + '" y="' + (H - toe) + '" width="' + (p.w - 1.2) + '" height="' + toe + '" fill="' + kShade(p.hex, -0.55) + '"/>' +
                '<rect x="' + x + '" y="' + (H - cabH) + '" width="' + p.w + '" height="' + (cabH - toe) + '" fill="' + p.hex + '" stroke="' + edge + '" stroke-width=".4"/>' +
                kitchenFront(x, H - cabH, p.w, cabH - toe, p, edge) + '</g>';
            x += p.w;
        });
        if (baseW) body += '<rect x="' + (x0 - 1) + '" y="' + (H - counterTop) + '" width="' + (baseW + 2) + '" height="1.5" rx=".4" fill="#e8e4dc" stroke="#9c958a" stroke-width=".3"/>';
        x = x0;
        upper.forEach(function (p) { body += piece(p, x, H - upperBottom - p.h); x += p.w; });
        x = x0 + runW;
        tall.forEach(function (p) { body += piece(p, x, H - p.h); x += p.w; });
        var vbH = H + pad, top = H - upperBottom - 42 - pad;
        return '<svg class="dl-kitchen" viewBox="' + (-pad) + ' ' + top + ' ' + (totalW + 2 * pad) + ' ' + (vbH - top) + '" role="img" aria-label="Preview of the ' +
            (space === 'Bath' ? 'bathroom' : 'kitchen') + ' cabinets in your cart">' +
            // A light wall and floor behind the cabinets so dark and white finishes both read.
            '<rect x="' + (-pad) + '" y="' + top + '" width="' + (totalW + 2 * pad) + '" height="' + (H - top) + '" fill="#ece7df"/>' +
            '<rect x="' + (-pad) + '" y="' + H + '" width="' + (totalW + 2 * pad) + '" height="' + pad + '" fill="#c9bba6"/>' + body + '</svg>';
    }

    function feetInches(inches) {
        var ft = Math.floor(inches / 12), inch = Math.round(inches % 12);
        return (ft ? ft + '′' : '') + (inch ? inch + '″' : (ft ? '' : '0″'));
    }

    // Draw into el. opts.space limits to one space; opts.onEmpty(el) handles an empty cart.
    function renderKitchen(el, opts) {
        opts = opts || {};
        return kitchenPieces(readCart()).then(function (pieces) {
            var seen = {};
            try { seen = JSON.parse(sessionStorage.getItem(KITCHEN_SEEN_KEY) || '{}'); } catch (e) {}
            var spaces = opts.space ? [opts.space] : ['Kitchen', 'Bath'];
            var html = spaces.map(function (space) {
                var svg = kitchenSvg(pieces, space, seen);
                if (!svg) return '';
                var mine = pieces.filter(function (p) { return p.space === space; });
                var baseRun = mine.filter(function (p) { return p.room !== 'Wall' && p.room !== 'Tall' && !p.medicine; })
                    .reduce(function (n, p) { return n + p.w; }, 0);
                return '<figure class="dl-kitchen-fig"><figcaption><b>Your ' + (space === 'Bath' ? 'bathroom' : 'kitchen') + ' so far</b>' +
                    '<span>' + mine.length + (mine.length === 1 ? ' cabinet' : ' cabinets') + (baseRun ? ' · ' + feetInches(baseRun) + ' of base' : '') + '</span></figcaption>' + svg + '</figure>';
            }).join('');
            el.innerHTML = html;
            el.hidden = !html && !opts.keepEmpty;
            if (!html && opts.onEmpty) opts.onEmpty(el);
            pieces.forEach(function (p) { seen[p.key] = true; });
            try { sessionStorage.setItem(KITCHEN_SEEN_KEY, JSON.stringify(seen)); } catch (e) {}
            return pieces;
        });
    }

    // One cabinet on its own (cart thumbnails when there's no photo in the chosen finish).
    function cabinetSvg(p) {
        var edge = kShade(p.hex, -0.35), base = p.room !== 'Wall' && p.room !== 'Tall' && !p.medicine;
        var toe = base ? 4 : 0, h = base ? Math.min(p.h, 34.5) : p.h, m = Math.max(p.w, h) * 0.12;
        return '<svg viewBox="' + (-m) + ' ' + (-m) + ' ' + (p.w + 2 * m) + ' ' + (h + 2 * m) + '" role="img" aria-label="Cabinet drawing" style="width:100%;height:100%;display:block">' +
            (toe ? '<rect x=".6" y="' + (h - toe) + '" width="' + (p.w - 1.2) + '" height="' + toe + '" fill="' + kShade(p.hex, -0.55) + '"/>' : '') +
            '<rect x="0" y="0" width="' + p.w + '" height="' + (h - toe) + '" fill="' + p.hex + '" stroke="' + edge + '" stroke-width=".5"/>' +
            kitchenFront(0, 0, p.w, h - toe, p, edge) + '</svg>';
    }

    var kitchen = { render: renderKitchen, pieces: kitchenPieces, svg: kitchenSvg, cabinet: cabinetSvg };

    window.DL = {
        supabase: supabase,
        formatMoney: formatMoney,
        fetchAll: fetchAll,
        escapeHtml: escapeHtml,
        cart: cart,
        doorSvg: doorSvg,
        doorGuide: doorGuide,
        photos: photos,
        kitchen: kitchen
    };
})();
