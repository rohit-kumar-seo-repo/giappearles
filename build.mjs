import { existsSync } from 'node:fs';
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
  'product.js',
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
const homepageTemplate = await readFile(path.join(projectRoot, 'index.html'), 'utf8');
const productPageFiles = [];
const slugForProduct = (product) => product.name.normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const escapeHtml = (value) => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const escapeJsonForHtml = (value) => JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');
const imageUrl = (image) => '/' + encodeURI(String(image || '').replace(/^\/+/, ''));
const imageSrcset = (image) => {
  const source = imageUrl(image);
  const original = String(image || '').replace(/^\/+/, '');
  const variants = ['-480.jpg', '-900.jpg'].flatMap((suffix) => {
    const candidate = original.replace(/\.jpg$/i, suffix);
    if (!existsSync(path.join(projectRoot, candidate))) return [];
    return [`${imageUrl(candidate)} ${suffix === '-480.jpg' ? 480 : 900}w`];
  });
  return [...variants, `${source} 1600w`].join(', ');
};
const discountPercent = (product) => Math.max(0, Math.round((product.displayPrice - product.launchPrice) / product.displayPrice * 100));
const productMeta = (product) => {
  const colour = product.details?.find((detail) => /^Colour:/i.test(detail))?.replace(/^Colour:\s*/i, '').trim();
  return [colour, product.categoryLabel].filter(Boolean).join(' · ');
};
const productCardHtml = (product, featured = false) => {
  const name = escapeHtml(product.name);
  const meta = escapeHtml(productMeta(product));
  const price = Number(product.launchPrice).toLocaleString('en-IN');
  const displayPrice = Number(product.displayPrice).toLocaleString('en-IN');
  const discount = discountPercent(product);
  const image = imageUrl(product.image);
  const secondImage = product.secondaryImage ? imageUrl(product.secondaryImage) : '';
  return '<article class="product-card' + (featured ? ' featured-product' : '') + '" data-product-id="' + escapeHtml(product.id) + '">'
    + '<a class="product-card-link" href="/products/' + slugForProduct(product) + '/" aria-label="View ' + name + '">'
    + '<div class="product-image-wrap"><img class="product-image product-image-primary" src="' + image + '" srcset="' + imageSrcset(product.image) + '" sizes="(max-width: 767px) 46vw, (max-width: 1024px) 31vw, 23vw" alt="' + name + '" width="900" height="1200" loading="lazy" decoding="async">'
    + (secondImage ? '<img class="product-image product-image-secondary" src="' + secondImage + '" alt="" width="900" height="1200" loading="lazy" decoding="async" aria-hidden="true">' : '')
    + (discount ? '<span class="product-card-discount">-' + discount + '%</span>' : '')
    + '</div><div class="product-info"><h3 class="product-name">' + name + '</h3><p class="product-card-meta">' + meta + '</p>'
    + '<div class="product-price-row"><span class="launch-price">₹' + price + '</span><s class="display-price">₹' + displayPrice + '</s><span class="discount-badge-pill">-' + discount + '%</span></div></div></a>'
    + '<button class="product-card-add" type="button" data-open-size-choice="' + escapeHtml(product.id) + '" aria-label="Add ' + name + ' to bag">Add to bag</button></article>';
};

const sharedHeaderMatch = homepageTemplate.match(/  <div class="launch-offer-bar"[\s\S]*?<\/header>/);
const sharedFooterMatch = homepageTemplate.match(/  <footer class="site-footer">[\s\S]*?<\/footer>/);
if (!sharedHeaderMatch || !sharedFooterMatch) throw new Error('Homepage shared header or footer could not be found.');
const sharedHeader = sharedHeaderMatch[0]
  .replace(/href="#([^"]*)"/g, 'href="/#$1"')
  .replace(/href="login\.html/g, 'href="/login.html')
  .replace(/<button class="action-btn search-btn" id="headerSearchBtn" aria-label="Search products">([\s\S]*?)<\/button>/, '<a class="action-btn search-btn" id="headerSearchBtn" href="/#catalog" aria-label="Search products">$1</a>')
  .replace(/<button class="action-btn cart-btn cart-header-trigger" id="cartTriggerBtn" aria-label="Open shopping bag">([\s\S]*?)<\/button>/, '<a class="action-btn cart-btn cart-header-trigger" id="cartTriggerBtn" href="/?openBag=1" aria-label="Open shopping bag">$1</a>');
const sharedFooter = sharedFooterMatch[0]
  .replace(/href="#([^"]*)"/g, 'href="/#$1"')
  .replace(/href="login\.html/g, 'href="/login.html')
  .replace('href="/#sizeModal" class="trigger-size-guide"', 'href="#sizeModal" class="trigger-size-guide"');
const extractSection = (source, start, end) => {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex);
  if (startIndex < 0 || endIndex < 0) throw new Error(`Could not extract shared section beginning with ${start}.`);
  return source.slice(startIndex, endIndex).trim();
};
const sharedPolicyModals = [
  extractSection(homepageTemplate, '  <div class="modal-backdrop" id="sizeModal"', '  <!-- Return & Exchange Policy Modal -->'),
  extractSection(homepageTemplate, '  <!-- Return & Exchange Policy Modal -->', '  <!-- Shipping & Delivery Policy -->'),
  extractSection(homepageTemplate, '  <!-- Shipping & Delivery Policy -->', '  <!-- Terms & Conditions Modal -->'),
  extractSection(homepageTemplate, '  <!-- Terms & Conditions Modal -->', '  <!-- ==========================================\n       7. QUICK VIEW MODAL')
].join('\n\n');

for (const product of clientProducts) {
  const slug = slugForProduct(product);
  const images = [...new Set([product.image, product.secondaryImage, ...(product.additionalImages || [])].filter(Boolean))];
  const firstImage = images[0] || product.image;
  const imageButtons = images.map((image, index) => {
    const encoded = escapeHtml(imageUrl(image));
    const srcset = escapeHtml(imageSrcset(image));
    const productName = escapeHtml(product.name);
    return '<button class="product-gallery-thumb' + (index === 0 ? ' is-active' : '') + '" type="button" data-product-image-index="' + index + '" data-product-alt="' + productName + ' · view ' + (index + 1) + '" aria-label="View product image ' + (index + 1) + '" aria-pressed="' + (index === 0) + '"><img src="' + encoded + '" srcset="' + srcset + '" sizes="92px" alt="" width="900" height="1200" loading="lazy" decoding="async"></button>';
  }).join('');
  const imageSlides = images.map((image, index) => {
    const encoded = escapeHtml(imageUrl(image));
    const srcset = escapeHtml(imageSrcset(image));
    const productName = escapeHtml(product.name);
    return '<img class="product-main-photo' + (index === 0 ? ' is-active' : '') + '"' + (index === 0 ? ' id="productMainImage"' : '') + ' data-product-slide="' + index + '" src="' + encoded + '" srcset="' + srcset + '" sizes="(max-width: 767px) 100vw, (max-width: 1280px) 52vw, 620px" alt="' + productName + ' · view ' + (index + 1) + '" width="900" height="1200" ' + (index === 0 ? 'fetchpriority="high"' : 'loading="eager"') + ' decoding="async">';
  }).join('');
  const sizes = (product.sizes || []).map((size) => '<button class="product-size-option" type="button" data-product-size="' + escapeHtml(size) + '" aria-pressed="false">' + escapeHtml(size) + '</button>').join('');
  const details = (product.details || []).map((detail) => '<li>' + escapeHtml(detail) + '</li>').join('');
  let related = clientProducts.filter((item) => item.id !== product.id && item.category === product.category).slice(0, 3);
  if (!related.length) related = clientProducts.filter((item) => item.id !== product.id).slice(0, 3);
  const relatedProducts = related.map((item) => productCardHtml(item)).join('');
  const canonical = 'https://giapparel.in/products/' + slug + '/';
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    image: images.map((image) => 'https://giapparel.in' + imageUrl(image)),
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
    sizes: product.sizes || [],
    categoryLabel: product.categoryLabel || product.category
  };
  const productCatalog = clientProducts.map((item) => ({ id: item.id, name: item.name, launchPrice: item.launchPrice, displayPrice: item.displayPrice, sizes: item.sizes || [] }));
  const replacements = {
    '%%PRODUCT_NAME%%': escapeHtml(product.name),
    '%%PRODUCT_DESCRIPTION%%': escapeHtml(product.description),
    '%%PRODUCT_CANONICAL%%': canonical,
    '%%PRODUCT_IMAGE%%': escapeHtml(imageUrl(firstImage).replace(/^\//, '')),
    '%%PRODUCT_IMAGE_SRCSET%%': escapeHtml(imageSrcset(firstImage)),
    '%%PRODUCT_DISCOUNT%%': String(discountPercent(product)),
    '%%PRODUCT_NAME_ENCODED%%': encodeURIComponent(product.name),
    '%%PRODUCT_SCHEMA%%': JSON.stringify(schema).replace(/</g, '\\u003c'),
    '%%PRODUCT_CATEGORY%%': escapeHtml(product.categoryLabel || product.category),
    '%%PRODUCT_PRICE%%': Number(product.launchPrice).toLocaleString('en-IN'),
    '%%PRODUCT_DISPLAY_PRICE%%': Number(product.displayPrice).toLocaleString('en-IN'),
    '%%PRODUCT_SAVINGS%%': Number(product.savings || 0).toLocaleString('en-IN'),
    '%%PRODUCT_IMAGES%%': imageButtons,
    '%%PRODUCT_SLIDES%%': imageSlides,
    '%%PRODUCT_SIZES%%': sizes,
    '%%PRODUCT_DETAILS%%': details,
    '%%RELATED_PRODUCTS%%': relatedProducts,
    '%%PRODUCT_JSON%%': escapeJsonForHtml(productJson),
    '%%PRODUCT_CATALOG_JSON%%': escapeJsonForHtml(productCatalog),
    '%%SHARED_HEADER%%': sharedHeader,
    '%%SHARED_POLICY_MODALS%%': sharedPolicyModals,
    '%%SHARED_FOOTER%%': sharedFooter
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
for (const file of ['index.html', 'login.html', 'styles.css', 'data.js', 'app.js', 'product.js', ...productPageFiles]) {
  const sourcePath = productPageFiles.includes(file) ? path.join(outputDirectory, file) : path.join(projectRoot, file);
  const source = await readFile(sourcePath, 'utf8');
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
