import { randomUUID } from 'node:crypto';
import { buildOrder, InputError, validateCustomer } from '../server/orders.js';
import { FLAT_SHIPPING_PAISE } from '../server/catalog.js';
import {
  createRazorpayOrder,
  consumeOrderRateLimit,
  getAuthenticatedUser,
  isAllowedOrigin,
  notifyOwner,
  orderNotificationEnvironment,
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
      return response.status(200).json({
        itemSubtotalPaise: quote.itemSubtotalPaise,
        shippingPaise: quote.shippingPaise,
        totalPaise: quote.totalPaise,
        currency: 'INR'
      });
    }

    const authenticatedUser = await getAuthenticatedUser(request);
    const customer = validateCustomer({
      ...body.customer,
      ...(authenticatedUser ? { email: authenticatedUser.email } : {})
    });
    if (body.website) return fail(response, 400, 'Invalid checkout request.');
    if (!['offline', 'razorpay'].includes(body.paymentMethod)) {
      throw new InputError('Choose an available payment method.');
    }
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
      payment_method: body.paymentMethod,
      payment_status: body.paymentMethod === 'razorpay' ? 'pending' : 'unpaid',
      order_status: body.paymentMethod === 'razorpay' ? 'pending_payment' : 'request_received',
      owner_notification_status: 'pending'
    };

    const inserted = await supabaseRequest('orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
      body: JSON.stringify(orderRow)
    });
    const savedOrder = inserted?.[0];
    if (!savedOrder?.id) throw new Error('The order record was not returned after insertion.');

    if (body.paymentMethod === 'razorpay') {
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
    }

    try {
      orderNotificationEnvironment();
      await notifyOwner(savedOrder, customer);
      await supabaseRequest(`orders?id=eq.${encodeURIComponent(savedOrder.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          owner_notification_status: 'sent',
          owner_notified_at: new Date().toISOString()
        })
      });
      return response.status(201).json({
        orderId: savedOrder.id,
        orderNumber: savedOrder.order_number,
        paymentMethod: 'offline',
        ownerNotification: 'sent'
      });
    } catch (error) {
      console.error('Offline order saved but owner notification failed', {
        orderId: savedOrder.id,
        error: error.message
      });
      await supabaseRequest(`orders?id=eq.${encodeURIComponent(savedOrder.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          owner_notification_status: 'failed',
          owner_notification_error: error.message.slice(0, 240)
        })
      }).catch((updateError) => {
        console.error('Could not record owner notification failure', {
          orderId: savedOrder.id,
          error: updateError.message
        });
      });
      return response.status(201).json({
        orderId: savedOrder.id,
        orderNumber: savedOrder.order_number,
        paymentMethod: 'offline',
        ownerNotification: 'failed'
      });
    }
  } catch (error) {
    if (error instanceof InputError) return fail(response, 400, error.message);
    if (error.statusCode === 401) return fail(response, 401, error.message);
    console.error('Order API request failed', { error: error.message });
    return fail(response, 500, 'We could not process your order. No payment was taken. Please try again or contact us.');
  }
}
