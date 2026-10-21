# Dashboard sections

Each file here is one section of the employee dashboard (`/dashboard/`). To add one:

1. Create `modules/<name>.js`:

```js
DLDash.register({
    id: 'quotes',               // the route: /dashboard/#quotes (and #quotes/<param>)
    label: 'Quotes',            // sidebar label and page title
    order: 35,                  // sidebar position (Overview 10, Live Help 20, Orders 30, ...)
    icon: '<path d="..."/>',    // 24x24 stroke icon
    mount: function (el, ctx) { // runs on the first visit; el is this section's own box
        el.innerHTML = '<section class="card card-pad">Hello</section>';
        return {
            show: function (param) { /* every visit: reload data */ },
            hide: function () {}  // optional
        };
    }
});
```

2. Add `<script src="/dashboard/modules/<name>.js"></script>` to `dashboard/index.html`, with the others.

Sections stay loaded after the first visit (switching away only hides them), so
calls and live help sessions keep running.

## What `ctx` gives you

- `ctx.sb`: Supabase client (signed in as the employee). `ctx.user`, `ctx.profile`, `ctx.firstName`.
- `ctx.has('admin' | 'pricing' | 'makers' | ...)`: whether you have a tag (Dashboard → Tags). Use it to decide what to
  show; the database checks the same tags. `ctx.tagList()` (all tags, cached; `true` re-reads), `ctx.tagPill(tag)`.
- `ctx.lobby.names(agents)`: "Sam and you" for who's available for live help.
- `ctx.toast(msg, 'bad'?)`, `ctx.notify({ title, text, href, loud })`: bell list, toast, and (loud) sound plus a desktop pop-up.
- `ctx.drawer(title)` returns `{ body, close, setTitle }`, a side panel for details.
- `ctx.esc`, `ctx.money`, `ctx.fmtDate(v, withTime)`, `ctx.timeAgo(v)`, `ctx.copy(text, button?)`, `ctx.csv(rows, filename)`, `ctx.initials(name)`.
- `ctx.STATUS`, `ctx.statusOf`, `ctx.statusPill(key)`: order statuses in workflow order.
- `ctx.setBadge(id, n, soft?)`: the count next to a section in the sidebar.
- `ctx.lobby.onChange(fn)`: live help `{ waiting, agents }`; `ctx.lobby.available()`.
- `ctx.orders.onChange(fn)` / `ctx.orders.refresh()`: new-order checks (every minute).
- `ctx.go('#orders/1005')`.

Styles: `dashboard/dash.css`. Use the shared pieces (`.card`, `.card-head`, `.card-body`,
`.kpis/.kpi`, `.list`, `.table`, `.pill`, `.chips/.chip`, `.btn`, `.field`) rather than new ones.
