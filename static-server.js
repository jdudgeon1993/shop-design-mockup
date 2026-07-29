// Gates every path on this domain behind a real, server-side check before
// deciding what to send back — the check that a purely static host (like
// GitHub Pages) can never do, since there's no server there to ask.
//
// Not authenticated (no valid cookie, or a valid session that isn't an
// employee): every single path gets coming-soon/index.html, full stop.
// Authenticated employee: the real site is served as-is.
//
// Login itself still happens client-side via Supabase (same pattern as
// every other page in this repo) — the browser signs in, then POSTs the
// resulting access token to POST /api/session here, which verifies it
// against Supabase directly (same approach as server/index.js's
// getSupabaseUser) and only then sets the cookie this file actually checks.
// A JS-disabled visitor just can't reach the sign-in step — they were never
// going to see anything past this file's own check either way.
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const PORT = process.env.PORT || 3000;
const COOKIE_NAME = 'dl_session';
const SESSION_MAX_AGE = 60 * 60; // 1 hour — matches Supabase's default access token lifetime

const REQUIRED_ENV = ['SUPABASE_URL', 'SUPABASE_ANON_KEY'];
for (const name of REQUIRED_ENV) {
    if (!process.env[name]) {
        console.error('Missing required environment variable: ' + name);
        process.exit(1);
    }
}
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.sql': 'text/plain; charset=utf-8',
    '.md': 'text/plain; charset=utf-8'
};

// ---- Supabase verification (same approach as server/index.js) ----
function getSupabaseUser(accessToken) {
    return fetch(SUPABASE_URL + '/auth/v1/user', {
        headers: { Authorization: 'Bearer ' + accessToken, apikey: SUPABASE_ANON_KEY }
    }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; });
}

function isEmployee(accessToken, userId) {
    var url = SUPABASE_URL + '/rest/v1/profiles?id=eq.' + encodeURIComponent(userId) + '&select=role';
    return fetch(url, {
        headers: { Authorization: 'Bearer ' + accessToken, apikey: SUPABASE_ANON_KEY }
    }).then(function (r) { return r.ok ? r.json() : []; })
      .then(function (rows) { return Array.isArray(rows) && rows[0] && rows[0].role === 'employee'; })
      .catch(function () { return false; });
}

function verifySession(accessToken) {
    if (!accessToken) return Promise.resolve(null);
    return getSupabaseUser(accessToken).then(function (user) {
        if (!user || !user.id) return null;
        return isEmployee(accessToken, user.id).then(function (ok) { return ok ? user : null; });
    });
}

// ---- Cookies ----
function parseCookies(header) {
    var out = {};
    (header || '').split(';').forEach(function (part) {
        var i = part.indexOf('=');
        if (i === -1) return;
        out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
    });
    return out;
}

// ---- Static file serving (path-traversal-safe — unchanged from before) ----
function serveFile(res, filePath, status) {
    fs.stat(filePath, function (err, stats) {
        if (!err && stats.isDirectory()) filePath = path.join(filePath, 'index.html');
        fs.readFile(filePath, function (err, data) {
            if (err) {
                res.writeHead(404, { 'Content-Type': 'text/plain' });
                return res.end('Not found');
            }
            var ext = path.extname(filePath).toLowerCase();
            res.writeHead(status || 200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
            res.end(data);
        });
    });
}

function serveComingSoon(res) {
    serveFile(res, path.join(ROOT, 'coming-soon', 'index.html'));
}

function readJsonBody(req) {
    return new Promise(function (resolve, reject) {
        var chunks = [];
        req.on('data', function (c) { chunks.push(c); });
        req.on('end', function () {
            try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); }
            catch (e) { reject(e); }
        });
        req.on('error', reject);
    });
}

http.createServer(function (req, res) {
    var urlPath = decodeURIComponent(req.url.split('?')[0]);
    var cookies = parseCookies(req.headers.cookie);

    // ---- API: exchange a Supabase access token for this gate's own cookie ----
    if (req.method === 'POST' && urlPath === '/api/session') {
        return readJsonBody(req).then(function (body) {
            return verifySession(body.access_token).then(function (user) {
                if (!user) {
                    res.writeHead(401, { 'Content-Type': 'application/json' });
                    return res.end(JSON.stringify({ error: 'Not an employee account, or session expired.' }));
                }
                res.writeHead(200, {
                    'Content-Type': 'application/json',
                    'Set-Cookie': COOKIE_NAME + '=' + encodeURIComponent(body.access_token) +
                        '; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=' + SESSION_MAX_AGE
                });
                res.end(JSON.stringify({ ok: true }));
            });
        }).catch(function () {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Bad request' }));
        });
    }

    if (req.method === 'POST' && urlPath === '/api/logout') {
        res.writeHead(200, {
            'Content-Type': 'application/json',
            'Set-Cookie': COOKIE_NAME + '=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0'
        });
        return res.end(JSON.stringify({ ok: true }));
    }

    if (req.method === 'GET' && urlPath === '/healthz') {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        return res.end('ok');
    }

    // ---- Every other path: gate first, serve second ----
    verifySession(cookies[COOKIE_NAME]).then(function (user) {
        if (!user) return serveComingSoon(res);

        var filePath = path.normalize(path.join(ROOT, urlPath));
        if (filePath !== ROOT && !filePath.startsWith(ROOT + path.sep)) {
            res.writeHead(403, { 'Content-Type': 'text/plain' });
            return res.end('Forbidden');
        }
        serveFile(res, filePath);
    });
}).listen(PORT, function () {
    console.log('Gatekeeper serving ' + ROOT + ' on port ' + PORT);
});
