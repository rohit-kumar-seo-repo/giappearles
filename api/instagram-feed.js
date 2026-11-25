const FEATURED_REEL = 'DePoajdzr2r';
const CACHE_CONTROL = 'public, max-age=300, s-maxage=900, stale-while-revalidate=3600';
const LOCAL_REELS = {
  DePoajdzr2r: { image: '/assets/images/optimized/instagram-floral-moment.jpg', video: '/assets/videos/instagram/floral-moment.mp4', caption: 'A little floral moment' },
  DecdCrUS_yj: { image: '/assets/images/optimized/instagram-navy-halter.jpg', video: '/assets/videos/instagram/navy-halter-reel.mp4', caption: 'A little blue, a little magic' },
  DeH1DRcStuE: { image: '/assets/images/optimized/instagram-floral-skirt.jpg', video: '/assets/videos/instagram/floral-skirt-reel.mp4', caption: 'In my pretty skirt era' },
  DdjuZdJwSFJ: { image: '/assets/images/optimized/instagram-rosie-gingham.jpg', video: '/assets/videos/instagram/rosie-gingham-reel.mp4', caption: 'Meet Rosie Gingham' },
};
const FALLBACK_POSTS = Object.entries(LOCAL_REELS).map(([shortcode, post]) => ({
  ...post,
  permalink: `https://www.instagram.com/reel/${shortcode}/`,
  type: 'VIDEO',
}));

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

function validInstagramMediaUrl(value) {
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
  let video = '';
  if (media.media_type === 'VIDEO') video = media.media_url;
  else if (media.media_type === 'CAROUSEL_ALBUM' && isVideo) video = firstChild?.media_url;
  const shortcode = new URL(media.permalink).pathname.split('/')[2];
  const localReel = LOCAL_REELS[shortcode];
  return {
    image: localReel?.image || image,
    video: localReel?.video || (validInstagramMediaUrl(video) ? video : ''),
    permalink: media.permalink,
    type: localReel || isVideo ? 'VIDEO' : 'IMAGE',
    caption: typeof media.caption === 'string' && media.caption.trim()
      ? media.caption.trim().slice(0, 2200)
      : localReel?.caption || '',
  };
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
    url.searchParams.set('fields', 'id,caption,media_type,media_url,permalink,timestamp,thumbnail_url,children{media_type,media_url,thumbnail_url}');
    url.searchParams.set('limit', '12');
    url.searchParams.set('access_token', token);
    const upstream = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!upstream.ok) return respond(response, 200, { posts: FALLBACK_POSTS });
    const payload = await upstream.json();
    const posts = selectPosts(Array.isArray(payload.data) ? payload.data : []);
    if (!posts.length) return respond(response, 200, { posts: FALLBACK_POSTS });
    const pinnedPosts = FALLBACK_POSTS.filter((fallback) => !posts.some((post) => post.permalink === fallback.permalink));
    return respond(response, 200, { posts: [...posts, ...pinnedPosts] });
  } catch {
    return respond(response, 200, { posts: FALLBACK_POSTS });
  }
}
