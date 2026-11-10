import { supabase } from './supabase-client.js';
import { friendlyAuthError, validateRegistration, validateSignIn } from './auth-utils.js';

const elements = Object.fromEntries([
  'accountTitle',
  'authPanel',
  'accountTabs',
  'showLoginBtn',
  'showRegisterBtn',
  'loginForm',
  'registerForm',
  'resetPasswordForm',
  'signedInPanel',
  'loginMessage',
  'registerMessage',
  'registrationSuccessPanel',
  'emailVerificationMessage',
  'resetMessage',
  'signedInEmail',
  'signedInMessage',
  'welcomeMessage',
  'loginSubmitBtn',
  'registerSubmitBtn',
  'resetSubmitBtn',
  'forgotPasswordBtn',
  'signOutBtn',
  'profileForm',
  'profileName',
  'profileEmail',
  'profilePhone',
  'addressList',
  'addressForm',
  'addressId',
  'addressLabel',
  'addressRecipient',
  'addressPhone',
  'addressLine1',
  'addressLine2',
  'addressCity',
  'addressState',
  'addressPostalCode',
  'addressDefault',
  'addressMessage',
  'addAddressBtn',
  'cancelAddressBtn',
  'orderHistory',
  'changePasswordForm',
  'currentPassword',
  'accountNewPassword',
  'accountConfirmPassword',
  'passwordMessage'
].map((id) => [id, document.getElementById(id)]));

let currentUser = null;
let addresses = [];

function setMessage(element, text, type = 'error') {
  element.textContent = text;
  element.dataset.type = type;
  element.hidden = false;
}

function clearMessage(element) {
  element.textContent = '';
  element.hidden = true;
}

function setBusy(button, busy, busyLabel) {
  if (busy) {
    button.dataset.defaultLabel ||= button.textContent;
    button.textContent = busyLabel;
  } else {
    button.textContent = button.dataset.defaultLabel || button.textContent;
  }
  button.disabled = busy;
  button.setAttribute('aria-busy', String(busy));
}

function customerDataError(error) {
  if (error?.code === 'PGRST205' || /schema cache.*customer_|customer_.*schema cache/i.test(error?.message || '')) {
    return new Error(
      'Customer account tables are not set up yet. In Supabase Dashboard → SQL Editor, run the customer-account migration from this project, then refresh this page.'
    );
  }
  return error;
}

function showAuth(mode = 'login') {
  document.body.classList.remove('account-signed-in');
  elements.accountTitle.textContent = mode === 'register' ? 'Create your account' : 'Your GI Apparel account';
  elements.authPanel.hidden = false;
  elements.signedInPanel.hidden = true;
  elements.accountTabs.hidden = mode === 'reset';
  elements.registrationSuccessPanel.hidden = true;
  elements.loginForm.hidden = mode !== 'login';
  elements.registerForm.hidden = mode !== 'register';
  elements.resetPasswordForm.hidden = mode !== 'reset';
  elements.showLoginBtn.hidden = mode === 'reset';
  elements.showRegisterBtn.hidden = mode === 'reset';
  elements.showLoginBtn.classList.toggle('active', mode === 'login');
  elements.showRegisterBtn.classList.toggle('active', mode === 'register');
  elements.showLoginBtn.setAttribute('aria-selected', String(mode === 'login'));
  elements.showRegisterBtn.setAttribute('aria-selected', String(mode === 'register'));
}

function showDashboard(user) {
  document.body.classList.add('account-signed-in');
  currentUser = user;
  elements.accountTitle.textContent = 'Your account';
  elements.authPanel.hidden = true;
  elements.signedInPanel.hidden = false;
  elements.signedInEmail.textContent = user.email || 'Your account';
  const name = String(user.user_metadata?.full_name || '').trim();
  elements.welcomeMessage.textContent = `Welcome back, ${name || user.email?.split('@')[0] || 'Customer'}!`;
  elements.profileEmail.value = user.email || '';
}

function showRegistrationSuccess(needsEmailVerification) {
  document.body.classList.remove('account-signed-in');
  elements.accountTitle.textContent = 'Account created';
  elements.authPanel.hidden = false;
  elements.signedInPanel.hidden = true;
  elements.accountTabs.hidden = true;
  elements.loginForm.hidden = true;
  elements.registerForm.hidden = true;
  elements.resetPasswordForm.hidden = true;
  elements.registrationSuccessPanel.hidden = false;
  elements.emailVerificationMessage.hidden = !needsEmailVerification;
}

function scrollToRequestedSection() {
  const sectionId = window.location.hash.slice(1);
  if (!sectionId || sectionId === 'register' || sectionId === 'sign-in') return;
  setTimeout(() => document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth' }), 100);
}

function appendText(parent, tag, text, className = '') {
  const node = document.createElement(tag);
  node.textContent = text;
  if (className) node.className = className;
  parent.append(node);
  return node;
}

function renderAddresses() {
  elements.addressList.replaceChildren();
  if (!addresses.length) {
    appendText(elements.addressList, 'p', 'No saved addresses yet.', 'account-muted');
    return;
  }

  for (const address of addresses) {
    const card = document.createElement('article');
    card.className = 'saved-address-card';
    const title = document.createElement('div');
    title.className = 'saved-address-title';
    appendText(title, 'strong', address.label);
    if (address.is_default) appendText(title, 'span', 'Default', 'default-address-badge');
    card.append(title);
    appendText(card, 'p', `${address.recipient_name} · ${address.phone}`);
    appendText(card, 'p', [
      address.address_line1,
      address.address_line2,
      address.city,
      address.state,
      address.postal_code
    ].filter(Boolean).join(', '));

    const actions = document.createElement('div');
    actions.className = 'account-button-row';
    const edit = document.createElement('button');
    edit.type = 'button';
    edit.className = 'text-button';
    edit.textContent = 'Edit';
    edit.addEventListener('click', () => editAddress(address));
    actions.append(edit);
    if (!address.is_default) {
      const makeDefault = document.createElement('button');
      makeDefault.type = 'button';
      makeDefault.className = 'text-button';
      makeDefault.textContent = 'Make default';
      makeDefault.addEventListener('click', () => {
        setDefaultAddress(address.id).catch((error) => {
          setMessage(elements.signedInMessage, error.message || 'Could not update the default address.');
        });
      });
      actions.append(makeDefault);
    }
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'text-button';
    remove.textContent = 'Delete';
    remove.addEventListener('click', () => {
      deleteAddress(address).catch((error) => {
        setMessage(elements.signedInMessage, error.message || 'Could not delete the address.');
      });
    });
    actions.append(remove);
    card.append(actions);
    elements.addressList.append(card);
  }
}

function renderOrders(orders) {
  elements.orderHistory.replaceChildren();
  if (!orders.length) {
    appendText(elements.orderHistory, 'p', 'Your orders will appear here after checkout.', 'account-muted');
    return;
  }

  const money = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 });
  for (const order of orders) {
    const details = document.createElement('details');
    details.className = 'order-history-card';
    const summary = document.createElement('summary');
    const title = document.createElement('strong');
    title.textContent = order.order_number;
    const status = document.createElement('span');
    status.textContent = `${order.order_status.replaceAll('_', ' ')} · ${money.format(order.total_paise / 100)}`;
    summary.append(title, status);
    details.append(summary);
    appendText(details, 'p', `Placed ${new Date(order.created_at).toLocaleDateString()} · Payment ${order.payment_status}`);
    const itemList = document.createElement('ul');
    for (const item of order.items || []) {
      appendText(itemList, 'li', `${item.name} · Size ${item.size} × ${item.quantity}`);
    }
    details.append(itemList);
    const customer = order.customer || {};
    appendText(details, 'p', [
      customer.addressLine1,
      customer.addressLine2,
      customer.city,
      customer.state,
      customer.postalCode
    ].filter(Boolean).join(', '));
    elements.orderHistory.append(details);
  }
}

async function loadDashboard() {
  if (!currentUser) return;
  clearMessage(elements.signedInMessage);

  const [profileResult, addressResult, orderResult] = await Promise.all([
    supabase.from('customer_profiles')
      .select('full_name,phone')
      .eq('user_id', currentUser.id)
      .maybeSingle(),
    supabase.from('customer_addresses')
      .select('id,label,recipient_name,phone,address_line1,address_line2,city,state,postal_code,is_default')
      .eq('user_id', currentUser.id)
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: true }),
    supabase.from('orders')
      .select('order_number,items,customer,total_paise,payment_status,order_status,created_at')
      .eq('user_id', currentUser.id)
      .order('created_at', { ascending: false })
      .limit(50)
  ]);

  const error = profileResult.error || addressResult.error || orderResult.error;
  if (error) throw customerDataError(error);

  let profile = profileResult.data;
  if (!profile) {
    const created = await supabase.from('customer_profiles').upsert({
      user_id: currentUser.id,
      full_name: currentUser.user_metadata?.full_name || '',
      phone: ''
    }).select('full_name,phone').single();
    if (created.error) throw customerDataError(created.error);
    profile = created.data;
  }

  elements.profileName.value = profile.full_name || '';
  elements.profilePhone.value = profile.phone || '';
  elements.welcomeMessage.textContent = `Welcome back, ${profile.full_name || currentUser.email?.split('@')[0] || 'Customer'}!`;
  addresses = addressResult.data || [];
  renderAddresses();
  renderOrders(orderResult.data || []);
  scrollToRequestedSection();
}

function readAddressForm() {
  const form = new FormData(elements.addressForm);
  return {
    label: String(form.get('label')).trim(),
    recipient_name: String(form.get('recipient_name')).trim(),
    phone: String(form.get('phone')).trim(),
    address_line1: String(form.get('address_line1')).trim(),
    address_line2: String(form.get('address_line2')).trim(),
    city: String(form.get('city')).trim(),
    state: String(form.get('state')).trim(),
    postal_code: String(form.get('postal_code')).trim(),
    is_default: elements.addressDefault.checked
  };
}

function editAddress(address) {
  elements.addressForm.reset();
  elements.addressId.value = address.id;
  elements.addressLabel.value = address.label;
  elements.addressRecipient.value = address.recipient_name;
  elements.addressPhone.value = address.phone;
  elements.addressLine1.value = address.address_line1;
  elements.addressLine2.value = address.address_line2;
  elements.addressCity.value = address.city;
  elements.addressState.value = address.state;
  elements.addressPostalCode.value = address.postal_code;
  elements.addressDefault.checked = address.is_default;
  elements.addressForm.hidden = false;
  clearMessage(elements.addressMessage);
}

async function saveAddress(event) {
  event.preventDefault();
  clearMessage(elements.addressMessage);
  const id = elements.addressId.value;
  const record = { ...readAddressForm(), user_id: currentUser.id, is_default: false };
  const saved = id
    ? await supabase.from('customer_addresses').update(record).eq('id', id).select('id').single()
    : await supabase.from('customer_addresses').insert(record).select('id').single();
  if (saved.error) {
    setMessage(elements.addressMessage, customerDataError(saved.error).message);
    return;
  }

  if (elements.addressDefault.checked) {
    const clearDefaults = await supabase.from('customer_addresses')
      .update({ is_default: false })
      .eq('user_id', currentUser.id)
      .neq('id', saved.data.id);
    if (clearDefaults.error) {
      setMessage(elements.addressMessage, customerDataError(clearDefaults.error).message);
      return;
    }
    const setDefault = await supabase.from('customer_addresses')
      .update({ is_default: true })
      .eq('id', saved.data.id);
    if (setDefault.error) {
      setMessage(elements.addressMessage, customerDataError(setDefault.error).message);
      return;
    }
  }

  elements.addressForm.hidden = true;
  await loadDashboard();
}

async function setDefaultAddress(id) {
  const clearDefaults = await supabase.from('customer_addresses')
    .update({ is_default: false })
    .eq('user_id', currentUser.id);
  if (clearDefaults.error) {
    setMessage(elements.signedInMessage, customerDataError(clearDefaults.error).message);
    return;
  }
  const setDefault = await supabase.from('customer_addresses')
    .update({ is_default: true })
    .eq('id', id);
  if (setDefault.error) {
    setMessage(elements.signedInMessage, customerDataError(setDefault.error).message);
    return;
  }
  await loadDashboard();
}

async function deleteAddress(address) {
  if (!window.confirm(`Delete the ${address.label.toLowerCase()} address?`)) return;
  const result = await supabase.from('customer_addresses')
    .delete()
    .eq('id', address.id);
  if (result.error) {
    setMessage(elements.signedInMessage, customerDataError(result.error).message);
    return;
  }
  if (address.is_default && addresses.length > 1) {
    const nextAddress = addresses.find((candidate) => candidate.id !== address.id);
    if (nextAddress) {
      const resultDefault = await supabase.from('customer_addresses')
        .update({ is_default: true })
        .eq('id', nextAddress.id);
      if (resultDefault.error) {
        setMessage(elements.signedInMessage, resultDefault.error.message);
        return;
      }
    }
  }
  await loadDashboard();
}

elements.showLoginBtn.addEventListener('click', () => showAuth('login'));
elements.showRegisterBtn.addEventListener('click', () => showAuth('register'));

elements.loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  clearMessage(elements.loginMessage);
  const form = new FormData(elements.loginForm);
  const email = String(form.get('email')).trim();
  const password = String(form.get('password'));
  const validationError = validateSignIn(email, password);
  if (validationError) {
    setMessage(elements.loginMessage, validationError);
    return;
  }
  if (elements.loginSubmitBtn.disabled) return;
  setBusy(elements.loginSubmitBtn, true, 'Signing in…');
  try {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  } catch (error) {
    setMessage(elements.loginMessage, friendlyAuthError(error, 'Sign in'));
  } finally {
    setBusy(elements.loginSubmitBtn, false);
  }
});

elements.registerForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  clearMessage(elements.registerMessage);
  const form = new FormData(elements.registerForm);
  const name = String(form.get('name')).trim();
  const email = String(form.get('email')).trim();
  const password = String(form.get('password'));
  const confirmation = String(form.get('passwordConfirm'));
  const validationError = validateRegistration(name, email, password, confirmation);
  if (validationError) {
    setMessage(elements.registerMessage, validationError);
    return;
  }
  if (elements.registerSubmitBtn.disabled) return;
  setBusy(elements.registerSubmitBtn, true, 'Creating account…');
  try {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: name } }
    });
    if (error) throw error;
    if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
      setMessage(elements.registerMessage, 'An account with this email may already exist. Sign in or request a password reset.');
      return;
    }
    elements.registerForm.reset();
    if (data.session) {
      const { error: signOutError } = await supabase.auth.signOut({ scope: 'local' });
      if (signOutError) {
        console.error('Account created, but the new session could not be cleared:', signOutError);
        showDashboard(data.session.user);
        await loadDashboard();
        setMessage(elements.signedInMessage, 'Your account has been created successfully! Welcome to GI Apparel.', 'success');
        return;
      }
    }
    showRegistrationSuccess(!data.session);
  } catch (error) {
    setMessage(elements.registerMessage, friendlyAuthError(error, 'Account creation'));
  } finally {
    setBusy(elements.registerSubmitBtn, false);
  }
});

elements.forgotPasswordBtn.addEventListener('click', async () => {
  clearMessage(elements.loginMessage);
  const email = document.getElementById('loginEmail').value.trim();
  if (!email) {
    setMessage(elements.loginMessage, 'Enter your email address first, then choose “Forgot password?”.');
    document.getElementById('loginEmail').focus();
    return;
  }
  elements.forgotPasswordBtn.disabled = true;
  try {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.href.split('#')[0]
    });
    if (error) throw error;
    setMessage(elements.loginMessage, 'If an account exists for this email, a password reset link has been sent.', 'success');
  } catch (error) {
    setMessage(elements.loginMessage, friendlyAuthError(error, 'Password reset'));
  } finally {
    elements.forgotPasswordBtn.disabled = false;
  }
});

elements.resetPasswordForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  clearMessage(elements.resetMessage);
  const password = document.getElementById('newPassword').value;
  if (password !== document.getElementById('confirmPassword').value) {
    setMessage(elements.resetMessage, 'The passwords do not match.');
    return;
  }
  elements.resetSubmitBtn.disabled = true;
  try {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw error;
    elements.resetPasswordForm.reset();
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
    showAuth('login');
    setMessage(elements.loginMessage, 'Your password has been updated. Sign in with your new password.', 'success');
  } catch (error) {
    setMessage(elements.resetMessage, friendlyAuthError(error, 'Password update'));
  } finally {
    elements.resetSubmitBtn.disabled = false;
  }
});

elements.profileForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  clearMessage(elements.signedInMessage);
  try {
    const result = await supabase.from('customer_profiles').upsert({
      user_id: currentUser.id,
      full_name: elements.profileName.value.trim(),
      phone: elements.profilePhone.value.trim()
    });
    if (result.error) {
      setMessage(elements.signedInMessage, customerDataError(result.error).message);
      return;
    }
    const fullName = elements.profileName.value.trim();
    window.dispatchEvent(new CustomEvent('gi:account-profile-updated', {
      detail: { id: currentUser.id, full_name: fullName }
    }));
    elements.welcomeMessage.textContent = `Welcome back, ${fullName}!`;
    setMessage(elements.signedInMessage, 'Your profile has been saved.', 'success');
  } catch (error) {
    setMessage(elements.signedInMessage, error.message || 'Could not save your profile.');
  }
});

elements.addAddressBtn.addEventListener('click', () => {
  elements.addressForm.reset();
  elements.addressId.value = '';
  elements.addressLabel.value = 'Home';
  elements.addressDefault.checked = addresses.length === 0;
  elements.addressForm.hidden = false;
  clearMessage(elements.addressMessage);
});
elements.cancelAddressBtn.addEventListener('click', () => {
  elements.addressForm.hidden = true;
  clearMessage(elements.addressMessage);
});
elements.addressForm.addEventListener('submit', (event) => {
  saveAddress(event).catch((error) => {
    setMessage(elements.addressMessage, error.message || 'Could not save the address.');
  });
});

elements.changePasswordForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  clearMessage(elements.passwordMessage);
  if (elements.accountNewPassword.value !== elements.accountConfirmPassword.value) {
    setMessage(elements.passwordMessage, 'The new passwords do not match.');
    return;
  }
  const button = elements.changePasswordForm.querySelector('button[type="submit"]');
  button.disabled = true;
  try {
    const verified = await supabase.auth.signInWithPassword({
      email: currentUser.email,
      password: elements.currentPassword.value
    });
    if (verified.error) throw new Error('Your current password is incorrect.');
    const updated = await supabase.auth.updateUser({ password: elements.accountNewPassword.value });
    if (updated.error) throw updated.error;
    elements.changePasswordForm.reset();
    setMessage(elements.passwordMessage, 'Your password has been updated.', 'success');
  } catch (error) {
    setMessage(elements.passwordMessage, friendlyAuthError(error, 'Password update'));
  } finally {
    button.disabled = false;
  }
});

elements.signOutBtn.addEventListener('click', async () => {
  elements.signOutBtn.disabled = true;
  try {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  } catch (error) {
    setMessage(elements.signedInMessage, error.message || 'Could not sign out. Please try again.');
  } finally {
    elements.signOutBtn.disabled = false;
  }
});

supabase.auth.onAuthStateChange((event, session) => {
  if (event === 'PASSWORD_RECOVERY' || new URLSearchParams(window.location.hash.slice(1)).get('type') === 'recovery') {
    showAuth('reset');
    return;
  }
  if (session?.user) {
    showDashboard(session.user);
    if (event !== 'INITIAL_SESSION') {
      setTimeout(() => loadDashboard().catch((error) => {
        setMessage(elements.signedInMessage, error.message || 'Could not load your account information.');
      }), 0);
    }
  } else if (event === 'SIGNED_OUT' || event === 'INITIAL_SESSION') {
    currentUser = null;
    showAuth(event === 'INITIAL_SESSION' && window.location.hash === '#register' ? 'register' : 'login');
  }
});

try {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  if (new URLSearchParams(window.location.hash.slice(1)).get('type') === 'recovery') {
    showAuth('reset');
  } else if (data.session?.user) {
    showDashboard(data.session.user);
    await loadDashboard();
  } else {
    showAuth(window.location.hash === '#register' ? 'register' : 'login');
  }
} catch (error) {
  showAuth('login');
  setMessage(elements.loginMessage, error.message || 'Could not load your account. Please refresh the page.');
}
