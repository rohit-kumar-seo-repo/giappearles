const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateSignIn(email, password) {
  const normalizedEmail = String(email || '').trim();
  const value = String(password || '');
  if (!normalizedEmail || !EMAIL_PATTERN.test(normalizedEmail)) {
    return 'Enter a valid email address.';
  }
  if (!value) return 'Enter your password.';
  return '';
}

export function validateRegistration(name, email, password, confirmation) {
  const normalizedName = String(name || '').trim();
  const normalizedEmail = String(email || '').trim();
  const value = String(password || '');
  const confirmedValue = String(confirmation || '');
  if (normalizedName.length < 2) return 'Enter your full name.';
  if (!normalizedEmail || !EMAIL_PATTERN.test(normalizedEmail)) {
    return 'Enter a valid email address.';
  }
  if (value.length < 8) return 'Choose a password with at least 8 characters.';
  if (value !== confirmedValue) return 'The passwords do not match.';
  return '';
}

export function friendlyAuthError(error, action) {
  const message = String(error?.message || '').toLowerCase();
  const status = Number(error?.status || error?.statusCode || 0);
  if (message.includes('failed to fetch') || message.includes('network request') || message.includes('networkerror')) {
    return 'Could not reach Supabase Auth. Check your internet connection, then verify the Supabase project URL and deploy the latest build.';
  }
  if (message.includes('supabase_url') || message.includes('publishable') || message.includes('configuration')) {
    return 'Authentication is not configured correctly. Check the runtime SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY settings in your hosting environment, then restart the application.';
  }
  if (status === 429 || message.includes('rate limit') || message.includes('too many requests')) {
    return 'Too many attempts. Wait a few minutes, then try again.';
  }
  if (message.includes('invalid login credentials') || status === 400) {
    if (/sign in/i.test(action)) {
      return 'The email or password is incorrect. Check your details and try again.';
    }
  }
  if (message.includes('already registered') || message.includes('already exists') || message.includes('user already registered')) {
    return 'An account with this email already exists. Sign in or reset your password.';
  }
  if (message.includes('email not confirmed') || message.includes('email_address_not_verified')) {
    return 'Please confirm your email address using the link we received before signing in.';
  }
  if (message.includes('password should be at least')) {
    return 'Choose a password with at least 8 characters.';
  }
  return error?.message || `${action} failed. Please try again.`;
}
