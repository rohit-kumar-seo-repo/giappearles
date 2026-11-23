import { isAdminRequest } from '../admin.js';
import { normalizeCouponInput } from '../../server/coupons.js';
import { InputError } from '../../server/orders.js';
import { supabaseRequest } from '../../server/services.js';

const COUPON_FIELDS = 'id,code,title,discount_type,discount_value,minimum_subtotal_paise,maximum_discount_paise,starts_at,expires_at,usage_limit,active,created_at,updated_at';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function fail(response, status, error) {
  return response.status(status).json({ error });
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
      const [coupons, stats] = await Promise.all([
        supabaseRequest(`coupons?select=${COUPON_FIELDS}&order=created_at.desc&limit=500`),
        supabaseRequest('coupon_stats?select=coupon_id,usage_count,paid_order_count,discount_total_paise,paid_revenue_paise')
      ]);
      const byId = new Map((stats || []).map((item) => [item.coupon_id, item]));
      return response.status(200).json({
        coupons: (coupons || []).map((coupon) => ({
          ...coupon,
          stats: byId.get(coupon.id) || {
            usage_count: 0, paid_order_count: 0, discount_total_paise: 0, paid_revenue_paise: 0
          }
        }))
      });
    }

    if (request.body?.action === 'toggle') {
      const { id, active } = request.body;
      if (typeof id !== 'string' || !UUID.test(id) || typeof active !== 'boolean') {
        return fail(response, 400, 'Invalid coupon update.');
      }
      const updated = await supabaseRequest(`coupons?id=eq.${encodeURIComponent(id)}&select=${COUPON_FIELDS}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
        body: JSON.stringify({ active })
      });
      if (!updated?.length) return fail(response, 404, 'Coupon not found.');
      return response.status(200).json({ coupon: updated[0] });
    }

    let coupon;
    try {
      coupon = normalizeCouponInput(request.body);
    } catch (error) {
      if (error instanceof InputError) return fail(response, 400, error.message);
      throw error;
    }
    const { id, ...values } = coupon;
    const saved = await supabaseRequest(
      id ? `coupons?id=eq.${encodeURIComponent(id)}&select=${COUPON_FIELDS}` : `coupons?select=${COUPON_FIELDS}`,
      {
        method: id ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
        body: JSON.stringify(values)
      }
    );
    if (!saved?.length) return fail(response, id ? 404 : 500, id ? 'Coupon not found.' : 'Coupon was not saved.');
    return response.status(id ? 200 : 201).json({ coupon: saved[0] });
  } catch (error) {
    if (error.details?.code === '23505') return fail(response, 409, 'That coupon code is already in use.');
    console.error('Admin coupon API request failed', { error: error.message });
    return fail(response, 500, 'Could not save or load coupons. Please try again.');
  }
}
