import { InputError, verifyRazorpaySignature } from '../../server/orders.js';
import {
  getCapturedRazorpayPayment,
  getAuthenticatedUser,
  isAllowedOrigin,
  notifyOwner,
  orderNotificationEnvironment,
  supabaseRequest
} from '../../server/services.js';

function fail(response, status, error) {
  response.status(status).json({ error });
}

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return fail(response, 405, 'Method not allowed.');
  }
  if (!isAllowedOrigin(request)) return fail(response, 403, 'This request origin is not allowed.');
  const { orderId, razorpay_order_id, razorpay_payment_id, razorpay_signature } = request.body || {};

  try {
    if (
      typeof orderId !== 'string'
      || typeof razorpay_order_id !== 'string'
      || typeof razorpay_payment_id !== 'string'
      || typeof razorpay_signature !== 'string'
    ) throw new InputError('Payment verification details are incomplete.');

    const authenticatedUser = await getAuthenticatedUser(request);
    const result = await supabaseRequest(
      `orders?id=eq.${encodeURIComponent(orderId)}&select=id,user_id,order_number,customer,items,total_paise,currency,payment_method,payment_status,order_status,razorpay_order_id,owner_notification_status`,
      { method: 'GET' }
    );
    const order = result?.[0];
    if (!order || order.payment_method !== 'razorpay') {
      return fail(response, 404, 'Order not found.');
    }
    if (order.user_id && order.user_id !== authenticatedUser?.id) {
      return fail(response, 404, 'Order not found.');
    }
    if (order.razorpay_order_id !== razorpay_order_id) {
      return fail(response, 400, 'Payment does not match this order.');
    }
    if (order.payment_status === 'paid') {
      return response.status(200).json({
        orderNumber: order.order_number,
        paymentStatus: 'paid',
        ownerNotification: order.owner_notification_status
      });
    }

    const secret = process.env.RAZORPAY_KEY_SECRET;
    if (!verifyRazorpaySignature(razorpay_order_id, razorpay_payment_id, razorpay_signature, secret)) {
      return fail(response, 400, 'Payment verification failed.');
    }

    const payment = await getCapturedRazorpayPayment(razorpay_payment_id);
    if (
      payment.status !== 'captured'
      || payment.order_id !== razorpay_order_id
      || payment.amount !== order.total_paise
      || payment.currency !== order.currency
    ) {
      return fail(response, 409, 'Payment has not been captured yet. Do not retry payment; contact us if your bank shows a debit.');
    }

    const updated = await supabaseRequest(
      `orders?id=eq.${encodeURIComponent(order.id)}&payment_status=eq.pending`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
        body: JSON.stringify({
          payment_status: 'paid',
          order_status: 'confirmed',
          razorpay_payment_id,
          paid_at: new Date().toISOString()
        })
      }
    );

    if (updated?.length) {
      try {
        orderNotificationEnvironment();
        await notifyOwner({ ...order, payment_method: 'razorpay' }, order.customer);
        await supabaseRequest(`orders?id=eq.${encodeURIComponent(order.id)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            owner_notification_status: 'sent',
            owner_notified_at: new Date().toISOString()
          })
        });
      } catch (notificationError) {
        console.error('Paid order saved but owner notification failed', {
          orderId: order.id,
          error: notificationError.message
        });
        await supabaseRequest(`orders?id=eq.${encodeURIComponent(order.id)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            owner_notification_status: 'failed',
            owner_notification_error: notificationError.message.slice(0, 240)
          })
        }).catch((updateError) => {
          console.error('Could not record paid-order notification failure', {
            orderId: order.id,
            error: updateError.message
          });
        });
        return response.status(200).json({
          orderNumber: order.order_number,
          paymentStatus: 'paid',
          ownerNotification: 'failed'
        });
      }
    }

    return response.status(200).json({
      orderNumber: order.order_number,
      paymentStatus: 'paid',
      ownerNotification: updated?.length ? 'sent' : 'pending'
    });
  } catch (error) {
    if (error instanceof InputError) return fail(response, 400, error.message);
    if (error.statusCode === 401) return fail(response, 401, error.message);
    console.error('Payment verification failed', { error: error.message });
    return fail(response, 500, 'We could not verify the payment yet. Do not pay again; contact us if your bank shows a debit.');
  }
}
