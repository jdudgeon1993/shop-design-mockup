// The one site footer for every storefront page. Style: Assets/dl-header.css
// (header and footer are the site's "frame" and share one stylesheet).
//
// Put <script src="/Assets/dl-footer.js"></script> as the LAST thing inside
// <body>. It builds the footer right there.
//
// Short pages: the footer sits at the bottom of the screen, never halfway up.
// Long pages: it follows the content. This is done by giving the footer a top
// margin that fills any gap under short content; it is recalculated whenever
// the page or the window changes size.
(function () {
    var body = document.body;
    if (!body) return;
    var year = new Date().getFullYear();

    var foot = document.createElement('footer');
    foot.className = 'dl-footer';
    foot.innerHTML =
        '<div class="df-in">' +
            '<div class="df-grid">' +
                '<div class="df-brand"><a class="df-lock" href="/home/" aria-label="Design Lab home"><img src="/Assets/Logos/dl-mark-gold.svg" alt="" width="27" height="36"><span>Design Lab</span></a>' +
                    '<p>Online cabinetry. Customer focused. Best flippin&rsquo; home on the block.</p></div>' +
                '<div><h2>Shop</h2><ul>' +
                    '<li><a href="/diy-wizard/">DIY Shop</a></li>' +
                    '<li><a href="/collections/">Curated Collections</a></li>' +
                    '<li><a href="/cart/">Your Cart</a></li></ul></div>' +
                '<div><h2>Learn</h2><ul>' +
                    '<li><a href="/resources/">Resource Library</a></li>' +
                    '<li><a href="/about/">About Us</a></li></ul></div>' +
                '<div><h2>Talk to us</h2><ul>' +
                    '<li><a href="/connect/">Send us a message</a></li>' +
                    '<li><a href="/consultation/">Join a video call</a></li>' +
                    '<li><a href="mailto:hello@shopdesignlab.com">hello@shopdesignlab.com</a></li></ul></div>' +
                '<div class="df-news"><h2>New Field Guides</h2><p>Get each new Field Guide and Lab Book when it&rsquo;s published.</p>' +
                    '<form class="df-signup" novalidate><label for="df-email" class="df-sr">Email</label>' +
                    '<input id="df-email" type="email" autocomplete="email" placeholder="Your email" required>' +
                    '<button type="submit">Join</button></form>' +
                    '<p class="df-msg" aria-live="polite"></p></div>' +
            '</div>' +
            '<div class="df-base"><span>&copy; ' + year + ' Design Lab. All rights reserved.</span>' +
                '<span class="df-base-r">Designed in the Lab &middot; <a href="/dashboard/">Employee sign-in</a></span></div>' +
        '</div>';
    body.appendChild(foot);

    // ---- keep the footer at the bottom of short pages ----
    function place() {
        foot.style.marginTop = '0px';
        var bottom = foot.getBoundingClientRect().bottom + (window.scrollY || 0);
        var gap = window.innerHeight - bottom;
        if (gap > 0) foot.style.marginTop = gap + 'px';
    }
    place();
    window.addEventListener('load', place);
    window.addEventListener('resize', place);
    if (window.ResizeObserver) {
        var busy = false;
        new ResizeObserver(function () {
            if (busy) return;
            busy = true;
            requestAnimationFrame(function () { place(); busy = false; });
        }).observe(body);
    }

    // ---- Field Guide sign-up (Supabase launch_signups, same as the home page had) ----
    var form = foot.querySelector('.df-signup'), msg = foot.querySelector('.df-msg'), input = foot.querySelector('#df-email');
    function loadScript(src) {
        return new Promise(function (ok, fail) {
            var s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = fail; document.head.appendChild(s);
        });
    }
    function core() {
        if (window.DL && window.DL.supabase) return Promise.resolve(window.DL);
        var p = window.supabase ? Promise.resolve() : loadScript('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2');
        return p.then(function () { return loadScript('/Assets/dl-core.js'); }).then(function () { return window.DL; });
    }
    var SORRY = 'Sorry, that didn’t go through. Please try again.';
    form.addEventListener('submit', function (e) {
        e.preventDefault();
        var email = input.value.trim();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { msg.textContent = 'Please enter a full email address, like name@example.com.'; input.focus(); return; }
        msg.textContent = 'Adding you…';
        core().then(function (DL) {
            if (!DL || !DL.supabase) throw new Error('no client');
            return DL.supabase.from('launch_signups').insert({ email: email, line: 'field-guides', source: location.pathname.split('/')[1] || 'home' });
        }).then(function (r) {
            if (r.error && r.error.code !== '23505') { msg.textContent = SORRY; return; }
            msg.textContent = 'You’re on the list. We’ll send each new guide when it’s out.';
            form.reset();
        }).catch(function () { msg.textContent = SORRY; });
    });
})();
