// Live help: the Help Desk (/help-desk/) inside the dashboard. It stays loaded once
// opened, so a session, chat or video call keeps going while you use other sections.
// Alerts for new requests come from dash.js (the "Available for live help" switch).
DLDash.register({
    id: 'live-help', label: 'Live Help', order: 20,
    icon: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z"/><path d="M8.5 11h.01M12 11h.01M15.5 11h.01"/>',
    mount: function (el, ctx) {
        el.innerHTML =
            '<p class="muted small" id="lh-note" style="margin:0"></p>' +
            '<iframe src="/help-desk/?embed=1" title="Help Desk" style="width:100%;height:calc(100dvh - 150px);min-height:620px;border:1px solid var(--line);border-radius:12px;background:#1a1a1a"></iframe>';
        var note = el.querySelector('#lh-note'), last = { agents: [] };
        function paint() {
            note.innerHTML = (ctx.lobby.available() ? '<span class="dot on"></span> You\'re available: you\'ll get an alert for each new request.'
                : 'Turn on <strong>Available for live help</strong> (top right) to get an alert, with sound, for each new request.') +
                ' · ' + last.agents.length + ' agent' + (last.agents.length === 1 ? '' : 's') + ' available';
        }
        ctx.lobby.onChange(function (l) { last = l; paint(); });
        document.getElementById('avail').addEventListener('change', function () { setTimeout(paint, 0); });
        return {};
    }
});
