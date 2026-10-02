// Pre-launch access gate. Load this in <head>, before any other script, on
// every page that should stay private until launch.
//
// A visitor who has entered the access code on the coming-soon page (/) gets
// a flag in localStorage and can move around the site freely. Anyone else is
// sent to / with ?next= so they land back where they were after entering it.
//
// This is a "keep it off the public's radar" gate, not security: GitHub
// Pages has no server, so the page files themselves are still public.
//
// Never gated: the video consultation pages (clients join calls by link and
// will never have the code) and the employee dashboard (has its own login).
(function () {
    var ACCESS_KEY = 'dl_access';
    var ACCESS_VALUE = 'granted-v1';
    var OPEN_PATHS = /^\/(proto\/)?(consultation|dashboard)\//;

    if (OPEN_PATHS.test(location.pathname)) return;

    try {
        if (localStorage.getItem(ACCESS_KEY) === ACCESS_VALUE) return;
    } catch (e) {
        // Storage blocked (private mode on some browsers): fall through to the gate.
    }

    var next = location.pathname + location.search + location.hash;
    location.replace('/?next=' + encodeURIComponent(next));
})();
