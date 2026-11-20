import assert from 'node:assert/strict';
import { after, beforeEach, test } from 'node:test';
import adminHandler, { isAdminRequest } from '../api/admin.js';

const TEST_PASSWORD = 'admin-test-password-123';
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
    statusCode: 200,
    headers: {},
    body: null,
    status(code) { this.statusCode = code; return this; },
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
    json(body) { this.body = body; return this; }
  };
}

function request(method, headers = {}, body = undefined) {
  return { method, headers, body };
}

test('isAdminRequest accepts the configured password and rejects other values', () => {
  assert.equal(isAdminRequest(request('GET', { 'x-admin-password': TEST_PASSWORD })), true);
  assert.equal(isAdminRequest(request('GET', { 'x-admin-password': 'different-password-123' })), false);
  assert.equal(isAdminRequest(request('GET')), false);
  assert.equal(isAdminRequest(request('GET', { 'x-admin-password': [TEST_PASSWORD] })), false);
});

test('admin handler returns 401 without a password', async () => {
  const res = response();
  await adminHandler(request('GET'), res);
  assert.equal(res.statusCode, 401);
  assert.equal(res.headers['cache-control'], 'no-store');
  assert.deepEqual(res.body, { error: 'Wrong admin password.' });
});

test('admin handler returns 405 for PUT', async () => {
  const res = response();
  await adminHandler(request('PUT', { 'x-admin-password': TEST_PASSWORD }), res);
  assert.equal(res.statusCode, 405);
  assert.equal(res.headers.allow, 'GET, POST');
  assert.deepEqual(res.body, { error: 'Method not allowed.' });
});

test('admin handler rejects invalid order IDs and status values without database access', async () => {
  const invalidId = response();
  await adminHandler(request('POST', { 'x-admin-password': TEST_PASSWORD }, {
    id: 'not-a-uuid', order_status: 'confirmed'
  }), invalidId);
  assert.equal(invalidId.statusCode, 400);
  assert.deepEqual(invalidId.body, { error: 'Invalid order.' });

  const invalidOrderStatus = response();
  await adminHandler(request('POST', { 'x-admin-password': TEST_PASSWORD }, {
    id: '550e8400-e29b-41d4-a716-446655440000', order_status: 'unknown'
  }), invalidOrderStatus);
  assert.equal(invalidOrderStatus.statusCode, 400);
  assert.deepEqual(invalidOrderStatus.body, { error: 'Invalid order status.' });

  const invalidPaymentStatus = response();
  await adminHandler(request('POST', { 'x-admin-password': TEST_PASSWORD }, {
    id: '550e8400-e29b-41d4-a716-446655440000', payment_status: 'unknown'
  }), invalidPaymentStatus);
  assert.equal(invalidPaymentStatus.statusCode, 400);
  assert.deepEqual(invalidPaymentStatus.body, { error: 'Invalid payment status.' });
});
