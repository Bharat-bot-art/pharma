const express = require('express');
const { ApiError } = require('../utils/ApiError');
const catalog = require('../services/catalog');

const router = express.Router();

router.get('/products', (req, res, next) => {
  try {
    const result = catalog.queryProducts({
      category: req.query.category,
      subcategory: req.query.subcategory,
      q: req.query.q,
      brand: req.query.brand,
      minPrice: req.query.minPrice,
      maxPrice: req.query.maxPrice,
      availability: req.query.availability,
      rating: req.query.rating,
      discount: req.query.discount,
      featured: req.query.featured,
      rx: req.query.rx,
      sort: req.query.sort,
      limit: req.query.limit || 48,
      offset: req.query.offset || 0,
    });
    res.json({ ok: true, products: result.products, total: result.total });
  } catch (e) { next(e); }
});

// Search suggestions / autocomplete
router.get('/search/suggest', (req, res, next) => {
  try {
    const q = String(req.query.q || '').trim();
    if (q.length < 2) return res.json({ ok: true, suggestions: [] });
    res.json({ ok: true, suggestions: catalog.autocomplete(q) });
  } catch (e) { next(e); }
});

router.get('/products/:slug', (req, res, next) => {
  try {
    const row = catalog.getProductBySlug(req.params.slug);
    if (!row) throw ApiError.notFound('PRODUCT_NOT_FOUND', 'Product not found.');
    const product = catalog.hydrate(row);
    const related = catalog.related(row.id, row.category_id);
    const recommended = catalog.recommendedForUser(req.user && req.user.id);
    const frequentlyBought = catalog.frequentlyBoughtTogether(row.id);
    res.json({ ok: true, product, related, recommended, frequentlyBought });
  } catch (e) { next(e); }
});

router.get('/combos', (req, res, next) => {
  try {
    res.json({ ok: true, combos: catalog.getCombos() });
  } catch (e) { next(e); }
});

router.get('/combos/:id', (req, res, next) => {
  try {
    const combo = catalog.getCombos().find((c) => c.id === parseInt(req.params.id, 10));
    if (!combo) throw ApiError.notFound('COMBO_NOT_FOUND', 'Combo offer not found.');
    res.json({ ok: true, combo });
  } catch (e) { next(e); }
});

router.get('/brands', (req, res, next) => {
  try {
    res.json({ ok: true, brands: catalog.getBrands() });
  } catch (e) { next(e); }
});

router.get('/categories', (req, res, next) => {
  try {
    const tree = req.query.tree === '1' ? catalog.getCategoryTree() : catalog.getCategories();
    res.json({ ok: true, categories: tree });
  } catch (e) { next(e); }
});

module.exports = router;
