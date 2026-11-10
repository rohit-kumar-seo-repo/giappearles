import { createHmac, timingSafeEqual } from 'node:crypto';
import { FLAT_SHIPPING_PAISE, MAX_CART_QUANTITY, ORDER_CATALOG } from './catalog.js';

export class InputError extends Error {
  constructor(message) {
    super(message);
    this.name = 'InputError';
  }
}

export function buildOrder(items) {
  if (!Array.isArray(items) || items.length < 1 || items.length > 10) {
    throw new InputError('Your bag must contain between 1 and 10 different product-size items.');
  }

  const seen = new Set();
  const lines = items.map((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new InputError('One of the items in your bag is invalid.');
    }

    const product = ORDER_CATALOG[item.id];
    const quantity = item.quantity;
    const size = item.size;
    if (!product || !product.sizes.includes(size)) {
      throw new InputError('A product or size in your bag is no longer available.');
    }
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_CART_QUANTITY) {
      throw new InputError('Each item quantity must be between 1 and 10.');
    }

    const lineKey = `${item.id}:${size}`;
    if (seen.has(lineKey)) {
      throw new InputError('Duplicate product-size lines are not allowed.');
    }
    seen.add(lineKey);

    return {
      product_id: item.id,
      name: product.name,
      size,
      quantity,
      unit_price_paise: product.price * 100,
      line_total_paise: product.price * quantity * 100
    };
  });

  const itemSubtotalPaise = lines.reduce((sum, line) => sum + line.line_total_paise, 0);
  return {
    lines,
    itemSubtotalPaise,
    shippingPaise: FLAT_SHIPPING_PAISE,
    totalPaise: itemSubtotalPaise + FLAT_SHIPPING_PAISE
  };
}

export function validateCustomer(customer) {
  if (!customer || typeof customer !== 'object' || Array.isArray(customer)) {
    throw new InputError('Enter your contact and delivery details.');
  }

  const clean = (value, maxLength) => (
    typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, maxLength) : ''
  );
  const name = clean(customer.name, 100);
  const email = clean(customer.email, 254).toLowerCase();
  const phone = clean(customer.phone, 20);
  const addressLine1 = clean(customer.addressLine1, 160);
  const addressLine2 = clean(customer.addressLine2, 160);
  const city = clean(customer.city, 80);
  const state = clean(customer.state, 80);
  const postalCode = clean(customer.postalCode, 6);

  if (name.length < 2) throw new InputError('Enter your full name.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new InputError('Enter a valid email address.');
  if (!/^(?:\+?91[\s-]?)?[6-9]\d{9}$/.test(phone.replace(/[()\s-]/g, ''))) {
    throw new InputError('Enter a valid 10-digit Indian mobile number.');
  }
  if (addressLine1.length < 5) throw new InputError('Enter your delivery address.');
  if (!city || !state) throw new InputError('Enter your city and state.');
  if (!/^[1-9]\d{5}$/.test(postalCode)) throw new InputError('Enter a valid 6-digit Indian PIN code.');

  return { name, email, phone, addressLine1, addressLine2, city, state, postalCode };
}

export function verifyRazorpaySignature(orderId, paymentId, signature, secret) {
  if (
    typeof orderId !== 'string'
    || typeof paymentId !== 'string'
    || typeof signature !== 'string'
    || typeof secret !== 'string'
    || !orderId
    || !paymentId
    || !signature
    || !secret
  ) return false;

  const expected = createHmac('sha256', secret).update(`${orderId}|${paymentId}`).digest();
  let received;
  try {
    received = Buffer.from(signature, 'hex');
  } catch {
    return false;
  }
  return received.length === expected.length && timingSafeEqual(received, expected);
}

export function verifyWebhookSignature(rawBody, signature, secret) {
  if (!Buffer.isBuffer(rawBody) || typeof signature !== 'string' || typeof secret !== 'string') {
    return false;
  }
  const expected = createHmac('sha256', secret).update(rawBody).digest();
  let received;
  try {
    received = Buffer.from(signature, 'hex');
  } catch {
    return false;
  }
  return received.length === expected.length && timingSafeEqual(received, expected);
}

export function formatRupees(paise) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  }).format(paise / 100);
}
