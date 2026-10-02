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

    window.DL = {
        supabase: supabase,
        formatMoney: formatMoney,
        fetchAll: fetchAll,
        escapeHtml: escapeHtml,
        cart: cart
    };
})();
