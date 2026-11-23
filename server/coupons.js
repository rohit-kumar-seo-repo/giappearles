import { InputError } from './orders.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function rupeesToPaise(value, label, allowZero = true) {
  const raw = String(value ?? '').trim();
  if (!/^\d{1,8}(?:\.\d{1,2})?$/.test(raw)) throw new InputError(`Enter a valid ${label} amount in rupees.`);
  const [whole, fraction = ''] = raw.split('.');
  const paise = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (!Number.isSafeInteger(paise) || (!allowZero && paise < 1)) throw new InputError(`Enter a valid ${label} amount in rupees.`);
  return paise;
}

function optionalDate(value, label) {
  if (value === '' || value === null || value === undefined) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new InputError(`Enter a valid ${label} date and time.`);
  return date.toISOString();
}

export function normalizeCouponInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new InputError('Enter the coupon details.');
  const code = typeof input.code === 'string' ? input.code.trim().toUpperCase() : '';
  const title = typeof input.title === 'string' ? input.title.trim().replace(/\s+/g, ' ') : '';
  if (!/^[A-Z0-9_-]{3,32}$/.test(code)) throw new InputError('Use 3–32 letters, numbers, hyphens or underscores for the coupon code.');
  if (title.length < 2 || title.length > 80) throw new InputError('The coupon name must be between 2 and 80 characters.');

  const discountType = input.discount_type;
  if (!['percentage', 'fixed'].includes(discountType)) throw new InputError('Choose a valid discount type.');
  const discountValue = discountType === 'percentage'
    ? Number(input.discount_value)
    : rupeesToPaise(input.discount_value, 'discount', false);
  if (discountType === 'percentage' && (!Number.isInteger(discountValue) || discountValue < 1 || discountValue > 100)) {
    throw new InputError('Percentage discounts must be between 1% and 100%.');
  }

  const startsAt = optionalDate(input.starts_at, 'start');
  const expiresAt = optionalDate(input.expires_at, 'expiry');
  if (startsAt && expiresAt && new Date(expiresAt) <= new Date(startsAt)) {
    throw new InputError('Expiry must be later than the start date.');
  }
  const usageLimit = input.usage_limit === '' || input.usage_limit === null || input.usage_limit === undefined
    ? null
    : Number(input.usage_limit);
  if (usageLimit !== null && (!Number.isSafeInteger(usageLimit) || usageLimit < 1 || usageLimit > 1000000)) {
    throw new InputError('The usage limit must be a whole number from 1 to 1,000,000.');
  }
  if (input.id !== undefined && (typeof input.id !== 'string' || !UUID.test(input.id))) {
    throw new InputError('Invalid coupon.');
  }
  if (input.active !== undefined && typeof input.active !== 'boolean') throw new InputError('Choose whether this coupon is active.');

  return {
    ...(input.id ? { id: input.id } : {}),
    code,
    title,
    discount_type: discountType,
    discount_value: discountValue,
    minimum_subtotal_paise: rupeesToPaise(input.minimum_subtotal_rupees ?? '0', 'minimum order'),
    maximum_discount_paise: input.maximum_discount_rupees === '' || input.maximum_discount_rupees === null || input.maximum_discount_rupees === undefined
      ? null
      : rupeesToPaise(input.maximum_discount_rupees, 'maximum discount', false),
    starts_at: startsAt,
    expires_at: expiresAt,
    usage_limit: usageLimit,
    active: input.active !== false
  };
}
