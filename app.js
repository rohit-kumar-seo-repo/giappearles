/**
 * ==========================================================================
 * GI APPAREL - CORE APPLICATION CONTROLLER (APP.JS)
 * Author: GI Apparel Web Engineering Team
 * 
 * Developer Guide:
 * This script handles all client-side interactions including:
 * 1. Product catalog rendering, live search, sorting & price range filtering.
 * 2. Interactive Size Guide Modal with live Inches ↔ CM conversion.
 * 3. Quick View Modal for product details & fabric specifications.
 * 4. Slide-Over Shopping Cart Drawer with real-time launch savings calculator.
 * 5. Checkout form connected to server-validated order and payment APIs.
 * 6. Order quote, payment status, and owner-notification feedback.
 * 7. Toast notification engine.
 * ==========================================================================
 */

// ==========================================================================
// 1. GLOBAL APP STATE
// ==========================================================================
const AppState = {
  currentCategory: 'all',          // 'all', 'dresses', 'coords', 'tops', 'bottoms'
  searchQuery: '',                 // Text search query
  sortBy: 'featured',              // 'featured', 'price-asc', 'price-desc', 'rating'
  priceFilter: 'all',              // 'all', 'under1000', '1000-1500', 'over1500'
  cart: [],                        // Array of cart items { product, size, quantity }
  activeSizeCategory: 'topKurti',  // 'topKurti', 'fittingPant', 'bottomSkirtsShorts'
  sizeUnit: 'inches',              // 'inches' | 'cm'
  quickViewProduct: null,          // Currently selected product object for Quick View modal
};

// ==========================================================================
// 2. DOM ELEMENT REFERENCES
// ==========================================================================
const DOM = {
  productsGrid: document.getElementById('productsGrid'),
  filterTabsContainer: document.getElementById('filterTabsContainer'),

  // Search, Sort & Multi-Filter Controls
  headerSearchBtn: document.getElementById('headerSearchBtn'),
  searchInput: document.getElementById('searchInput'),
  clearSearchBtn: document.getElementById('clearSearchBtn'),
  sortSelect: document.getElementById('sortSelect'),
  priceFilterGroup: document.getElementById('priceFilterGroup'),
  activeFiltersBar: document.getElementById('activeFiltersBar'),
  activeTagsWrap: document.getElementById('activeTagsWrap'),
  resetFiltersBtn: document.getElementById('resetFiltersBtn'),
  
  // Size Modal Elements
  sizeModal: document.getElementById('sizeModal'),
  sizeModalCloseBtn: document.getElementById('sizeModalCloseBtn'),
  sizeCatBtns: document.querySelectorAll('.size-cat-btn'),
  unitBtns: document.querySelectorAll('.unit-btn'),
  sizeTableHeader: document.getElementById('sizeTableHeader'),
  sizeTableBody: document.getElementById('sizeTableBody'),

  // Quick View Modal Elements
  quickViewModal: document.getElementById('quickViewModal'),
  quickViewCloseBtn: document.getElementById('quickViewCloseBtn'),
  quickViewContent: document.getElementById('quickViewContent'),
  returnPolicyModal: document.getElementById('returnPolicyModal'),

  // Cart Drawer Elements
  cartDrawer: document.getElementById('cartDrawerBackdrop'),
  cartDrawerCloseBtn: document.getElementById('cartDrawerCloseBtn'),
  cartTriggerBtn: document.getElementById('cartTriggerBtn'),
  cartCountBadge: document.getElementById('cartCountBadge'),
  cartItemsList: document.getElementById('cartItemsList'),
  cartSubtotalPrice: document.getElementById('cartSubtotalPrice'),
  cartSavingsPrice: document.getElementById('cartSavingsPrice'),
  cartTotalPrice: document.getElementById('cartTotalPrice'),
  checkoutBtn: document.getElementById('checkoutBtn'),

  // Checkout and Order Status Elements
  checkoutModal: document.getElementById('checkoutModal'),
  checkoutModalCloseBtn: document.getElementById('checkoutModalCloseBtn'),
  checkoutForm: document.getElementById('checkoutForm'),
  checkoutStatus: document.getElementById('checkoutStatus'),
  submitOrderBtn: document.getElementById('submitOrderBtn'),
  checkoutItemsTotal: document.getElementById('checkoutItemsTotal'),
  checkoutShippingTotal: document.getElementById('checkoutShippingTotal'),
  checkoutGrandTotal: document.getElementById('checkoutGrandTotal'),
  checkoutSuccess: document.getElementById('checkoutSuccess'),
  checkoutSuccessTitle: document.getElementById('checkoutSuccessTitle'),
  checkoutSuccessMessage: document.getElementById('checkoutSuccessMessage'),
  checkoutWhatsappLink: document.getElementById('checkoutWhatsappLink'),

  // Toast Container
  toastContainer: document.getElementById('toastContainer')
};

// ==========================================================================
// 3. INITIALIZATION & EVENT LISTENERS
// ==========================================================================
document.addEventListener('DOMContentLoaded', () => {
  initCatalog();
  initFeaturedCarousel();
  initLaunchOffer();
  initBrandMarquee();
  initCategoryFilters();
  initSearchAndFilters();
  initMobileNavigation();
  initStorefrontLinks();
  initSizeModal();
  initReturnPolicyModal();
  initShippingPolicyModal();
  initTermsModal();
  initCartDrawer();
  initQuickViewModal();
  initCheckoutModal();
  initModalAccessibility();
  console.log("✨ GI Apparel Web Application Initialized Successfully.");
});

function initMobileNavigation() {
  const toggle = document.getElementById('mobileNavToggle');
  const navigation = document.getElementById('siteNavigation');
  if (!toggle || !navigation) return;

  const closeMenu = () => {
    navigation.classList.remove('mobile-open');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-label', 'Open navigation menu');
  };

  toggle.addEventListener('click', () => {
    const isOpen = navigation.classList.toggle('mobile-open');
    toggle.setAttribute('aria-expanded', String(isOpen));
    toggle.setAttribute('aria-label', isOpen ? 'Close navigation menu' : 'Open navigation menu');
  });

  navigation.addEventListener('click', (event) => {
    if (event.target.closest('a')) closeMenu();
  });

  document.addEventListener('click', (event) => {
    if (!navigation.contains(event.target) && !toggle.contains(event.target)) closeMenu();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && navigation.classList.contains('mobile-open')) {
      closeMenu();
      toggle.focus();
    }
  });

  const desktopLayout = window.matchMedia('(min-width: 1025px)');
  const closeWhenDesktop = (event) => {
    if (event.matches) closeMenu();
  };
  if (typeof desktopLayout.addEventListener === 'function') {
    desktopLayout.addEventListener('change', closeWhenDesktop);
  } else {
    desktopLayout.addListener(closeWhenDesktop);
  }
}

function initStorefrontLinks() {
  document.querySelectorAll('[data-shop-category]').forEach((link) => {
    link.addEventListener('click', () => {
      const category = link.dataset.shopCategory;
      const filter = document.querySelector('.filter-tab[data-category="' + category + '"]');
      if (category === 'all') {
        resetAllFilters();
      } else if (filter) {
        filter.click();
      }
    });
  });
}

function initLaunchOffer() {
  const savingsLabel = document.getElementById('launchOfferSavings');
  const offerBar = savingsLabel?.closest('.launch-offer-bar');
  if (!savingsLabel || !offerBar || !Array.isArray(PRODUCTS_DATA)) return;

  const maximumSavings = PRODUCTS_DATA.reduce((maximum, product) => (
    Math.max(maximum, Number(product.displayPrice) - Number(product.launchPrice))
  ), 0);

  if (maximumSavings <= 0) {
    offerBar.hidden = true;
    return;
  }

  savingsLabel.textContent = `₹${maximumSavings.toLocaleString('en-IN')}`;
}

function initFeaturedCarousel() {
  const rail = document.getElementById('featuredRail');
  const previousButton = document.getElementById('featuredEditPrev');
  const nextButton = document.getElementById('featuredEditNext');
  const countLabel = document.getElementById('featuredEditCount');
  const section = rail?.closest('.featured-edit');
  if (!rail || !previousButton || !nextButton || !Array.isArray(PRODUCTS_DATA)) return;

  const featuredProducts = PRODUCTS_DATA.slice(0, 8);
  if (!featuredProducts.length) {
    section?.setAttribute('hidden', '');
    return;
  }

  rail.innerHTML = featuredProducts.map((product) => `
    <article class="featured-product" data-featured-product="${product.id}">
      <div class="featured-product-image-wrap">
        <span class="featured-product-badge ${product.isBundle ? 'is-bundle' : ''}">${product.badge}</span>
        <img src="${encodeURI(product.image)}" srcset="${encodeURI(product.image.replace('.jpg', '-480.jpg'))} 480w, ${encodeURI(product.image)} 900w" sizes="(max-width: 767px) 78vw, (max-width: 1024px) 40vw, 23vw" alt="${product.name}" loading="lazy" decoding="async" />
      </div>
      <div class="featured-product-info">
        <span class="featured-product-category">${product.categoryLabel}</span>
        <h3>${product.name}</h3>
        <div class="featured-product-prices">
          <strong>₹${product.launchPrice.toLocaleString('en-IN')}</strong>
          <s>₹${product.displayPrice.toLocaleString('en-IN')}</s>
          <span>Save ₹${(product.displayPrice - product.launchPrice).toLocaleString('en-IN')}</span>
        </div>
        <button class="featured-product-link" type="button" data-featured-open="${product.id}" aria-label="View details for ${product.name}">View details <span aria-hidden="true">↗</span></button>
      </div>
    </article>
  `).join('');

  const scrollRail = (direction) => {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    rail.scrollBy({ left: rail.clientWidth * direction * 0.85, behavior: reducedMotion ? 'auto' : 'smooth' });
  };

  const updateControls = () => {
    const atStart = rail.scrollLeft <= 2;
    const atEnd = rail.scrollLeft + rail.clientWidth >= rail.scrollWidth - 2;
    previousButton.disabled = atStart;
    nextButton.disabled = atEnd;

    if (countLabel) {
      const firstCard = rail.firstElementChild;
      const styles = window.getComputedStyle(rail);
      const gap = Number.parseFloat(styles.columnGap || styles.gap) || 0;
      const cardWidth = firstCard?.getBoundingClientRect().width || rail.clientWidth;
      const firstVisible = Math.min(featuredProducts.length, Math.floor((rail.scrollLeft + 2) / (cardWidth + gap)) + 1);
      countLabel.textContent = `${String(firstVisible).padStart(2, '0')} / ${String(featuredProducts.length).padStart(2, '0')}`;
    }
  };

  previousButton.addEventListener('click', () => scrollRail(-1));
  nextButton.addEventListener('click', () => scrollRail(1));
  rail.addEventListener('click', (event) => {
    const openButton = event.target.closest('[data-featured-open]');
    if (openButton) openQuickView(openButton.dataset.featuredOpen);
  });
  rail.addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    scrollRail(event.key === 'ArrowRight' ? 1 : -1);
  });

  let frame = 0;
  rail.addEventListener('scroll', () => {
    if (frame) cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      updateControls();
      frame = 0;
    });
  }, { passive: true });
  window.addEventListener('resize', updateControls, { passive: true });
  updateControls();
}

function initBrandMarquee() {
  const track = document.getElementById('brandMarqueeTrack');
  const toggle = document.getElementById('marqueeToggle');
  if (!track || !toggle) return;

  const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
  const syncMotionPreference = () => {
    if (motionPreference.matches) {
      track.classList.add('is-paused');
      toggle.hidden = true;
      toggle.setAttribute('aria-pressed', 'true');
    } else {
      toggle.hidden = false;
      toggle.setAttribute('aria-pressed', String(track.classList.contains('is-paused')));
    }
  };

  toggle.addEventListener('click', () => {
    const paused = track.classList.toggle('is-paused');
    toggle.setAttribute('aria-pressed', String(paused));
    toggle.setAttribute('aria-label', paused ? 'Play moving store details' : 'Pause moving store details');
  });

  if (typeof motionPreference.addEventListener === 'function') {
    motionPreference.addEventListener('change', syncMotionPreference);
  }
  syncMotionPreference();
}

function initModalAccessibility() {
  const containers = Array.from(document.querySelectorAll('.modal-backdrop, .cart-drawer-backdrop'));
  if (!containers.length) return;

  const focusableSelector = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
  let activeContainer = null;
  let returnFocus = null;

  const getDialog = (container) => container.querySelector('[role="dialog"]') || container;
  const getFocusable = (container) => {
    const dialog = getDialog(container);
    return Array.from(dialog.querySelectorAll(focusableSelector)).filter((element) => (
      !element.hasAttribute('hidden') && element.getClientRects().length > 0
    ));
  };

  const syncDialogs = () => {
    const openContainers = containers.filter((container) => container.classList.contains('active'));
    const nextContainer = openContainers[openContainers.length - 1] || null;

    containers.forEach((container) => {
      const isTopDialog = container === nextContainer;
      container.inert = !isTopDialog;
      container.setAttribute('aria-hidden', String(!isTopDialog));
    });

    document.body.style.overflow = nextContainer ? 'hidden' : '';

    if (nextContainer && nextContainer !== activeContainer) {
      if (!activeContainer) returnFocus = document.activeElement;
      activeContainer = nextContainer;
      const dialog = getDialog(nextContainer);
      dialog.setAttribute('tabindex', '-1');
      requestAnimationFrame(() => {
        if (activeContainer !== nextContainer) return;
        const firstFocusable = getFocusable(nextContainer)[0];
        (firstFocusable || dialog).focus({ preventScroll: true });
      });
    } else if (!nextContainer && activeContainer) {
      activeContainer = null;
      const previousFocus = returnFocus;
      returnFocus = null;
      if (previousFocus && previousFocus.isConnected) {
        previousFocus.focus({ preventScroll: true });
      }
    }
  };

  const observer = new MutationObserver(syncDialogs);
  containers.forEach((container) => {
    observer.observe(container, { attributes: true, attributeFilter: ['class'] });
  });

  document.addEventListener('keydown', (event) => {
    if (!activeContainer) return;

    if (event.key === 'Escape') {
      event.preventDefault();
      const closeButton = activeContainer.querySelector('[data-dialog-close], .modal-close-btn');
      if (closeButton) closeButton.click();
      else activeContainer.classList.remove('active');
      return;
    }

    if (event.key !== 'Tab') return;
    const focusable = getFocusable(activeContainer);
    if (!focusable.length) {
      event.preventDefault();
      getDialog(activeContainer).focus();
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && (document.activeElement === first || !activeContainer.contains(document.activeElement))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (document.activeElement === last || !activeContainer.contains(document.activeElement))) {
      event.preventDefault();
      first.focus();
    }
  });

  syncDialogs();
}

// ==========================================================================
// 4. CATALOG RENDERER, SEARCH, SORT & MULTI-FILTER MODULE
// ==========================================================================
function initCatalog() {
  renderProducts();
}

/**
 * Filter tabs click handler
 */
function initCategoryFilters() {
  if (!DOM.filterTabsContainer) return;
  DOM.filterTabsContainer.addEventListener('click', (e) => {
    const tabBtn = e.target.closest('.filter-tab');
    if (!tabBtn) return;

    // Update active class
    document.querySelectorAll('.filter-tab').forEach(b => b.classList.remove('active'));
    tabBtn.classList.add('active');

    // Filter products
    const category = tabBtn.getAttribute('data-category');
    AppState.currentCategory = category;
    renderProducts();
  });
}

/**
 * Initialize live search, sorting, and price range filters
 */
function initSearchAndFilters() {
  if (DOM.headerSearchBtn && DOM.searchInput) {
    DOM.headerSearchBtn.addEventListener('click', () => {
      DOM.searchInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
      DOM.searchInput.focus({ preventScroll: true });
    });
  }

  if (DOM.searchInput) {
    DOM.searchInput.addEventListener('input', (e) => {
      AppState.searchQuery = e.target.value.trim().toLowerCase();
      if (DOM.clearSearchBtn) {
        DOM.clearSearchBtn.style.display = AppState.searchQuery ? 'block' : 'none';
      }
      renderProducts();
    });
  }

  if (DOM.clearSearchBtn) {
    DOM.clearSearchBtn.addEventListener('click', () => {
      AppState.searchQuery = '';
      if (DOM.searchInput) DOM.searchInput.value = '';
      DOM.clearSearchBtn.style.display = 'none';
      renderProducts();
    });
  }

  if (DOM.sortSelect) {
    DOM.sortSelect.addEventListener('change', (e) => {
      AppState.sortBy = e.target.value;
      renderProducts();
    });
  }

  if (DOM.priceFilterGroup) {
    DOM.priceFilterGroup.addEventListener('click', (e) => {
      const chip = e.target.closest('.price-chip');
      if (!chip) return;
      document.querySelectorAll('.price-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      AppState.priceFilter = chip.getAttribute('data-price');
      renderProducts();
    });
  }

  if (DOM.resetFiltersBtn) {
    DOM.resetFiltersBtn.addEventListener('click', resetAllFilters);
  }

  // Filter Modal Toggle Logic
  const filterToggleBtn = document.getElementById('filterToggleBtn');
  const filterModal = document.getElementById('filterModal');
  const filterModalCloseBtn = document.getElementById('filterModalCloseBtn');

  if (filterToggleBtn && filterModal) {
    filterToggleBtn.addEventListener('click', () => filterModal.classList.add('active'));
  }
  
  if (filterModalCloseBtn && filterModal) {
    filterModalCloseBtn.addEventListener('click', () => filterModal.classList.remove('active'));
  }

  // Close filter modal if clicked outside of the content
  if (filterModal) {
    filterModal.addEventListener('click', (e) => {
      if (e.target === filterModal) filterModal.classList.remove('active');
    });
  }
}

/**
 * Reset all active catalog filters
 */
function resetAllFilters() {
  AppState.currentCategory = 'all';
  AppState.searchQuery = '';
  AppState.sortBy = 'featured';
  AppState.priceFilter = 'all';

  if (DOM.searchInput) DOM.searchInput.value = '';
  if (DOM.clearSearchBtn) DOM.clearSearchBtn.style.display = 'none';
  if (DOM.sortSelect) DOM.sortSelect.value = 'featured';

  document.querySelectorAll('.filter-tab').forEach(b => {
    b.classList.toggle('active', b.getAttribute('data-category') === 'all');
  });

  document.querySelectorAll('.price-chip').forEach(b => {
    b.classList.toggle('active', b.getAttribute('data-price') === 'all');
  });

  renderProducts();
}

/**
 * Render products array into DOM grid with category, search, price & sort logic
 */
function renderProducts() {
  if (!DOM.productsGrid) return;

  let list = PRODUCTS_DATA.slice();

  // 1. Category Filter
  if (AppState.currentCategory !== 'all') {
    list = list.filter(p => p.category === AppState.currentCategory);
  }

  // 2. Search Query Filter
  if (AppState.searchQuery) {
    const q = AppState.searchQuery;
    list = list.filter(p => {
      const matchName = p.name.toLowerCase().includes(q);
      const matchCategory = p.categoryLabel.toLowerCase().includes(q);
      const matchDesc = p.description.toLowerCase().includes(q);
      const matchDetails = p.details ? p.details.some(d => d.toLowerCase().includes(q)) : false;
      return matchName || matchCategory || matchDesc || matchDetails;
    });
  }

  // 3. Price Range Filter
  if (AppState.priceFilter === 'under1000') {
    list = list.filter(p => p.launchPrice < 1000);
  } else if (AppState.priceFilter === '1000-1500') {
    list = list.filter(p => p.launchPrice >= 1000 && p.launchPrice <= 1500);
  } else if (AppState.priceFilter === 'over1500') {
    list = list.filter(p => p.launchPrice > 1500);
  }

  // 4. Sorting
  if (AppState.sortBy === 'price-asc') {
    list.sort((a, b) => a.launchPrice - b.launchPrice);
  } else if (AppState.sortBy === 'price-desc') {
    list.sort((a, b) => b.launchPrice - a.launchPrice);
  }

  // 5. Update Active Filter Badges UI
  updateActiveFiltersUI();

  // 6. Empty State Handling
  if (list.length === 0) {
    DOM.productsGrid.innerHTML = `
      <div class="catalog-empty-state">
        <div class="empty-icon">🔍</div>
        <h3>No Matching Collection Pieces Found</h3>
        <p>We couldn't find any products matching your active search query or price filter.</p>
        <button class="btn-secondary" onclick="resetAllFilters()">Reset All Filters 🔄</button>
      </div>
    `;
    return;
  }

  // 7. Render Product Cards Grid
  DOM.productsGrid.innerHTML = list.map(product => `
    <article class="product-card" data-product-id="${product.id}">
      <div class="product-image-wrap">
        <span class="badge-launch ${product.isBundle ? 'badge-bundle' : ''}">${product.badge}</span>
        <img src="${product.image}" srcset="${encodeURI(product.image.replace('.jpg', '-480.jpg'))} 480w, ${encodeURI(product.image)} 900w" sizes="(max-width: 767px) 50vw, (max-width: 1024px) 33vw, 25vw" alt="${product.name}" class="product-image" loading="lazy" decoding="async" />
        <div class="quick-actions-overlay">
          <button class="btn-quick-action" type="button" aria-label="View details for ${product.name}" onclick="openQuickView('${product.id}')">View Details</button>
        </div>
      </div>
      
      <div class="product-info">
        <span class="product-category-tag">${product.categoryLabel}</span>
        <h3 class="product-name"><button class="product-name-button" type="button" aria-label="View details for ${product.name}" onclick="openQuickView('${product.id}')">${product.name}</button></h3>
        
        <div class="product-price-row" style="margin-bottom: 0;">
          <span class="launch-price">₹${product.launchPrice.toLocaleString()}</span>
          <span class="display-price">₹${product.displayPrice.toLocaleString()}</span>
          <span class="save-pill">SAVE ₹${product.savings}</span>
        </div>
      </div>
    </article>
  `).join('');
}

/**
 * Render active filter badges bar
 */
function updateActiveFiltersUI() {
  if (!DOM.activeFiltersBar || !DOM.activeTagsWrap) return;
  const tags = [];

  if (AppState.currentCategory !== 'all') {
    const catLabel = AppState.currentCategory.toUpperCase();
    tags.push(`<span class="active-filter-badge">Category: ${catLabel} <button onclick="setCategoryFilter('all')">✕</button></span>`);
  }

  if (AppState.searchQuery) {
    tags.push(`<span class="active-filter-badge">Search: "${AppState.searchQuery}" <button onclick="clearSearchFilter()">✕</button></span>`);
  }

  if (AppState.priceFilter !== 'all') {
    let pText = AppState.priceFilter;
    if (pText === 'under1000') pText = 'Under ₹1k';
    if (pText === '1000-1500') pText = '₹1k - ₹1.5k';
    if (pText === 'over1500') pText = '₹1.5k+';
    tags.push(`<span class="active-filter-badge">Price: ${pText} <button onclick="setPriceFilter('all')">✕</button></span>`);
  }

  if (AppState.sortBy !== 'featured') {
    let sText = AppState.sortBy;
    if (sText === 'price-asc') sText = 'Price: Low to High';
    if (sText === 'price-desc') sText = 'Price: High to Low';
    tags.push(`<span class="active-filter-badge">Sort: ${sText} <button onclick="setSortOption('featured')">✕</button></span>`);
  }

  if (tags.length > 0) {
    DOM.activeTagsWrap.innerHTML = tags.join('');
    DOM.activeFiltersBar.style.display = 'flex';
  } else {
    DOM.activeFiltersBar.style.display = 'none';
  }
}

function setCategoryFilter(cat) {
  AppState.currentCategory = cat;
  document.querySelectorAll('.filter-tab').forEach(b => {
    b.classList.toggle('active', b.getAttribute('data-category') === cat);
  });
  renderProducts();
}

function clearSearchFilter() {
  AppState.searchQuery = '';
  if (DOM.searchInput) DOM.searchInput.value = '';
  if (DOM.clearSearchBtn) DOM.clearSearchBtn.style.display = 'none';
  renderProducts();
}

function setPriceFilter(pf) {
  AppState.priceFilter = pf;
  document.querySelectorAll('.price-chip').forEach(b => {
    b.classList.toggle('active', b.getAttribute('data-price') === pf);
  });
  renderProducts();
}

function setSortOption(sortVal) {
  AppState.sortBy = sortVal;
  if (DOM.sortSelect) DOM.sortSelect.value = sortVal;
  renderProducts();
}

function selectProductCardSize(chipBtn, productId, size) {
  const parent = chipBtn.closest('.product-size-picker');
  parent.querySelectorAll('.size-chip').forEach(c => c.classList.remove('selected'));
  chipBtn.classList.add('selected');
}

// ==========================================================================
// 5. INTERACTIVE SIZE GUIDE MODAL MODULE (PDF 1 SIZING SPECS)
// ==========================================================================
function initSizeModal() {
  document.querySelectorAll('.trigger-size-guide').forEach(btn => {
    btn.addEventListener('click', () => openSizeModal());
  });

  if (DOM.sizeModalCloseBtn) {
    DOM.sizeModalCloseBtn.addEventListener('click', () => closeSizeModal());
  }

  if (DOM.sizeModal) {
    DOM.sizeModal.addEventListener('click', (e) => {
      if (e.target === DOM.sizeModal) closeSizeModal();
    });
  }

  DOM.sizeCatBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      DOM.sizeCatBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      AppState.activeSizeCategory = btn.getAttribute('data-cat');
      renderSizeTable();
    });
  });

  DOM.unitBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      DOM.unitBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      AppState.sizeUnit = btn.getAttribute('data-unit');
      renderSizeTable();
      showToast(`Sizing unit updated to ${AppState.sizeUnit.toUpperCase()}`);
    });
  });
}

function openSizeModal(defaultCategory = 'topKurti') {
  AppState.activeSizeCategory = defaultCategory;
  DOM.sizeCatBtns.forEach(b => {
    b.classList.toggle('active', b.getAttribute('data-cat') === defaultCategory);
  });

  renderSizeTable();
  if (DOM.sizeModal) DOM.sizeModal.classList.add('active');
}

function closeSizeModal() {
  if (DOM.sizeModal) DOM.sizeModal.classList.remove('active');
}

function initReturnPolicyModal() {
  const policyModal = document.getElementById('returnPolicyModal');
  const closeButton = document.getElementById('returnPolicyCloseBtn');

  document.querySelectorAll('.trigger-return-policy').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      if (policyModal) policyModal.classList.add('active');
    });
  });

  if (closeButton && policyModal) {
    closeButton.addEventListener('click', () => policyModal.classList.remove('active'));
    policyModal.addEventListener('click', (e) => {
      if (e.target === policyModal) policyModal.classList.remove('active');
    });
  }
}

function initShippingPolicyModal() {
  const shippingModal = document.getElementById('shippingPolicyModal');
  const closeButton = document.getElementById('shippingPolicyCloseBtn');

  document.querySelectorAll('.trigger-shipping-policy').forEach((link) => {
    link.addEventListener('click', (event) => {
      event.preventDefault();
      if (shippingModal) shippingModal.classList.add('active');
    });
  });

  if (closeButton && shippingModal) {
    closeButton.addEventListener('click', () => shippingModal.classList.remove('active'));
    shippingModal.addEventListener('click', (event) => {
      if (event.target === shippingModal) shippingModal.classList.remove('active');
    });
  }
}

function initTermsModal() {
  const termsModal = document.getElementById('termsModal');
  const closeButton = document.getElementById('termsCloseBtn');

  document.querySelectorAll('.trigger-terms').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      if (termsModal) termsModal.classList.add('active');
    });
  });

  if (closeButton && termsModal) {
    closeButton.addEventListener('click', () => termsModal.classList.remove('active'));
    termsModal.addEventListener('click', (e) => {
      if (e.target === termsModal) termsModal.classList.remove('active');
    });
  }
}

function renderSizeTable() {
  const chartData = SIZE_CHART_DATA[AppState.activeSizeCategory];
  if (!chartData) return;

  const unit = AppState.sizeUnit;
  const rows = chartData[unit];
  const unitLabel = unit === 'inches' ? 'Inches (in)' : 'Centimeters (cm)';

  if (AppState.activeSizeCategory === 'topKurti') {
    DOM.sizeTableHeader.innerHTML = `
      <tr>
        <th>Size</th>
        <th>Bust (${unitLabel})</th>
        <th>Waist (${unitLabel})</th>
        <th>Hip (${unitLabel})</th>
      </tr>
    `;
    DOM.sizeTableBody.innerHTML = rows.map(r => `
      <tr>
        <td>${r.size}</td>
        <td>${r.bust}</td>
        <td>${r.waist}</td>
        <td>${r.hip}</td>
      </tr>
    `).join('');
  } else {
    DOM.sizeTableHeader.innerHTML = `
      <tr>
        <th>Size</th>
        <th>Waist (${unitLabel})</th>
        <th>Hip (${unitLabel})</th>
        <th>Length (${unitLabel})</th>
      </tr>
    `;
    DOM.sizeTableBody.innerHTML = rows.map(r => `
      <tr>
        <td>${r.size}</td>
        <td>${r.waist}</td>
        <td>${r.hip}</td>
        <td>${r.length}</td>
      </tr>
    `).join('');
  }
}

// ==========================================================================
// 6. QUICK VIEW MODAL MODULE
// ==========================================================================
function initQuickViewModal() {
  if (DOM.quickViewCloseBtn) {
    DOM.quickViewCloseBtn.addEventListener('click', closeQuickView);
  }
  if (DOM.quickViewModal) {
    DOM.quickViewModal.addEventListener('click', (e) => {
      if (e.target === DOM.quickViewModal) closeQuickView();
    });
  }
  if (DOM.quickViewContent) {
    DOM.quickViewContent.addEventListener('click', (event) => {
      const exchangePolicyLink = event.target.closest('[data-open-return-policy]');
      if (exchangePolicyLink) {
        event.preventDefault();
        closeQuickView();
        DOM.returnPolicyModal?.classList.add('active');
        return;
      }

      const sizeButton = event.target.closest('[data-product-size]');
      if (sizeButton) {
        DOM.quickViewContent.querySelectorAll('[data-product-size]').forEach((button) => {
          const isSelected = button === sizeButton;
          button.classList.toggle('selected', isSelected);
          button.setAttribute('aria-pressed', String(isSelected));
        });
        window.__giSelectedSize = sizeButton.dataset.productSize;
        const addButton = DOM.quickViewContent.querySelector('.quick-view-add-to-cart');
        if (addButton) addButton.disabled = false;
      }

      const addButton = event.target.closest('.quick-view-add-to-cart');
      if (addButton && !addButton.disabled && AppState.quickViewProduct) {
        addToCart(AppState.quickViewProduct.id, window.__giSelectedSize);
        closeQuickView();
      }
    });
  }
}

function openQuickView(productId) {
  const product = PRODUCTS_DATA.find(p => p.id === productId);
  if (!product) return;

  AppState.quickViewProduct = product;
  window.__giSelectedSize = null;
  DOM.quickViewContent.scrollTop = 0;

  const galleryImages = [product.image, product.secondaryImage, ...(product.additionalImages || [])].filter(Boolean);

  DOM.quickViewContent.innerHTML = `
    <div class="quick-view-layout" style="display: grid; grid-template-columns: 1.1fr 1fr; gap: 2.5rem; align-items: start;">
      <div class="quick-view-gallery" style="display: flex; flex-direction: column; gap: 1rem;">
        <div class="quick-view-main-image" style="border-radius: var(--radius-md); overflow: hidden; max-height: 80vh; text-align: center; background: rgba(255,255,255,0.02); border: 1px solid var(--color-border);">
          <img class="quick-view-main-photo" src="${galleryImages[0]}" alt="${product.name}" decoding="async" style="width: 100%; height: auto; max-height: 78vh; object-fit: contain; display: block; margin: 0 auto;" />
        </div>
        ${galleryImages.length > 1 ? `
          <div class="quick-view-thumbnails" style="display: flex; gap: 0.75rem; justify-content: center; flex-wrap: wrap;">
            ${galleryImages.map((img, idx) => `
              <img src="${img}" alt="${product.name} view ${idx + 1}" loading="lazy" decoding="async" style="width: 72px; height: 92px; object-fit: cover; border-radius: 8px; border: 1px solid var(--color-border); background: rgba(255,255,255,0.04); cursor: pointer;" onclick="this.parentElement.previousElementSibling.querySelector('img').src='${img}'" />
            `).join('')}
          </div>
        ` : ''}
      </div>
      <div class="quick-view-details" style="display: flex; flex-direction: column; min-width: 0;">
        <span class="product-category-tag" style="font-size: 0.85rem;">${product.categoryLabel}</span>
        <h2 class="quick-view-title" id="quickViewTitle" style="font-family: var(--font-serif); font-size: 2.2rem; margin-bottom: 0.5rem; color: var(--color-accent-maroon);">${product.name}</h2>
        
        <div class="product-price-row quick-view-price-row" style="margin-bottom: 1.5rem; align-items: baseline;">
          <span class="launch-price" style="font-size: 1.8rem; color: var(--color-accent-maroon);">₹${product.launchPrice.toLocaleString()}</span>
          <span class="display-price" style="font-size: 1.2rem; margin-left: 0.5rem;">₹${product.displayPrice.toLocaleString()}</span>
          <span class="save-pill" style="margin-left: 1rem; padding: 4px 10px; font-size: 0.8rem;">SAVE ₹${product.savings}</span>
        </div>

        <div class="quick-view-description" style="margin-bottom: 2rem; background: rgba(255,255,255,0.02); padding: 1.5rem; border-radius: var(--radius-md); border: 1px solid var(--color-border);">
          <h4 style="font-weight: 700; margin-bottom: 1rem; font-size: 0.9rem; text-transform: uppercase; letter-spacing: 0.1em; color: var(--color-accent-maroon);">The Details</h4>
          <ul style="padding-left: 1.25rem; font-size: 0.9rem; color: var(--color-text-muted); line-height: 1.8;">
            ${product.details.map(d => `<li>${d}</li>`).join('')}
          </ul>
        </div>

        <div class="quick-view-size-row" style="margin-bottom: 2rem;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem;">
            <label style="font-weight: 600; font-size: 0.9rem; color: var(--color-accent-maroon);">Select Size:</label>
            <button class="trigger-size-guide quick-view-size-guide" type="button" onclick="closeQuickView(); openSizeModal();">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 16 12-12 4 4L8 20H4v-4Z"/><path d="m13 7 4 4M10 10l2 2M7 13l2 2"/></svg>
              View Size Guide
            </button>
          </div>
          <div class="quick-view-size-options" role="group" aria-label="Choose a size">
            ${product.sizes.map(size => `
              <button class="size-chip" type="button" data-product-size="${size}" aria-pressed="false">${size}</button>
            `).join('')}
          </div>
          <p class="size-selection-hint" aria-live="polite">Choose a size to continue.</p>
        </div>

        <div class="product-delivery-note">
          <span class="delivery-note-item"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v18M5 8h10a3 3 0 1 0 0-6H8a3 3 0 0 0 0 6h8a3 3 0 1 1 0 8H5"/></svg>Made to order · dispatched in 10–12 working days</span>
          <span class="delivery-note-item"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7h18v13H3zM3 11h18M7 16h4"/><path d="M7 4h10"/></svg>₹150 flat shipping · shown in checkout</span>
          <a href="#return-policy" data-open-return-policy>One size exchange per order · see terms</a>
          <a href="https://wa.me/919536429777" target="_blank" rel="noopener noreferrer">Need sizing help? Message us</a>
        </div>

        <button class="btn-place-order quick-view-add-to-cart" type="button" disabled style="margin-top: auto; padding: 1.25rem;">
          ADD TO BAG · ₹${product.launchPrice.toLocaleString()}
        </button>
      </div>
    </div>
  `;

  DOM.quickViewModal.setAttribute('aria-labelledby', 'quickViewTitle');
  DOM.quickViewModal.classList.add('active');
}

function closeQuickView() {
  if (DOM.quickViewModal) DOM.quickViewModal.classList.remove('active');
}

// ==========================================================================
// 7. SLIDE-OVER SHOPPING CART DRAWER MODULE
// ==========================================================================
function initCartDrawer() {
  if (DOM.cartTriggerBtn) {
    DOM.cartTriggerBtn.addEventListener('click', openCartDrawer);
  }
  if (DOM.cartDrawerCloseBtn) {
    DOM.cartDrawerCloseBtn.addEventListener('click', closeCartDrawer);
  }
  if (DOM.cartDrawer) {
    DOM.cartDrawer.addEventListener('click', (e) => {
      if (e.target === DOM.cartDrawer) closeCartDrawer();
    });
  }
  if (DOM.checkoutBtn) {
    DOM.checkoutBtn.addEventListener('click', openCheckoutModal);
  }
}

function openCartDrawer() {
  if (DOM.cartDrawer) DOM.cartDrawer.classList.add('active');
}

function closeCartDrawer() {
  if (DOM.cartDrawer) DOM.cartDrawer.classList.remove('active');
}

function quickAddToCart(productId) {
  const card = document.querySelector(`[data-product-id="${productId}"]`);
  const selectedSizeChip = card ? card.querySelector('.size-chip.selected') : null;
  if (!selectedSizeChip) {
    openQuickView(productId);
    return;
  }
  addToCart(productId, selectedSizeChip.innerText);
}

function addToCart(productId, size) {
  const product = PRODUCTS_DATA.find(p => p.id === productId);
  if (!product) return;
  if (!size) {
    showToast('Choose a size before adding this piece to your bag.');
    return;
  }

  const existing = AppState.cart.find(item => item.product.id === productId && item.size === size);

  if (existing) {
    existing.quantity += 1;
  } else {
    AppState.cart.push({
      product,
      size,
      quantity: 1
    });
  }

  updateCartUI();
  openCartDrawer();
  showToast(`Added ${product.name} (${size}) to your bag! ✨`);
}

function updateCartQty(productId, size, change) {
  const itemIndex = AppState.cart.findIndex(i => i.product.id === productId && i.size === size);
  if (itemIndex > -1) {
    if (change > 0 && AppState.cart[itemIndex].quantity >= 10) {
      showToast('The maximum quantity for one product and size is 10.');
      return;
    }
    AppState.cart[itemIndex].quantity += change;
    if (AppState.cart[itemIndex].quantity <= 0) {
      AppState.cart.splice(itemIndex, 1);
    }
  }
  updateCartUI();
}

function updateCartUI() {
  const totalItems = AppState.cart.reduce((sum, item) => sum + item.quantity, 0);
  if (DOM.cartCountBadge) DOM.cartCountBadge.innerText = totalItems;

  if (AppState.cart.length === 0) {
    if (DOM.cartItemsList) {
      DOM.cartItemsList.innerHTML = `
        <div class="empty-cart-state">
          <div class="empty-cart-icon">🛍️</div>
          <h4>Your Shopping Bag is Empty</h4>
          <p style="font-size: 0.875rem; margin-top: 0.5rem;">Explore our launch collection and elevate your summer wardrobe.</p>
        </div>
      `;
    }
    if (DOM.cartSubtotalPrice) DOM.cartSubtotalPrice.innerText = '₹0';
    if (DOM.cartSavingsPrice) DOM.cartSavingsPrice.innerText = '₹0';
    if (DOM.cartTotalPrice) DOM.cartTotalPrice.innerText = '₹0';
    return;
  }

  let subtotalLaunch = 0;
  let subtotalDisplay = 0;

  if (DOM.cartItemsList) {
    DOM.cartItemsList.innerHTML = AppState.cart.map(item => {
      const itemLaunchTotal = item.product.launchPrice * item.quantity;
      const itemDisplayTotal = item.product.displayPrice * item.quantity;
      subtotalLaunch += itemLaunchTotal;
      subtotalDisplay += itemDisplayTotal;

      return `
        <div class="cart-item">
          <img src="${item.product.image}" alt="${item.product.name}" class="cart-item-img" loading="lazy" decoding="async" />
          <div class="cart-item-details">
            <h4 class="cart-item-name">${item.product.name}</h4>
            <span class="cart-item-meta">Size: ${item.size} • Launch Promo</span>
            
            <div class="cart-item-price-row">
              <span style="font-weight: 700; color: var(--color-accent-maroon);">₹${itemLaunchTotal.toLocaleString()}</span>
              
              <div class="cart-item-qty">
                <button class="qty-btn" onclick="updateCartQty('${item.product.id}', '${item.size}', -1)">-</button>
                <span class="qty-val">${item.quantity}</span>
                <button class="qty-btn" onclick="updateCartQty('${item.product.id}', '${item.size}', 1)">+</button>
              </div>
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  const savingsTotal = subtotalDisplay - subtotalLaunch;

  if (DOM.cartSubtotalPrice) DOM.cartSubtotalPrice.innerText = `₹${subtotalDisplay.toLocaleString()}`;
  if (DOM.cartSavingsPrice) DOM.cartSavingsPrice.innerText = `-₹${savingsTotal.toLocaleString()}`;
  if (DOM.cartTotalPrice) DOM.cartTotalPrice.innerText = `₹${subtotalLaunch.toLocaleString()}`;
}

// ==========================================================================
// 8. SERVER-BACKED CHECKOUT MODULE
// ==========================================================================
function initCheckoutModal() {
  if (DOM.checkoutModalCloseBtn) {
    DOM.checkoutModalCloseBtn.addEventListener('click', closeCheckoutModal);
  }

  if (DOM.checkoutModal) {
    DOM.checkoutModal.addEventListener('click', (e) => {
      if (e.target === DOM.checkoutModal) closeCheckoutModal();
    });
  }

  if (DOM.checkoutForm) {
    DOM.checkoutForm.addEventListener('submit', submitOrder);
    DOM.checkoutForm.querySelectorAll('input[name="paymentMethod"]').forEach((input) => {
      input.addEventListener('change', () => {
        DOM.checkoutForm.querySelectorAll('.payment-card').forEach((card) => {
          card.classList.toggle('active', card.contains(input) && input.checked);
        });
        updateSubmitOrderLabel();
      });
    });
  }
}

async function openCheckoutModal() {
  if (AppState.cart.length === 0) {
    showToast("Your shopping bag is empty! Add items to proceed.");
    return;
  }
  closeCartDrawer();
  if (DOM.checkoutForm) DOM.checkoutForm.hidden = false;
  if (DOM.checkoutSuccess) DOM.checkoutSuccess.hidden = true;
  setCheckoutStatus('', '');
  if (DOM.checkoutModal) DOM.checkoutModal.classList.add('active');
  document.body.style.overflow = 'hidden';
  updateSubmitOrderLabel();
  try {
    await window.GIAccount?.ready;
    await window.GIAccount?.populateCheckout();
  } catch (error) {
    setCheckoutStatus('error', `We could not load your saved account details. You can still enter them manually. ${error.message}`);
  }
  refreshCheckoutQuote();
}

function closeCheckoutModal() {
  if (DOM.checkoutModal) DOM.checkoutModal.classList.remove('active');
  document.body.style.overflow = '';
}

function getCheckoutItems() {
  return AppState.cart.map((item) => ({
    id: item.product.id,
    size: item.size,
    quantity: item.quantity
  }));
}

function formatCheckoutMoney(paise) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  }).format(paise / 100);
}

async function requestOrderApi(payload) {
  const headers = { 'Content-Type': 'application/json' };
  if (payload.action !== 'quote' && window.GIAccount) {
    const token = await window.GIAccount.getAccessToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  const response = await fetch('/api/orders', {
    method: 'POST',
    headers,
    body: JSON.stringify(payload)
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'Checkout is temporarily unavailable.');
  return result;
}

async function refreshCheckoutQuote() {
  if (!DOM.checkoutItemsTotal || AppState.cart.length === 0) return;
  DOM.submitOrderBtn.disabled = true;
  DOM.checkoutItemsTotal.innerText = 'Calculating…';
  DOM.checkoutShippingTotal.innerText = '—';
  DOM.checkoutGrandTotal.innerText = '—';
  try {
    const quote = await requestOrderApi({
      action: 'quote',
      items: getCheckoutItems()
    });
    DOM.checkoutItemsTotal.innerText = formatCheckoutMoney(quote.itemSubtotalPaise);
    DOM.checkoutShippingTotal.innerText = formatCheckoutMoney(quote.shippingPaise);
    DOM.checkoutGrandTotal.innerText = formatCheckoutMoney(quote.totalPaise);
    DOM.submitOrderBtn.disabled = false;
    setCheckoutStatus('', '');
  } catch (error) {
    DOM.checkoutItemsTotal.innerText = 'Unavailable';
    DOM.checkoutShippingTotal.innerText = '—';
    DOM.checkoutGrandTotal.innerText = '—';
    setCheckoutStatus('error', `${error.message} Please try again later or contact GI Apparel on WhatsApp.`);
  }
}

function selectedPaymentMethod() {
  return DOM.checkoutForm?.querySelector('input[name="paymentMethod"]:checked')?.value || 'offline';
}

function updateSubmitOrderLabel() {
  if (!DOM.submitOrderBtn) return;
  DOM.submitOrderBtn.innerText = selectedPaymentMethod() === 'razorpay'
    ? 'Continue to secure payment'
    : 'Submit order request';
}

function setCheckoutStatus(type, message) {
  if (!DOM.checkoutStatus) return;
  DOM.checkoutStatus.dataset.type = type;
  DOM.checkoutStatus.innerText = message;
}

function showCheckoutSuccess(title, message, orderNumber) {
  if (DOM.checkoutForm) DOM.checkoutForm.hidden = true;
  if (DOM.checkoutSuccess) DOM.checkoutSuccess.hidden = false;
  if (DOM.checkoutSuccessTitle) DOM.checkoutSuccessTitle.innerText = title;
  if (DOM.checkoutSuccessMessage) {
    DOM.checkoutSuccessMessage.innerText = orderNumber
      ? `${message} Reference: ${orderNumber}.`
      : message;
  }
  if (DOM.checkoutWhatsappLink) {
    const text = orderNumber ? `Hello GI Apparel, I need help with order ${orderNumber}.` : 'Hello GI Apparel, I need help with my order.';
    DOM.checkoutWhatsappLink.href = `https://wa.me/919536429777?text=${encodeURIComponent(text)}`;
  }
  AppState.cart = [];
  updateCartUI();
}

function getCheckoutCustomer(formData) {
  return {
    name: formData.get('name'),
    email: formData.get('email'),
    phone: formData.get('phone'),
    addressLine1: formData.get('addressLine1'),
    addressLine2: formData.get('addressLine2'),
    city: formData.get('city'),
    state: formData.get('state'),
    postalCode: formData.get('postalCode')
  };
}

async function loadRazorpayCheckout() {
  if (window.Razorpay) return;
  if (!window.__giRazorpayScriptPromise) {
    window.__giRazorpayScriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.async = true;
      script.onload = resolve;
      script.onerror = () => reject(new Error('Secure payment could not be loaded. No order or payment was created.'));
      document.head.appendChild(script);
    });
  }
  await window.__giRazorpayScriptPromise;
}

async function submitOrder(event) {
  event.preventDefault();
  if (!DOM.checkoutForm || !DOM.submitOrderBtn || !DOM.checkoutForm.reportValidity()) return;
  if (AppState.cart.length === 0) {
    setCheckoutStatus('error', 'Your bag is empty. Add an item before placing an order.');
    return;
  }

  const button = DOM.submitOrderBtn;
  button.disabled = true;
  button.setAttribute('aria-busy', 'true');
  const formData = new FormData(DOM.checkoutForm);
  try {
    const paymentMethod = selectedPaymentMethod();
    if (paymentMethod === 'razorpay') await loadRazorpayCheckout();
    const customer = getCheckoutCustomer(formData);
    await window.GIAccount?.saveCheckoutAddress(customer);

    const order = await requestOrderApi({
      items: getCheckoutItems(),
      customer,
      paymentMethod,
      website: formData.get('website')
    });

    if (paymentMethod === 'offline') {
      if (order.ownerNotification === 'sent') {
        showCheckoutSuccess(
          'Order request received',
          'Your order request has been saved and GI Apparel has been emailed. The team will confirm availability and payment arrangements using your contact details.',
          order.orderNumber
        );
      } else {
        showCheckoutSuccess(
          'Order request saved — please contact us',
          'Your request is recorded, but the owner email alert could not be sent. Please message GI Apparel on WhatsApp so the team can confirm your order.',
          order.orderNumber
        );
      }
      return;
    }

    const payment = new window.Razorpay({
      key: order.razorpayKeyId,
      amount: order.amountPaise,
      currency: order.currency,
      name: 'GI Apparel',
      description: `Made-to-order purchase ${order.orderNumber}`,
      order_id: order.razorpayOrderId,
      prefill: {
        name: formData.get('name'),
        email: formData.get('email'),
        contact: formData.get('phone')
      },
      theme: { color: '#6b1f2d' },
      handler: async (paymentResponse) => {
        button.disabled = true;
        setCheckoutStatus('', 'Payment received by Razorpay. Verifying securely…');
        try {
          const headers = { 'Content-Type': 'application/json' };
          const token = await window.GIAccount?.getAccessToken();
          if (token) headers.Authorization = `Bearer ${token}`;
          const response = await fetch('/api/payments/verify', {
            method: 'POST',
            headers,
            body: JSON.stringify({ orderId: order.orderId, ...paymentResponse })
          });
          const verification = await response.json().catch(() => ({}));
          if (!response.ok || verification.paymentStatus !== 'paid') {
            throw new Error(verification.error || 'The payment has not been verified yet.');
          }
          const notificationMessage = verification.ownerNotification === 'sent'
            ? 'Your payment is verified and GI Apparel has been emailed.'
            : 'Your payment is verified, but the owner email alert could not be sent. Please contact GI Apparel on WhatsApp.';
          setCheckoutStatus('', '');
          showCheckoutSuccess('Payment confirmed', notificationMessage, verification.orderNumber);
        } catch (error) {
          setCheckoutStatus('error', `${error.message} Do not pay again. Please contact GI Apparel on WhatsApp with reference ${order.orderNumber}.`);
          button.disabled = false;
        }
      },
      modal: {
        ondismiss: () => {
          button.disabled = false;
          button.removeAttribute('aria-busy');
          setCheckoutStatus('error', `Payment was not confirmed. If you see a debit, contact GI Apparel with reference ${order.orderNumber} before trying again.`);
        }
      }
    });
    payment.open();
  } catch (error) {
    setCheckoutStatus('error', `${error.message} No order or payment was confirmed.`);
  } finally {
    button.removeAttribute('aria-busy');
    if (DOM.checkoutForm && !DOM.checkoutForm.hidden) button.disabled = false;
  }
}

// ==========================================================================
// 9. TOAST NOTIFICATION ENGINE
// ==========================================================================
function showToast(message) {
  if (!DOM.toastContainer) return;

  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.innerHTML = `<span>✨</span> <span>${message}</span>`;

  DOM.toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    toast.style.transition = '0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}
