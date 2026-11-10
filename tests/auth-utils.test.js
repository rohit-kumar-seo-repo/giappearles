import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { publicSupabaseConfigSource } from '../server/public-config.js';
import { friendlyAuthError, validateRegistration, validateSignIn } from '../auth-utils.js';

test('sign-in validation rejects invalid email and missing password', () => {
  assert.equal(validateSignIn('not-an-email', 'secret'), 'Enter a valid email address.');
  assert.equal(validateSignIn('customer@example.com', ''), 'Enter your password.');
  assert.equal(validateSignIn(' customer@example.com ', 'secret'), '');
});

test('registration validation requires name, email, strength, and matching passwords', () => {
  assert.equal(validateRegistration('', 'customer@example.com', 'password123', 'password123'), 'Enter your full name.');
  assert.equal(validateRegistration('Customer', 'bad', 'password123', 'password123'), 'Enter a valid email address.');
  assert.equal(validateRegistration('Customer', 'customer@example.com', 'short', 'short'), 'Choose a password with at least 8 characters.');
  assert.equal(validateRegistration('Customer', 'customer@example.com', 'password123', 'different'), 'The passwords do not match.');
  assert.equal(validateRegistration(' Customer ', ' customer@example.com ', 'password123', 'password123'), '');
});

test('browser authentication loads a local Supabase client instead of a remote import', async () => {
  const [html, client, build] = await Promise.all([
    readFile(new URL('../login.html', import.meta.url), 'utf8'),
    readFile(new URL('../supabase-client.js', import.meta.url), 'utf8'),
    readFile(new URL('../build.mjs', import.meta.url), 'utf8')
  ]);
  assert.ok(html.indexOf('src="supabase.js"') < html.indexOf('src="login.js"'));
  assert.doesNotMatch(client, /esm\.sh|cdn\.jsdelivr|unpkg\.com/);
  assert.match(client, /globalThis\.supabase\?\.createClient/);
  assert.match(client, /import\(['"]\/supabase-config\.js['"]\)/);
  assert.doesNotMatch(build, /SUPABASE_URL|SUPABASE_PUBLISHABLE_KEY|supabase-config\.js/);
});

test('account registration confirms success and offers a direct login action', async () => {
  const [html, account] = await Promise.all([
    readFile(new URL('../login.html', import.meta.url), 'utf8'),
    readFile(new URL('../account.js', import.meta.url), 'utf8')
  ]);
  assert.match(html, /Your account has been created successfully! Welcome to GI Apparel\./);
  assert.match(html, /GO TO LOGIN/);
  assert.match(html, /verify your email address before signing in/);
  assert.match(account, /showRegistrationSuccess\(!data\.session\)/);
  assert.match(account, /signUp\(/);
  assert.match(account, /signInWithPassword\(/);
});

test('account pages expose persistent customer navigation and dashboard sections', async () => {
  const [home, login, header, client] = await Promise.all([
    readFile(new URL('../index.html', import.meta.url), 'utf8'),
    readFile(new URL('../login.html', import.meta.url), 'utf8'),
    readFile(new URL('../account-header.js', import.meta.url), 'utf8'),
    readFile(new URL('../supabase-client.js', import.meta.url), 'utf8')
  ]);
  for (const page of [home, login]) {
    assert.match(page, /Sign In/);
    assert.match(page, /Create Account/);
    assert.match(page, /My Orders/);
    assert.match(page, /My Addresses/);
    assert.match(page, /Edit Profile/);
    assert.match(page, /headerAccountLogout/);
  }
  assert.ok(home.indexOf('src="supabase.js"') < home.indexOf('src="storefront-auth.js"'));
  assert.match(login, /id="orders"/);
  assert.match(login, /id="addresses"/);
  assert.match(login, /id="profile"/);
  assert.match(login, /id="welcomeMessage"/);
  assert.match(header, /onAuthStateChange/);
  assert.match(header, /getSession/);
  assert.match(client, /persistSession:\s*true/);
  assert.match(client, /autoRefreshToken:\s*true/);
});

test('runtime browser configuration contains only public Supabase values', () => {
  const previousUrl = process.env.SUPABASE_URL;
  const previousKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  const previousRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  try {
    process.env.SUPABASE_URL = 'https://project.supabase.co';
    process.env.SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_public-test';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'private-test-secret';
    const source = publicSupabaseConfigSource();
    assert.match(source, /SUPABASE_URL = "https:\/\/project\.supabase\.co"/);
    assert.match(source, /SUPABASE_PUBLISHABLE_KEY = "sb_publishable_public-test"/);
    assert.doesNotMatch(source, /private-test-secret|service.role/i);
  } finally {
    if (previousUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = previousUrl;
    if (previousKey === undefined) delete process.env.SUPABASE_PUBLISHABLE_KEY;
    else process.env.SUPABASE_PUBLISHABLE_KEY = previousKey;
    if (previousRole === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = previousRole;
  }
});

test('runtime browser configuration rejects malformed project URLs', () => {
  const previousUrl = process.env.SUPABASE_URL;
  const previousKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  try {
    process.env.SUPABASE_URL = 'https://project.supabase.co/auth/v1';
    process.env.SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_public-test';
    assert.throws(() => publicSupabaseConfigSource(), /without credentials or a path/);
  } finally {
    if (previousUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = previousUrl;
    if (previousKey === undefined) delete process.env.SUPABASE_PUBLISHABLE_KEY;
    else process.env.SUPABASE_PUBLISHABLE_KEY = previousKey;
  }
});

test('authentication errors distinguish network, configuration, rate limits, and confirmation', () => {
  assert.match(friendlyAuthError(new Error('Failed to fetch'), 'Sign in'), /Could not reach Supabase Auth/);
  assert.match(friendlyAuthError(new Error('SUPABASE_URL is invalid'), 'Sign in'), /not configured correctly/);
  assert.match(friendlyAuthError({ message: 'Too many requests', status: 429 }, 'Sign in'), /Too many attempts/);
  assert.match(friendlyAuthError(new Error('Email not confirmed'), 'Sign in'), /confirm your email/);
  assert.match(friendlyAuthError(new Error('Invalid login credentials'), 'Sign in'), /email or password is incorrect/);
  assert.match(friendlyAuthError(new Error('User already registered'), 'Account creation'), /already exists/);
});
