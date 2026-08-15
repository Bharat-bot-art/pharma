const express = require('express');
const { db } = require('../config/db');
const { ApiError } = require('../utils/ApiError');
const { requireAuth } = require('../middleware/auth');
const { env } = require('../config/env');
const catalog = require('../services/catalog');

const router = express.Router();

function getCartCount(req, res) {
  const sid = req.cookies.biosym_cart;
  if (req.user) {
    const r = db.prepare('SELECT COALESCE(SUM(qty),0) AS c FROM cart_items WHERE user_id = ? AND is_saved = 0').get(req.user.id);
    return r.c;
  }
  if (!sid) return 0;
  const r = db.prepare('SELECT COALESCE(SUM(qty),0) AS c FROM cart_items WHERE session_id = ? AND is_saved = 0').get(sid);
  return r.c;
}

function getWishlistIds(userId) {
  if (!userId) return new Set();
  const rows = db.prepare('SELECT product_id FROM wishlist WHERE user_id = ?').all(userId);
  return new Set(rows.map((r) => r.product_id));
}

function getActiveBanners() {
  return db.prepare('SELECT * FROM banners WHERE is_active = 1 ORDER BY sort_order, id LIMIT 5').all();
}

router.use((req, res, next) => {
  res.locals.cartCount = getCartCount(req, res);
  res.locals.wishlistIds = getWishlistIds(req.user && req.user.id);
  res.locals.env = { razorpayKeyId: env.razorpay.keyId || '', baseUrl: env.baseUrl };
  res.locals.whatsappNumber = env.whatsapp;
  next();
});

router.get('/', (req, res) => {
  const featured = db.prepare('SELECT * FROM products WHERE featured = 1 ORDER BY rating DESC LIMIT 8').all().map(catalog.hydrate);
  const bestSellers = catalog.bestSellers(8);
  const topRated = db.prepare('SELECT * FROM products ORDER BY rating_count DESC LIMIT 8').all().map(catalog.hydrate);
  const newest = catalog.newest(8);
  const categories = catalog.getCategoryTree();
  const combos = catalog.getCombos().slice(0, 4);
  const banners = getActiveBanners();
  res.render('pages/home', {
    title: 'BIOSYM Pharma — Trusted Online Pharmacy', page: 'home',
    featured, bestSellers, topRated, newest, categories, combos, banners,
  });
});

router.get('/shop', (req, res) => {
  const q = { ...req.query };
  const limit = 24;
  const result = catalog.queryProducts({
    category: q.category, subcategory: q.subcategory, q: q.q, brand: q.brand,
    minPrice: q.minPrice, maxPrice: q.maxPrice, availability: q.availability,
    rating: q.rating, discount: q.discount, featured: q.featured, rx: q.rx,
    sort: q.sort, limit, offset: 0,
  });
  const categories = catalog.getCategoryTree();
  const brands = catalog.getBrands();
  const priceBounds = catalog.getPriceBounds();
  const categoriesCount = db.prepare('SELECT COUNT(*) AS c FROM products').get().c;
  res.render('pages/shop', {
    title: q.q ? `Search: ${q.q}` : q.category ? `Shop ${q.category}` : 'Shop All Products',
    page: 'shop', products: result.products, total: result.total, categories, brands,
    priceBounds, categoriesCount, query: q, initialLimit: limit,
  });
});

router.get('/categories', (req, res) => {
  const categories = catalog.getCategoryTree();
  res.render('pages/categories', { title: 'Shop by Category', page: 'categories', categories });
});

router.get('/product/:slug', (req, res, next) => {
  const row = catalog.getProductBySlug(req.params.slug);
  if (!row) return next(ApiError.notFound('PRODUCT_NOT_FOUND', 'Product not found.'));
  const product = catalog.hydrate(row);
  const related = catalog.related(row.id, row.category_id);
  const recommended = catalog.recommendedForUser(req.user && req.user.id);
  const frequentlyBought = catalog.frequentlyBoughtTogether(row.id);
  const combos = catalog.getCombos().filter((c) => c.items.some((i) => i.product.id === row.id)).slice(0, 3);
  const reviews = db.prepare(
    `SELECT r.*, u.full_name FROM reviews r JOIN users u ON u.id = r.user_id
     WHERE r.product_id = ? AND r.status = 'approved' ORDER BY r.created_at DESC LIMIT 12`
  ).all(row.id);
  const faqs = db.prepare(
    `SELECT * FROM faqs WHERE is_active = 1 AND (product_id = ? OR product_id IS NULL)
     ORDER BY (product_id = ?) DESC, sort_order, id LIMIT 20`
  ).all(row.id, row.id);
  res.render('pages/product', {
    title: row.name, page: 'shop', product, related, recommended, frequentlyBought,
    combos, reviews, faqs, categoryTree: catalog.getCategoryTree(),
  });
});

router.get('/combos', (req, res) => {
  const combos = catalog.getCombos();
  res.render('pages/combos', { title: 'Combo Offers', page: 'combo', combos });
});

router.get('/faq', (req, res) => {
  const general = db.prepare(
    `SELECT * FROM faqs WHERE is_active = 1 AND product_id IS NULL ORDER BY sort_order, id`
  ).all();
  res.render('pages/faq', { title: 'Frequently Asked Questions', page: 'faq', faqs: general });
});

router.get('/cart', (req, res) => {
  res.render('pages/cart', { title: 'Your Cart', page: 'cart' });
});

router.get('/checkout', requireAuth, (req, res) => {
  res.render('pages/checkout', { title: 'Checkout', page: 'checkout' });
});

router.get('/order/:orderNumber/success', requireAuth, (req, res, next) => {
  const order = db.prepare('SELECT * FROM orders WHERE order_number = ? AND user_id = ?').get(req.params.orderNumber, req.user.id);
  if (!order) return next(ApiError.notFound('ORDER_NOT_FOUND', 'Order not found.'));
  order.items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(order.id);
  res.render('pages/order-success', { title: 'Order Confirmed', page: 'account', order });
});

router.get('/login', (req, res) => {
  if (req.user) return res.redirect('/account');
  res.render('auth/login', { title: 'Sign in to BIOSYM', page: 'auth', redirect: req.query.redirect || '/account' });
});

router.get('/register', (req, res) => {
  if (req.user) return res.redirect('/account');
  res.render('auth/register', { title: 'Create your BIOSYM account', page: 'auth', redirect: req.query.redirect || '/account' });
});

router.get('/otp-verify', (req, res) => {
  if (req.user) return res.redirect('/account');
  const { identifier, channel, purpose, redirect } = req.query;
  if (!identifier || !channel || !purpose) return res.redirect('/login');
  res.render('auth/otp', {
    title: 'Verify OTP', page: 'auth',
    identifier, channel, purpose,
    redirect: redirect || '/account',
  });
});

router.get('/forgot-password', (req, res) => {
  if (req.user) return res.redirect('/account');
  res.render('auth/forgot', { title: 'Reset your password', page: 'auth' });
});

router.get('/reset-password', (req, res) => {
  const { token } = req.query;
  if (!token) return res.redirect('/forgot-password');
  res.render('auth/reset', { title: 'Set a new password', page: 'auth', token });
});

router.get('/account', requireAuth, (req, res) => {
  res.render('account/account', { title: 'My Account', page: 'account', user: req.user });
});

router.get('/orders', requireAuth, (req, res) => {
  res.render('account/orders', { title: 'My Orders', page: 'account' });
});

router.get('/orders/:orderNumber', requireAuth, (req, res, next) => {
  const order = db.prepare('SELECT * FROM orders WHERE order_number = ? AND user_id = ?').get(req.params.orderNumber, req.user.id);
  if (!order) return next(ApiError.notFound('ORDER_NOT_FOUND', 'Order not found.'));
  order.items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(order.id);
  const events = db.prepare('SELECT * FROM tracking_events WHERE order_id = ? ORDER BY id').all(order.id);
  const shipment = require('../services/shiprocket');
  const trackInfo = shipment.isConfigured() && order.tracking_number ? null : null;
  res.render('account/order-detail', {
    title: `Order ${order.order_number}`, page: 'account', order, events,
    shiprocketConfigured: shipment.isConfigured(), trackInfo,
  });
});

router.get('/wishlist', requireAuth, (req, res) => {
  res.render('account/wishlist', { title: 'My Wishlist', page: 'account' });
});

router.get('/addresses', requireAuth, (req, res) => {
  res.render('account/addresses', { title: 'Saved Addresses', page: 'account', user: req.user });
});

router.get('/about', (req, res) => {
  res.render('pages/about', { title: 'About BIOSYM Pharma', page: 'about' });
});

router.get('/contact', (req, res) => {
  res.render('pages/contact', { title: 'Contact BIOSYM Pharma', page: 'contact' });
});

router.get('/consultation', (req, res) => {
  res.render('pages/consultation', { title: 'Free Consultation', page: 'contact', user: req.user || null });
});

const adminPages = [
  { path: '/admin', view: 'admin/dashboard', section: 'dashboard', title: 'Admin Dashboard' },
  { path: '/admin/products', view: 'admin/products', section: 'products', title: 'Manage Products' },
  { path: '/admin/categories', view: 'admin/categories', section: 'categories', title: 'Manage Categories' },
  { path: '/admin/coupons', view: 'admin/coupons', section: 'coupons', title: 'Manage Coupons' },
  { path: '/admin/orders', view: 'admin/orders', section: 'orders', title: 'Manage Orders' },
  { path: '/admin/users', view: 'admin/users', section: 'users', title: 'Manage Users' },
  { path: '/admin/reviews', view: 'admin/reviews', section: 'reviews', title: 'Moderate Reviews' },
  { path: '/admin/banners', view: 'admin/banners', section: 'banners', title: 'Manage Banners' },
  { path: '/admin/appearance', view: 'admin/appearance', section: 'appearance', title: 'Site Appearance' },
  { path: '/admin/home_builder', view: 'admin/home_builder', section: 'home_builder', title: 'Home Page Builder' },
  { path: '/admin/coupons', view: 'admin/coupons', section: 'coupons', title: 'Discount Coupons' },
  { path: '/admin/pages', view: 'admin/pages', section: 'pages', title: 'Static Pages' },
  { path: '/admin/consultations', view: 'admin/consultations', section: 'consultations', title: 'Consultation Requests' },
  { path: '/admin/support', view: 'admin/support', section: 'support', title: 'Support Messages' },
  { path: '/admin/reports', view: 'admin/reports', section: 'reports', title: 'Sales Reports' },
  { path: '/admin/audit', view: 'admin/audit', section: 'audit', title: 'Audit Logs' },
];

for (const p of adminPages) {
  router.get(p.path, requireAuth, (req, res, next) => {
    if (req.user.role !== 'admin') return res.status(403).render('errors/403', { title: 'Access denied' });
    res.render(p.view, { title: p.title, page: 'admin', adminSection: p.section });
  });
}

module.exports = router;
