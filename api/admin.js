// Owner dashboard API: list orders and update their status.
// Protected by the ADMIN_PASSWORD environment variable (sent in the
// X-Admin-Password header). A custom header also blocks cross-site requests.
import { createHash, timingSafeEqual } from 'node:crypto';
import { supabaseRequest } from '../server/services.js';

export const ORDER_STATUSES = [
  'request_received', 'pending_payment', 'confirmed', 'payment_initialization_failed',
  'processing', 'shipped', 'delivered', 'cancelled'
];
export const PAYMENT_STATUSES = ['unpaid', 'pending', 'paid', 'failed', 'refunded'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ORDER_FIELDS = 'id,order_number,created_at,customer,items,item_subtotal_paise,shipping_paise,total_paise,payment_method,payment_status,order_status,owner_notification_status';

export function isAdminRequest(request) {
  const expected = process.env.ADMIN_PASSWORD?.trim();
  const given = request.headers['x-admin-password'];
  if (!expected || expected.length < 12 || typeof given !== 'string') return false;
  const digest = (value) => createHash('sha256').update(value).digest();
  return timingSafeEqual(digest(given), digest(expected));
}

function fail(response, status, error) {
  response.status(status).json({ error });
}

export default async function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store');
  if (request.method !== 'GET' && request.method !== 'POST') {
    response.setHeader('Allow', 'GET, POST');
    return fail(response, 405, 'Method not allowed.');
  }
  if (!isAdminRequest(request)) return fail(response, 401, 'Wrong admin password.');

  try {
    if (request.method === 'GET') {
      const orders = await supabaseRequest(
        `orders?select=${ORDER_FIELDS}&order=created_at.desc&limit=500`,
        { method: 'GET' }
      );
      return response.status(200).json({ orders });
    }

    const { id, order_status: orderStatus, payment_status: paymentStatus } = request.body || {};
    if (typeof id !== 'string' || !UUID.test(id)) return fail(response, 400, 'Invalid order.');
    const patch = {};
    if (orderStatus !== undefined) {
      if (!ORDER_STATUSES.includes(orderStatus)) return fail(response, 400, 'Invalid order status.');
      patch.order_status = orderStatus;
    }
    if (paymentStatus !== undefined) {
      if (!PAYMENT_STATUSES.includes(paymentStatus)) return fail(response, 400, 'Invalid payment status.');
      patch.payment_status = paymentStatus;
      if (paymentStatus === 'paid') patch.paid_at = new Date().toISOString();
    }
    if (!Object.keys(patch).length) return fail(response, 400, 'Nothing to update.');

    const updated = await supabaseRequest(`orders?id=eq.${encodeURIComponent(id)}&select=${ORDER_FIELDS}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
      body: JSON.stringify(patch)
    });
    if (!updated?.length) return fail(response, 404, 'Order not found.');
    return response.status(200).json({ order: updated[0] });
  } catch (error) {
    console.error('Admin API request failed', { error: error.message });
    return fail(response, 500, 'Could not reach the order database. Please try again.');
  }
}
