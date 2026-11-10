import { publicSupabaseConfigSource } from '../server/public-config.js';

export default function handler(_request, response) {
  let source;
  try {
    source = publicSupabaseConfigSource();
  } catch (error) {
    response.writeHead(503, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    });
    response.end(JSON.stringify({ error: error.message }));
    return;
  }

  response.writeHead(200, {
    'Content-Type': 'text/javascript; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY'
  });
  response.end(source);
}
