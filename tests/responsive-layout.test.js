import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, stat } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

test('storefront exposes mobile navigation and two-column phone layouts', async () => {
  const [html, app, styles] = await Promise.all([
    readFile(new URL('../index.html', import.meta.url), 'utf8'),
    readFile(new URL('../app.js', import.meta.url), 'utf8'),
    readFile(new URL('../styles.css', import.meta.url), 'utf8')
  ]);

  assert.match(html, /id="mobileNavToggle"[^>]+aria-expanded="false"/);
  assert.match(html, /id="siteNavigation"/);
  assert.match(app, /function initMobileNavigation\(\)/);
  assert.match(app, /event\.key === 'Escape'/);
  assert.match(styles, /@media \(max-width: 1024px\)/);
  assert.match(styles, /@media \(max-width: 767px\)/);
  assert.match(styles, /@media \(max-width: 480px\)/);
  assert.match(styles, /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(styles, /\.quick-view-layout/);
});

test('product cards use existing optimized responsive image assets', async () => {
  const source = await readFile(new URL('../data.js', import.meta.url), 'utf8');
  const context = {};
  runInNewContext(`${source}\nglobalThis.__products = PRODUCTS_DATA;`, context);

  const products = context.__products;
  assert.ok(products.length > 0);

  for (const product of products) {
    const optimizedImage = new URL(`../${product.image}`, import.meta.url);
    const originalImage = new URL(
      `../${product.image.replace('assets/images/optimized/', 'assets/images/').replace(/\.jpg$/, '.png')}`,
      import.meta.url
    );
    const [optimized, original] = await Promise.all([stat(optimizedImage), stat(originalImage)]);
    assert.ok(optimized.size < original.size / 2, `${product.name} image should be compressed`);
    await stat(new URL(`../${product.image.replace('.jpg', '-480.jpg')}`, import.meta.url));
    await stat(new URL(`../${product.image.replace('.jpg', '-900.jpg')}`, import.meta.url));
  }

  const app = await readFile(new URL('../app.js', import.meta.url), 'utf8');
  assert.match(app, /srcset=/);
  assert.match(app, /loading="lazy" decoding="async"/);
});
