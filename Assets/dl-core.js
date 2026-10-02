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

    // Best photo for a product (or family) in a door style + finish. Falls back from the
    // exact finish -> any-finish drawing -> another finish of the same style.
    function pickPhoto(rows, o) {
        function score(r) {
            if (o.styleId != null && r.door_style_id !== o.styleId) return -1;
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

    window.DL = {
        supabase: supabase,
        formatMoney: formatMoney,
        fetchAll: fetchAll,
        escapeHtml: escapeHtml,
        cart: cart,
        doorSvg: doorSvg,
        doorGuide: doorGuide,
        photos: photos
    };
})();
