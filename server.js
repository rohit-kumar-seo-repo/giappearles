
import http from 'node:http';
import path from 'node:path';
import process from 'node:process';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { isIP } from 'node:net';

import ordersHandler from './api/orders.js';
import verifyHandler from './api/payments/verify.js';
import webhookHandler from './api/payments/webhook.js';
import adminHandler from './api/admin.js';
import adminCouponsHandler from './api/admin/coupons.js';
import instagramFeedHandler from './api/instagram-feed.js';
import { parseByteRange } from './server/byte-range.js';
import { publicSupabaseConfigSource } from './server/public-config.js';

try {
  process.loadEnvFile();
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(ROOT, 'dist');
const PORT = Number(process.env.PORT || 3000);

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.mp4': 'video/mp4',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

function sendJson(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(data));
}

function adaptResponse(res) {
  return {
    status(code) {
      res.statusCode = code;
      return this;
    },
    setHeader(name, value) {
      res.setHeader(name, value);
    },
    json(data) {
      if (!res.headersSent) {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
      }
      res.end(JSON.stringify(data));
      return this;
    },
  };
}

async function readJsonBody(req, res) {
  const chunks = [];
  let size = 0;

  for await (const chunk of req) {
    size += chunk.length;

    if (size > 16 * 1024) {
      sendJson(res, 413, { error: 'The request is too large.' });
      return null;
    }

    chunks.push(chunk);
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    sendJson(res, 400, { error: 'Invalid JSON request.' });
    return null;
  }
}

async function serveStatic(req, res, pathname) {
  let relativePath;

  try {
    relativePath = decodeURIComponent(pathname);
  } catch {
    sendJson(res, 400, { error: 'Invalid URL path.' });
    return;
  }

  if (relativePath === '/') relativePath = '/index.html';

  let filePath = path.resolve(DIST, `.${relativePath}`);

  if (!filePath.startsWith(DIST + path.sep)) {
    sendJson(res, 403, { error: 'Forbidden.' });
    return;
  }

  try {
    let info = await stat(filePath);
    if (info.isDirectory()) {
      filePath = path.join(filePath, 'index.html');
      info = await stat(filePath);
    }
    if (!info.isFile()) {
      sendJson(res, 404, { error: 'Not found.' });
      return;
    }

    const extension = path.extname(filePath).toLowerCase();
    const sharedHeaders = {
      'Content-Type': mimeTypes[extension] || 'application/octet-stream',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
    };

    if (extension === '.mp4') {
      const content = await readFile(filePath);
      const range = req.headers.range;
      if (range) {
        const byteRange = parseByteRange(range, info.size);
        if (!byteRange) {
          res.writeHead(416, { ...sharedHeaders, 'Accept-Ranges': 'bytes', 'Content-Range': `bytes */${info.size}` });
          res.end();
          return;
        }
        const { start, end } = byteRange;
        res.writeHead(206, {
          ...sharedHeaders,
          'Accept-Ranges': 'bytes',
          'Content-Range': `bytes ${start}-${end}/${info.size}`,
          'Content-Length': end - start + 1,
        });
        res.end(req.method === 'HEAD' ? undefined : content.subarray(start, end + 1));
        return;
      }
      res.writeHead(200, { ...sharedHeaders, 'Accept-Ranges': 'bytes', 'Content-Length': info.size });
      res.end(req.method === 'HEAD' ? undefined : content);
      return;
    }

    const content = await readFile(filePath);

    res.writeHead(200, sharedHeaders);

    if (req.method === 'HEAD') {
      res.end();
    } else {
      res.end(content);
    }
  } catch {
    sendJson(res, 404, { error: 'Not found.' });
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    const pathname = url.pathname;

    // Local development only: provide a loopback address when no
    // reverse proxy supplies a client IP. Never use this fallback
    // in production.
    if (
      process.env.NODE_ENV !== 'production'
      && !isIP(String(req.headers['x-real-ip'] || '').trim())
    ) {
      req.headers['x-real-ip'] = '127.0.0.1';
    }

    if (pathname === '/supabase-config.js') {
      let source;
      try {
        source = publicSupabaseConfigSource();
      } catch (error) {
        sendJson(res, 503, { error: error.message });
        return;
      }
      res.writeHead(200, {
        'Content-Type': 'text/javascript; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
      });
      res.end(source);
      return;
    }

    const routes = {
      '/api/orders': ordersHandler,
      '/api/admin': adminHandler,
      '/api/admin/coupons': adminCouponsHandler,
      '/api/instagram-feed': instagramFeedHandler,
      '/api/payments/verify': verifyHandler,
      '/api/payments/webhook': webhookHandler,
    };

    const handler = routes[pathname];

    if (handler) {
      const allowedMethods = pathname === '/api/instagram-feed' ? ['GET'] : pathname === '/api/admin' || pathname === '/api/admin/coupons' ? ['GET', 'POST'] : ['POST'];
      if (!allowedMethods.includes(req.method)) {
        res.setHeader('Allow', allowedMethods.join(', '));
        sendJson(res, 405, { error: 'Method not allowed.' });
        return;
      }

      // Preserve the original request stream for Razorpay webhook
      // signature verification. GET requests do not have a JSON body.
      if (req.method === 'POST' && pathname !== '/api/payments/webhook') {
        const body = await readJsonBody(req, res);
        if (body === null) return;
        req.body = body;
      }

      await handler(req, adaptResponse(res));
      return;
    }

    if (pathname.startsWith('/api/')) {
      sendJson(res, 404, { error: 'API endpoint not found.' });
      return;
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      sendJson(res, 405, { error: 'Method not allowed.' });
      return;
    }

    await serveStatic(req, res, pathname === '/admin' || pathname === '/admin/' ? '/admin.html' : pathname);
  } catch (error) {
    console.error('Server request failed:', error.message);

    if (!res.headersSent) {
      sendJson(res, 500, { error: 'Internal server error.' });
    } else if (!res.writableEnded) {
      res.end();
    }
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`GI Apparel server listening on port ${PORT}`);
});
