// The one site header for every storefront page. Style: Assets/dl-header.css.
//
// Put <script src="/Assets/dl-header.js"></script> as the FIRST thing inside
// <body>: it builds the header right there, before the rest of the page is
// parsed, so there is no flash. To change the links, edit LINKS below; every
// page picks it up.
//
// <body data-header="overlay"> makes the header float over the page (the home
// page's photo) instead of sitting at the top of it.
(function () {
    var LINKS = [
        { href: '/home/', label: 'Home' },
        { href: '/diy-wizard/', label: 'DIY Shop' },
        { href: '/collections/', label: 'Curated Collections' },
        { href: '/about/', label: 'About Us' }
    ];
    // CONNECT goes to email until the contact form exists.
    var CONNECT = { href: 'mailto:hello@shopdesignlab.com', label: 'Connect' };

    var body = document.body;
    if (!body) return;
    var path = location.pathname;
    function current(href) {
        // Anything under /collections/ counts as Curated Collections.
        return path === href || (href !== '/home/' && path.indexOf(href) === 0) ? ' aria-current="page"' : '';
    }
    var links = LINKS.map(function (l) { return '<a href="' + l.href + '"' + current(l.href) + '>' + l.label + '</a>'; }).join('');
    var cartIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 7h12l1 13H5L6 7Z"></path><path d="M9 7a3 3 0 0 1 6 0"></path></svg>';

    var header = document.createElement('header');
    header.className = 'site-header' + (body.getAttribute('data-header') === 'overlay' ? ' is-overlay on-photo' : '');
    header.innerHTML =
        '<a class="sh-brand" href="/home/" aria-label="Design Lab home">' +
            '<img src="/Assets/Logos/dl-mark-gold.svg" alt="" width="27" height="32"><span class="sh-name">Design Lab</span></a>' +
        '<nav class="sh-nav" aria-label="Main">' + links + '</nav>' +
        '<div class="sh-right">' +
            '<span data-scheme-slot></span>' +
            '<a class="sh-cart" href="/cart/" aria-label="Cart">' + cartIcon + '<span class="sh-count" data-cart-count hidden>0</span></a>' +
            '<a class="sh-connect" href="' + CONNECT.href + '">' + CONNECT.label + '</a>' +
            '<button type="button" class="sh-burger" aria-label="Menu" aria-expanded="false" aria-controls="sh-menu"><span></span><span></span><span></span></button>' +
        '</div>' +
        '<div class="sh-menu" id="sh-menu" hidden>' + links +
            '<a class="sh-connect" href="' + CONNECT.href + '">' + CONNECT.label + '</a></div>';
    body.insertBefore(header, body.firstChild);

    var burger = header.querySelector('.sh-burger'), menu = header.querySelector('.sh-menu');
    function setOpen(open) {
        menu.hidden = !open;
        burger.setAttribute('aria-expanded', open ? 'true' : 'false');
        burger.setAttribute('aria-label', open ? 'Close menu' : 'Menu');
    }
    burger.addEventListener('click', function () { setOpen(menu.hidden); });
    menu.addEventListener('click', function (e) { if (e.target.closest('a')) setOpen(false); });
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && !menu.hidden) { setOpen(false); burger.focus(); }
    });
    document.addEventListener('click', function (e) { if (!menu.hidden && !header.contains(e.target)) setOpen(false); });
    window.addEventListener('resize', function () { if (!menu.hidden && window.innerWidth > 1120) setOpen(false); });

    // Pages without the shared cart script still show the count.
    if (!window.DL) {
        try {
            var cart = JSON.parse(localStorage.getItem('dl_cart_v2') || '[]'); // same key as Assets/dl-core.js
            var n = (Array.isArray(cart) ? cart : []).reduce(function (s, l) { return s + (Number(l.quantity) || 1); }, 0);
            var badge = header.querySelector('.sh-count');
            if (n > 0) { badge.textContent = n; badge.hidden = false; }
        } catch (e) {}
    }
})();
