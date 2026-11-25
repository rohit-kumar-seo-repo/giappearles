import { randomUUID } from 'node:crypto';
import { buildOrder, InputError, validateCustomer } from '../server/orders.js';
import { FLAT_SHIPPING_PAISE } from '../server/catalog.js';
import {
  createRazorpayOrder,
  consumeOrderRateLimit,
  getAuthenticatedUser,
  isAllowedOrigin,
  onlinePaymentsEnabled,
  supabaseRequest
} from '../server/services.js';

function fail(response, status, error) {
  response.status(status).json({ error });
}

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return fail(response, 405, 'Method not allowed.');
  }
  if (!isAllowedOrigin(request)) return fail(response, 403, 'This request origin is not allowed.');
  if (Number(request.headers['content-length'] || 0) > 16384) {
    return fail(response, 413, 'The request is too large.');
  }

  const body = request.body;
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return fail(response, 400, 'Invalid checkout request.');
  }

  try {
    const quote = buildOrder(body.items);
    if (body.action === 'quote') {
      let coupon = null;
      if (body.couponCode !== undefined && body.couponCode !== '') {
        if (typeof body.couponCode !== 'string' || !/^[A-Za-z0-9_-]{3,32}$/.test(body.couponCode.trim())) {
          throw new InputError('Enter a valid coupon code.');
        }
        coupon = await supabaseRequest('rpc/coupon_quote', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ p_code: body.couponCode.trim(), p_item_subtotal_paise: quote.itemSubtotalPaise })
        });
        if (!coupon?.valid) return fail(response, 400, coupon?.message || 'This coupon is not available.');
      }
      const discountPaise = Number(coupon?.discountPaise || 0);
      return response.status(200).json({
        itemSubtotalPaise: quote.itemSubtotalPaise,
        shippingPaise: quote.shippingPaise,
        discountPaise,
        totalPaise: quote.totalPaise - discountPaise,
        couponCode: coupon?.code || null,
        couponTitle: coupon?.title || null,
        currency: 'INR',
        onlinePayments: onlinePaymentsEnabled()
      });
    }

    const couponCode = body.couponCode === undefined || body.couponCode === '' ? '' : body.couponCode;
    if (typeof couponCode !== 'string' || (couponCode && !/^[A-Za-z0-9_-]{3,32}$/.test(couponCode.trim()))) {
      throw new InputError('Enter a valid coupon code.');
    }
    if (body.paymentMethod !== 'razorpay') {
      throw new InputError('Only secure online payment is accepted.');
    }
    if (!onlinePaymentsEnabled()) {
      throw new InputError('Secure online payment is temporarily unavailable. Please try again later.');
    }

    const authenticatedUser = await getAuthenticatedUser(request);
    const customer = validateCustomer({
      ...body.customer,
      ...(authenticatedUser ? { email: authenticatedUser.email } : {})
    });
    if (body.website) return fail(response, 400, 'Invalid checkout request.');
    if (!await consumeOrderRateLimit(request)) {
      return fail(response, 429, 'Too many order attempts. Please wait a few minutes and try again.');
    }

    const orderId = randomUUID();
    const orderNumber = `GI-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${orderId.slice(0, 16).toUpperCase()}`;
    const orderRow = {
      id: orderId,
      user_id: authenticatedUser?.id || null,
      order_number: orderNumber,
      customer,
      items: quote.lines,
      item_subtotal_paise: quote.itemSubtotalPaise,
      shipping_paise: quote.shippingPaise,
      total_paise: quote.totalPaise,
      currency: 'INR',
      payment_method: 'razorpay',
      payment_status: 'pending',
      order_status: 'pending_payment',
      owner_notification_status: 'pending'
    };

    const inserted = couponCode
      ? await supabaseRequest('rpc/create_order_with_coupon', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ p_order: orderRow, p_coupon_code: couponCode.trim() })
      })
      : await supabaseRequest('orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
        body: JSON.stringify(orderRow)
      });
    const savedOrder = Array.isArray(inserted) ? inserted[0] : inserted;
    if (!savedOrder?.id) throw new Error('The order record was not returned after insertion.');

    try {
      const razorpay = await createRazorpayOrder({
        id: savedOrder.id,
        orderNumber: savedOrder.order_number,
        totalPaise: savedOrder.total_paise
      });
      const updated = await supabaseRequest(`orders?id=eq.${encodeURIComponent(savedOrder.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
        body: JSON.stringify({ razorpay_order_id: razorpay.id })
      });
      if (!updated?.length) throw new Error('Could not associate the payment with the saved order.');
      return response.status(201).json({
        orderId: savedOrder.id,
        orderNumber: savedOrder.order_number,
        paymentMethod: 'razorpay',
        razorpayOrderId: razorpay.id,
        razorpayKeyId: razorpay.keyId,
        amountPaise: savedOrder.total_paise,
        currency: 'INR'
      });
    } catch (error) {
      console.error('Razorpay order initialization failed', {
        orderId: savedOrder.id,
        error: error.message
      });
      await supabaseRequest(`orders?id=eq.${encodeURIComponent(savedOrder.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payment_status: 'failed', order_status: 'payment_initialization_failed' })
      }).catch((updateError) => {
        console.error('Could not record Razorpay initialization failure', {
          orderId: savedOrder.id,
          error: updateError.message
        });
      });
      return fail(response, 502, 'Online payment could not be started. Your order was not placed; please try again or contact us.');
    }
  } catch (error) {
    if (error instanceof InputError) return fail(response, 400, error.message);
    if (error.statusCode === 401) return fail(response, 401, error.message);
    if (body.couponCode && error.details?.code === 'P0001') {
      return fail(response, 400, 'That coupon is no longer available. Please review it and try again.');
    }
    console.error('Order API request failed', { error: error.message });
    return fail(response, 500, 'We could not process your order. No payment was taken. Please try again or contact us.');
  }
}
