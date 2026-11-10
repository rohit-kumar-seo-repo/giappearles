import { cp, mkdir, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { ORDER_CATALOG } from './server/catalog.js';

const projectRoot = path.dirname(fileURLToPath(import.meta.url));
const outputDirectory = path.join(projectRoot, 'dist');

const requiredFiles = [
  'index.html',
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

await cp(
  path.join(projectRoot, 'assets'),
  path.join(outputDirectory, 'assets'),
  { recursive: true }
);

await cp(
  path.join(projectRoot, 'node_modules', '@supabase', 'supabase-js', 'dist', 'umd', 'supabase.js'),
  path.join(outputDirectory, 'supabase.js')
);

console.log('Static production site built in dist/.');
