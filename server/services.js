// Server-only integrations; never import this module into browser code.
import { createHmac } from 'node:crypto';
import { isIP } from 'node:net';

let warnedAboutRateLimitSecretFallback = false;

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required server environment variable: ${name}`);
  return value;
}

export async function getAuthenticatedUser(request) {
  const authorization = request.headers.authorization;
  if (!authorization) return null;

  const match = /^Bearer\s+([^\s]+)$/i.exec(authorization);
  if (!match) {
    const error = new Error('Your session is invalid. Please sign in again.');
    error.statusCode = 401;
    throw error;
  }

  const supabaseUrl = requiredEnv('SUPABASE_URL').replace(/\/+$/, '');
  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      apikey: requiredEnv('SUPABASE_PUBLISHABLE_KEY'),
      Authorization: `Bearer ${match[1]}`
    }
  });
  const user = await response.json().catch(() => null);
  if (!response.ok || typeof user?.id !== 'string' || typeof user.email !== 'string') {
    const error = new Error('Your session has expired. Please sign in again.');
    error.statusCode = 401;
    throw error;
  }
  return { id: user.id, email: user.email };
}

function orderRateLimitSecret() {
  const configuredSecret = process.env.ORDER_RATE_LIMIT_SECRET?.trim();
  if (configuredSecret) return configuredSecret;

  if (!warnedAboutRateLimitSecretFallback) {
    console.warn(
      'ORDER_RATE_LIMIT_SECRET is not set; deriving a dedicated rate-limit key from SUPABASE_SERVICE_ROLE_KEY. Configure ORDER_RATE_LIMIT_SECRET to keep rate-limit windows stable when rotating the Supabase key.'
    );
    warnedAboutRateLimitSecretFallback = true;
  }

  return createHmac('sha256', requiredEnv('SUPABASE_SERVICE_ROLE_KEY'))
    .update('gi-apparel:order-rate-limit:v1')
    .digest();
}

function supabaseHeaders(extra = {}) {
  const serviceKey = requiredEnv('SUPABASE_SERVICE_ROLE_KEY');
  return {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    ...extra
  };
}

export async function supabaseRequest(path, options = {}) {
  const supabaseUrl = requiredEnv('SUPABASE_URL').replace(/\/+$/, '');
  const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    ...options,
    headers: supabaseHeaders(options.headers)
  });
  const text = await response.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error('Supabase returned an unreadable response.');
    }
  }
  if (!response.ok) {
    const error = new Error(`Supabase request failed (${response.status}).`);
    error.statusCode = response.status;
    error.details = data;
    throw error;
  }
  return data;
}

export async function consumeOrderRateLimit(request) {
  const realIp = request.headers['x-real-ip'];
  const forwardedFor = request.headers['x-forwarded-for'];
  const remoteAddress = typeof realIp === 'string' && isIP(realIp.trim())
    ? realIp.trim()
    : typeof forwardedFor === 'string' ? forwardedFor.split(',')[0].trim() : '';
  if (!isIP(remoteAddress)) {
    throw new Error('Could not determine the checkout request address.');
  }
  const token = createHmac('sha256', orderRateLimitSecret())
    .update(remoteAddress)
    .digest('hex');
  const result = await supabaseRequest('rpc/consume_order_rate_limit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_ip_hash: token })
  });
  if (typeof result !== 'boolean') throw new Error('Supabase returned an invalid rate-limit response.');
  return result;
}

export function razorpayCredentials() {
  return {
    keyId: requiredEnv('RAZORPAY_KEY_ID'),
    keySecret: requiredEnv('RAZORPAY_KEY_SECRET')
  };
}

export async function createRazorpayOrder(order) {
  const { keyId, keySecret } = razorpayCredentials();
  const authorization = Buffer.from(`${keyId}:${keySecret}`).toString('base64');
  const response = await fetch('https://api.razorpay.com/v1/orders', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${authorization}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      amount: order.totalPaise,
      currency: 'INR',
      receipt: order.orderNumber,
      notes: { gi_apparel_order_id: order.id }
    })
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.id || data.amount !== order.totalPaise || data.currency !== 'INR') {
    const error = new Error(`Razorpay order creation failed (${response.status}).`);
    error.statusCode = response.status;
    throw error;
  }
  return { id: data.id, keyId };
}

export async function getCapturedRazorpayPayment(paymentId) {
  const { keyId, keySecret } = razorpayCredentials();
  const authorization = Buffer.from(`${keyId}:${keySecret}`).toString('base64');
  const response = await fetch(`https://api.razorpay.com/v1/payments/${encodeURIComponent(paymentId)}`, {
    headers: { Authorization: `Basic ${authorization}` }
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.id) {
    const error = new Error(`Razorpay payment lookup failed (${response.status}).`);
    error.statusCode = response.status;
    throw error;
  }
  return data;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[character]);
}

export async function notifyOwner(order, customer) {
  const apiKey = requiredEnv('RESEND_API_KEY');
  const from = requiredEnv('ORDER_NOTIFICATION_FROM');
  const to = requiredEnv('ORDER_NOTIFICATION_TO');
  const lines = order.items.map((item) => (
    `<li>${escapeHtml(item.name)} — size ${escapeHtml(item.size)} × ${item.quantity}: ${escapeHtml(
      new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(item.line_total_paise / 100)
    )}</li>`
  )).join('');
  const address = [
    customer.addressLine1,
    customer.addressLine2,
    customer.city,
    customer.state,
    customer.postalCode
  ].filter(Boolean).map(escapeHtml).join(', ');
  const paymentMethod = order.payment_method === 'razorpay'
    ? 'Razorpay (paid; verified by the server)'
    : 'Offline payment (awaiting owner confirmation)';
  const html = `<h2>New GI Apparel order ${escapeHtml(order.order_number)}</h2>
    <p><strong>Payment:</strong> ${escapeHtml(paymentMethod)}</p>
    <p><strong>Customer:</strong> ${escapeHtml(customer.name)}</p>
    <p><strong>Email:</strong> ${escapeHtml(customer.email)}</p>
    <p><strong>Phone:</strong> ${escapeHtml(customer.phone)}</p>
    <p><strong>Delivery address:</strong> ${address}</p>
    <ul>${lines}</ul>
    <p>Items: ${escapeHtml(new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(order.item_subtotal_paise / 100))}<br>
    Shipping: ${escapeHtml(new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(order.shipping_paise / 100))}<br>
    <strong>Total: ${escapeHtml(new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(order.total_paise / 100))}</strong></p>`;
  const text = [
    `New GI Apparel order ${order.order_number}`,
    `Payment: ${paymentMethod}`,
    `Customer: ${customer.name}`,
    `Email: ${customer.email}`,
    `Phone: ${customer.phone}`,
    `Delivery address: ${address}`,
    `Items: ${order.item_subtotal_paise / 100} INR`,
    `Shipping: ${order.shipping_paise / 100} INR`,
    `Total: ${order.total_paise / 100} INR`
  ].join('\n');
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from,
      to: [to],
      reply_to: customer.email,
      subject: `GI Apparel ${order.payment_method === 'razorpay' ? 'paid' : 'offline'} order ${order.order_number}`,
      html,
      text
    })
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(`Resend notification failed (${response.status}).`);
    error.statusCode = response.status;
    throw error;
  }
  return data;
}

export function isAllowedOrigin(request) {
  const origin = request.headers.origin;
  if (!origin) return false;

  let parsedOrigin;
  try {
    parsedOrigin = new URL(origin).origin;
  } catch {
    return false;
  }

  const allowed = new Set(['https://giapparel.in', 'https://www.giapparel.in']);
  const configured = process.env.APP_ORIGIN?.trim();
  if (configured) {
    try {
      allowed.add(new URL(configured).origin);
    } catch {
      return false;
    }
  }
  if (process.env.VERCEL_URL) allowed.add(`https://${process.env.VERCEL_URL}`);
  if (process.env.NODE_ENV !== 'production') {
    allowed.add('http://localhost:4173');
    allowed.add('http://127.0.0.1:4173');
    allowed.add('http://localhost:3000');
    allowed.add('http://127.0.0.1:3000');
  }
  return allowed.has(parsedOrigin);
}

export function readRawBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let length = 0;
    request.on('data', (chunk) => {
      length += chunk.length;
      if (length > 1024 * 64) {
        reject(new Error('Webhook payload is too large.'));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => resolve(Buffer.concat(chunks)));
    request.on('error', reject);
  });
}

export function orderNotificationEnvironment() {
  return {
    to: requiredEnv('ORDER_NOTIFICATION_TO'),
    from: requiredEnv('ORDER_NOTIFICATION_FROM'),
    resendKey: requiredEnv('RESEND_API_KEY')
  };
}

export function razorpayWebhookSecret() {
  return requiredEnv('RAZORPAY_WEBHOOK_SECRET');
}
