const { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } = await import('/supabase-config.js');

const createClient = globalThis.supabase?.createClient;
if (typeof createClient !== 'function') {
  throw new Error('The local Supabase browser client did not load. Rebuild and redeploy the site.');
}

if (!/^https:\/\//i.test(SUPABASE_URL) || !SUPABASE_PUBLISHABLE_KEY) {
  throw new Error('Supabase browser configuration is invalid. Check the runtime SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY settings.');
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: window.localStorage,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
});
