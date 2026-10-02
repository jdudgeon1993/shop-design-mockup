// Pre-launch access gate. Load this in <head>, before any other script, on
// every page that should stay private until launch.
//
// Entering the access code on the coming-soon page (/) stores a "last active"
// timestamp in localStorage. While the visitor keeps using the site (page
// loads, clicks, scrolling, typing) it stays fresh; after IDLE_MINUTES with no
// activity they're sent back to / and need the code again. Anyone without
// fresh access is sent to / with ?next= so they land back where they were.
//
// This is a "keep it off the public's radar" gate, not security: GitHub
// Pages has no server, so the page files themselves are still public.
//
// Never gated: the video consultation pages (clients join calls by link and
// will never have the code) and the employee dashboard (has its own login).
(function () {
    var ACCESS_KEY = 'dl_access_v2';
    var IDLE_MINUTES = 5;
    var IDLE_MS = IDLE_MINUTES * 60 * 1000;
    var OPEN_PATHS = /^\/(proto\/)?(consultation|dashboard)\//;

    if (OPEN_PATHS.test(location.pathname)) return;

    function lastActive() {
        try { return parseInt(localStorage.getItem(ACCESS_KEY), 10) || 0; } catch (e) { return 0; }
    }
    function touch() {
        try { localStorage.setItem(ACCESS_KEY, String(Date.now())); } catch (e) {}
    }
    function toGate() {
        try { localStorage.removeItem(ACCESS_KEY); } catch (e) {}
        var next = location.pathname + location.search + location.hash;
        location.replace('/?next=' + encodeURIComponent(next));
    }

    if (Date.now() - lastActive() > IDLE_MS) { toGate(); return; }
    touch();

    // Keep access fresh while the visitor is actually using the page (at most
    // one write every 20s), and send them back to the gate once they've been
    // idle long enough. Other open tabs share the same timestamp.
    var lastWrite = Date.now();
    function onActivity() {
        if (Date.now() - lastWrite > 20000) { lastWrite = Date.now(); touch(); }
    }
    ['pointerdown', 'keydown', 'scroll', 'touchstart', 'mousemove'].forEach(function (type) {
        window.addEventListener(type, onActivity, { passive: true });
    });
    setInterval(function () {
        if (Date.now() - lastActive() > IDLE_MS) toGate();
    }, 15000);
})();
