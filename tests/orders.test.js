import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import { ORDER_CATALOG, FLAT_SHIPPING_PAISE } from '../server/catalog.js';
import {
  buildOrder,
  formatRupees,
  InputError,
  validateCustomer,
  verifyRazorpaySignature,
  verifyWebhookSignature
} from '../server/orders.js';

test('Supabase URL is read after environment variables are loaded', async () => {
  const previousUrl = process.env.SUPABASE_URL;
  const previousServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const originalFetch = globalThis.fetch;
  delete process.env.SUPABASE_URL;
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';

  try {
    const { supabaseRequest } = await import('../server/services.js?late-env-test');
    process.env.SUPABASE_URL = 'https://supabase.example/';
    let requestedUrl;
    globalThis.fetch = async (url) => {
      requestedUrl = url;
      return { ok: true, status: 200, text: async () => '[]' };
    };

    assert.deepEqual(await supabaseRequest('orders'), []);
    assert.equal(requestedUrl, 'https://supabase.example/rest/v1/orders');
  } finally {
    globalThis.fetch = originalFetch;
    if (previousUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = previousUrl;
    if (previousServiceKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = previousServiceKey;
  }
});

test('order rate limiting derives a separate key when its dedicated secret is missing', async () => {
  const previousEnv = {
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    ORDER_RATE_LIMIT_SECRET: process.env.ORDER_RATE_LIMIT_SECRET
  };
  const originalFetch = globalThis.fetch;
  const originalWarn = console.warn;
  const serviceRoleKey = 'test-service-role-key';
  let rpcRequest;
  let warning = '';

  process.env.SUPABASE_URL = 'https://supabase.example';
  process.env.SUPABASE_SERVICE_ROLE_KEY = serviceRoleKey;
  delete process.env.ORDER_RATE_LIMIT_SECRET;
  globalThis.fetch = async (url, options) => {
    rpcRequest = { url, options };
    return { ok: true, status: 200, text: async () => 'true' };
  };
  console.warn = (message) => { warning = message; };

  try {
    const { consumeOrderRateLimit } = await import('../server/services.js');
    assert.equal(await consumeOrderRateLimit({ headers: { 'x-real-ip': '203.0.113.10' } }), true);

    const derivedSecret = createHmac('sha256', serviceRoleKey)
      .update('gi-apparel:order-rate-limit:v1')
      .digest();
    const expectedToken = createHmac('sha256', derivedSecret)
      .update('203.0.113.10')
      .digest('hex');
    assert.equal(rpcRequest.url, 'https://supabase.example/rest/v1/rpc/consume_order_rate_limit');
    assert.deepEqual(JSON.parse(rpcRequest.options.body), { p_ip_hash: expectedToken });
    assert.match(warning, /ORDER_RATE_LIMIT_SECRET is not set/);
  } finally {
    globalThis.fetch = originalFetch;
    console.warn = originalWarn;
    for (const [name, value] of Object.entries(previousEnv)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});

test('server catalog prices and sizes match the storefront catalog', async () => {
  const dataSource = await readFile(new URL('../data.js', import.meta.url), 'utf8');
  const context = {};
  runInNewContext(`${dataSource}\nglobalThis.__catalogForTest = PRODUCTS_DATA;`, context);
  assert.equal(context.__catalogForTest.length, Object.keys(ORDER_CATALOG).length);
  for (const product of context.__catalogForTest) {
    assert.equal(
      JSON.stringify(ORDER_CATALOG[product.id]),
      JSON.stringify({ name: product.name, price: product.launchPrice, sizes: product.sizes })
    );
  }
});

test('order total is calculated from the server catalog and flat shipping rate', () => {
  const order = buildOrder([
    { id: 'gi-001', size: 'S', quantity: 2 },
    { id: 'gi-011', size: 'M', quantity: 1 }
  ]);
  assert.equal(order.itemSubtotalPaise, (1699 * 2 + 799) * 100);
  assert.equal(order.shippingPaise, FLAT_SHIPPING_PAISE);
  assert.equal(order.totalPaise, (1699 * 2 + 799) * 100 + 15000);
  assert.equal(order.lines[0].name, 'Alora Midi Dress');
});

test('order validation rejects client prices, invalid products, sizes and quantities', () => {
  assert.throws(() => buildOrder([]), InputError);
  assert.throws(() => buildOrder([{ id: 'not-a-product', size: 'M', quantity: 1 }]), InputError);
  assert.throws(() => buildOrder([{ id: 'gi-001', size: 'XXL', quantity: 1 }]), InputError);
  assert.throws(() => buildOrder([{ id: 'gi-001', size: 'M', quantity: 11 }]), InputError);
  const clientPriceIgnored = buildOrder([{ id: 'gi-001', size: 'M', quantity: 1, price: 1 }]);
  assert.equal(clientPriceIgnored.totalPaise, 169900 + FLAT_SHIPPING_PAISE);
});

test('customer validation normalizes and requires a deliverable Indian address', () => {
  const customer = validateCustomer({
    name: '  Ada   Lovelace ',
    email: 'ADA@example.com',
    phone: '+91 9536429777',
    addressLine1: '  12 Fashion Street ',
    addressLine2: '',
    city: ' Jaipur ',
    state: ' Rajasthan ',
    postalCode: '302001'
  });
  assert.equal(customer.name, 'Ada Lovelace');
  assert.equal(customer.email, 'ada@example.com');
  assert.equal(customer.postalCode, '302001');
  assert.throws(() => validateCustomer({ ...customer, postalCode: '000000' }), InputError);
});

test('Razorpay checkout signature and webhook signature are verified', () => {
  const secret = 'test-secret-only';
  const orderId = 'order_test123';
  const paymentId = 'pay_test123';
  const checkoutSignature = createHmac('sha256', secret)
    .update(`${orderId}|${paymentId}`)
    .digest('hex');
  const rawBody = Buffer.from('{"event":"payment.captured"}');
  const webhookSignature = createHmac('sha256', secret).update(rawBody).digest('hex');

  assert.equal(verifyRazorpaySignature(orderId, paymentId, checkoutSignature, secret), true);
  assert.equal(verifyRazorpaySignature(orderId, paymentId, '00', secret), false);
  assert.equal(verifyWebhookSignature(rawBody, webhookSignature, secret), true);
  assert.equal(verifyWebhookSignature(rawBody, 'not-a-signature', secret), false);
});

test('prices display in Indian Rupees without floating-point paise loss', () => {
  assert.equal(formatRupees(184900), '₹1,849');
  assert.equal(formatRupees(15050), '₹150.5');
});
