/* Blueprint builder for the Curated card editor (mockup).
   A drawing is a list of pieces in inches (x from the left end, y from the floor), so every size stays editable.
   window.DLBlueprint:
     svg(pieces)            -> the front elevation as an SVG string (spec-sheet colours: navy lines, red dimensions)
     open(pieces, onSave)   -> opens the builder dialog; onSave(pieces) when the user presses "Use this drawing"
     cabinets(pieces)       -> rows for the cabinet schedule, made from the drawing
   Reading a photo needs an AI. The site has no server, so the builder hands the photo to ChatGPT:
   copy our instructions, ChatGPT replies with JSON, paste it back and the drawing appears. */
(function () {
    'use strict';
    var KINDS = { base: 'Base cabinet', wall: 'Wall cabinet', tall: 'Tall cabinet', open: 'Open shelves', counter: 'Countertop', knee: 'Knee space', filler: 'Filler / panel' };
    var INK = '#1f2a5c', DIM = '#c0392b', WOOD = '#d9c6a5', OPEN = '#e9ecf5', HI = '#e0a43a';
    var uid = 1;
    function nid() { return 'b' + (uid++) + Math.random().toString(36).slice(2, 6); }
    function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
    function clone(o) { return JSON.parse(JSON.stringify(o)); }

    // ---------- inches, shown to the nearest 1/8" like a tape measure ----------
    function fmt(v) {
        var n = Math.round(Math.abs(v) * 8) / 8, whole = Math.floor(n), f = Math.round((n - whole) * 8);
        var fr = f ? { 1: '1/8', 2: '1/4', 3: '3/8', 4: '1/2', 5: '5/8', 6: '3/4', 7: '7/8' }[f] : '';
        return (v < 0 ? '-' : '') + (whole ? whole + (fr ? ' ' + fr : '') : (fr || '0')) + '"';
    }
    function parse(s) {
        s = String(s).replace(/["”″]|in(ches)?/gi, '').trim();
        if (!s) return NaN;
        var m = s.match(/^(-?\d+(?:\.\d+)?)[\s-]+(\d+)\s*\/\s*(\d+)$/);
        if (m) return +m[1] + (+m[2] / +m[3]);
        m = s.match(/^(\d+)\s*\/\s*(\d+)$/);
        if (m) return +m[1] / +m[2];
        var n = Number(s);
        return isFinite(n) ? n : NaN;
    }
    function r8(v) { return Math.round(v * 8) / 8; }

    function P(kind, name, x, y, w, h, extra) {
        var p = { id: nid(), kind: kind, name: name, x: x, y: y, w: w, h: h, d: kind === 'wall' ? 12 : kind === 'open' ? 15 : kind === 'counter' ? 25 : 24,
            doors: 0, drawers: 0, shelves: 0, toe: 0, crown: 0 };
        for (var k in (extra || {})) p[k] = extra[k];
        return p;
    }
    var TEMPLATES = {
        desk: { label: 'Desk with two towers', make: function () { return [
            P('base', 'Left base', 0, 0, 30, 28.5, { doors: 2, drawers: 1, toe: 4 }),
            P('knee', 'Knee space', 30, 25.5, 39, 3),
            P('base', 'Right base', 69, 0, 30, 28.5, { doors: 2, drawers: 1, toe: 4 }),
            P('counter', 'Desk top', 0, 28.5, 99, 1.5),
            P('open', 'Left tower', 6, 30, 18, 60, { shelves: 4, drawers: 2, crown: 2.5 }),
            P('open', 'Right tower', 75, 30, 18, 60, { shelves: 4, drawers: 2, crown: 2.5 })]; } },
        kitchen: { label: 'Kitchen wall run', make: function () { return [
            P('base', 'Drawer base', 0, 0, 18, 34.5, { drawers: 4, toe: 4.5 }),
            P('base', 'Sink base', 18, 0, 36, 34.5, { doors: 2, drawers: 1, toe: 4.5 }),
            P('base', 'Base', 54, 0, 24, 34.5, { doors: 1, drawers: 1, toe: 4.5 }),
            P('counter', 'Countertop', 0, 34.5, 78, 1.5),
            P('wall', 'Wall', 0, 54, 18, 30, { doors: 1 }),
            P('wall', 'Wall over sink', 18, 66, 36, 18, { doors: 2 }),
            P('wall', 'Wall', 54, 54, 24, 30, { doors: 2 })]; } },
        hutch: { label: 'Hutch / buffet', make: function () { return [
            P('base', 'Left base', 0, 0, 24, 34.5, { doors: 1, drawers: 1, toe: 4 }),
            P('base', 'Center drawers', 24, 0, 24, 34.5, { drawers: 3, toe: 4 }),
            P('base', 'Right base', 48, 0, 24, 34.5, { doors: 1, drawers: 1, toe: 4 }),
            P('counter', 'Top', 0, 34.5, 72, 1.5),
            P('open', 'Hutch', 0, 54, 72, 30, { d: 12, shelves: 1, crown: 3 })]; } },
        blank: { label: 'Blank', make: function () { return [P('base', 'Base', 0, 0, 30, 34.5, { doors: 2, drawers: 1, toe: 4.5 })]; } }
    };

    // ---------- geometry ----------
    function top(p) { return p.y + p.h; }
    function right(p) { return p.x + p.w; }
    function bounds(ps) {
        if (!ps.length) return { x0: 0, x1: 36, y1: 36 };
        return { x0: Math.min.apply(null, ps.map(function (p) { return p.x; })), x1: Math.max.apply(null, ps.map(right)), y1: Math.max.apply(null, ps.map(top)) };
    }
    function counters(ps) { return ps.filter(function (p) { return p.kind === 'counter'; }); }
    function bandOverlap(a, b) { return Math.min(top(a), top(b)) - Math.max(a.y, b.y) > 0.1; }

    // A wider piece pushes the pieces to its right (same band) along; a counter over it grows with it.
    function setWidth(ps, p, w) {
        var d = w - p.w, edge = right(p);
        ps.forEach(function (q) {
            if (q === p) return;
            if (q.kind === 'counter' && p.kind !== 'counter') { if (right(q) > edge - 3) q.w += d; return; }
            if (q.x >= edge - 0.05 && bandOverlap(q, p)) q.x += d;
        });
        p.w = w;
    }
    // A taller piece lifts whatever sits on it.
    function setHeight(ps, p, h) {
        var d = h - p.h, t = top(p);
        ps.forEach(function (q) { if (q !== p && Math.abs(q.y - t) < 0.3 && q.x < right(p) && right(q) > p.x) q.y += d; });
        p.h = h;
    }
    function setOverallWidth(ps, W) {
        var b = bounds(ps), d = W - (b.x1 - b.x0);
        var knees = ps.filter(function (p) { return p.kind === 'knee'; });
        if (knees.length) { knees.forEach(function (k) { setWidth(ps, k, Math.max(6, k.w + d / knees.length)); }); return 'The change went into the knee space.'; }
        var f = W / (b.x1 - b.x0);
        ps.forEach(function (p) { p.x = r8(b.x0 + (p.x - b.x0) * f); p.w = r8(p.w * f); });
        return 'Every piece was widened in proportion.';
    }
    function setCounterHeight(ps, H) {
        var c = counters(ps)[0]; if (!c) return '';
        var d = H - top(c), cb = c.y, ct = top(c);
        ps.forEach(function (p) {
            if (p === c) return;
            if (p.y >= ct - 0.3 || p.kind === 'knee') p.y += d;
            else if (p.y < 0.5 && Math.abs(top(p) - cb) < 0.5) p.h += d;
        });
        c.y += d;
        return 'Cabinets under the top grew; everything above it moved.';
    }
    function setOverallHeight(ps, H) {
        var b = bounds(ps), d = H - b.y1;
        var tops = ps.filter(function (p) { return Math.abs(top(p) - b.y1) < 0.3; });
        tops.forEach(function (p) { p.h = Math.max(1, p.h + d); });
        return 'The tallest pieces changed height: ' + tops.map(function (p) { return p.name; }).join(', ') + '.';
    }

    // ---------- the drawing ----------
    function svg(ps, opts) {
        opts = opts || {};
        var b = bounds(ps), span = Math.max(b.x1 - b.x0, b.y1 * 0.9, 40);
        var fs = Math.max(2.3, span / 42);
        var padL = fs * 9, padR = fs * 7.5, padT = fs * 6, padB = fs * 8.5;
        var vx = b.x0 - padL, vw = (b.x1 - b.x0) + padL + padR, vh = b.y1 + padT + padB;
        function Y(v) { return b.y1 + padT - v; }
        var out = [], sw = 'vector-effect="non-scaling-stroke"';
        function R(x, y, w, h, cls) { out.push('<rect class="' + cls + '" x="' + x + '" y="' + Y(y + h) + '" width="' + Math.max(0, w) + '" height="' + Math.max(0, h) + '" ' + sw + '/>'); }
        function L(x1, y1, x2, y2, cls) { out.push('<line class="' + cls + '" x1="' + x1 + '" y1="' + Y(y1) + '" x2="' + x2 + '" y2="' + Y(y2) + '" ' + sw + '/>'); }
        function doorsRow(x, y, w, h, n) {
            if (n < 1 || h < 2) return;
            var dw = w / n;
            for (var i = 0; i < n; i++) { var dx = x + i * dw; R(dx + .25, y + .25, dw - .5, h - .5, 'ln'); if (dw > 7 && h > 7) R(dx + 2.5, y + 2.5, dw - 5, h - 5, 'thin'); }
        }
        function drawerStack(x, y, w, h, n) {
            if (n < 1 || h < 1) return;
            var dh = h / n;
            for (var i = 0; i < n; i++) { var dy = y + i * dh; R(x + .25, dy + .25, w - .5, dh - .5, 'ln'); if (dh > 4 && w > 6) R(x + 1.75, dy + 1.5, w - 3.5, dh - 3, 'thin'); }
        }
        var order = { open: 0, wall: 0, tall: 0, base: 1, filler: 1, knee: 2, counter: 3 };
        ps.slice().sort(function (a, c) { return order[a.kind] - order[c.kind]; }).forEach(function (p) {
            out.push('<g class="pc' + (p.id === opts.selected ? ' sel' : '') + '" data-id="' + p.id + '"><title>' + esc(p.name) + ': ' + fmt(p.w) + ' wide × ' + fmt(p.h) + ' high</title>');
            if (p.kind === 'counter') R(p.x, p.y, p.w, p.h, 'wood');
            else if (p.kind === 'knee' || p.kind === 'filler') R(p.x, p.y, p.w, p.h, 'ln fillw');
            else if (p.kind === 'open') {
                var cr = Math.min(p.crown, p.h / 3), body = p.h - cr;
                R(p.x, p.y, p.w, body, 'ln fillw');
                if (cr > 0) R(p.x - 1, p.y + body, p.w + 2, cr, 'ln fillw');
                var dh = Math.min(5.25, body / Math.max(3, p.drawers + 2));
                drawerStack(p.x, p.y, p.w, dh * p.drawers, p.drawers);
                var o0 = p.y + dh * p.drawers + 1, o1 = p.y + body - 1.25;
                if (o1 - o0 > 2) {
                    R(p.x + 1, o0, p.w - 2, o1 - o0, 'opn');
                    var n = Math.max(0, Math.round(p.shelves));
                    for (var i = 1; i <= n; i++) { var sy = o0 + (o1 - o0) * i / (n + 1); L(p.x + 1, sy, right(p) - 1, sy, 'ln'); }
                }
            } else {
                R(p.x, p.y, p.w, p.h, 'ln fillw');
                var toe = p.kind === 'base' || p.kind === 'tall' ? Math.min(p.toe, p.h / 3) : 0;
                if (toe > 0) L(p.x, p.y + toe, right(p), p.y + toe, 'ln');
                var y0 = p.y + toe, hh = p.h - toe, nd = Math.max(0, Math.round(p.drawers)), dr = Math.max(0, Math.round(p.doors));
                if (!dr) drawerStack(p.x, y0, p.w, hh, nd || 1);
                else {
                    var ddh = nd ? Math.min(6.5, hh / (nd + 2)) : 0;
                    if (p.kind === 'tall') { drawerStack(p.x, y0, p.w, ddh * nd, nd); doorsRow(p.x, y0 + ddh * nd, p.w, hh - ddh * nd, dr); }
                    else { drawerStack(p.x, y0 + hh - ddh * nd, p.w, ddh * nd, nd); doorsRow(p.x, y0, p.w, hh - ddh * nd, dr); }
                }
            }
            out.push('</g>');
        });
        out.push('<line class="floor" x1="' + (b.x0 - padL * .6) + '" y1="' + Y(0) + '" x2="' + (b.x1 + padR * .6) + '" y2="' + Y(0) + '" ' + sw + '/>');

        var tk = fs * 0.45;
        function dimH(x1, x2, y, label) {
            if (x2 - x1 < 0.5) return;
            out.push('<line class="dm" x1="' + x1 + '" y1="' + y + '" x2="' + x2 + '" y2="' + y + '" ' + sw + '/>');
            [x1, x2].forEach(function (x) { out.push('<line class="dm" x1="' + (x - tk) + '" y1="' + (y + tk) + '" x2="' + (x + tk) + '" y2="' + (y - tk) + '" ' + sw + '/><line class="dm" x1="' + x + '" y1="' + (y - tk * 1.6) + '" x2="' + x + '" y2="' + (y + tk * 1.6) + '" ' + sw + '/>'); });
            var small = (x2 - x1) < label.length * fs * 0.5;
            out.push('<text class="dt" x="' + ((x1 + x2) / 2) + '" y="' + (y - fs * 0.45) + '" font-size="' + (small ? fs * .78 : fs) + '" text-anchor="middle">' + esc(label) + '</text>');
        }
        function dimV(x, y1, y2, label, side) {
            if (y2 - y1 < 0.5) return;
            out.push('<line class="dm" x1="' + x + '" y1="' + Y(y1) + '" x2="' + x + '" y2="' + Y(y2) + '" ' + sw + '/>');
            [y1, y2].forEach(function (v) { out.push('<line class="dm" x1="' + (x - tk) + '" y1="' + (Y(v) + tk) + '" x2="' + (x + tk) + '" y2="' + (Y(v) - tk) + '" ' + sw + '/><line class="dm" x1="' + (x - tk * 1.6) + '" y1="' + Y(v) + '" x2="' + (x + tk * 1.6) + '" y2="' + Y(v) + '" ' + sw + '/>'); });
            var tx = side === 'r' ? x + fs * 1.1 : x - fs * 0.45, ty = (Y(y1) + Y(y2)) / 2;
            out.push('<text class="dt" x="' + tx + '" y="' + ty + '" font-size="' + fs + '" text-anchor="middle" transform="rotate(-90 ' + tx + ' ' + ty + ')">' + esc(label) + '</text>');
        }
        ps.filter(function (p) { return p.kind === 'knee' || (p.y < 0.5 && p.kind !== 'counter'); }).sort(function (a, c) { return a.x - c.x; })
            .forEach(function (p) { dimH(p.x, right(p), Y(0) + fs * 2.6, fmt(p.w) + (p.kind === 'knee' ? ' knee' : '')); });
        dimH(b.x0, b.x1, Y(0) + fs * 5.6, fmt(b.x1 - b.x0) + ' overall');
        var c = counters(ps)[0];
        var uppers = ps.filter(function (p) { return (p.kind === 'wall' || p.kind === 'open' || (p.kind === 'tall' && p.y > 0.5)) && (!c || p.y >= c.y); }).sort(function (a, q) { return a.x - q.x; });
        uppers.forEach(function (p) { dimH(p.x, right(p), Y(b.y1) - fs * 1.6, fmt(p.w)); });
        dimV(b.x0 - fs * 5.6, 0, b.y1, fmt(b.y1) + ' overall');
        if (c) dimV(b.x0 - fs * 2.6, 0, top(c), fmt(top(c)) + ' to top');
        if (uppers.length) { var u = uppers[uppers.length - 1]; dimV(b.x1 + fs * 2, u.y, top(u), fmt(u.h), 'r'); }
        if (c) out.push('<text class="nt" x="' + (right(c) + fs * .5) + '" y="' + (Y(c.y) + fs * .35) + '" font-size="' + (fs * .8) + '">top ' + fmt(c.h) + '</text>');

        var css = '.ln{fill:none;stroke:' + INK + ';stroke-width:1.5}.thin{fill:none;stroke:' + INK + ';stroke-width:.7}.fillw{fill:#fff}' +
            '.wood{fill:' + WOOD + ';stroke:' + INK + ';stroke-width:1.5}.opn{fill:' + OPEN + ';stroke:' + INK + ';stroke-width:.9}' +
            '.floor{stroke:' + INK + ';stroke-width:2.5}.dm{stroke:' + DIM + ';stroke-width:1}.dt,.nt{fill:' + DIM + ";font-family:Montserrat,Arial,sans-serif}" +
            (opts.interactive ? '.pc{cursor:pointer}.pc:hover .ln,.pc:hover .wood{stroke:' + HI + '}.pc.sel .ln,.pc.sel .wood{stroke:' + HI + ';stroke-width:2.5}' : '');
        return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + vx + ' 0 ' + vw + ' ' + vh + '" role="img" aria-label="Front elevation drawing"><style>' + css + '</style>' +
            '<rect x="' + vx + '" y="0" width="' + vw + '" height="' + vh + '" fill="#fff"/>' + out.join('') + '</svg>';
    }

    function checks(ps) {
        var out = [], solid = ps.filter(function (p) { return p.kind !== 'counter'; });
        for (var i = 0; i < solid.length; i++) for (var j = i + 1; j < solid.length; j++) {
            var a = solid[i], c = solid[j];
            var ox = Math.min(right(a), right(c)) - Math.max(a.x, c.x), oy = Math.min(top(a), top(c)) - Math.max(a.y, c.y);
            if (ox > 0.1 && oy > 0.1) out.push(['bad', a.name + ' and ' + c.name + ' overlap by ' + fmt(ox) + '.']);
        }
        counters(ps).forEach(function (c) {
            var under = ps.filter(function (p) { return p.kind !== 'counter' && p.y < c.y && top(p) >= c.y - 4; });
            if (!under.length) return;
            var lo = Math.min.apply(null, under.map(function (p) { return p.x; })), hi = Math.max.apply(null, under.map(right));
            if (c.x > lo + 0.05 || right(c) < hi - 0.05) out.push(['bad', 'The ' + c.name.toLowerCase() + ' is shorter than the cabinets under it.']);
            under.filter(function (p) { return p.kind !== 'knee' && top(p) < c.y - 0.1; }).forEach(function (p) { out.push(['bad', p.name + ' stops ' + fmt(c.y - top(p)) + ' below the top.']); });
        });
        var row = ps.filter(function (p) { return p.kind !== 'counter' && (p.y < 0.5 || p.kind === 'knee'); }).sort(function (a, c) { return a.x - c.x; });
        for (var k = 1; k < row.length; k++) {
            var gap = row[k].x - right(row[k - 1]);
            if (gap > 0.1) out.push(['info', fmt(gap) + ' gap between ' + row[k - 1].name + ' and ' + row[k].name + '. A filler usually closes it.']);
        }
        ps.filter(function (p) { return /base|wall|tall/.test(p.kind) && Math.abs(p.w / 3 - Math.round(p.w / 3)) > 0.01; })
            .forEach(function (p) { out.push(['info', p.name + ' is ' + fmt(p.w) + ' wide. Stock cabinets come in 3" steps (nearest: ' + fmt(Math.round(p.w / 3) * 3) + ').']); });
        if (!out.length) out.push(['good', 'Everything lines up: no overlaps, gaps or short tops.']);
        return out;
    }

    // Cabinet schedule rows from the drawing (identical pieces are counted together).
    function cabinets(ps) {
        var rows = {};
        ps.forEach(function (p) {
            if (p.kind === 'knee') return;
            var bits = [];
            if (p.doors) bits.push(p.doors + (p.doors > 1 ? ' doors' : ' door'));
            if (p.drawers) bits.push(p.drawers + (p.drawers > 1 ? ' drawers' : ' drawer'));
            if (p.kind === 'open' && p.shelves) bits.push(p.shelves + ' open shelves');
            var size = p.kind === 'counter' ? fmt(p.w) + ' long, ' + fmt(p.h) + ' thick' : fmt(p.w) + ' W × ' + fmt(p.h) + ' H × ' + fmt(p.d) + ' D';
            var desc = KINDS[p.kind] + ' ' + size + (bits.length ? ' (' + bits.join(', ') + ')' : '');
            rows[desc] = rows[desc] || { qty: 0, desc: desc };
            rows[desc].qty++;
        });
        return Object.keys(rows).map(function (k) { return { qty: String(rows[k].qty), desc: rows[k].desc, sku: '', hinge: '', fin: '', mods: '', extra: '' }; });
    }

    // ---------- reading ChatGPT's answer ----------
    var PROMPT = [
        'I\'m attaching a picture of built-in cabinetry. Measure it so it can be drawn as a front elevation blueprint.',
        '',
        '1. Find the main run of cabinetry. Ignore loose furniture, decor and freestanding appliances.',
        '2. Pick a ruler: something of standard size in the picture, for example an interior door (80" tall, 30-36" wide), a kitchen counter (36" to the top), a desk (30" to the top), a wall outlet (4.5" tall), a ceiling (about 96"). Say which one you used.',
        '3. Measure every piece in inches. x = inches from the left end of the cabinetry to the piece\'s left edge. y = inches from the floor to the piece\'s bottom edge. When unsure, snap cabinet widths to 3" steps and use standard heights.',
        '',
        'Piece kinds:',
        '- "base": floor cabinet. doors (0, 1 or 2), drawers (rows of drawers at the top; with doors 0 the whole front is drawers), toe (toe kick height, about 4).',
        '- "wall": hung cabinet. doors.',
        '- "tall": floor-to-top cabinet. doors, drawers at the bottom, toe.',
        '- "open": open shelving tower or hutch. shelves (how many shelves), drawers (drawers at its bottom), crown (crown molding height, 0 if none).',
        '- "counter": countertop or desk top. h = thickness.',
        '- "knee": open knee space under a desk. y = bottom of the skirt under the top, h = skirt height, w = opening width.',
        '- "filler": filler strip or end panel.',
        'd = depth, a guess from standards (base 24, wall 12, open towers 12-15, counter 25).',
        '',
        'Reply with only this JSON and nothing else:',
        '{"ruler":"what you used and its size","confidence":"low, medium or high","notes":["anything you had to guess"],"pieces":[{"kind":"base","name":"Left base","x":0,"y":0,"w":30,"h":34.5,"d":24,"doors":2,"drawers":1,"shelves":0,"toe":4,"crown":0}]}'
    ].join('\n');

    function readAnswer(text) {
        var t = String(text || ''), fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
        if (fence) t = fence[1];
        var a = t.indexOf('{'), z = t.lastIndexOf('}');
        if (a < 0 || z < a) return null;
        var data;
        try { data = JSON.parse(t.slice(a, z + 1).replace(/[“”]/g, '"').replace(/,\s*([}\]])/g, '$1')); } catch (e) { return null; }
        if (!data || !Array.isArray(data.pieces)) return null;
        function num(v, d, lo, hi) { var n = typeof v === 'number' ? v : parse(v); return isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; }
        var ps = data.pieces.slice(0, 60).map(function (q) {
            q = q || {};
            var kind = KINDS[q.kind] ? q.kind : 'base';
            var p = P(kind, String(q.name || KINDS[kind]).slice(0, 40), 0, 0, 24, 30);
            p.x = r8(num(q.x, 0, -50, 1000)); p.y = r8(num(q.y, 0, 0, 200)); p.w = r8(num(q.w, 24, 0.5, 1000)); p.h = r8(num(q.h, 30, 0.25, 200));
            p.d = r8(num(q.d, p.d, 0, 60)); p.doors = Math.round(num(q.doors, 0, 0, 6)); p.drawers = Math.round(num(q.drawers, 0, 0, 12));
            p.shelves = Math.round(num(q.shelves, 0, 0, 12)); p.toe = r8(num(q.toe, kind === 'base' ? 4 : 0, 0, 12)); p.crown = r8(num(q.crown, 0, 0, 12));
            return p;
        });
        if (!ps.length) return null;
        var x0 = Math.min.apply(null, ps.map(function (p) { return p.x; }));
        ps.forEach(function (p) { p.x = r8(p.x - x0); });
        var notes = [];
        if (data.ruler) notes.push('Ruler: ' + data.ruler);
        if (data.confidence) notes.push('Confidence: ' + data.confidence);
        (Array.isArray(data.notes) ? data.notes : []).slice(0, 6).forEach(function (n) { notes.push(String(n)); });
        return { pieces: ps, notes: notes };
    }

    // A sample of what ChatGPT sends back (Study Time, measured from its photo), for trying the paste step.
    var SAMPLE = '```json\n' + JSON.stringify({
        ruler: 'Interior door on the right, 80" tall', confidence: 'medium',
        notes: ['Depths are standard guesses', 'Could not see inside the base cabinets'],
        pieces: [
            { kind: 'base', name: 'Left base', x: 1.75, y: 0, w: 30.25, h: 30.625, d: 24, doors: 2, drawers: 1, toe: 4.5 },
            { kind: 'knee', name: 'Knee space', x: 32, y: 26.875, w: 37, h: 3.75 },
            { kind: 'base', name: 'Right base', x: 69, y: 0, w: 30.25, h: 30.625, d: 24, doors: 2, drawers: 1, toe: 4.5 },
            { kind: 'counter', name: 'Desk top', x: 0, y: 30.625, w: 101.125, h: 1.625, d: 25 },
            { kind: 'open', name: 'Left tower', x: 4.25, y: 32.25, w: 17.75, h: 61.125, d: 15, shelves: 4, drawers: 2, crown: 2.5 },
            { kind: 'open', name: 'Right tower', x: 78.25, y: 32.25, w: 18, h: 61.125, d: 15, shelves: 4, drawers: 2, crown: 2.5 }
        ] }, null, 1) + '\n```';

    // ---------- the builder dialog ----------
    var CSS = '\
.bp-dlg{border:none;padding:0;width:min(1240px,calc(100vw - 16px));max-width:none;height:calc(100vh - 16px);max-height:none;border-radius:14px;background:var(--surface,#222);color:var(--text,#fff)}\
.bp-dlg::backdrop{background:rgba(0,0,0,.65)}\
.bp{display:flex;flex-direction:column;height:100%}\
.bp-head{display:flex;flex-wrap:wrap;gap:10px;align-items:center;padding:12px 16px;border-bottom:1px solid rgba(var(--ink,255,255,255),.15)}\
.bp-head h2{margin:0 auto 0 0;font-family:"Libre Caslon Display",Georgia,serif;font-size:22px}\
.bp-main{flex:1;min-height:0;display:grid;grid-template-columns:minmax(0,1fr) 380px}\
.bp-left{min-width:0;overflow:auto;padding:14px;display:flex;flex-direction:column;gap:10px}\
.bp-right{min-width:0;overflow:auto;padding:14px;border-left:1px solid rgba(var(--ink,255,255,255),.15);display:flex;flex-direction:column;gap:14px}\
@media (max-width:860px){.bp-main{grid-template-columns:minmax(0,1fr);overflow:auto}.bp-left,.bp-right{overflow:visible}.bp-right{border-left:none}}\
.bp-draw{background:#fff;border-radius:8px;padding:8px;overflow-x:auto}.bp-draw svg{display:block;width:100%;height:auto;min-width:480px}\
.bp-hint{margin:0;font-size:13px;color:rgba(var(--ink,255,255,255),.65)}\
.bp-chk{font-size:13.5px;padding:7px 10px;border-left:3px solid #c0392b;background:rgba(var(--ink,255,255,255),.05);margin-top:4px}\
.bp-chk.info{border-left-color:#e0a43a}.bp-chk.good{border-left-color:#2e8b57}\
.bp-sec h3{margin:0 0 8px;font-size:12px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:rgba(var(--ink,255,255,255),.6)}\
.bp-keys{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}\
.bp-f{display:flex;flex-direction:column;gap:3px;min-width:0}\
.bp-f span{font-size:10.5px;font-weight:700;letter-spacing:.6px;text-transform:uppercase;color:rgba(var(--ink,255,255,255),.6)}\
.bp-f input,.bp-f select{width:100%;min-height:36px;padding:6px 8px;border:1px solid rgba(var(--ink,255,255,255),.2);border-radius:6px;background:var(--sunk,#141414);color:var(--text,#fff);font-size:14px;font-variant-numeric:tabular-nums}\
.bp-f input.bad{border-color:#c0392b}\
.bp-keys .bp-f input{font-size:16px;font-weight:600}\
.bp-pc{border:1px solid rgba(var(--ink,255,255,255),.15);border-radius:8px;margin-bottom:6px}\
.bp-pc[open]{border-color:var(--gold,#d4af37)}.bp-pc.sel{box-shadow:0 0 0 2px #e0a43a}\
.bp-pc summary{display:flex;gap:8px;align-items:center;padding:8px 10px;cursor:pointer;list-style:none}\
.bp-pc summary::-webkit-details-marker{display:none}\
.bp-pc summary b{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:14px}\
.bp-pc summary small{font-size:12.5px;color:rgba(var(--ink,255,255,255),.6);white-space:nowrap;font-variant-numeric:tabular-nums}\
.bp-pb{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;padding:2px 10px 10px}\
.bp-pb .w2{grid-column:span 2}.bp-pb .w4{grid-column:1/-1;display:flex;gap:8px;flex-wrap:wrap}\
.bp-adds{display:flex;flex-wrap:wrap;gap:6px}\
.bp-gpt{border:1px solid #10a37f;border-radius:10px;padding:12px;display:flex;flex-direction:column;gap:8px}\
.bp-gpt textarea{width:100%;min-height:110px;padding:10px;border-radius:8px;border:1px solid rgba(var(--ink,255,255,255),.2);background:var(--sunk,#141414);color:var(--text,#fff);font-size:13px;resize:vertical}\
.bp-gpt ol{margin:0;padding-left:20px;font-size:13.5px;line-height:1.5}\
.bp-msg{font-size:13px;min-height:1.1em}.bp-msg.ok{color:#2e8b57}.bp-msg.bad{color:#e06b5b}\
.bp-notes{margin:0;padding-left:18px;font-size:12.5px;color:rgba(var(--ink,255,255,255),.7)}\
.bp-link{background:none;border:none;color:var(--gold,#d4af37);text-decoration:underline;cursor:pointer;padding:0;font-size:13px;align-self:flex-start}\
';

    var dlg, st, onSaveCb, selected = null, past = [], future = [], notes = [];

    function el(id) { return dlg.querySelector('#' + id); }
    function build() {
        var s = document.createElement('style'); s.textContent = CSS; document.head.appendChild(s);
        dlg = document.createElement('dialog'); dlg.className = 'bp-dlg';
        dlg.innerHTML = '<div class="bp">' +
            '<div class="bp-head"><h2>Build the drawing</h2>' +
                '<button class="btn small" type="button" id="bp-undo">Undo</button><button class="btn small" type="button" id="bp-redo">Redo</button>' +
                '<button class="btn" type="button" id="bp-cancel">Cancel</button><button class="btn gold" type="button" id="bp-save">Use this drawing</button></div>' +
            '<div class="bp-main"><div class="bp-left">' +
                '<p class="bp-hint">Click a piece to change it. Red numbers are the sizes, in inches.</p>' +
                '<div class="bp-draw" id="bp-draw"></div><div id="bp-checks"></div>' +
                '<ul class="bp-notes" id="bp-notes" hidden></ul>' +
            '</div><div class="bp-right">' +
                '<div class="bp-gpt"><h3 style="margin:0;font-size:15px">Make it from the front picture</h3>' +
                    '<ol><li>Copy the instructions.</li><li>In ChatGPT, attach the front picture and paste them.</li><li>Copy ChatGPT\'s whole answer and paste it below.</li></ol>' +
                    '<button class="btn small gpt" type="button" id="bp-copy" style="align-self:flex-start">Copy instructions for ChatGPT</button>' +
                    '<textarea id="bp-ans" placeholder="Paste ChatGPT\'s answer here"></textarea>' +
                    '<div class="row" style="display:flex;gap:8px;flex-wrap:wrap;align-items:center"><button class="btn small gold" type="button" id="bp-read">Draw it</button><button class="bp-link" type="button" id="bp-sample">Try a sample answer</button></div>' +
                    '<div class="bp-msg" id="bp-msg"></div></div>' +
                '<div class="bp-sec"><h3>Main sizes</h3><div class="bp-keys">' +
                    '<label class="bp-f"><span>Overall width</span><input id="bp-kw" inputmode="decimal" autocomplete="off"></label>' +
                    '<label class="bp-f"><span>Overall height</span><input id="bp-kh" inputmode="decimal" autocomplete="off"></label>' +
                    '<label class="bp-f" id="bp-kd-wrap"><span>Top height</span><input id="bp-kd" inputmode="decimal" autocomplete="off"></label></div>' +
                    '<p class="bp-hint" id="bp-khint" style="margin-top:6px">Type a size and press Enter. Fractions work: 28 1/2.</p></div>' +
                '<div class="bp-sec"><div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:8px"><h3 style="margin:0">Pieces</h3>' +
                    '<label class="bp-f" style="flex-direction:row;align-items:center;gap:6px"><span>Start from</span><select id="bp-tpl"><option value="">Choose…</option>' +
                    Object.keys(TEMPLATES).map(function (k) { return '<option value="' + k + '">' + TEMPLATES[k].label + '</option>'; }).join('') + '</select></label></div>' +
                    '<div id="bp-list"></div>' +
                    '<div class="bp-adds">' + ['base', 'wall', 'tall', 'open', 'counter', 'knee', 'filler'].map(function (k) {
                        return '<button class="btn small" type="button" data-bpadd="' + k + '">+ ' + { base: 'Base', wall: 'Wall', tall: 'Tall', open: 'Open shelves', counter: 'Top', knee: 'Knee space', filler: 'Filler' }[k] + '</button>'; }).join('') + '</div></div>' +
            '</div></div></div>';
        document.body.appendChild(dlg);

        el('bp-cancel').onclick = function () { dlg.close(); };
        el('bp-save').onclick = function () { dlg.close(); onSaveCb && onSaveCb(clone(st), notes.slice()); };
        el('bp-undo').onclick = function () { if (!past.length) return; future.push(JSON.stringify(st)); st = JSON.parse(past.pop()); render(true); };
        el('bp-redo').onclick = function () { if (!future.length) return; past.push(JSON.stringify(st)); st = JSON.parse(future.pop()); render(true); };
        el('bp-draw').addEventListener('click', function (e) { var g = e.target.closest('.pc'); if (g) select(g.dataset.id, true); });
        el('bp-copy').onclick = function () {
            var b = el('bp-copy'), done = function () { b.textContent = 'Copied ✓'; setTimeout(function () { b.textContent = 'Copy instructions for ChatGPT'; }, 2000); };
            if (navigator.clipboard) navigator.clipboard.writeText(PROMPT).then(done, function () { el('bp-ans').value = PROMPT; el('bp-ans').select(); msg('Copy the instructions from the box, then clear it.', ''); });
        };
        el('bp-sample').onclick = function () { el('bp-ans').value = SAMPLE; msg('Sample answer pasted. Press Draw it.', ''); };
        el('bp-read').onclick = function () {
            var r = readAnswer(el('bp-ans').value);
            if (!r) { msg('That doesn\'t look like ChatGPT\'s measurements. Copy its whole answer, including the { } part.', 'bad'); return; }
            commit(function () { st = r.pieces; }, true);
            notes = r.notes.concat(['These are estimates from a picture. Check the main sizes before publishing.']);
            showNotes();
            msg('Drawn from ' + r.pieces.length + ' pieces. Fix any size below.', 'ok');
        };
        el('bp-tpl').onchange = function (e) { var t = e.target.value; e.target.value = ''; if (!t) return; commit(function () { st = TEMPLATES[t].make(); }, true); notes = []; showNotes(); };
        dlg.addEventListener('click', function (e) {
            var a = e.target.closest('[data-bpadd]'); if (a) addPiece(a.dataset.bpadd);
            var d = e.target.closest('[data-bpdel]'); if (d) commit(function () { st = st.filter(function (p) { return p.id !== d.dataset.bpdel; }); }, true);
            var u = e.target.closest('[data-bpdup]'); if (u) { var p = find(u.dataset.bpdup), c = clone(p); c.id = nid(); c.name = p.name + ' copy'; c.x = bounds(st).x1; commit(function () { st.push(c); }, true); select(c.id, true); }
            var s = e.target.closest('.bp-pc summary'); if (s) { var det = s.parentElement; setTimeout(function () { select(det.open ? det.dataset.id : null, false); }, 0); }
        });
        el('bp-list').addEventListener('change', function (e) { if (e.target.dataset.k) apply(e.target); });
        el('bp-list').addEventListener('keydown', function (e) { if (e.key === 'Enter' && e.target.dataset.k) { e.preventDefault(); apply(e.target); } });
        bindKey('bp-kw', setOverallWidth); bindKey('bp-kh', setOverallHeight); bindKey('bp-kd', setCounterHeight);
    }
    function msg(t, cls) { var m = el('bp-msg'); m.textContent = t; m.className = 'bp-msg ' + (cls || ''); }
    function showNotes() { var n = el('bp-notes'); n.hidden = !notes.length; n.innerHTML = notes.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join(''); }
    function find(id) { return st.filter(function (p) { return p.id === id; })[0]; }
    function commit(fn, rebuild) { past.push(JSON.stringify(st)); if (past.length > 80) past.shift(); future = []; fn(); render(rebuild); }
    function bindKey(id, fn) {
        var inp = el(id);
        function go() {
            var v = parse(inp.value);
            if (!isFinite(v) || v <= 0 || v > 1000) { inp.classList.add('bad'); return; }
            var before = JSON.stringify(st), m = '';
            commit(function () { m = fn(st, r8(v)); });
            if (JSON.stringify(st) === before) { past.pop(); return; }
            el('bp-khint').textContent = m;
        }
        inp.addEventListener('change', go);
        inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); go(); } });
    }
    function addPiece(kind) {
        var b = bounds(st), c = counters(st)[0], x = st.length ? b.x1 : 0, p;
        if (kind === 'base') p = P('base', 'Base', x, 0, 24, c ? c.y : 34.5, { doors: 1, drawers: 1, toe: 4 });
        if (kind === 'wall') p = P('wall', 'Wall', x, 54, 24, 30, { doors: 2 });
        if (kind === 'tall') p = P('tall', 'Tall', x, 0, 24, 84, { doors: 2, toe: 4 });
        if (kind === 'open') p = P('open', 'Open shelves', x, c ? top(c) : 0, 18, 60, { shelves: 4, crown: 2.5 });
        if (kind === 'counter') p = P('counter', 'Top', b.x0, c ? c.y : 34.5, Math.max(24, b.x1 - b.x0), 1.5);
        if (kind === 'knee') p = P('knee', 'Knee space', x, (c ? c.y : 28.5) - 3, 36, 3);
        if (kind === 'filler') p = P('filler', 'Filler', x, 0, 3, c ? c.y : 34.5);
        commit(function () { st.push(p); }, true);
        select(p.id, true);
    }
    function apply(inp) {
        var p = find(inp.dataset.id); if (!p) return;
        var k = inp.dataset.k;
        if (k === 'name') { if (inp.value.trim()) commit(function () { p.name = inp.value.trim(); }, false); return; }
        if (k === 'kind') { commit(function () { p.kind = inp.value; }, true); return; }
        var v = inp.dataset.count ? Math.round(Number(inp.value)) : parse(inp.value);
        var min = inp.dataset.count || /^(x|y|toe|crown)$/.test(k) ? 0 : 0.25;
        if (!isFinite(v) || v < min || v > 600) { inp.classList.add('bad'); return; }
        if (Math.abs(v - p[k]) < 1e-6) return;
        commit(function () {
            if (k === 'w') setWidth(st, p, r8(v));
            else if (k === 'h') setHeight(st, p, r8(v));
            else p[k] = inp.dataset.count ? Math.min(v, 12) : r8(v);
        }, false);
    }
    function select(id, open) {
        selected = id; drawOnly();
        dlg.querySelectorAll('.bp-pc').forEach(function (d) {
            var on = d.dataset.id === id; d.classList.toggle('sel', on);
            if (on && open) { d.open = true; d.scrollIntoView({ block: 'nearest' }); }
        });
    }
    function nf(p, k, label, cls) { return '<label class="bp-f ' + (cls || '') + '"><span>' + label + '</span><input data-id="' + p.id + '" data-k="' + k + '" value="' + fmt(p[k]).replace('"', '') + '" inputmode="decimal" autocomplete="off"></label>'; }
    function cf(p, k, label) { return '<label class="bp-f"><span>' + label + '</span><input data-id="' + p.id + '" data-k="' + k + '" data-count="1" value="' + p[k] + '" inputmode="numeric" autocomplete="off"></label>'; }
    function pieceHTML(p) {
        var extra = '';
        if (/base|wall|tall/.test(p.kind)) extra = cf(p, 'doors', 'Doors') + cf(p, 'drawers', 'Drawers') + (p.kind !== 'wall' ? nf(p, 'toe', 'Toe kick') : '');
        if (p.kind === 'open') extra = cf(p, 'shelves', 'Shelves') + cf(p, 'drawers', 'Drawers') + nf(p, 'crown', 'Crown');
        return '<details class="bp-pc' + (p.id === selected ? ' sel' : '') + '" data-id="' + p.id + '"><summary><b>' + esc(p.name) + '</b><small>' + fmt(p.w) + ' × ' + fmt(p.h) + '</small></summary><div class="bp-pb">' +
            '<label class="bp-f w2"><span>Name</span><input data-id="' + p.id + '" data-k="name" value="' + esc(p.name) + '" autocomplete="off"></label>' +
            '<label class="bp-f w2"><span>Type</span><select data-id="' + p.id + '" data-k="kind">' + Object.keys(KINDS).map(function (k) { return '<option value="' + k + '"' + (k === p.kind ? ' selected' : '') + '>' + KINDS[k] + '</option>'; }).join('') + '</select></label>' +
            nf(p, 'w', p.kind === 'counter' ? 'Length' : 'Width') + nf(p, 'h', p.kind === 'counter' ? 'Thickness' : p.kind === 'knee' ? 'Skirt' : 'Height') + nf(p, 'd', 'Depth') + nf(p, 'y', 'From floor') +
            nf(p, 'x', 'From left') + extra +
            '<div class="w4"><button class="btn small" type="button" data-bpdup="' + p.id + '">Duplicate</button><button class="btn small" type="button" data-bpdel="' + p.id + '">Remove</button></div></div></details>';
    }
    function drawOnly() {
        el('bp-draw').innerHTML = svg(st, { interactive: true, selected: selected });
        el('bp-checks').innerHTML = checks(st).map(function (c) { return '<div class="bp-chk ' + (c[0] === 'bad' ? '' : c[0]) + '">' + esc(c[1]) + '</div>'; }).join('');
    }
    function render(rebuild) {
        drawOnly();
        var b = bounds(st), c = counters(st)[0];
        function set(id, v) { var i = el(id); if (i !== document.activeElement || rebuild) { i.value = fmt(v).replace('"', ''); i.classList.remove('bad'); } }
        set('bp-kw', b.x1 - b.x0); set('bp-kh', b.y1);
        el('bp-kd-wrap').hidden = !c; if (c) set('bp-kd', top(c));
        if (rebuild) {
            var open = {};
            dlg.querySelectorAll('.bp-pc[open]').forEach(function (d) { open[d.dataset.id] = 1; });
            var sorted = st.slice().sort(function (a, q) { return (q.y < 0.5) - (a.y < 0.5) || a.y - q.y || a.x - q.x; });
            el('bp-list').innerHTML = sorted.map(pieceHTML).join('');
            dlg.querySelectorAll('.bp-pc').forEach(function (d) { if (open[d.dataset.id]) d.open = true; });
        } else {
            st.forEach(function (p) {
                var d = dlg.querySelector('.bp-pc[data-id="' + p.id + '"]'); if (!d) return;
                d.querySelector('summary b').textContent = p.name;
                d.querySelector('summary small').textContent = fmt(p.w) + ' × ' + fmt(p.h);
                d.querySelectorAll('input[data-k]').forEach(function (i) {
                    if (i === document.activeElement) return;
                    var k = i.dataset.k; i.value = k === 'name' ? p.name : i.dataset.count ? p[k] : fmt(p[k]).replace('"', ''); i.classList.remove('bad');
                });
            });
        }
        el('bp-undo').disabled = !past.length; el('bp-redo').disabled = !future.length;
    }

    function open(pieces, onSave, prevNotes) {
        if (!dlg) build();
        st = pieces && pieces.length ? clone(pieces) : TEMPLATES.desk.make();
        onSaveCb = onSave; selected = null; past = []; future = []; notes = (prevNotes || []).slice();
        el('bp-ans').value = ''; msg('', ''); showNotes();
        el('bp-khint').textContent = 'Type a size and press Enter. Fractions work: 28 1/2.';
        render(true);
        dlg.showModal();
    }

    window.DLBlueprint = { svg: svg, open: open, cabinets: cabinets, fmt: fmt, bounds: bounds };
})();
