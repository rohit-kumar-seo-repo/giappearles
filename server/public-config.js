import process from 'node:process';

function requiredPublicValue(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing ${name}.`);
  return value;
}

export function publicSupabaseConfigSource() {
  const supabaseUrl = requiredPublicValue('SUPABASE_URL');
  const publishableKey = requiredPublicValue('SUPABASE_PUBLISHABLE_KEY');
  let parsedUrl;

  try {
    parsedUrl = new URL(supabaseUrl);
  } catch {
    throw new Error('SUPABASE_URL must be a valid HTTPS URL.');
  }

  if (parsedUrl.protocol !== 'https:' || parsedUrl.username || parsedUrl.password || parsedUrl.pathname !== '/') {
    throw new Error('SUPABASE_URL must be an HTTPS project URL without credentials or a path.');
  }

  if (!publishableKey.startsWith('sb_publishable_') && !publishableKey.includes('.')) {
    throw new Error('SUPABASE_PUBLISHABLE_KEY must be a browser-safe publishable key or anon key.');
  }

  return [
    `export const SUPABASE_URL = ${JSON.stringify(supabaseUrl)};`,
    `export const SUPABASE_PUBLISHABLE_KEY = ${JSON.stringify(publishableKey)};`,
    ''
  ].join('\n');
}
