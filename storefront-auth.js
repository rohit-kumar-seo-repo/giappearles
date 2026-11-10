import { supabase } from './supabase-client.js';
import './account-header.js';

const addressGroup = document.getElementById('checkoutSavedAddressGroup');
const addressSelect = document.getElementById('checkoutSavedAddress');
const saveAddressLabel = document.getElementById('saveCheckoutAddressLabel');
const saveAddressCheckbox = document.getElementById('saveCheckoutAddress');
const checkoutForm = document.getElementById('checkoutForm');

let signedInUser = null;
let profile = null;
let savedAddresses = [];

function setAccountLink(user) {
  if (!user && signedInUser && checkoutForm) {
    for (const name of ['name', 'email', 'phone', 'addressLine1', 'addressLine2', 'city', 'state', 'postalCode']) {
      setCheckoutValue(name, '');
    }
    if (addressSelect) addressSelect.replaceChildren();
    if (addressGroup) addressGroup.hidden = true;
    if (saveAddressLabel) saveAddressLabel.hidden = true;
  }
  signedInUser = user;
}

function setCheckoutValue(name, value) {
  const field = checkoutForm?.elements.namedItem(name);
  if (field instanceof HTMLInputElement) field.value = value || '';
}

function applyAddress(address) {
  if (address) {
    setCheckoutValue('name', address.recipient_name);
    setCheckoutValue('phone', address.phone);
    setCheckoutValue('addressLine1', address.address_line1);
    setCheckoutValue('addressLine2', address.address_line2);
    setCheckoutValue('city', address.city);
    setCheckoutValue('state', address.state);
    setCheckoutValue('postalCode', address.postal_code);
    return;
  }
  setCheckoutValue('name', profile?.full_name || signedInUser?.user_metadata?.full_name || '');
  setCheckoutValue('phone', profile?.phone || '');
  for (const field of ['addressLine1', 'addressLine2', 'city', 'state', 'postalCode']) {
    setCheckoutValue(field, '');
  }
}

async function loadCustomerDetails(user) {
  const [profileResult, addressResult] = await Promise.all([
    supabase.from('customer_profiles')
      .select('full_name,phone')
      .eq('user_id', user.id)
      .maybeSingle(),
    supabase.from('customer_addresses')
      .select('id,label,recipient_name,phone,address_line1,address_line2,city,state,postal_code,is_default')
      .eq('user_id', user.id)
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: true })
  ]);
  if (profileResult.error) throw profileResult.error;
  if (addressResult.error) throw addressResult.error;
  profile = profileResult.data;
  savedAddresses = addressResult.data || [];
}

function populateSavedAddressSelector() {
  if (!addressSelect || !addressGroup) return;
  addressSelect.replaceChildren();
  const newAddressOption = document.createElement('option');
  newAddressOption.value = '';
  newAddressOption.textContent = 'Enter a new address';
  addressSelect.append(newAddressOption);
  for (const address of savedAddresses) {
    const option = document.createElement('option');
    option.value = address.id;
    option.textContent = `${address.label}${address.is_default ? ' (Default)' : ''} — ${address.city}`;
    addressSelect.append(option);
  }
  addressGroup.hidden = !signedInUser || savedAddresses.length === 0;
  saveAddressCheckbox.checked = false;
  const defaultAddress = savedAddresses.find((address) => address.is_default);
  addressSelect.value = defaultAddress?.id || '';
  saveAddressLabel.hidden = !signedInUser || Boolean(addressSelect.value);
  setCheckoutValue('email', signedInUser?.email || '');
  applyAddress(defaultAddress || null);
}

addressSelect?.addEventListener('change', () => {
  const address = savedAddresses.find((candidate) => candidate.id === addressSelect.value);
  applyAddress(address || null);
  saveAddressCheckbox.checked = false;
  saveAddressLabel.hidden = !signedInUser || Boolean(addressSelect.value);
});

async function getAccessToken() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session?.access_token || null;
}

async function populateCheckout() {
  if (!signedInUser) {
    if (addressGroup) addressGroup.hidden = true;
    if (saveAddressLabel) saveAddressLabel.hidden = true;
    return;
  }
  await loadCustomerDetails(signedInUser);
  populateSavedAddressSelector();
}

async function saveCheckoutAddress(customer) {
  if (!signedInUser || !saveAddressCheckbox?.checked || addressSelect?.value) return;
  const result = await supabase.from('customer_addresses').insert({
    user_id: signedInUser.id,
    label: 'Home',
    recipient_name: customer.name,
    phone: customer.phone,
    address_line1: customer.addressLine1,
    address_line2: customer.addressLine2,
    city: customer.city,
    state: customer.state,
    postal_code: customer.postalCode,
    is_default: savedAddresses.length === 0
  }).select('id,label,recipient_name,phone,address_line1,address_line2,city,state,postal_code,is_default')
    .single();
  if (result.error) throw result.error;
  savedAddresses.push(result.data);
  populateSavedAddressSelector();
  addressSelect.value = result.data.id;
}

window.GIAccount = {
  getAccessToken,
  populateCheckout,
  saveCheckoutAddress,
  ready: supabase.auth.getSession().then(({ data, error }) => {
    if (error) throw error;
    setAccountLink(data.session?.user || null);
    return data.session;
  })
};

supabase.auth.onAuthStateChange((_event, session) => {
  setAccountLink(session?.user || null);
  profile = null;
  savedAddresses = [];
});
