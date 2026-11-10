import { supabase } from './supabase-client.js';

const signedOut = document.getElementById('headerAccountSignedOut');
const signedIn = document.getElementById('headerAccountSignedIn');
const toggle = document.getElementById('headerAccountToggle');
const displayName = document.getElementById('headerAccountName');
const menu = document.getElementById('headerAccountDropdown');
const logoutButton = document.getElementById('headerAccountLogout');
const menuMessage = document.getElementById('headerAccountMessage');

let activeUserId = null;

function setMenuOpen(open) {
  if (!toggle || !menu) return;
  toggle.setAttribute('aria-expanded', String(open));
  menu.hidden = !open;
}

function accountName(user) {
  const fullName = String(user.user_metadata?.full_name || '').trim();
  return fullName.split(/\s+/)[0] || user.email?.split('@')[0] || 'My Account';
}

function renderSignedOut() {
  activeUserId = null;
  if (signedOut) signedOut.hidden = false;
  if (signedIn) signedIn.hidden = true;
  if (menuMessage) menuMessage.hidden = true;
  setMenuOpen(false);
}

function renderSignedIn(user) {
  activeUserId = user.id;
  if (signedOut) signedOut.hidden = true;
  if (signedIn) signedIn.hidden = false;
  if (displayName) displayName.textContent = accountName(user);
  if (toggle) toggle.setAttribute('aria-label', `Account menu for ${accountName(user)}`);
  if (menuMessage) menuMessage.hidden = true;
}

async function loadProfileName(user) {
  const { data, error } = await supabase.from('customer_profiles')
    .select('full_name')
    .eq('user_id', user.id)
    .maybeSingle();

  if (activeUserId !== user.id) return;
  if (error) {
    console.error('Could not load the customer name for the account menu:', error);
    if (menuMessage) {
      menuMessage.textContent = 'Your account is signed in, but your profile name could not be loaded.';
      menuMessage.hidden = false;
    }
    return;
  }

  const name = String(data?.full_name || '').trim().split(/\s+/)[0] || accountName(user);
  if (displayName) displayName.textContent = name;
  if (toggle) toggle.setAttribute('aria-label', `Account menu for ${name}`);
}

if (toggle && menu) {
  toggle.addEventListener('click', () => {
    setMenuOpen(toggle.getAttribute('aria-expanded') !== 'true');
  });

  document.addEventListener('click', (event) => {
    if (!signedIn?.contains(event.target)) setMenuOpen(false);
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') {
      setMenuOpen(false);
      toggle.focus();
    }
  });

  menu.addEventListener('click', (event) => {
    if (event.target instanceof HTMLAnchorElement) setMenuOpen(false);
  });
}

logoutButton?.addEventListener('click', async () => {
  if (menuMessage) menuMessage.hidden = true;
  if (logoutButton) logoutButton.disabled = true;
  try {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    setMenuOpen(false);
  } catch (error) {
    console.error('Could not sign out from the account menu:', error);
    if (menuMessage) {
      menuMessage.textContent = error.message || 'Could not sign out. Please try again.';
      menuMessage.hidden = false;
    }
  } finally {
    if (logoutButton) logoutButton.disabled = false;
  }
});

window.addEventListener('gi:account-profile-updated', (event) => {
  const updatedUser = event.detail;
  if (!updatedUser || updatedUser.id !== activeUserId) return;
  const name = String(updatedUser.full_name || '').trim().split(/\s+/)[0] || 'My Account';
  if (displayName) displayName.textContent = name;
  if (toggle) toggle.setAttribute('aria-label', `Account menu for ${name}`);
});

supabase.auth.onAuthStateChange((_event, session) => {
  const user = session?.user;
  if (!user) {
    renderSignedOut();
    return;
  }
  renderSignedIn(user);
  setTimeout(() => loadProfileName(user).catch((error) => {
    console.error('Could not load the customer name for the account menu:', error);
  }), 0);
});

supabase.auth.getSession().then(({ data, error }) => {
  if (error) throw error;
  if (data.session?.user) {
    renderSignedIn(data.session.user);
    awaitProfileName(data.session.user);
  } else {
    renderSignedOut();
  }
}).catch((error) => {
  console.error('Could not restore the account menu session:', error);
  renderSignedOut();
});

function awaitProfileName(user) {
  setTimeout(() => loadProfileName(user).catch((error) => {
    console.error('Could not load the customer name for the account menu:', error);
  }), 0);
}
