import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { ORDER_CATALOG } from './server/catalog.js';

const projectRoot = path.dirname(fileURLToPath(import.meta.url));
const outputDirectory = path.join(projectRoot, 'dist');

const requiredFiles = [
  'index.html',
  'admin.html',
  'login.html',
  'styles.css',
  'app.js',
  'login.js',
  'account.js',
  'account-header.js',
  'auth-utils.js',
  'supabase-client.js',
  'storefront-auth.js',
  'data.js',
  'favicon.svg',
  'robots.txt',
  'sitemap.xml'
];

const clientDataSource = await readFile(path.join(projectRoot, 'data.js'), 'utf8');
const clientContext = {};
runInNewContext(`${clientDataSource}\nglobalThis.__catalogForBuild = PRODUCTS_DATA;`, clientContext);
const clientProducts = clientContext.__catalogForBuild;

if (clientProducts.length !== Object.keys(ORDER_CATALOG).length) {
  throw new Error('Server order catalog must contain exactly the same products as data.js.');
}
for (const product of clientProducts) {
  const orderProduct = ORDER_CATALOG[product.id];
  if (
    !orderProduct
    || orderProduct.name !== product.name
    || orderProduct.price !== product.launchPrice
    || JSON.stringify(orderProduct.sizes) !== JSON.stringify(product.sizes)
  ) {
    throw new Error(`Server order price or size options do not match data.js for ${product.id}.`);
  }
}

await rm(outputDirectory, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });

for (const file of requiredFiles) {
  await readFile(path.join(projectRoot, file));
  await cp(path.join(projectRoot, file), path.join(outputDirectory, file));
}

// Generate an indexable static product page for each catalog item.
const productPageTemplate = await readFile(path.join(projectRoot, 'product-page.template.html'), 'utf8');
const productPageFiles = [];
const slugForProduct = (product) => product.name.normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const escapeHtml = (value) => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const escapeJsonForHtml = (value) => JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');

for (const product of clientProducts) {
  const slug = slugForProduct(product);
  const images = [...new Set([product.image, product.secondaryImage, ...(product.additionalImages || [])].filter(Boolean))];
  const firstImage = images[0] || product.image;
  const imageButtons = images.map((image, index) => {
    const encoded = escapeHtml(encodeURI(image));
    const productName = escapeHtml(product.name);
    return '<button class="product-thumbnail" type="button" data-product-image="' + encoded + '" data-product-alt="' + productName + ' · view ' + (index + 1) + '" aria-label="View product image ' + (index + 1) + '" aria-pressed="' + (index === 0) + '"><img src="/' + encoded + '" alt="" loading="lazy" decoding="async"></button>';
  }).join('');
  const sizes = (product.sizes || []).map((size) => '<button class="product-size-option" type="button" data-product-size="' + escapeHtml(size) + '" aria-pressed="false">' + escapeHtml(size) + '</button>').join('');
  const details = (product.details || []).map((detail) => '<li>' + escapeHtml(detail) + '</li>').join('');
  let related = clientProducts.filter((item) => item.id !== product.id && item.category === product.category).slice(0, 3);
  if (!related.length) related = clientProducts.filter((item) => item.id !== product.id).slice(0, 3);
  const relatedProducts = related.map((item) => {
    const itemSlug = slugForProduct(item);
    return '<a class="product-related-card" href="/products/' + itemSlug + '/"><img src="/' + escapeHtml(encodeURI(item.image)) + '" alt="' + escapeHtml(item.name) + '" loading="lazy" decoding="async"><span>' + escapeHtml(item.name) + '<small>₹' + Number(item.launchPrice).toLocaleString('en-IN') + '</small></span></a>';
  }).join('');
  const canonical = 'https://giapparel.in/products/' + slug + '/';
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    image: images.map((image) => 'https://giapparel.in/' + encodeURI(image)),
    description: product.description,
    sku: product.id,
    brand: { '@type': 'Brand', name: 'GI Apparel' },
    offers: {
      '@type': 'Offer',
      url: canonical,
      priceCurrency: 'INR',
      price: String(product.launchPrice),
      availability: 'https://schema.org/InStock'
    }
  };
  const productJson = {
    id: product.id,
    name: product.name,
    launchPrice: product.launchPrice,
    sizes: product.sizes || []
  };
  const replacements = {
    '%%PRODUCT_NAME%%': escapeHtml(product.name),
    '%%PRODUCT_DESCRIPTION%%': escapeHtml(product.description),
    '%%PRODUCT_CANONICAL%%': canonical,
    '%%PRODUCT_IMAGE%%': escapeHtml(encodeURI(firstImage)),
    '%%PRODUCT_SCHEMA%%': JSON.stringify(schema).replace(/</g, '\\u003c'),
    '%%PRODUCT_CATEGORY%%': escapeHtml(product.categoryLabel || product.category),
    '%%PRODUCT_PRICE%%': Number(product.launchPrice).toLocaleString('en-IN'),
    '%%PRODUCT_DISPLAY_PRICE%%': Number(product.displayPrice).toLocaleString('en-IN'),
    '%%PRODUCT_SAVINGS%%': Number(product.savings || 0).toLocaleString('en-IN'),
    '%%PRODUCT_IMAGES%%': imageButtons,
    '%%PRODUCT_SIZES%%': sizes,
    '%%PRODUCT_DETAILS%%': details,
    '%%RELATED_PRODUCTS%%': relatedProducts,
    '%%PRODUCT_JSON%%': escapeJsonForHtml(productJson)
  };
  let html = productPageTemplate;
  for (const [token, replacement] of Object.entries(replacements)) html = html.replaceAll(token, replacement);
  const outputPath = path.join(outputDirectory, 'products', slug, 'index.html');
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, html, 'utf8');
  productPageFiles.push(path.relative(outputDirectory, outputPath));
}

const productUrls = clientProducts.map((product) => '  <url><loc>https://giapparel.in/products/' + slugForProduct(product) + '/</loc></url>').join('\n');
await writeFile(
  path.join(outputDirectory, 'sitemap.xml'),
  '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>https://giapparel.in/</loc></url>\n' + productUrls + '\n</urlset>\n',
  'utf8'
);

// The full-size PNG originals in assets/images/ are source material only; the
// site serves the compressed copies in assets/images/optimized/. Leaving the
// originals out keeps about 23 MB of unused images off the deployment.
const originalImagesDirectory = path.join(projectRoot, 'assets', 'images');
await cp(
  path.join(projectRoot, 'assets'),
  path.join(outputDirectory, 'assets'),
  {
    recursive: true,
    filter: (source) => !(
      path.dirname(source) === originalImagesDirectory
      && path.extname(source).toLowerCase() === '.png'
    )
  }
);

// Fail the build if a page or stylesheet points at an image that is not deployed.
for (const file of ['index.html', 'login.html', 'styles.css', 'data.js', 'app.js', ...productPageFiles]) {
  const source = await readFile(path.join(projectRoot, file), 'utf8');
  for (const [reference] of source.matchAll(/assets\/images\/[^"'`()\n,]+?\.(?:jpe?g|png|webp|svg)/g)) {
    const relative = decodeURIComponent(reference);
    try {
      await readFile(path.join(outputDirectory, relative));
    } catch {
      throw new Error(`${file} references ${relative}, which is not in the build output.`);
    }
  }
}

await cp(
  path.join(projectRoot, 'node_modules', '@supabase', 'supabase-js', 'dist', 'umd', 'supabase.js'),
  path.join(outputDirectory, 'supabase.js')
);

console.log('Static production site built in dist/.');
