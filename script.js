// Configuración del cliente Supabase
const SUPABASE_URL = 'https://yevpudvixjcfmjbixqhj.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlldnB1ZHZpeGpjZm1qYml4cWhqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA4NTg1MjUsImV4cCI6MjEwNjQzNDUyNX0.WnF1Aa6h1Ms-DlYpdpUHjNQmEtgRnjqikCB3og0si7E';
const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const DEFAULT_CONFIG = {
  name: 'RUTH STORE',
  phone: '595982193139',
  currency: 'Gs.',
  adminPass: 'admin123',
  featured_product_id: ''
}; 

// Variables de estado
let storeCategories = [];
let storeConfig = JSON.parse(localStorage.getItem('aura_store_config')) || DEFAULT_CONFIG;
let products = [];
let cart = JSON.parse(localStorage.getItem('aura_cart')) || [];
let selectedCategory = 'Todas';
let searchQuery = '';
let sortOption = 'default';
let isCaptchaVerified = false;
let quickViewTarget = null;
let qvQuantity = 1;
let currentEditingImageBase64 = '';
// Variables para paginación y búsqueda del panel Admin
let adminCurrentPage = 1;
const adminItemsPerPage = 8; // Puedes cambiar la cantidad de productos por página aquí
let adminSearchQuery = '';

// Cargar catálogo desde Supabase
async function fetchProductsFromCloud() {
  try {
    const { data, error } = await _supabase
      .from('products')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    products = data || [];

    loadStoreSettingsForm();
    renderFeaturedProduct();
    renderCategories();
    renderProducts();
    renderAdminProductsTable();
    updateCartUI();
  } catch (err) {
    console.error('Error al conectar con Supabase:', err);
    showToast('Error al sincronizar catálogo con la nube', 'error');
  }
}

// Cargar configuración de tienda desde Supabase
async function fetchStoreConfigFromCloud() {
  try {
    const { data, error } = await _supabase
      .from('store_config')
      .select('*')
      .eq('id', 1)
      .maybeSingle();

    if (error) throw error;

    if (data) {
      storeConfig.name = data.name || storeConfig.name;
      storeConfig.phone = data.phone || storeConfig.phone;
      storeConfig.currency = data.currency || storeConfig.currency;
      storeConfig.featured_product_id = data.featured_product_id || '';
      
      applyStoreConfigUI();
      loadStoreSettingsForm();
      renderFeaturedProduct();
    }
  } catch (err) {
    console.error('Error al cargar configuración:', err);
  }
}

// Toast helper
function showToast(message, type = 'success') {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const toast = document.createElement('div');
  
  const icons = {
    success: 'fa-check-circle text-emerald-500',
    error: 'fa-circle-xmark text-red-500',
    info: 'fa-circle-info text-blue-500'
  };

  toast.className = 'pointer-events-auto flex items-center gap-3 bg-slate-900 text-white text-xs font-semibold px-4 py-3 rounded-2xl shadow-xl border border-slate-700/60 transform translate-y-4 opacity-0 transition-all duration-300';
  toast.innerHTML = `
    <i class="fa-solid ${icons[type] || icons.success} text-base"></i>
    <span>${message}</span>
  `;

  container.appendChild(toast);
  requestAnimationFrame(() => {
    toast.classList.remove('translate-y-4', 'opacity-0');
  });

  setTimeout(() => {
    toast.classList.add('opacity-0', 'translate-y-2');
    setTimeout(() => toast.remove(), 300);
  }, 3200);
}

// Modal Confirmation Helper
function showConfirmDialog({ title, message, onConfirm }) {
  const modal = document.getElementById('customConfirmModal');
  const titleEl = document.getElementById('confirmTitle');
  const msgEl = document.getElementById('confirmMessage');
  const acceptBtn = document.getElementById('confirmAcceptBtn');
  const cancelBtn = document.getElementById('confirmCancelBtn');

  titleEl.textContent = title;
  msgEl.textContent = message;

  modal.classList.remove('opacity-0', 'pointer-events-none');

  const handleConfirm = () => {
    cleanup();
    onConfirm();
  };

  const cleanup = () => {
    modal.classList.add('opacity-0', 'pointer-events-none');
    acceptBtn.removeEventListener('click', handleConfirm);
    cancelBtn.removeEventListener('click', cleanup);
  };

  acceptBtn.addEventListener('click', handleConfirm);
  cancelBtn.addEventListener('click', cleanup);
}

// Currency Formatter Helper
function formatCurrency(amount) {
  return `${storeConfig.currency} ${Math.round(Number(amount)).toLocaleString('es-PY')}`;
}

// Helper: Cálculo de Totales del Carrito con Descuento Mayorista
function getCartTotals() {
  let subtotalNormal = 0;
  let totalDiscount = 0;

  cart.forEach(item => {
    const prod = products.find(p => p.id === item.id);
    const discount = item.wholesaleDiscount !== undefined ? item.wholesaleDiscount : (prod?.wholesaleDiscount || 0);
    const itemNormal = item.price * item.qty;
    subtotalNormal += itemNormal;

    if (item.qty >= 10 && discount > 0) {
      const discountedUnit = item.price * (1 - (discount / 100));
      const lineTotal = discountedUnit * item.qty;
      totalDiscount += (itemNormal - lineTotal);
    }
  });

  const totalFinal = subtotalNormal - totalDiscount;
  return { subtotalNormal, totalDiscount, totalFinal };
}

function saveCart() {
  localStorage.setItem('aura_cart', JSON.stringify(cart));
  updateCartUI();
}

function addToCart(productId, qty = 1) {
  const product = products.find(p => p.id === productId);
  if (!product) return;

  const existing = cart.find(item => item.id === productId);
  if (existing) {
    existing.qty += qty;
    existing.wholesaleDiscount = product.wholesaleDiscount || 0;
  } else {
    cart.push({
      id: product.id,
      name: product.name,
      price: product.price,
      image: product.image,
      category: product.category,
      wholesaleDiscount: product.wholesaleDiscount || 0,
      qty: qty
    });
  }

  saveCart();
  showToast(`"${product.name}" agregado al carrito`);
  openCart();
}

function updateCartItemQty(productId, change) {
  const item = cart.find(i => i.id === productId);
  if (!item) return;

  item.qty += change;
  if (item.qty <= 0) {
    cart = cart.filter(i => i.id !== productId);
  }
  saveCart();
}

function removeCartItem(productId) {
  cart = cart.filter(i => i.id !== productId);
  saveCart();
  showToast('Producto removido del carrito', 'info');
}

function clearCart() {
  if (cart.length === 0) return;
  showConfirmDialog({
    title: 'Vaciar carrito',
    message: '¿Estás seguro de remover todos los productos de tu pedido?',
    onConfirm: () => {
      cart = [];
      saveCart();
      showToast('Carrito vaciado', 'info');
    }
  });
}

function openCart() {
  const drawer = document.getElementById('cartDrawer');
  const backdrop = document.getElementById('cartDrawerBackdrop');
  drawer.classList.remove('translate-x-full');
  backdrop.classList.remove('opacity-0', 'pointer-events-none');
  document.body.classList.add('overflow-hidden');
}

function closeCart() {
  const drawer = document.getElementById('cartDrawer');
  const backdrop = document.getElementById('cartDrawerBackdrop');
  drawer.classList.add('translate-x-full');
  backdrop.classList.add('opacity-0', 'pointer-events-none');
  document.body.classList.remove('overflow-hidden');
}

function toggleCart() {
  const drawer = document.getElementById('cartDrawer');
  if (drawer.classList.contains('translate-x-full')) {
    openCart();
  } else {
    closeCart();
  }
}

function updateCartUI() {
  const cartCountBadge = document.getElementById('cartCountBadge');
  const mobileBottomCartBadge = document.getElementById('mobileBottomCartBadge');
  const drawerItemCount = document.getElementById('drawerItemCount');
  const cartItemsList = document.getElementById('cartItemsList');
  const cartEmptyState = document.getElementById('cartEmptyState');
  const cartFooter = document.getElementById('cartFooter');
  const cartSubtotal = document.getElementById('cartSubtotal');
  const cartTotal = document.getElementById('cartTotal');

  const totalItems = cart.reduce((sum, item) => sum + item.qty, 0);
  const { subtotalNormal, totalDiscount, totalFinal } = getCartTotals();

  if (cartCountBadge) cartCountBadge.textContent = totalItems;
  if (mobileBottomCartBadge) mobileBottomCartBadge.textContent = totalItems;
  if (drawerItemCount) drawerItemCount.textContent = totalItems;

  if (cart.length === 0) {
    cartItemsList.innerHTML = '';
    cartItemsList.classList.add('hidden');
    cartEmptyState.classList.remove('hidden');
    cartFooter.classList.add('opacity-50', 'pointer-events-none');
    if (cartSubtotal) cartSubtotal.textContent = formatCurrency(0);
    if (cartTotal) cartTotal.textContent = formatCurrency(0);
    updateCartDiscountRow(0);
    return;
  }

  cartItemsList.classList.remove('hidden');
  cartEmptyState.classList.add('hidden');
  cartFooter.classList.remove('opacity-50', 'pointer-events-none');

  if (cartSubtotal) cartSubtotal.textContent = formatCurrency(subtotalNormal);
  if (cartTotal) cartTotal.textContent = formatCurrency(totalFinal);
  updateCartDiscountRow(totalDiscount);

  cartItemsList.innerHTML = cart.map(item => {
    const prod = products.find(p => p.id === item.id);
    const wholesaleDiscount = item.wholesaleDiscount !== undefined ? item.wholesaleDiscount : (prod?.wholesaleDiscount || 0);
    const isWholesale = item.qty >= 10 && wholesaleDiscount > 0;
    const normalSubtotal = item.price * item.qty;

    let priceHtml = '';
    let wholesaleBadgeHtml = '';

    if (isWholesale) {
      const discountedUnit = item.price * (1 - (wholesaleDiscount / 100));
      const lineTotal = discountedUnit * item.qty;
      priceHtml = `
        <div class="flex items-center gap-1.5 mt-0.5">
          <span class="text-xs text-slate-400 line-through">${formatCurrency(normalSubtotal)}</span>
          <span class="text-xs text-emerald-600 font-extrabold">${formatCurrency(lineTotal)}</span>
        </div>
      `;
      wholesaleBadgeHtml = `
        <span class="inline-block text-[10px] font-extrabold text-emerald-700 bg-emerald-100/70 border border-emerald-300 rounded px-1.5 py-0.5 mt-1">
          🎉 ${wholesaleDiscount}% OFF Mayorista aplicado
        </span>
      `;
    } else {
      priceHtml = `<p class="text-[11px] text-emerald-600 font-extrabold mt-0.5">${formatCurrency(item.price)}</p>`;
      if (wholesaleDiscount > 0) {
        const remaining = 10 - item.qty;
        wholesaleBadgeHtml = `
          <span class="block text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5 mt-1">
            💡 Agrega <strong>${remaining} más</strong> para <strong>${wholesaleDiscount}% OFF</strong>
          </span>
        `;
      }
    }

    const effectiveSubtotal = isWholesale ? (item.price * (1 - (wholesaleDiscount / 100)) * item.qty) : normalSubtotal;

    return `
      <div class="flex items-center gap-3 p-3 bg-slate-50 rounded-2xl border border-slate-100 hover:border-slate-200 transition-colors">
        <img src="${item.image}" alt="${item.name}" class="w-16 h-16 rounded-xl object-cover bg-white border border-slate-200" onerror="this.src='https://placehold.co/100x100/f1f5f9/0f172a?text=Foto'">
        <div class="flex-1 min-w-0">
          <h5 class="font-bold text-xs text-slate-800 truncate">${item.name}</h5>
          ${priceHtml}
          ${wholesaleBadgeHtml}
          <div class="flex items-center gap-2 mt-2">
            <div class="flex items-center border border-slate-200 rounded-lg bg-white">
              <button onclick="updateCartItemQty('${item.id}', -1)" class="px-2 py-0.5 text-slate-600 hover:text-slate-900" aria-label="Disminuir"><i class="fa-solid fa-minus text-[10px]"></i></button>
              <span class="px-2 text-xs font-bold text-slate-800">${item.qty}</span>
              <button onclick="updateCartItemQty('${item.id}', 1)" class="px-2 py-0.5 text-slate-600 hover:text-slate-900" aria-label="Aumentar"><i class="fa-solid fa-plus text-[10px]"></i></button>
            </div>
            <span class="text-[11px] text-slate-400 font-medium">Subt: ${formatCurrency(effectiveSubtotal)}</span>
          </div>
        </div>
        <button onclick="removeCartItem('${item.id}')" class="p-2 text-slate-400 hover:text-red-500 rounded-lg transition-colors" title="Eliminar ítem">
          <i class="fa-solid fa-trash-can text-sm"></i>
        </button>
      </div>
    `;
  }).join('');
}

function updateCartDiscountRow(discountAmount) {
  let discountRow = document.getElementById('cartWholesaleRow');
  if (!discountRow) {
    const totalEl = document.getElementById('cartTotal');
    if (totalEl) {
      const container = totalEl.closest('.flex') || totalEl.parentElement;
      if (container && container.parentElement) {
        discountRow = document.createElement('div');
        discountRow.id = 'cartWholesaleRow';
        discountRow.className = 'flex justify-between items-center text-xs text-emerald-600 font-bold pb-2';
        container.parentElement.insertBefore(discountRow, container);
      }
    }
  }

  if (discountRow) {
    if (discountAmount > 0) {
      discountRow.classList.remove('hidden');
      discountRow.innerHTML = `
        <span>Descuento Mayorista:</span>
        <span>-${formatCurrency(discountAmount)}</span>
      `;
    } else {
      discountRow.classList.add('hidden');
    }
  }
}

function renderCategories() {
  const container = document.getElementById('categoriesContainer');
  const uniqueCats = ['Todas', ...new Set(products.map(p => p.category))];

  container.innerHTML = uniqueCats.map(cat => {
    const isActive = cat.toLowerCase() === selectedCategory.toLowerCase();
    return `
      <button onclick="filterByCategory('${cat}')" class="px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap transition-all flex items-center gap-2 ${
        isActive 
          ? 'bg-slate-900 text-white shadow-md shadow-slate-900/20' 
          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
      }">
        <span>${cat}</span>
        ${cat === 'Todas' ? `<span class="opacity-60 text-[10px]">(${products.length})</span>` : ''}
      </button>
    `;
  }).join('');
}

function filterByCategory(cat) {
  selectedCategory = cat;
  renderCategories();
  renderProducts();
  
  const resetBtn = document.getElementById('resetFiltersBtn');
  if (selectedCategory !== 'Todas' || searchQuery !== '') {
    resetBtn.classList.remove('hidden');
  } else {
    resetBtn.classList.add('hidden');
  }
}

function resetAllFilters() {
  selectedCategory = 'Todas';
  searchQuery = '';
  document.getElementById('desktopSearchInput').value = '';
  document.getElementById('mobileSearchInput').value = '';
  document.getElementById('sortSelector').value = 'default';
  sortOption = 'default';
  document.getElementById('resetFiltersBtn').classList.add('hidden');
  renderCategories();
  renderProducts();
}

function renderProducts() {
  const grid = document.getElementById('productsGrid');
  const emptyState = document.getElementById('emptyCatalogState');
  const counter = document.getElementById('productCounter');

  let filtered = products.filter(p => {
    const matchesCat = selectedCategory === 'Todas' || p.category.toLowerCase() === selectedCategory.toLowerCase();
    const matchesQuery = p.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                         p.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         p.description.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCat && matchesQuery;
  });

  if (sortOption === 'price-asc') {
    filtered.sort((a, b) => a.price - b.price);
  } else if (sortOption === 'price-desc') {
    filtered.sort((a, b) => b.price - a.price);
  } else if (sortOption === 'name-asc') {
    filtered.sort((a, b) => a.name.localeCompare(b.name));
  }

  counter.textContent = filtered.length;

  if (filtered.length === 0) {
    grid.innerHTML = '';
    emptyState.classList.remove('hidden');
    return;
  }

  emptyState.classList.add('hidden');

  grid.innerHTML = filtered.map(product => {
    const badgeColor = {
      'Oferta': 'bg-red-500',
      'Nuevo': 'bg-emerald-600',
      'Más Vendido': 'bg-indigo-600',
      'Limitado': 'bg-amber-600'
    }[product.badge] || 'bg-slate-900';

    return `
      <div class="group bg-white rounded-3xl overflow-hidden border border-slate-200/80 hover:border-emerald-500/40 hover:shadow-xl transition-all duration-300 flex flex-col justify-between">
        <div>
          <div class="relative aspect-square overflow-hidden bg-slate-100">
            <img src="${product.image}" alt="${product.name}" class="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-500" onerror="this.src='https://placehold.co/600x600/f1f5f9/0f172a?text=Producto'">
            
            ${product.badge ? `
              <span class="absolute top-3 left-3 ${badgeColor} text-white font-extrabold text-[10px] uppercase tracking-wider px-2.5 py-1 rounded-full shadow-md">
                ${product.badge}
              </span>
            ` : ''}

            <button onclick="openQuickView('${product.id}')" class="absolute bottom-3 right-3 bg-white/90 backdrop-blur-md hover:bg-white text-slate-800 text-xs font-bold px-3 py-1.5 rounded-xl shadow-md transition-all opacity-0 group-hover:opacity-100 transform translate-y-2 group-hover:translate-y-0">
              <i class="fa-solid fa-eye mr-1"></i> Vista rápida
            </button>
          </div>

          <div class="p-5">
            <span class="text-[11px] font-bold text-emerald-600 uppercase tracking-wider">${product.category}</span>
            <h3 class="font-bold text-slate-900 text-base mt-1 line-clamp-1 group-hover:text-emerald-600 transition-colors" title="${product.name}">
              ${product.name}
            </h3>
            
            ${product.wholesaleDiscount > 0 ? `
              <div class="mt-1.5">
                <span class="inline-flex items-center gap-1 text-[10px] font-extrabold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md">
                  <i class="fa-solid fa-tags text-[9px]"></i> ${product.wholesaleDiscount}% OFF Mayorista (≥10 un.)
                </span>
              </div>
            ` : ''}

            <p class="text-xs text-slate-500 line-clamp-2 mt-2 leading-relaxed font-normal">
              ${product.description}
            </p>
          </div>
        </div>

        <div class="p-5 pt-0">
          <div class="pt-3 border-t border-slate-100 flex items-center justify-between">
            <div>
              <div class="flex items-baseline gap-1.5">
                <span class="text-base sm:text-lg font-black text-slate-900">${formatCurrency(product.price)}</span>
                ${product.oldPrice && product.oldPrice > product.price ? `
                  <span class="text-xs font-semibold text-slate-400 line-through">${formatCurrency(product.oldPrice)}</span>
                ` : ''}
              </div>
              <span class="text-[10px] text-emerald-600 font-semibold block">Por Pedido</span>
            </div>

            <button onclick="addToCart('${product.id}')" class="bg-slate-900 hover:bg-emerald-600 text-white font-bold text-xs p-3 sm:px-3.5 sm:py-2.5 rounded-xl transition-colors shadow-sm flex items-center gap-1.5 group-hover:bg-emerald-600" title="Agregar al presupuesto">
              <i class="fa-solid fa-cart-plus text-sm"></i>
              <span class="hidden sm:inline">Agregar</span>
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

// Quick View Modal Handlers
function openQuickView(productId) {
  const product = products.find(p => p.id === productId);
  if (!product) return;

  quickViewTarget = product;
  qvQuantity = 1;

  document.getElementById('qvImage').src = product.image;
  document.getElementById('qvTitle').textContent = product.name;
  document.getElementById('qvCategory').textContent = product.category;
  document.getElementById('qvDescription').textContent = product.description;
  document.getElementById('qvPrice').textContent = formatCurrency(product.price);
  
  const oldPriceEl = document.getElementById('qvOldPrice');
  if (product.oldPrice && product.oldPrice > product.price) {
    oldPriceEl.textContent = formatCurrency(product.oldPrice);
    oldPriceEl.classList.remove('hidden');
  } else {
    oldPriceEl.classList.add('hidden');
  }

  const badgeEl = document.getElementById('qvBadge');
  if (product.badge) {
    badgeEl.textContent = product.badge;
    badgeEl.className = 'absolute top-3 left-3 text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-md text-white bg-slate-900';
    badgeEl.classList.remove('hidden');
  } else {
    badgeEl.classList.add('hidden');
  }

  document.getElementById('qvQty').textContent = qvQuantity;

  document.getElementById('qvAddToCartBtn').onclick = () => {
    addToCart(product.id, qvQuantity);
    closeQuickView();
  };

  const modal = document.getElementById('quickViewModal');
  const content = document.getElementById('quickViewContent');
  modal.classList.remove('opacity-0', 'pointer-events-none');
  content.classList.remove('scale-95');
}

function closeQuickView() {
  const modal = document.getElementById('quickViewModal');
  const content = document.getElementById('quickViewContent');
  modal.classList.add('opacity-0', 'pointer-events-none');
  content.classList.add('scale-95');
}

function adjustQvQty(delta) {
  qvQuantity = Math.max(1, qvQuantity + delta);
  document.getElementById('qvQty').textContent = qvQuantity;
}

function openCheckoutModal() {
  if (cart.length === 0) {
    showToast('Agrega productos al carrito primero', 'error');
    return;
  }
  closeCart();

  const { totalFinal } = getCartTotals();
  document.getElementById('checkoutTotalSum').textContent = formatCurrency(totalFinal);

  isCaptchaVerified = false;
  document.getElementById('captchaSpinner').classList.add('hidden');
  document.getElementById('captchaCheck').classList.add('hidden');
  document.getElementById('captchaNotice').classList.add('hidden');
  document.getElementById('captchaBox').classList.remove('border-emerald-500', 'bg-emerald-50');

  const modal = document.getElementById('checkoutModal');
  modal.classList.remove('opacity-0', 'pointer-events-none');
}

function closeCheckoutModal() {
  const modal = document.getElementById('checkoutModal');
  modal.classList.add('opacity-0', 'pointer-events-none');
}

function triggerCaptchaVerification() {
  if (isCaptchaVerified) return;

  const spinner = document.getElementById('captchaSpinner');
  const check = document.getElementById('captchaCheck');
  const box = document.getElementById('captchaBox');
  const notice = document.getElementById('captchaNotice');

  notice.classList.add('hidden');
  spinner.classList.remove('hidden');

  setTimeout(() => {
    spinner.classList.add('hidden');
    check.classList.remove('hidden');
    box.classList.add('border-emerald-500', 'bg-emerald-50');
    isCaptchaVerified = true;
  }, 1000);
}

// Envío a WhatsApp con cálculo mayorista
document.getElementById('checkoutForm').addEventListener('submit', function(e) {
  e.preventDefault();

  if (!isCaptchaVerified) {
    document.getElementById('captchaNotice').classList.remove('hidden');
    return;
  }

  const name = document.getElementById('custName').value.trim();
  const phone = document.getElementById('custPhone').value.trim();
  const city = document.getElementById('custCity').value.trim();
  const address = document.getElementById('custAddress').value.trim();
  const notes = document.getElementById('custNotes').value.trim();

  const { subtotalNormal, totalDiscount, totalFinal } = getCartTotals();

  let msg = `🛍️ *SOLICITUD DE PRESUPUESTO - ${storeConfig.name}*\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `👤 *Cliente:* ${name}\n`;
  msg += `📱 *Teléfono:* ${phone}\n`;
  msg += `📍 *Ciudad/Barrio:* ${city}\n`;
  if (address) msg += `🏠 *Dirección:* ${address}\n`;
  if (notes) msg += `📝 *Nota adicional:* ${notes}\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `🛒 *DETALLE DEL PEDIDO:*\n`;

  cart.forEach((item, index) => {
    const prod = products.find(p => p.id === item.id);
    const wholesaleDiscount = item.wholesaleDiscount !== undefined ? item.wholesaleDiscount : (prod?.wholesaleDiscount || 0);
    const isWholesale = item.qty >= 10 && wholesaleDiscount > 0;
    const normalSubtotal = item.price * item.qty;

    msg += `${index + 1}. *${item.name}*\n`;
    if (isWholesale) {
      const discountedUnit = item.price * (1 - (wholesaleDiscount / 100));
      const lineTotal = discountedUnit * item.qty;
      msg += `   └ Cant: ${item.qty} un. | Subtotal: *${formatCurrency(lineTotal)}* (${wholesaleDiscount}% OFF Mayorista)\n`;
      msg += `   └ _(Precio reg.: ${formatCurrency(normalSubtotal)})_\n`;
    } else {
      msg += `   └ Cant: ${item.qty} un. | Subtotal: ${formatCurrency(normalSubtotal)}\n`;
    }
  });

  msg += `━━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `💵 *Subtotal:* ${formatCurrency(subtotalNormal)}\n`;
  if (totalDiscount > 0) {
    msg += `🎉 *Descuento Mayorista:* -${formatCurrency(totalDiscount)}\n`;
  }
  msg += `💰 *TOTAL ESTIMADO:* ${formatCurrency(totalFinal)}\n\n`;
  msg += `_Hola, he preparado mi presupuesto desde su catálogo online. Por favor confírmenme disponibilidad para procesar la entrega. Gracias!_`;

  const cleanPhone = storeConfig.phone.replace(/[^0-9]/g, '');
  const whatsappUrl = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(msg)}`;

  closeCheckoutModal();
  showToast('Redirigiendo a WhatsApp con tu pedido...');
  window.open(whatsappUrl, '_blank');
});

// Formulario de Contacto
document.getElementById('quickContactForm').addEventListener('submit', function(e) {
  e.preventDefault();
  const name = document.getElementById('contactName').value.trim();
  const subject = document.getElementById('contactSubject').value.trim();
  const message = document.getElementById('contactMessage').value.trim();

  let msg = `💬 *CONSULTA DIRECTA - ${storeConfig.name}*\n\n`;
  msg += `👤 *Nombre:* ${name}\n`;
  msg += `📌 *Asunto:* ${subject}\n`;
  msg += `✉️ *Mensaje:* ${message}\n\n`;
  msg += `_Enviado desde el formulario de contacto web._`;

  const cleanPhone = storeConfig.phone.replace(/[^0-9]/g, '');
  const whatsappUrl = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(msg)}`;

  showToast('Abriendo WhatsApp...');
  window.open(whatsappUrl, '_blank');
  this.reset();
});

function openAdminModal() {
  const modal = document.getElementById('adminModal');
  if (!modal) {
    console.warn("No se encontró el elemento con id='adminModal' en el HTML.");
    return;
  }
  modal.classList.remove('opacity-0', 'pointer-events-none');
}

function closeAdminModal() {
  const modal = document.getElementById('adminModal');
  if (modal) {
    modal.classList.add('opacity-0', 'pointer-events-none');
  }
}

// Cargar campos de configuración en el Admin
function loadStoreSettingsForm() {
  const nameInput = document.getElementById('settingStoreName');
  const phoneInput = document.getElementById('settingWhatsApp');
  const currInput = document.getElementById('settingCurrency');
  const selectFeatured = document.getElementById('settingFeaturedProduct');

  if (nameInput) nameInput.value = storeConfig.name || '';
  if (phoneInput) phoneInput.value = storeConfig.phone || '';
  if (currInput) currInput.value = storeConfig.currency || '';

  if (selectFeatured) {
    selectFeatured.innerHTML = '<option value="">-- Seleccionar producto --</option>' + 
      products.map(p => `
        <option value="${p.id}" ${storeConfig.featured_product_id === p.id ? 'selected' : ''}>
          ${p.name} (${formatCurrency(p.price)})
        </option>
      `).join('');
  }
}

// Autenticación con Supabase Auth
async function handleAdminLogin() {
  const email = document.getElementById('adminEmailInput').value.trim();
  const password = document.getElementById('adminPasswordInput').value;
  const loginBtn = document.getElementById('adminLoginBtn');

  if (!email || !password) {
    showToast('Por favor completa todos los campos', 'error');
    return;
  }

  loginBtn.disabled = true;
  loginBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1"></i> Verificando...';

  try {
    const { data, error } = await _supabase.auth.signInWithPassword({
      email: email,
      password: password
    });

    if (error) throw error;

    // 1. Expandir el contenedor de 400px a tamaño amplio para el catálogo
    const modalBox = document.getElementById('adminModalBox');
    if (modalBox) {
      modalBox.classList.remove('max-w-[400px]');
      modalBox.classList.add('max-w-4xl');
    }
    // 2. Cambiar de vista
    document.getElementById('adminLoginGate').classList.add('hidden');
    document.getElementById('adminDashboardBody').classList.remove('hidden');
    document.getElementById('adminDashboardBody').classList.remove('flex');
    renderAdminProductsTable();
    loadStoreSettingsForm();
    showToast('Sesión iniciada con éxito');
  } catch (err) {
    console.error(err);
    showToast('Correo o contraseña incorrectos', 'error');
  } finally {
    loginBtn.disabled = false;
    loginBtn.innerHTML = 'Iniciar Sesión';
  }
}

async function handleAdminLogout() {
  await _supabase.auth.signOut();
  document.getElementById('adminDashboardBody').classList.add('hidden');
  document.getElementById('adminLoginGate').classList.remove('hidden');
  document.getElementById('adminEmailInput').value = '';
  document.getElementById('adminPasswordInput').value = '';
  showToast('Sesión cerrada');
}

function switchAdminTab(tab) {
  const tabs = {
    products: { btn: 'tabBtnProducts', content: 'tabContentProducts' },
    categories: { btn: 'tabBtnCategories', content: 'tabContentCategories' },
    installments: { btn: 'tabBtnInstallments', content: 'tabContentInstallments' },
    clients: { btn: 'tabBtnClients', content: 'tabContentClients' },
    settings: { btn: 'tabBtnSettings', content: 'tabContentSettings' }
  };

  Object.keys(tabs).forEach(key => {
    const tabObj = tabs[key];
    const btn = document.getElementById(tabs[key].btn);
    const content = document.getElementById(tabs[key].content);

    if (key === tab) {
      btn?.classList.add('border-emerald-600', 'text-emerald-700');
      btn?.classList.remove('border-transparent', 'text-slate-500');
      content?.classList.remove('hidden');
    } else {
      btn?.classList.remove('border-emerald-600', 'text-emerald-700');
      btn?.classList.add('border-transparent', 'text-slate-500');
      content?.classList.add('hidden');
    }
  });

  if (tab === 'categories') renderCategoriesAdmin();
  if (tab === 'installments') {
    populateInstallmentsProductSelect();
    calculateInstallmentsTable();
  }
  if (tab === 'clients') {
    renderClientsTable();
  }

  // Agrega esto al final de tu función switchAdminTab(tab):
  const activeBtn = document.getElementById(tabs[tab]?.btn);
  if (activeBtn) {
    activeBtn.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }
}

// Carga de imágenes locales
document.getElementById('formProdImgFile')?.addEventListener('change', function(e) {
  const file = e.target.files[0];
  if (file) {
    if (file.size > 2 * 1024 * 1024) {
      showToast('La imagen es muy pesada. Máximo 2MB para almacenamiento rápido.', 'error');
      this.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = function(event) {
      currentEditingImageBase64 = event.target.result;
      document.getElementById('formImgPreview').src = currentEditingImageBase64;
      document.getElementById('imagePreviewContainer').classList.remove('hidden');
      document.getElementById('imagePreviewContainer').classList.add('flex');
      document.getElementById('formProdImgUrl').value = '';
    };
    reader.readAsDataURL(file);
  }
});

document.getElementById('formProdImgUrl')?.addEventListener('input', function(e) {
  const url = e.target.value.trim();
  if (url) {
    currentEditingImageBase64 = url;
    document.getElementById('formImgPreview').src = url;
    document.getElementById('imagePreviewContainer').classList.remove('hidden');
    document.getElementById('imagePreviewContainer').classList.add('flex');
  }
});

// Guardar / Actualizar Producto en Supabase
document.getElementById('productManageForm')?.addEventListener('submit', async function(e) {
  e.preventDefault();

  const saveBtn = document.getElementById('saveProductBtn');
  saveBtn.disabled = true;
  saveBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1"></i> Guardando...';

  const editId = document.getElementById('editProductId').value;
  const name = document.getElementById('formProdName').value.trim();
  const category = document.getElementById('formProdCategory').value.trim();
  const price = parseFloat(document.getElementById('formProdPrice').value) || 0;
  const oldPrice = parseFloat(document.getElementById('formProdOldPrice').value) || 0;
  const wholesaleDiscount = parseFloat(document.getElementById('formProdWholesale')?.value) || 0;
  const badge = document.getElementById('formProdBadge').value;
  const description = document.getElementById('formProdDesc').value.trim();

  const finalImage = currentEditingImageBase64 || 
                     document.getElementById('formProdImgUrl').value.trim() || 
                     'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=800&auto=format&fit=crop&q=80';

  const payload = {
    name,
    category,
    price,
    oldPrice,
    wholesaleDiscount,
    badge,
    description,
    image: finalImage
  };

  try {
    if (editId) {
      const { error } = await _supabase
        .from('products')
        .update(payload)
        .eq('id', editId);

      if (error) throw error;
      showToast('Producto actualizado en la nube');
    } else {
      payload.id = 'prod_' + Date.now();
      const { error } = await _supabase
        .from('products')
        .insert([payload]);

      if (error) throw error;
      showToast('Nuevo producto publicado');
    }

    resetProductForm();
    await fetchProductsFromCloud();
  } catch (err) {
    console.error(err);
    showToast('Error al guardar en la base de datos', 'error');
  } finally {
    saveBtn.disabled = false;
  }
});

function editProduct(productId) {
  const product = products.find(p => p.id === productId);
  if (!product) return;

  document.getElementById('editProductId').value = product.id;
  document.getElementById('formProdName').value = product.name;
  document.getElementById('formProdCategory').value = product.category;
  document.getElementById('formProdPrice').value = product.price;
  document.getElementById('formProdOldPrice').value = product.oldPrice || '';
  
  if (document.getElementById('formProdWholesale')) {
    document.getElementById('formProdWholesale').value = product.wholesaleDiscount || 0;
  }
  
  document.getElementById('formProdBadge').value = product.badge || '';
  document.getElementById('formProdDesc').value = product.description;

  currentEditingImageBase64 = product.image;
  document.getElementById('formImgPreview').src = product.image;
  document.getElementById('imagePreviewContainer').classList.remove('hidden');
  document.getElementById('imagePreviewContainer').classList.add('flex');

  document.getElementById('productFormTitle').innerHTML = '<i class="fa-solid fa-pen-to-square text-emerald-600 mr-1.5"></i> Editar Producto';
  document.getElementById('cancelEditBtn').classList.remove('hidden');
  document.getElementById('saveProductBtn').innerHTML = '<i class="fa-solid fa-check mr-1"></i> Actualizar Producto';

  document.getElementById('tabContentProducts').scrollTo({ top: 0, behavior: 'smooth' });
}

function deleteProduct(productId) {
  showConfirmDialog({
    title: 'Eliminar Producto',
    message: '¿Estás seguro de eliminar este producto del catálogo?',
    onConfirm: async () => {
      try {
        const { error } = await _supabase
          .from('products')
          .delete()
          .eq('id', productId);

        if (error) throw error;

        showToast('Producto eliminado');
        await fetchProductsFromCloud();
      } catch (err) {
        console.error(err);
        showToast('No se pudo eliminar el producto', 'error');
      }
    }
  });
}

function resetProductForm() {
  document.getElementById('productManageForm').reset();
  document.getElementById('editProductId').value = '';
  if (document.getElementById('formProdWholesale')) {
    document.getElementById('formProdWholesale').value = 0;
  }
  currentEditingImageBase64 = '';
  document.getElementById('imagePreviewContainer').classList.add('hidden');
  document.getElementById('imagePreviewContainer').classList.remove('flex');
  document.getElementById('productFormTitle').innerHTML = '<i class="fa-solid fa-plus-circle text-emerald-600 mr-1.5"></i> Agregar Nuevo Producto';
  document.getElementById('cancelEditBtn').classList.add('hidden');
  document.getElementById('saveProductBtn').innerHTML = '<i class="fa-solid fa-floppy-disk mr-1"></i> Guardar Producto';
}

// Maneja la búsqueda en tiempo real dentro del panel
function handleAdminSearch(query) {
  adminSearchQuery = query.toLowerCase().trim();
  adminCurrentPage = 1; // Reinicia a la primera página al filtrar
  renderAdminProductsTable();
}

// Cambia de página
function changeAdminPage(newPage) {
  adminCurrentPage = newPage;
  renderAdminProductsTable();
}

// Renderizado de tabla con filtro y paginación
function renderAdminProductsTable() {
  const tbody = document.getElementById('adminProductsTableBody');
  const countEl = document.getElementById('adminTotalProdCount');
  const infoEl = document.getElementById('adminPaginationInfo');
  const buttonsEl = document.getElementById('adminPaginationButtons');

  // Sincroniza la lista desplegable de la calculadora de cuotas
  if (typeof populateInstallmentsProductSelect === 'function') {
    populateInstallmentsProductSelect();
  }

  if (!tbody) return;

  // 1. Filtrar productos según el buscador
  const filtered = products.filter(p => {
    const nameMatch = p.name ? p.name.toLowerCase().includes(adminSearchQuery) : false;
    const catMatch = p.category ? p.category.toLowerCase().includes(adminSearchQuery) : false;
    return nameMatch || catMatch;
  });

  if (countEl) countEl.textContent = products.length;

  // 2. Si no hay productos registrados o coincidentes
  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" class="p-6 text-center text-slate-400">
          <i class="fa-solid fa-box-open text-2xl mb-1 text-slate-300 block"></i>
          ${products.length === 0 ? 'No hay productos registrados en el catálogo.' : 'No se encontraron productos coincidentes.'}
        </td>
      </tr>
    `;
    if (infoEl) infoEl.textContent = 'Mostrando 0 de 0 productos';
    if (buttonsEl) buttonsEl.innerHTML = '';
    return;
  }

  // 3. Cálculo de Paginación
  const totalPages = Math.ceil(filtered.length / adminItemsPerPage);
  if (adminCurrentPage > totalPages) adminCurrentPage = totalPages;
  if (adminCurrentPage < 1) adminCurrentPage = 1;

  const startIndex = (adminCurrentPage - 1) * adminItemsPerPage;
  const endIndex = Math.min(startIndex + adminItemsPerPage, filtered.length);
  const currentProducts = filtered.slice(startIndex, endIndex);

  // 4. Renderizar Filas de la Página Actual
  tbody.innerHTML = currentProducts.map(p => `
    <tr class="hover:bg-slate-50 transition-colors">
      <td class="p-3">
        <img src="${p.image}" alt="${p.name}" class="w-10 h-10 rounded-lg object-cover border border-slate-200" onerror="this.src='https://placehold.co/80x80/f1f5f9/0f172a?text=Foto'">
      </td>
      <td class="p-3">
        <p class="font-bold text-slate-900 text-xs">${p.name}</p>
        <span class="text-[10px] text-emerald-600 font-semibold">${p.category}</span>
      </td>
      <td class="p-3 font-bold text-slate-800">${formatCurrency(p.price)}</td>
      <td class="p-3 font-bold text-emerald-600">
        ${p.wholesaleDiscount > 0 ? `${p.wholesaleDiscount}% OFF` : '<span class="text-slate-400 font-normal">0%</span>'}
      </td>
      <td class="p-3">
        ${p.badge ? `<span class="bg-slate-100 text-slate-700 px-2 py-0.5 rounded text-[10px] font-bold">${p.badge}</span>` : '<span class="text-slate-300">-</span>'}
      </td>
      <td class="p-3 text-right space-x-1">
        <button onclick="editProduct('${p.id}')" class="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="Editar">
          <i class="fa-solid fa-pen-to-square"></i>
        </button>
        <button onclick="deleteProduct('${p.id}')" class="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Eliminar">
          <i class="fa-solid fa-trash"></i>
        </button>
      </td>
    </tr>
  `).join('');

  // 5. Actualizar Texto Informativo
  if (infoEl) {
    infoEl.textContent = `Mostrando ${startIndex + 1} a ${endIndex} de ${filtered.length} productos`;
  }

  // 6. Generar Botones de Paginación
  if (buttonsEl) {
    let btnHtml = '';

    // Botón Anterior
    btnHtml += `
      <button 
        onclick="changeAdminPage(${adminCurrentPage - 1})" 
        ${adminCurrentPage === 1 ? 'disabled' : ''} 
        class="px-2.5 py-1 text-xs rounded-lg border border-slate-200 font-medium ${adminCurrentPage === 1 ? 'opacity-40 cursor-not-allowed bg-slate-100 text-slate-400' : 'bg-white hover:bg-slate-100 text-slate-700 shadow-sm'}"
      >
        <i class="fa-solid fa-chevron-left text-[10px]"></i>
      </button>
    `;

    // Botones numéricos
    for (let i = 1; i <= totalPages; i++) {
      const isCurrent = i === adminCurrentPage;
      btnHtml += `
        <button 
          onclick="changeAdminPage(${i})" 
          class="w-7 h-7 text-xs font-bold rounded-lg transition-all ${isCurrent ? 'bg-emerald-600 text-white shadow-sm' : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-200'}"
        >
          ${i}
        </button>
      `;
    }

    // Botón Siguiente
    btnHtml += `
      <button 
        onclick="changeAdminPage(${adminCurrentPage + 1})" 
        ${adminCurrentPage === totalPages ? 'disabled' : ''} 
        class="px-2.5 py-1 text-xs rounded-lg border border-slate-200 font-medium ${adminCurrentPage === totalPages ? 'opacity-40 cursor-not-allowed bg-slate-100 text-slate-400' : 'bg-white hover:bg-slate-100 text-slate-700 shadow-sm'}"
      >
        <i class="fa-solid fa-chevron-right text-[10px]"></i>
      </button>
    `;

    buttonsEl.innerHTML = btnHtml;
  }
}

// Guardar ajustes de la tienda y producto destacado
document.getElementById('storeSettingsForm')?.addEventListener('submit', async function(e) {
  e.preventDefault();

  const name = document.getElementById('settingStoreName').value.trim() || 'AURA Store';
  const phone = document.getElementById('settingWhatsApp').value.trim() || '595981123456';
  const currency = document.getElementById('settingCurrency').value.trim() || 'Gs.';
  const featuredId = document.getElementById('settingFeaturedProduct')?.value || '';

  const saveBtn = this.querySelector('button[type="submit"]');
  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1"></i> Guardando...';
  }

  try {
    const { error } = await _supabase
      .from('store_config')
      .update({
        name: name,
        phone: phone,
        currency: currency,
        featured_product_id: featuredId,
        updated_at: new Date().toISOString()
      })
      .eq('id', 1);

    if (error) throw error;

    storeConfig.name = name;
    storeConfig.phone = phone;
    storeConfig.currency = currency;
    storeConfig.featured_product_id = featuredId;

    applyStoreConfigUI();
    renderFeaturedProduct();
    renderProducts();
    updateCartUI();
    showToast('Ajustes sincronizados globalmente');
  } catch (err) {
    console.error(err);
    showToast('Error al guardar ajustes en la nube', 'error');
  } finally {
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.innerHTML = '<i class="fa-solid fa-floppy-disk mr-1"></i> Guardar Ajustes';
    }
  }
});

function applyStoreConfigUI() {
  document.getElementById('navStoreName').textContent = storeConfig.name;
  document.getElementById('mobileStoreName').textContent = storeConfig.name;
  document.getElementById('footerStoreName').textContent = storeConfig.name;
  document.getElementById('contactPhoneDisplay').textContent = '+' + storeConfig.phone;
}

// Renderizado de la tarjeta destacada en la portada
function renderFeaturedProduct() {
  const container = document.getElementById('heroFeaturedCard');
  if (!container) return;

  let featured = products.find(p => p.id === storeConfig.featured_product_id) || products[0];

  if (!featured) {
    container.classList.add('hidden');
    return;
  }

  container.classList.remove('hidden');
  container.innerHTML = `
    <div class="relative rounded-2xl overflow-hidden aspect-square bg-slate-100">
      <img src="${featured.image}" alt="${featured.name}" class="w-full h-full object-cover object-center" onerror="this.src='https://placehold.co/600x600/f1f5f9/0f172a?text=Producto'">
      <span class="absolute top-2 left-2 bg-amber-600 text-white text-[12px] font-extrabold uppercase px-2.5 py-1 rounded-full shadow-md">
        ⭐ Destacado del Mes
      </span>
    </div>
    
    <div class="mt-4 p-2 flex items-center justify-between">
      <div class="pr-2 min-w-0 flex-1">
        <h4 class="font-bold text-slate-900 text-base sm:text-lg truncate" title="${featured.name}">${featured.name}</h4>
        <p class="text-xs text-slate-500 line-clamp-2 mt-1">${featured.description}</p>
        <p class="text-lg text-emerald-600 font-extrabold mt-0.5">${formatCurrency(featured.price)}</p>
      </div>
      <button onclick="addToCart('${featured.id}')" class="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs px-4 py-2.5 rounded-xl shadow-md transition-transform hover:scale-105 flex items-center gap-1.5 whitespace-nowrap">
        <i class="fa-solid fa-cart-plus"></i> Agregar
      </button>
    </div>
  `;
}

// Búsqueda en catálogo
const desktopSearch = document.getElementById('desktopSearchInput');
const mobileSearch = document.getElementById('mobileSearchInput');

function handleSearch(val) {
  searchQuery = val;
  renderProducts();
  const resetBtn = document.getElementById('resetFiltersBtn');
  if (searchQuery !== '' || selectedCategory !== 'Todas') {
    resetBtn.classList.remove('hidden');
  } else {
    resetBtn.classList.add('hidden');
  }
}

desktopSearch?.addEventListener('input', (e) => handleSearch(e.target.value));
mobileSearch?.addEventListener('input', (e) => handleSearch(e.target.value));

document.getElementById('mobileSearchToggle')?.addEventListener('click', () => {
  const searchBar = document.getElementById('mobileSearchBar');
  searchBar.classList.toggle('hidden');
  if (!searchBar.classList.contains('hidden')) {
    mobileSearch.focus();
  }
});

document.getElementById('sortSelector')?.addEventListener('change', (e) => {
  sortOption = e.target.value;
  renderProducts();
});

document.getElementById('resetFiltersBtn')?.addEventListener('click', resetAllFilters);

// Menú Móvil
const mobileMenuBtn = document.getElementById('mobileMenuBtn');
const closeMobileMenuBtn = document.getElementById('closeMobileMenuBtn');
const mobileMenu = document.getElementById('mobileMenu');

mobileMenuBtn?.addEventListener('click', () => mobileMenu.classList.remove('hidden'));
closeMobileMenuBtn?.addEventListener('click', () => mobileMenu.classList.add('hidden'));

document.querySelectorAll('.mobile-nav-link').forEach(link => {
  link.addEventListener('click', () => mobileMenu.classList.add('hidden'));
});

document.getElementById('mobileAdminQuickBtn')?.addEventListener('click', () => {
  mobileMenu.classList.add('hidden');
  openAdminModal();
});

// Triggers del Carrito
document.getElementById('openCartBtn')?.addEventListener('click', openCart);
document.getElementById('closeCartBtn')?.addEventListener('click', closeCart);
document.getElementById('cartDrawerBackdrop')?.addEventListener('click', closeCart);
document.getElementById('openCheckoutModalBtn')?.addEventListener('click', openCheckoutModal);

// Trigger del Panel Admin
document.getElementById('openAdminBtn')?.addEventListener('click', openAdminModal);

// Visibilidad secreta del Admin
function unlockAdminAccess() {
  sessionStorage.setItem('aura_admin_visible', 'true');
  
  const desktopBtn = document.getElementById('openAdminBtn');
  const mobileBtn = document.getElementById('mobileAdminQuickBtn');

  if (desktopBtn) desktopBtn.classList.remove('hidden');
  if (mobileBtn) mobileBtn.classList.remove('hidden');
}

function checkAdminUrlAccess() {
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('admin') === '1' || sessionStorage.getItem('aura_admin_visible') === 'true') {
    unlockAdminAccess();
  }
}

// Botón "Restaurar productos de ejemplo" (evita error si se hace clic)
function restoreDefaultProducts() {
  showToast('Para agregar productos usa el formulario superior.', 'info');
}

// Cargar categorías desde Supabase
async function fetchCategoriesFromCloud() {
  try {
    const { data, error } = await _supabase
      .from('categories')
      .select('*')
      .order('name', { ascending: true });

    if (error) throw error;
    storeCategories = data || [];

    renderCategoriesAdmin();
    populateProductCategorySelect();
    renderCategories(); // Actualiza las burbujas de filtros de la tienda
  } catch (err) {
    console.error('Error al cargar categorías:', err);
  }
}

// Llenar el <select> del formulario de productos
function populateProductCategorySelect() {
  const select = document.getElementById('formProdCategory');
  if (!select) return;

  const currentVal = select.value;
  select.innerHTML = '<option value="">-- Seleccionar categoría --</option>' + 
    storeCategories.map(cat => `
      <option value="${cat.name}">${cat.name}</option>
    `).join('');

  if (currentVal) select.value = currentVal;
}

// Renderizar la lista dentro del panel de administración
function renderCategoriesAdmin() {
  const list = document.getElementById('adminCategoriesList');
  const countEl = document.getElementById('catTotalCount');
  if (countEl) countEl.textContent = storeCategories.length;
  if (!list) return;

  if (storeCategories.length === 0) {
    list.innerHTML = `<li class="p-4 text-center text-slate-400">No hay categorías registradas.</li>`;
    return;
  }

  list.innerHTML = storeCategories.map(cat => {
    // Cuenta cuántos productos usan esta categoría
    const prodCount = products.filter(p => p.category?.toLowerCase() === cat.name.toLowerCase()).length;

    return `
      <li class="flex items-center justify-between p-3.5 hover:bg-slate-50 transition-colors">
        <div class="flex items-center gap-2.5">
          <i class="fa-solid fa-tag text-emerald-600 text-xs"></i>
          <span class="font-bold text-slate-800">${cat.name}</span>
          <span class="text-[10px] text-slate-400">(${prodCount} productos)</span>
        </div>
        <button onclick="deleteCategory('${cat.id}', '${cat.name}', ${prodCount})" class="text-slate-400 hover:text-red-600 p-1.5 rounded-lg transition-colors" title="Eliminar categoría">
          <i class="fa-solid fa-trash-can"></i>
        </button>
      </li>
    `;
  }).join('');
}

// Crear nueva categoría
async function handleCreateCategory(e) {
  e.preventDefault();
  const input = document.getElementById('newCategoryName');
  const name = input.value.trim();
  const saveBtn = document.getElementById('saveCatBtn');

  if (!name) return;

  // Evita duplicados en cliente
  const exists = storeCategories.some(c => c.name.toLowerCase() === name.toLowerCase());
  if (exists) {
    showToast('Esta categoría ya existe', 'error');
    return;
  }

  saveBtn.disabled = true;
  try {
    const { error } = await _supabase.from('categories').insert([{ name }]);
    if (error) throw error;

    input.value = '';
    showToast(`Categoría "${name}" agregada`);
    await fetchCategoriesFromCloud();
  } catch (err) {
    console.error(err);
    showToast('Error al guardar categoría', 'error');
  } finally {
    saveBtn.disabled = false;
  }
}

// Eliminar categoría
function deleteCategory(catId, catName, prodCount) {
  if (prodCount > 0) {
    showToast(`No puedes eliminar "${catName}" porque tiene ${prodCount} producto(s) asignado(s).`, 'error');
    return;
  }

  showConfirmDialog({
    title: 'Eliminar Categoría',
    message: `¿Estás seguro de eliminar la categoría "${catName}"?`,
    onConfirm: async () => {
      try {
        const { error } = await _supabase.from('categories').delete().eq('id', catId);
        if (error) throw error;

        showToast(`Categoría "${catName}" eliminada`);
        await fetchCategoriesFromCloud();
      } catch (err) {
        console.error(err);
        showToast('Error al eliminar categoría', 'error');
      }
    }
  });
}
// ========================================================
// MÓDULO PRIVADO: SIMULADOR DE CUOTAS ADMIN
// ========================================================

// 1. Carga los productos registrados en el desplegable de la calculadora
function populateInstallmentsProductSelect() {
  const select = document.getElementById('calcProductSelect');
  if (!select) return;

  const currentVal = select.value;
  select.innerHTML = '<option value="">-- Ingresar monto manual --</option>' + 
    products.map(p => `
      <option value="${p.id}">${p.name} - ${formatCurrency(p.price)}</option>
    `).join('');

  if (currentVal) select.value = currentVal;
}

// 2. Al seleccionar un producto, copia su precio automáticamente al campo de cálculo
function onSelectProductForInstallment(productId) {
  const basePriceInput = document.getElementById('calcBasePrice');
  if (!productId) {
    if (basePriceInput) basePriceInput.value = '';
    calculateInstallmentsTable();
    return;
  }

  const prod = products.find(p => p.id === productId);
  if (prod && basePriceInput) {
    basePriceInput.value = prod.price;
    calculateInstallmentsTable();
  }
}

// 3. Genera la tabla matemática de cuotas
function calculateInstallmentsTable() {
  const tbody = document.getElementById('installmentsResultTableBody');
  const basePrice = parseFloat(document.getElementById('calcBasePrice')?.value) || 0;
  const interestPerQuota = parseFloat(document.getElementById('calcInterestRate')?.value) || 0;
  const maxQuotas = parseInt(document.getElementById('calcMaxQuotas')?.value, 10) || 6;

  if (!tbody) return;

  if (basePrice <= 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="4" class="p-6 text-center text-slate-400">
          Selecciona un producto o escribe un monto al contado para simular las cuotas.
        </td>
      </tr>
    `;
    return;
  }

  let html = '';

  // Fila 1: Precio Contado base
  html += `
    <tr class="bg-emerald-50/40">
      <td class="p-3 font-bold text-slate-800">1 cuota (Contado)</td>
      <td class="p-3 text-slate-500">Sin recargo (0%)</td>
      <td class="p-3 font-bold text-emerald-700">${formatCurrency(basePrice)}</td>
      <td class="p-3 font-extrabold text-slate-900">${formatCurrency(basePrice)}</td>
    </tr>
  `;

  // Filas de cuotas financiadas (desde 2 hasta maxQuotas)
  for (let q = 2; q <= maxQuotas; q++) {
    const totalSurchargePct = q * interestPerQuota; // Ej: 3 cuotas * 5% = 15%
    const totalAmount = Math.round(basePrice * (1 + totalSurchargePct / 100));
    const quotaAmount = Math.round(totalAmount / q);

    html += `
      <tr class="hover:bg-slate-50 transition-colors">
        <td class="p-3 font-bold text-slate-800">${q} cuotas</td>
        <td class="p-3 text-amber-700 font-medium">+${totalSurchargePct}%</td>
        <td class="p-3 font-bold text-emerald-600">${formatCurrency(quotaAmount)}</td>
        <td class="p-3 font-bold text-slate-900">${formatCurrency(totalAmount)}</td>
      </tr>
    `;
  }

  tbody.innerHTML = html;
}

// 4. Copia un resumen listo para enviar por WhatsApp al cliente
function copyInstallmentsBudget() {
  const basePrice = parseFloat(document.getElementById('calcBasePrice')?.value) || 0;
  const interestPerQuota = parseFloat(document.getElementById('calcInterestRate')?.value) || 0;
  const maxQuotas = parseInt(document.getElementById('calcMaxQuotas')?.value, 10) || 6;
  const productSelect = document.getElementById('calcProductSelect');
  
  if (basePrice <= 0) {
    showToast('Ingresa un monto al contado primero', 'error');
    return;
  }

  const selectedProdName = productSelect && productSelect.value 
    ? products.find(p => p.id === productSelect.value)?.name 
    : 'el producto consultado';

  let msg = `Hola! Te paso las opciones de pago para *${selectedProdName}*:\n\n`;
  msg += `💵 *Contado:* ${formatCurrency(basePrice)}\n\n`;
  msg += `💳 *Planes de Cuotas:*\n`;

  for (let q = 2; q <= maxQuotas; q++) {
    const totalSurchargePct = q * interestPerQuota;
    const totalAmount = Math.round(basePrice * (1 + totalSurchargePct / 100));
    const quotaAmount = Math.round(totalAmount / q);
    msg += `• *${q} cuotas* de *${formatCurrency(quotaAmount)}* (Total: ${formatCurrency(totalAmount)})\n`;
  }

  msg += `\nCualquier consulta estamos a las órdenes para coordinar la entrega!`;

  navigator.clipboard.writeText(msg).then(() => {
    showToast('Presupuesto copiado. ¡Listo para pegar en WhatsApp!');
  }).catch(() => {
    showToast('Error al copiar al portapapeles', 'error');
  });
}
// ========================================================
// MÓDULO CRM: GESTIÓN DE CLIENTES
// ========================================================

let storeClients = [];
let clientSearchQuery = '';

// 1. Cargar clientes desde Supabase
async function fetchClientsFromCloud() {
  try {
    const { data, error } = await _supabase
      .from('clients')
      .select('*')
      .order('name', { ascending: true });

    if (error) throw error;
    storeClients = data || [];
    renderClientsTable();
  } catch (err) {
    console.error('Error al cargar clientes:', err);
  }
}

// 2. Filtrar clientes en tiempo real
function handleClientSearch(val) {
  clientSearchQuery = val.toLowerCase().trim();
  renderClientsTable();
}

// 3. Renderizar la tabla de clientes
function renderClientsTable() {
  const tbody = document.getElementById('clientsTableBody');
  const countEl = document.getElementById('totalClientsCount');
  if (!tbody) return;

  const filtered = storeClients.filter(c => {
    const nameMatch = c.name?.toLowerCase().includes(clientSearchQuery);
    const phoneMatch = c.phone?.toLowerCase().includes(clientSearchQuery);
    const cityMatch = c.city?.toLowerCase().includes(clientSearchQuery);
    return nameMatch || phoneMatch || cityMatch;
  });

  if (countEl) countEl.textContent = storeClients.length;

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5" class="p-6 text-center text-slate-400">
          <i class="fa-solid fa-address-book text-2xl mb-1 text-slate-300 block"></i>
          ${storeClients.length === 0 ? 'No hay clientes registrados aún.' : 'No se encontraron clientes coincidentes.'}
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = filtered.map(c => {
    // Sanitizar número para enlace a WhatsApp
    const cleanPhone = (c.phone || '').replace(/\D/g, '');
    const waLink = `https://wa.me/${cleanPhone}`;

    // Colores para el tipo de cliente
    const badgeColors = {
      'Mayorista': 'bg-emerald-100 text-emerald-800',
      'Cuotas': 'bg-amber-100 text-amber-800',
      'Frecuente': 'bg-blue-100 text-blue-800',
      'Minorista': 'bg-slate-100 text-slate-700'
    };
    const badgeClass = badgeColors[c.category] || 'bg-slate-100 text-slate-700';

    return `
      <tr class="hover:bg-slate-50 transition-colors">
        <td class="p-3">
          <p class="font-bold text-slate-900 text-xs">${c.name}</p>
          <span class="text-[11px] text-slate-500 font-mono flex items-center gap-1 mt-0.5">
            <i class="fa-solid fa-phone text-[9px] text-slate-400"></i> ${c.phone}
          </span>
        </td>
        <td class="p-3">
          <p class="text-xs text-slate-800 font-semibold">${c.city || '<span class="text-slate-300">-</span>'}</p>
          <span class="text-[10px] text-slate-400 block truncate max-w-[150px]">${c.address || ''}</span>
        </td>
        <td class="p-3">
          <span class="px-2 py-0.5 rounded text-[10px] font-bold ${badgeClass}">${c.category}</span>
        </td>
        <td class="p-3">
          <p class="text-[11px] text-slate-600 truncate max-w-[200px]" title="${c.notes || ''}">
            ${c.notes || '<span class="text-slate-300">Sin notas</span>'}
          </p>
        </td>
        <td class="p-3 text-right space-x-1 whitespace-nowrap">
          <a href="${waLink}" target="_blank" class="inline-block p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors" title="Abrir chat en WhatsApp">
            <i class="fa-brands fa-whatsapp text-sm"></i>
          </a>
          <button onclick="editClient('${c.id}')" class="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="Editar ficha">
            <i class="fa-solid fa-pen-to-square"></i>
          </button>
          <button onclick="deleteClient('${c.id}', '${c.name}')" class="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Eliminar cliente">
            <i class="fa-solid fa-trash"></i>
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

// 4. Guardar o actualizar cliente
async function handleSaveClient(e) {
  e.preventDefault();
  const id = document.getElementById('editClientId').value;
  const name = document.getElementById('formClientName').value.trim();
  const phone = document.getElementById('formClientPhone').value.trim();
  const category = document.getElementById('formClientCategory').value;
  const city = document.getElementById('formClientCity').value.trim();
  const address = document.getElementById('formClientAddress').value.trim();
  const notes = document.getElementById('formClientNotes').value.trim();
  const saveBtn = document.getElementById('saveClientBtn');

  if (!name || !phone) {
    showToast('Nombre y teléfono son obligatorios', 'error');
    return;
  }

  saveBtn.disabled = true;

  const clientData = { name, phone, category, city, address, notes };

  try {
    if (id) {
      // Actualizar existente
      const { error } = await _supabase.from('clients').update(clientData).eq('id', id);
      if (error) throw error;
      showToast('Cliente actualizado con éxito');
    } else {
      // Crear nuevo
      const { error } = await _supabase.from('clients').insert([clientData]);
      if (error) throw error;
      showToast('Cliente registrado con éxito');
    }

    resetClientForm();
    await fetchClientsFromCloud();
  } catch (err) {
    console.error(err);
    showToast('Error al guardar cliente', 'error');
  } finally {
    saveBtn.disabled = false;
  }
}

// 5. Cargar datos para editar
function editClient(id) {
  const c = storeClients.find(item => item.id === id);
  if (!c) return;

  document.getElementById('editClientId').value = c.id;
  document.getElementById('formClientName').value = c.name;
  document.getElementById('formClientPhone').value = c.phone;
  document.getElementById('formClientCategory').value = c.category || 'Minorista';
  document.getElementById('formClientCity').value = c.city || '';
  document.getElementById('formClientAddress').value = c.address || '';
  document.getElementById('formClientNotes').value = c.notes || '';

  document.getElementById('clientFormTitle').innerHTML = '<i class="fa-solid fa-pen-to-square text-emerald-600"></i> Editar Datos de Cliente';
  document.getElementById('cancelEditClientBtn')?.classList.remove('hidden');
  document.getElementById('saveClientBtn').innerHTML = '<i class="fa-solid fa-arrows-rotate"></i> Actualizar Cliente';
  
  // Desplazar suavemente hacia el formulario
  document.getElementById('tabContentClients').scrollTo({ top: 0, behavior: 'smooth' });
}

// 6. Resetear formulario
function resetClientForm() {
  document.getElementById('clientManageForm').reset();
  document.getElementById('editClientId').value = '';
  document.getElementById('clientFormTitle').innerHTML = '<i class="fa-solid fa-user-plus text-emerald-600"></i> Registrar Nuevo Cliente';
  document.getElementById('cancelEditClientBtn')?.classList.add('hidden');
  document.getElementById('saveClientBtn').innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Guardar Cliente';
}

// 7. Eliminar cliente
function deleteClient(id, name) {
  showConfirmDialog({
    title: 'Eliminar Cliente',
    message: `¿Estás seguro de eliminar a "${name}" de tu base de clientes?`,
    onConfirm: async () => {
      try {
        const { error } = await _supabase.from('clients').delete().eq('id', id);
        if (error) throw error;
        showToast('Cliente eliminado');
        await fetchClientsFromCloud();
      } catch (err) {
        console.error(err);
        showToast('Error al eliminar cliente', 'error');
      }
    }
  });
}

// Inicialización
window.addEventListener('DOMContentLoaded', () => {
  applyStoreConfigUI();
  renderCategories();
  renderProducts();
  updateCartUI();
  fetchStoreConfigFromCloud();
  fetchProductsFromCloud();
  fetchCategoriesFromCloud();
  fetchClientsFromCloud();
  checkAdminUrlAccess();
});
