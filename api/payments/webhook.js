import { verifyWebhookSignature } from '../../server/orders.js';
import {
  notifyOwner,
  orderNotificationEnvironment,
  readRawBody,
  razorpayWebhookSecret,
  supabaseRequest
} from '../../server/services.js';

export const config = { api: { bodyParser: false } };

function fail(response, status, error) {
  response.status(status).json({ error });
}

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return fail(response, 405, 'Method not allowed.');
  }

  try {
    const rawBody = await readRawBody(request);
    const signature = request.headers['x-razorpay-signature'];
    if (!verifyWebhookSignature(rawBody, signature, razorpayWebhookSecret())) {
      return fail(response, 400, 'Invalid webhook signature.');
    }

    const event = JSON.parse(rawBody.toString('utf8'));
    if (event.event !== 'payment.captured') {
      return response.status(200).json({ received: true, ignored: true });
    }

    const payment = event.payload?.payment?.entity;
    if (!payment?.id || !payment.order_id || payment.status !== 'captured') {
      return fail(response, 400, 'Captured payment data is incomplete.');
    }
    const matches = await supabaseRequest(
      `orders?razorpay_order_id=eq.${encodeURIComponent(payment.order_id)}&select=id,order_number,customer,total_paise,currency,payment_method,payment_status,order_status,owner_notification_status`,
      { method: 'GET' }
    );
    const order = matches?.[0];
    if (!order) return fail(response, 404, 'Matching order not found.');
    if (
      payment.amount !== order.total_paise
      || payment.currency !== order.currency
      || order.payment_method !== 'razorpay'
    ) return fail(response, 400, 'Captured payment does not match the order.');

    const updated = await supabaseRequest(
      `orders?id=eq.${encodeURIComponent(order.id)}&payment_status=eq.pending`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
        body: JSON.stringify({
          payment_status: 'paid',
          order_status: 'confirmed',
          razorpay_payment_id: payment.id,
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
        });
        return fail(response, 500, 'Order was confirmed, but owner notification needs retry.');
      }
    }
    return response.status(200).json({ received: true });
  } catch (error) {
    console.error('Razorpay webhook processing failed', { error: error.message });
    return fail(response, 500, 'Webhook processing failed.');
  }
}
