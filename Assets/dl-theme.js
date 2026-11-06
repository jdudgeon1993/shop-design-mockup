// Design Lab color-scheme switcher (test, 2026-11).
//
// Load in <head> right after dl-theme.css, BEFORE the page paints, so the
// saved scheme applies with no flash of the old colors. It sets
// <html data-scheme="..."> from (1) ?scheme=<id> in the URL, which also gets
// saved, so a link like /home/?scheme=walnut opens straight into a scheme,
// or (2) the scheme saved in localStorage.
//
// Then it puts a switcher in the center of the page header (.navbar on the
// home page, .top-bar everywhere else): ‹ previous, the current scheme's name
// (click for the full list), next ›. Keys: [ and ] also step through schemes.
(function () {
    var KEY = 'dl_scheme_v1';
    var SCHEMES = [
        { id: 'original', name: 'Original',      note: 'Today’s black and gold',          a: '#1a1a1a', b: '#d4af37', meta: '#1a1a1a' },
        { id: 'walnut',   name: 'Walnut Night',  note: 'Espresso black, warm cream text',      a: '#1c1714', b: '#d4af37', meta: '#1c1714' },
        { id: 'gallery',  name: 'Gallery',       note: 'Dark frame, ivory pages',              a: '#1a1714', b: '#f6f1e9', meta: '#1a1714' },
        { id: 'ivory',    name: 'Ivory & Gold',  note: 'Fully light, deep gold',               a: '#faf7f2', b: '#8a6a1f', meta: '#faf7f2' },
        { id: 'stone',    name: 'Stone & Brass', note: 'Greige pages, taupe frame',            a: '#e6e2da', b: '#4f4842', meta: '#4f4842' },
        { id: 'navy',     name: 'Midnight Navy', note: 'Deep navy, gold accents',              a: '#0f1e2e', b: '#d4af37', meta: '#0f1e2e' }
    ];
    var root = document.documentElement;

    function find(id) {
        for (var i = 0; i < SCHEMES.length; i++) if (SCHEMES[i].id === id) return i;
        return -1;
    }
    function saved() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
    function save(id) { try { localStorage.setItem(KEY, id); } catch (e) {} }

    var fromUrl = null;
    try { fromUrl = new URLSearchParams(location.search).get('scheme'); } catch (e) {}
    var current = find(fromUrl) >= 0 ? find(fromUrl) : Math.max(0, find(saved()));
    if (find(fromUrl) >= 0) save(fromUrl);

    function apply(i) {
        current = (i + SCHEMES.length) % SCHEMES.length;
        var s = SCHEMES[current];
        if (s.id === 'original') root.removeAttribute('data-scheme');
        else root.setAttribute('data-scheme', s.id);
        save(s.id);
        var meta = document.querySelector('meta[name="theme-color"]');
        if (meta) meta.setAttribute('content', s.meta);
        render();
        try { window.dispatchEvent(new CustomEvent('dl:scheme', { detail: s.id })); } catch (e) {}
    }

    var box, nameBtn, menu;
    function dot(s) { return '<span class="dl-dot" style="--a:' + s.a + ';--b:' + s.b + '" aria-hidden="true"></span>'; }
    function render() {
        if (!box) return;
        var s = SCHEMES[current];
        nameBtn.innerHTML = dot(s) + '<span class="dl-scheme-name">' + s.name + '</span>';
        nameBtn.setAttribute('aria-label', 'Color scheme: ' + s.name + '. Show all schemes');
        var items = menu.querySelectorAll('button');
        for (var i = 0; i < items.length; i++) items[i].setAttribute('aria-checked', i === current ? 'true' : 'false');
    }
    function openMenu(open) {
        menu.hidden = !open;
        nameBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
        if (open) { var on = menu.querySelector('[aria-checked="true"]'); if (on) on.focus(); }
    }

    function mount() {
        var host = document.querySelector('.navbar') || document.querySelector('.top-bar');
        if (!host || host.querySelector('.dl-scheme')) return;
        if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
        document.body.classList.add('has-dl-scheme');

        box = document.createElement('div');
        box.className = 'dl-scheme';
        box.setAttribute('role', 'group');
        box.setAttribute('aria-label', 'Color scheme test');
        box.innerHTML =
            '<button type="button" data-step="-1" aria-label="Previous color scheme">‹</button>' +
            '<button type="button" class="dl-scheme-open" aria-haspopup="true" aria-expanded="false"></button>' +
            '<button type="button" data-step="1" aria-label="Next color scheme">›</button>' +
            '<ul class="dl-scheme-menu" role="menu" hidden>' + SCHEMES.map(function (s, i) {
                return '<li role="none"><button type="button" role="menuitemradio" data-i="' + i + '">' + dot(s) +
                    '<span>' + s.name + '<small>' + s.note + '</small></span></button></li>';
            }).join('') + '</ul>';
        // The home navbar is full of links, so there the switcher sits in the
        // free space between the logo and the menu instead of floating on top.
        var brand = host.classList.contains('navbar') && host.querySelector('.nav-brand');
        if (brand) { box.classList.add('in-flow'); brand.insertAdjacentElement('afterend', box); }
        else if (host.firstElementChild) host.firstElementChild.insertAdjacentElement('afterend', box);
        else host.appendChild(box);
        nameBtn = box.querySelector('.dl-scheme-open');
        menu = box.querySelector('.dl-scheme-menu');

        box.addEventListener('click', function (e) {
            var b = e.target.closest('button');
            if (!b) return;
            e.preventDefault(); e.stopPropagation();
            if (b.hasAttribute('data-step')) apply(current + parseInt(b.getAttribute('data-step'), 10));
            else if (b === nameBtn) openMenu(menu.hidden);
            else if (b.hasAttribute('data-i')) { apply(parseInt(b.getAttribute('data-i'), 10)); openMenu(false); nameBtn.focus(); }
        });
        document.addEventListener('click', function (e) { if (!box.contains(e.target)) openMenu(false); });
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && !menu.hidden) { openMenu(false); nameBtn.focus(); return; }
            var t = e.target, tag = t && t.tagName;
            if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (t && t.isContentEditable)) return;
            if (e.key === '[') apply(current - 1);
            else if (e.key === ']') apply(current + 1);
        });
        render();
    }

    apply(current);
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
    else mount();
})();
