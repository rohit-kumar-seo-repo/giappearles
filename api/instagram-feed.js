const FEATURED_REEL = 'DePoajdzr2r';
const CACHE_CONTROL = 'public, max-age=300, s-maxage=900, stale-while-revalidate=3600';
const FALLBACK_POSTS = [
  { image: '/assets/images/optimized/azure bloom dress1.jpg', permalink: 'https://www.instagram.com/reel/DePoajdzr2r/', type: 'VIDEO' },
  { image: '/assets/images/optimized/alora midi.jpg', permalink: 'https://www.instagram.com/reel/DecdCrUS_yj/', type: 'VIDEO' },
  { image: '/assets/images/optimized/azure mini skirt1.jpg', permalink: 'https://www.instagram.com/reel/DeH1DRcStuE/', type: 'VIDEO' },
  { image: '/assets/images/optimized/rosie gingham top1.jpg', permalink: 'https://www.instagram.com/reel/DdjuZdJwSFJ/', type: 'VIDEO' },
];

function validInstagramLink(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:'
      && ['instagram.com', 'www.instagram.com'].includes(url.hostname)
      && /^\/(?:p|reel)\/[A-Za-z0-9_-]+\/?$/.test(url.pathname);
  } catch {
    return false;
  }
}

function validInstagramImage(value) {
  if (typeof value !== 'string') return false;
  if (value.startsWith('/assets/images/optimized/')) return true;
  try {
    const url = new URL(value);
    return url.protocol === 'https:'
      && (url.hostname.endsWith('.cdninstagram.com') || url.hostname.endsWith('.fbcdn.net')
        || ['lookaside.instagram.com', 'instagram.com'].includes(url.hostname));
  } catch {
    return false;
  }
}

function normalizeMedia(media) {
  if (!validInstagramLink(media?.permalink)) return null;
  const children = Array.isArray(media.children?.data) ? media.children.data : [];
  const firstChild = children.find((child) => validInstagramImage(child.media_type === 'VIDEO' ? child.thumbnail_url : child.media_url));
  const isVideo = media.media_type === 'VIDEO' || (media.media_type === 'CAROUSEL_ALBUM' && firstChild?.media_type === 'VIDEO');
  let image = media.media_url;
  if (media.media_type === 'VIDEO') image = media.thumbnail_url;
  else if (media.media_type === 'CAROUSEL_ALBUM') image = isVideo ? firstChild?.thumbnail_url : firstChild?.media_url;
  if (!validInstagramImage(image)) return null;
  return { image, permalink: media.permalink, type: isVideo ? 'VIDEO' : 'IMAGE' };
}

function selectPosts(media) {
  const posts = media.map(normalizeMedia).filter(Boolean);
  const featured = posts.find((post) => post.permalink.includes(`/reel/${FEATURED_REEL}/`));
  return [...(featured ? [featured] : []), ...posts.filter((post) => post !== featured)].slice(0, 4);
}

function respond(response, status, body) {
  response.setHeader('Cache-Control', CACHE_CONTROL);
  response.setHeader('X-Content-Type-Options', 'nosniff');
  return response.status(status).json(body);
}

export default async function handler(request, response) {
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    return respond(response, 405, { error: 'Method not allowed.' });
  }

  const token = process.env.INSTAGRAM_ACCESS_TOKEN?.trim();
  if (!token) return respond(response, 200, { posts: FALLBACK_POSTS });

  try {
    const url = new URL('https://graph.instagram.com/v27.0/me/media');
    url.searchParams.set('fields', 'id,media_type,media_url,permalink,timestamp,thumbnail_url,children{media_type,media_url,thumbnail_url}');
    url.searchParams.set('limit', '12');
    url.searchParams.set('access_token', token);
    const upstream = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!upstream.ok) return respond(response, 200, { posts: FALLBACK_POSTS });
    const payload = await upstream.json();
    const posts = selectPosts(Array.isArray(payload.data) ? payload.data : []);
    return respond(response, 200, { posts: posts.length ? posts : FALLBACK_POSTS });
  } catch {
    return respond(response, 200, { posts: FALLBACK_POSTS });
  }
}
