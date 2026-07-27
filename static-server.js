// Serves this repo's static site as-is, no build step. Deliberately not
// using the `serve` npm package — as of this writing its dependency chain
// (serve -> serve-handler -> minimatch -> brace-expansion) carries an
// unpatched high-severity DoS advisory (GHSA-mh99-v99m-4gvg). A plain
// static file server is a small enough job to just write directly and
// avoid that supply-chain risk entirely. See ADMIN-HOSTING.md.
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const PORT = process.env.PORT || 3000;

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

http.createServer(function (req, res) {
    var urlPath = decodeURIComponent(req.url.split('?')[0]);
    var filePath = path.normalize(path.join(ROOT, urlPath));

    // path.normalize collapses "..", but confirm the resolved path never
    // escapes ROOT before touching the filesystem.
    if (filePath !== ROOT && !filePath.startsWith(ROOT + path.sep)) {
        res.writeHead(403, { 'Content-Type': 'text/plain' });
        return res.end('Forbidden');
    }

    fs.stat(filePath, function (err, stats) {
        if (!err && stats.isDirectory()) {
            filePath = path.join(filePath, 'index.html');
        }
        fs.readFile(filePath, function (err, data) {
            if (err) {
                res.writeHead(404, { 'Content-Type': 'text/plain' });
                return res.end('Not found');
            }
            var ext = path.extname(filePath).toLowerCase();
            res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
            res.end(data);
        });
    });
}).listen(PORT, function () {
    console.log('Serving ' + ROOT + ' on port ' + PORT);
});
