(() => {
  'use strict';

  const product = window.GI_PRODUCT;
  if (!product) return;

  const gallery = document.getElementById('productSwipeArea');
  const imageTrack = document.getElementById('productImageTrack');
  const thumbnails = [...document.querySelectorAll('[data-product-image-index]')];
  const slides = [...document.querySelectorAll('[data-product-slide]')];
  const sizeOptions = document.getElementById('productSizeOptions');
  const sizeStatus = document.getElementById('productSizeStatus');
  const viewBag = document.getElementById('productViewBag');
  const relatedModal = document.getElementById('relatedSizeModal');
  const sizeGuide = document.getElementById('size-guide');
  const relatedOptions = document.getElementById('relatedSizeOptions');
  const relatedStatus = document.getElementById('relatedSizeStatus');
  const relatedAddButton = document.getElementById('relatedSizeAdd');
  const relatedCloseButton = document.getElementById('relatedSizeClose');
  let activeRelatedProduct = null;
  let scrollFrame = 0;

  document.querySelector('.product-size-heading a[href="#size-guide"]')?.addEventListener('click', () => {
    if (sizeGuide) sizeGuide.open = true;
  });

  const updateGallerySelection = (index, scrollMobile = false) => {
    const safeIndex = Math.max(0, Math.min(index, slides.length - 1));
    slides.forEach((slide, slideIndex) => {
      slide.classList.toggle('is-active', slideIndex === safeIndex);
      slide.setAttribute('aria-hidden', String(slideIndex !== safeIndex && window.matchMedia('(min-width: 768px)').matches));
    });
    thumbnails.forEach((button, buttonIndex) => {
      const active = buttonIndex === safeIndex;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    });

    if (scrollMobile && imageTrack && window.matchMedia('(max-width: 767px)').matches) {
      imageTrack.scrollTo({ left: safeIndex * imageTrack.clientWidth, behavior: 'smooth' });
    }
  };

  thumbnails.forEach((button) => {
    button.addEventListener('click', () => updateGallerySelection(Number(button.dataset.productImageIndex), true));
  });

  if (imageTrack) {
    imageTrack.addEventListener('scroll', () => {
      if (!window.matchMedia('(max-width: 767px)').matches || scrollFrame) return;
      scrollFrame = window.requestAnimationFrame(() => {
        scrollFrame = 0;
        const index = Math.round(imageTrack.scrollLeft / Math.max(1, imageTrack.clientWidth));
        updateGallerySelection(index);
      });
    }, { passive: true });
  }

  const selectMainSize = (button) => {
    if (!button || !sizeOptions?.contains(button)) return;
    sizeOptions.querySelectorAll('[data-product-size]').forEach((item) => {
      const selected = item === button;
      item.classList.toggle('is-selected', selected);
      item.setAttribute('aria-pressed', String(selected));
    });
    if (sizeStatus) sizeStatus.textContent = `Size ${button.dataset.productSize} selected.`;
  };

  sizeOptions?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-product-size]');
    selectMainSize(button);
  });

  const addMainProduct = () => {
    const selected = sizeOptions?.querySelector('[data-product-size].is-selected');
    if (!selected) {
      if (sizeStatus) sizeStatus.textContent = 'Please choose a size to continue.';
      sizeOptions?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      sizeOptions?.querySelector('[data-product-size]')?.focus({ preventScroll: true });
      return;
    }

    if (typeof window.addToCart !== 'function') {
      if (sizeStatus) sizeStatus.textContent = 'Your bag is unavailable right now. Please refresh and try again.';
      return;
    }

    window.addToCart(product.id, selected.dataset.productSize);
    if (viewBag) viewBag.hidden = false;
    document.querySelectorAll('[data-product-add]').forEach((button) => {
      button.classList.add('is-added');
      button.textContent = button.id === 'productStickyAddButton'
        ? 'Added to bag'
        : `Added to bag · ₹${Number(product.launchPrice).toLocaleString('en-IN')}`;
      button.setAttribute('aria-label', `${product.name} added to bag`);
    });
    if (sizeStatus) sizeStatus.textContent = `${product.name}, size ${selected.dataset.productSize}, added to your bag.`;
  };

  document.querySelectorAll('[data-product-add]').forEach((button) => button.addEventListener('click', addMainProduct));

  const openRelatedSizeChoice = (productId) => {
    const selectedProduct = (window.GI_PRODUCT_CATALOG || []).find((item) => item.id === productId);
    if (!selectedProduct || !relatedModal || !relatedOptions || !relatedAddButton) return;
    activeRelatedProduct = selectedProduct;
    relatedOptions.replaceChildren();
    if (relatedStatus) relatedStatus.textContent = '';
    const title = document.getElementById('relatedSizeTitle');
    const category = document.getElementById('relatedSizeCategory');
    if (title) title.textContent = `Choose a size for ${selectedProduct.name}`;
    if (category) category.textContent = selectedProduct.categoryLabel || 'GI Apparel';

    selectedProduct.sizes.forEach((size) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'product-size-option';
      button.dataset.relatedSize = size;
      button.setAttribute('aria-pressed', 'false');
      button.textContent = size;
      relatedOptions.append(button);
    });
    relatedAddButton.disabled = true;
    relatedAddButton.textContent = `Add to bag · ₹${Number(selectedProduct.launchPrice).toLocaleString('en-IN')}`;
    relatedModal.hidden = false;
    document.body.classList.add('product-modal-open');
    relatedCloseButton?.focus();
  };

  window.openRelatedSizeChoice = openRelatedSizeChoice;

  relatedOptions?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-related-size]');
    if (!button) return;
    relatedOptions.querySelectorAll('[data-related-size]').forEach((option) => {
      const selected = option === button;
      option.classList.toggle('is-selected', selected);
      option.setAttribute('aria-pressed', String(selected));
    });
    if (relatedAddButton) relatedAddButton.disabled = false;
    if (relatedStatus) relatedStatus.textContent = `Size ${button.dataset.relatedSize} selected.`;
  });

  const closeRelatedSizeChoice = () => {
    if (!relatedModal) return;
    relatedModal.hidden = true;
    document.body.classList.remove('product-modal-open');
    activeRelatedProduct = null;
  };

  relatedCloseButton?.addEventListener('click', closeRelatedSizeChoice);
  relatedModal?.addEventListener('click', (event) => {
    if (event.target === relatedModal) closeRelatedSizeChoice();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && relatedModal && !relatedModal.hidden) closeRelatedSizeChoice();
  });

  relatedAddButton?.addEventListener('click', () => {
    const selected = relatedOptions?.querySelector('[data-related-size].is-selected');
    if (!activeRelatedProduct || !selected) {
      if (relatedStatus) relatedStatus.textContent = 'Choose a size to continue.';
      return;
    }
    if (typeof window.addToCart !== 'function') {
      if (relatedStatus) relatedStatus.textContent = 'Your bag is unavailable right now. Please refresh and try again.';
      return;
    }
    window.addToCart(activeRelatedProduct.id, selected.dataset.relatedSize);
    if (relatedStatus) relatedStatus.textContent = `${activeRelatedProduct.name} added to your bag.`;
    closeRelatedSizeChoice();
  });

  document.getElementById('cartTriggerBtn')?.addEventListener('click', (event) => {
    event.preventDefault();
    window.location.href = '/?openBag=1';
  });

  const relatedRail = document.getElementById('relatedProducts');
  document.getElementById('relatedPrevious')?.addEventListener('click', () => {
    relatedRail?.scrollBy({ left: -relatedRail.clientWidth * 0.8, behavior: 'smooth' });
  });
  document.getElementById('relatedNext')?.addEventListener('click', () => {
    relatedRail?.scrollBy({ left: relatedRail.clientWidth * 0.8, behavior: 'smooth' });
  });

  updateGallerySelection(0);
})();
