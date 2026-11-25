import assert from 'node:assert/strict';
import { after, beforeEach, test } from 'node:test';
import couponAdminHandler from '../api/admin/coupons.js';
import ordersHandler from '../api/orders.js';
import { normalizeCouponInput } from '../server/coupons.js';
import { InputError } from '../server/orders.js';

const TEST_PASSWORD = 'coupon-admin-test-password';
const previousPassword = process.env.ADMIN_PASSWORD;

beforeEach(() => {
  process.env.ADMIN_PASSWORD = TEST_PASSWORD;
});

after(() => {
  if (previousPassword === undefined) delete process.env.ADMIN_PASSWORD;
  else process.env.ADMIN_PASSWORD = previousPassword;
});

function response() {
  return {
    statusCode: 200, headers: {}, body: null,
    status(code) { this.statusCode = code; return this; },
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
    json(body) { this.body = body; return this; }
  };
}

function request(method, headers = {}, body = undefined) {
  return { method, headers, body };
}

test('coupon input normalizes code and rupee amounts to integer paise', () => {
  const coupon = normalizeCouponInput({
    code: '  welcome-10 ', title: '  Welcome   offer ', discount_type: 'percentage', discount_value: '10',
    minimum_subtotal_rupees: '799.50', maximum_discount_rupees: '250',
    starts_at: '2026-11-25T10:00:00+05:30', expires_at: '2026-12-01T23:59:00+05:30',
    usage_limit: '100', active: true
  });
  assert.equal(coupon.code, 'WELCOME-10');
  assert.equal(coupon.title, 'Welcome offer');
  assert.equal(coupon.minimum_subtotal_paise, 79950);
  assert.equal(coupon.maximum_discount_paise, 25000);
  assert.equal(coupon.usage_limit, 100);
  assert.equal(coupon.active, true);
});

test('coupon input rejects unsafe codes, discounts, dates and usage limits', () => {
  const base = {
    code: 'SAVE10', title: 'Save today', discount_type: 'percentage', discount_value: 10,
    minimum_subtotal_rupees: '0', maximum_discount_rupees: '', starts_at: '', expires_at: '', usage_limit: '', active: true
  };
  assert.throws(() => normalizeCouponInput({ ...base, code: '<script>' }), InputError);
  assert.throws(() => normalizeCouponInput({ ...base, discount_value: 101 }), InputError);
  assert.throws(() => normalizeCouponInput({ ...base, minimum_subtotal_rupees: '-10' }), InputError);
  assert.throws(() => normalizeCouponInput({ ...base, usage_limit: '0' }), InputError);
  assert.throws(() => normalizeCouponInput({ ...base, starts_at: '2026-12-02T10:00:00Z', expires_at: '2026-12-01T10:00:00Z' }), InputError);
  assert.equal(normalizeCouponInput({ ...base, discount_type: 'fixed', discount_value: '59.95' }).discount_value, 5995);
});

test('coupon admin API rejects missing authentication and unsupported methods before database access', async () => {
  const unauthenticated = response();
  await couponAdminHandler(request('GET'), unauthenticated);
  assert.equal(unauthenticated.statusCode, 401);
  assert.equal(unauthenticated.headers['cache-control'], 'no-store');

  const wrongMethod = response();
  await couponAdminHandler(request('PUT', { 'x-admin-password': TEST_PASSWORD }), wrongMethod);
  assert.equal(wrongMethod.statusCode, 405);
  assert.equal(wrongMethod.headers.allow, 'GET, POST');
});

test('coupon admin API rejects invalid coupon input before database access', async () => {
  const res = response();
  await couponAdminHandler(request('POST', { 'x-admin-password': TEST_PASSWORD }, {
    code: 'SAVE10', title: 'A valid name', discount_type: 'percentage', discount_value: 120,
    minimum_subtotal_rupees: '0', maximum_discount_rupees: '', starts_at: '', expires_at: '', usage_limit: ''
  }), res);
  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, { error: 'Percentage discounts must be between 1% and 100%.' });
});

test('checkout quote returns only the server-validated coupon discount', async () => {
  const keys = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'APP_ORIGIN', 'RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET'];
  const previous = Object.fromEntries(keys.map(name => [name, process.env[name]]));
  const originalFetch = globalThis.fetch;
  Object.assign(process.env, {
    SUPABASE_URL: 'https://supabase.example', SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key', APP_ORIGIN: 'http://localhost:3000'
  });
  delete process.env.RAZORPAY_KEY_ID;
  delete process.env.RAZORPAY_KEY_SECRET;
  let rpc;
  globalThis.fetch = async (url, options) => {
    rpc = { url, options };
    return { ok: true, status: 200, text: async () => JSON.stringify({ valid: true, code: 'SAVE10', title: 'Welcome', discountPaise: 16990 }) };
  };

  try {
    const res = response();
    await ordersHandler(request('POST', { origin: 'http://localhost:3000' }, {
      action: 'quote', items: [{ id: 'gi-001', size: 'M', quantity: 1 }], couponCode: 'save10'
    }), res);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(JSON.parse(rpc.options.body), { p_code: 'save10', p_item_subtotal_paise: 169900 });
    assert.equal(res.body.discountPaise, 16990);
    assert.equal(res.body.totalPaise, 167910);
    assert.equal(res.body.couponCode, 'SAVE10');
  } finally {
    globalThis.fetch = originalFetch;
    for (const [name, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
  }
});

test('coupon orders are created through the transactional server function', async () => {
  const keys = [
    'SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'ORDER_RATE_LIMIT_SECRET',
    'APP_ORIGIN', 'RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET', 'VERCEL_ENV'
  ];
  const previous = Object.fromEntries(keys.map(name => [name, process.env[name]]));
  const originalFetch = globalThis.fetch;
  Object.assign(process.env, {
    SUPABASE_URL: 'https://supabase.example', SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
    ORDER_RATE_LIMIT_SECRET: 'test-rate-limit-secret', APP_ORIGIN: 'http://localhost:3000',
    RAZORPAY_KEY_ID: 'rzp_test_coupon', RAZORPAY_KEY_SECRET: 'test-payment-secret', VERCEL_ENV: 'preview'
  });
  delete process.env.SUPABASE_PUBLISHABLE_KEY;
  let couponOrderArgs;
  let razorpayRequest;
  let paymentOrderPatch;
  globalThis.fetch = async (url, options = {}) => {
    const address = String(url);
    if (address.endsWith('/rest/v1/rpc/consume_order_rate_limit')) return { ok: true, status: 200, text: async () => 'true' };
    if (address.endsWith('/rest/v1/rpc/create_order_with_coupon')) {
      couponOrderArgs = JSON.parse(options.body);
      return {
        ok: true, status: 200,
        text: async () => JSON.stringify({
          ...couponOrderArgs.p_order, total_paise: 167910, discount_paise: 16990,
          coupon_id: '550e8400-e29b-41d4-a716-446655440000', coupon_code: 'SAVE10'
        })
      };
    }
    if (address === 'https://api.razorpay.com/v1/orders') {
      razorpayRequest = JSON.parse(options.body);
      return { ok: true, status: 200, json: async () => ({ id: 'order_test_coupon', amount: razorpayRequest.amount, currency: razorpayRequest.currency }) };
    }
    if (address.includes('/rest/v1/orders?') && options.method === 'PATCH') {
      paymentOrderPatch = JSON.parse(options.body);
      return { ok: true, status: 200, text: async () => JSON.stringify([{ id: couponOrderArgs.p_order.id }]) };
    }
    throw new Error(`Unexpected request in coupon order test: ${address}`);
  };

  try {
    const res = response();
    await ordersHandler(request('POST', {
      origin: 'http://localhost:3000', 'x-real-ip': '127.0.0.1', 'content-length': '1024'
    }, {
      items: [{ id: 'gi-001', size: 'M', quantity: 1 }],
      customer: {
        name: 'Customer Name', email: 'customer@example.com', phone: '9536429777',
        addressLine1: '12 Fashion Street', addressLine2: '', city: 'Jaipur', state: 'Rajasthan', postalCode: '302001'
      },
      paymentMethod: 'razorpay', couponCode: 'SAVE10', website: ''
    }), res);
    assert.equal(res.statusCode, 201);
    assert.equal(couponOrderArgs.p_coupon_code, 'SAVE10');
    assert.equal(couponOrderArgs.p_order.item_subtotal_paise, 169900);
    assert.equal(couponOrderArgs.p_order.payment_method, 'razorpay');
    assert.equal(couponOrderArgs.p_order.payment_status, 'pending');
    assert.equal(razorpayRequest.amount, 167910);
    assert.deepEqual(paymentOrderPatch, { razorpay_order_id: 'order_test_coupon' });
    assert.equal(res.body.paymentMethod, 'razorpay');
    assert.equal(res.body.amountPaise, 167910);
  } finally {
    globalThis.fetch = originalFetch;
    for (const [name, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
  }
});
