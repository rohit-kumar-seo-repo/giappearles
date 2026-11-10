import assert from 'node:assert/strict';
import test from 'node:test';
import ordersHandler from '../api/orders.js';

test('order authentication verifies the bearer token with Supabase Auth', async () => {
  const previousUrl = process.env.SUPABASE_URL;
  const previousKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  const originalFetch = globalThis.fetch;
  process.env.SUPABASE_URL = 'https://supabase.example/';
  process.env.SUPABASE_PUBLISHABLE_KEY = 'test-publishable-key';
  let request;

  try {
    const { getAuthenticatedUser } = await import('../server/services.js?customer-auth-test');
    globalThis.fetch = async (url, options) => {
      request = { url, options };
      return {
        ok: true,
        status: 200,
        json: async () => ({ id: 'customer-123', email: 'customer@example.com' })
      };
    };

    assert.deepEqual(await getAuthenticatedUser({ headers: {} }), null);
    assert.deepEqual(
      await getAuthenticatedUser({ headers: { authorization: 'Bearer verified-token' } }),
      { id: 'customer-123', email: 'customer@example.com' }
    );
    assert.equal(request.url, 'https://supabase.example/auth/v1/user');
    assert.equal(request.options.headers.apikey, 'test-publishable-key');
    assert.equal(request.options.headers.Authorization, 'Bearer verified-token');

    globalThis.fetch = async () => ({
      ok: false,
      status: 401,
      json: async () => ({ message: 'Invalid token' })
    });
    await assert.rejects(
      () => getAuthenticatedUser({ headers: { authorization: 'Bearer expired-token' } }),
      (error) => error.statusCode === 401
    );
    await assert.rejects(
      () => getAuthenticatedUser({ headers: { authorization: 'Basic invalid' } }),
      (error) => error.statusCode === 401
    );
  } finally {
    globalThis.fetch = originalFetch;
    if (previousUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = previousUrl;
    if (previousKey === undefined) delete process.env.SUPABASE_PUBLISHABLE_KEY;
    else process.env.SUPABASE_PUBLISHABLE_KEY = previousKey;
  }
});

test('authenticated checkout links the saved order to the verified customer', async () => {
  const names = [
    'SUPABASE_URL',
    'SUPABASE_PUBLISHABLE_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
    'ORDER_RATE_LIMIT_SECRET',
    'RESEND_API_KEY',
    'ORDER_NOTIFICATION_FROM',
    'ORDER_NOTIFICATION_TO',
    'APP_ORIGIN'
  ];
  const previousEnv = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  const originalFetch = globalThis.fetch;
  Object.assign(process.env, {
    SUPABASE_URL: 'https://supabase.example',
    SUPABASE_PUBLISHABLE_KEY: 'test-publishable-key',
    SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
    ORDER_RATE_LIMIT_SECRET: 'test-rate-limit-secret',
    RESEND_API_KEY: 'test-resend-key',
    ORDER_NOTIFICATION_FROM: 'GI Apparel <orders@example.com>',
    ORDER_NOTIFICATION_TO: 'owner@example.com',
    APP_ORIGIN: 'http://localhost:3000'
  });
  let insertedOrder;

  try {
    globalThis.fetch = async (url, options = {}) => {
      const address = String(url);
      if (address.endsWith('/auth/v1/user')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ id: 'verified-customer-id', email: 'verified@example.com' })
        };
      }
      if (address.endsWith('/rest/v1/rpc/consume_order_rate_limit')) {
        return { ok: true, status: 200, text: async () => 'true' };
      }
      if (address.endsWith('/rest/v1/orders') && options.method === 'POST') {
        insertedOrder = JSON.parse(options.body);
        return { ok: true, status: 201, text: async () => JSON.stringify([insertedOrder]) };
      }
      if (address.startsWith('https://api.resend.com/emails')) {
        return { ok: true, status: 200, json: async () => ({ id: 'email-id' }) };
      }
      if (address.includes('/rest/v1/orders?') && options.method === 'PATCH') {
        return { ok: true, status: 200, text: async () => '[]' };
      }
      throw new Error(`Unexpected request in test: ${address}`);
    };

    const response = {
      statusCode: 200,
      headers: {},
      status(code) {
        this.statusCode = code;
        return this;
      },
      setHeader(name, value) {
        this.headers[name] = value;
      },
      json(value) {
        this.body = value;
        return this;
      }
    };
    await ordersHandler({
      method: 'POST',
      headers: {
        origin: 'http://localhost:3000',
        'content-length': '512',
        'x-real-ip': '127.0.0.1',
        authorization: 'Bearer valid-customer-token'
      },
      body: {
        items: [{ id: 'gi-001', size: 'M', quantity: 1 }],
        customer: {
          name: 'Customer Name',
          email: 'spoofed@example.com',
          phone: '9536429777',
          addressLine1: '12 Fashion Street',
          addressLine2: '',
          city: 'Jaipur',
          state: 'Rajasthan',
          postalCode: '302001'
        },
        paymentMethod: 'offline',
        website: ''
      }
    }, response);

    assert.equal(response.statusCode, 201);
    assert.equal(insertedOrder.user_id, 'verified-customer-id');
    assert.equal(insertedOrder.customer.email, 'verified@example.com');
  } finally {
    globalThis.fetch = originalFetch;
    for (const [name, value] of Object.entries(previousEnv)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});
