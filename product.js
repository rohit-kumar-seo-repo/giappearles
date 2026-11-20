(() => {
  'use strict';

  const product = window.GI_PRODUCT;
  if (!product) return;
  const gallery = document.getElementById('productMainImage');
  const bagCount = document.getElementById('productBagCount');
  const sizeError = document.getElementById('productSizeError');
  const addButton = document.getElementById('productAddButton');
  const viewBag = document.getElementById('productViewBag');
  const storageKey = 'gi-apparel-bag-v1';

  const readBag = () => {
    try {
      const value = JSON.parse(window.localStorage.getItem(storageKey) || '[]');
      return Array.isArray(value) ? value : [];
    } catch {
      return [];
    }
  };

  const updateBagCount = () => {
    const count = readBag().reduce((total, line) => total + (Number.isInteger(line?.quantity) ? line.quantity : 0), 0);
    if (bagCount) bagCount.textContent = String(count);
  };

  document.querySelectorAll('[data-product-image]').forEach((button) => {
    button.addEventListener('click', () => {
      if (!gallery) return;
      gallery.src = button.dataset.productImage || gallery.src;
      gallery.alt = button.dataset.productAlt || product.name;
      document.querySelectorAll('[data-product-image]').forEach((item) => item.setAttribute('aria-pressed', String(item === button)));
    });
  });

  document.querySelectorAll('[data-product-size]').forEach((button) => {
    button.addEventListener('click', () => {
      document.querySelectorAll('[data-product-size]').forEach((item) => {
        item.classList.toggle('is-selected', item === button);
        item.setAttribute('aria-pressed', String(item === button));
      });
      if (sizeError) sizeError.textContent = '';
    });
  });

  if (addButton) {
    addButton.addEventListener('click', () => {
      const selected = document.querySelector('[data-product-size].is-selected');
      if (!selected) {
        if (sizeError) sizeError.textContent = 'Please choose a size to continue.';
        document.querySelector('.product-size-picker')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }

      const bag = readBag();
      const existing = bag.find((line) => line?.id === product.id && line?.size === selected.dataset.productSize);
      if (existing) existing.quantity = Math.min(10, Math.max(1, Number(existing.quantity) || 1) + 1);
      else if (bag.length < 10) bag.push({ id: product.id, size: selected.dataset.productSize, quantity: 1 });
      else {
        if (sizeError) sizeError.textContent = 'Your bag is full. Please open it to review your pieces.';
        return;
      }

      try {
        window.localStorage.setItem(storageKey, JSON.stringify(bag));
      } catch {
        if (sizeError) sizeError.textContent = 'Your bag could not be saved. Please allow site storage and try again.';
        return;
      }

      updateBagCount();
      if (viewBag) viewBag.hidden = false;
      addButton.textContent = 'Added to bag · ₹' + Number(product.launchPrice).toLocaleString('en-IN');
      addButton.classList.add('is-added');
    });
  }

  const menuToggle = document.getElementById('productMenuToggle');
  const mobileMenu = document.getElementById('productMobileMenu');
  if (menuToggle && mobileMenu) {
    menuToggle.addEventListener('click', () => {
      const open = menuToggle.getAttribute('aria-expanded') !== 'true';
      menuToggle.setAttribute('aria-expanded', String(open));
      mobileMenu.classList.toggle('is-open', open);
    });
  }

  window.addEventListener('storage', (event) => {
    if (event.key === storageKey) updateBagCount();
  });
  const year = document.getElementById('productYear');
  if (year) year.textContent = String(new Date().getFullYear());
  updateBagCount();
})();