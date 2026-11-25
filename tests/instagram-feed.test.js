import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import instagramFeedHandler from '../api/instagram-feed.js';
import { parseByteRange } from '../server/byte-range.js';

const originalToken = process.env.INSTAGRAM_ACCESS_TOKEN;
const originalFetch = globalThis.fetch;

after(() => {
  if (originalToken === undefined) delete process.env.INSTAGRAM_ACCESS_TOKEN;
  else process.env.INSTAGRAM_ACCESS_TOKEN = originalToken;
  globalThis.fetch = originalFetch;
});

function response() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

test('video byte ranges handle normal, open-ended, suffix, and invalid requests', () => {
  assert.deepEqual(parseByteRange('bytes=0-1023', 4096), { start: 0, end: 1023 });
  assert.deepEqual(parseByteRange('bytes=1024-', 4096), { start: 1024, end: 4095 });
  assert.deepEqual(parseByteRange('bytes=-512', 4096), { start: 3584, end: 4095 });
  assert.equal(parseByteRange('bytes=4096-', 4096), null);
  assert.equal(parseByteRange('bytes=0-1,4-5', 4096), null);
});

test('Instagram fallback serves all four supplied videos with their post links', async () => {
  delete process.env.INSTAGRAM_ACCESS_TOKEN;
  const res = response();
  await instagramFeedHandler({ method: 'GET' }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.posts.length, 4);
  for (const post of res.body.posts) {
    assert.equal(post.type, 'VIDEO');
    assert.match(post.video, /^\/assets\/videos\/instagram\/.+\.mp4$/);
    assert.match(post.image, /^\/assets\/images\/optimized\/instagram-.+\.jpg$/);
    assert.match(post.permalink, /^https:\/\/www\.instagram\.com\/reel\/[A-Za-z0-9_-]+\/$/);
  }
});

test('live feed keeps supplied reels while adding current posts and uses the local clip for matching links', async () => {
  process.env.INSTAGRAM_ACCESS_TOKEN = 'test-token';
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({
      data: [
        {
          media_type: 'VIDEO',
          thumbnail_url: 'https://scontent.cdninstagram.com/live-poster.jpg',
          media_url: 'https://scontent.cdninstagram.com/live-video.mp4',
          permalink: 'https://www.instagram.com/reel/DePoajdzr2r/',
          caption: 'Live Instagram caption',
        },
        {
          media_type: 'VIDEO',
          thumbnail_url: 'https://scontent.cdninstagram.com/new-poster.jpg',
          media_url: 'https://scontent.cdninstagram.com/new-video.mp4',
          permalink: 'https://www.instagram.com/reel/NewPost123/',
          caption: 'A newly published post',
        },
      ],
    }),
  });
  const res = response();
  await instagramFeedHandler({ method: 'GET' }, res);

  assert.equal(res.body.posts.length, 5);
  assert.equal(res.body.posts[0].video, '/assets/videos/instagram/floral-moment.mp4');
  assert.equal(res.body.posts[0].caption, 'Live Instagram caption');
  assert.equal(res.body.posts[1].permalink, 'https://www.instagram.com/reel/NewPost123/');
  assert.ok(res.body.posts.some((post) => post.video === '/assets/videos/instagram/rosie-gingham-reel.mp4'));
});
