const { db } = require('../config/db');
const { discountPercent } = require('../utils/helpers');

const PRODUCT_SELECT = `
  SELECT p.id, p.category_id, p.name, p.slug, p.short_description, 
         p.mrp, p.price, p.stock, p.is_prescription, p.featured, p.rating, 
         p.rating_count, p.image_hue, p.tags, p.brand, p.gallery_hues, p.created_at, p.updated_at,
         CASE WHEN p.image LIKE 'data:%' THEN 'data:image' ELSE p.image END AS image,
         c.name AS category_name, c.slug AS category_slug,
         (SELECT COALESCE(SUM(oi.qty), 0) FROM order_items oi WHERE oi.product_id = p.id) AS sold_count
  FROM products p LEFT JOIN categories c ON c.id = p.category_id`;

const PRODUCT_SELECT_FULL = `
  SELECT p.id, p.category_id, p.name, p.slug, p.short_description, p.description, 
         p.mrp, p.price, p.stock, p.is_prescription, p.featured, p.rating, 
         p.rating_count, p.image_hue, p.tags, p.brand, p.gallery_hues, p.created_at, p.updated_at,
         CASE WHEN p.image LIKE 'data:%' THEN 'data:image' ELSE p.image END AS image,
         c.name AS category_name, c.slug AS category_slug,
         (SELECT COALESCE(SUM(oi.qty), 0) FROM order_items oi WHERE oi.product_id = p.id) AS sold_count
  FROM products p LEFT JOIN categories c ON c.id = p.category_id`;

function hydrate(product) {
  if (!product) return null;
  return {
    id: product.id,
    name: product.name,
    slug: product.slug,
    shortDescription: product.short_description,
    description: product.description,
    mrp: product.mrp,
    price: product.price,
    discount: discountPercent(product.mrp, product.price),
    stock: product.stock,
    stockStatus: product.stock <= 0 ? 'out_of_stock' : product.stock <= 10 ? 'low_stock' : 'in_stock',
    isPrescription: !!product.is_prescription,
    rating: product.rating,
    ratingCount: product.rating_count,
    featured: !!product.featured,
    tags: product.tags ? product.tags.split(',').map((t) => t.trim()).filter(Boolean) : [],
    brand: product.brand || '',
    image: product.image && product.image.startsWith('data:') 
      ? `/api/img/product/${product.id}` 
      : (product.image && !product.image.startsWith('http') && !product.image.startsWith('/') 
          ? `/uploads/products/${product.image}` 
          : product.image),
    imageHue: product.image_hue,
    image_hue: product.image_hue,
    galleryHues: parseGallery(product.gallery_hues, product.image_hue),
    sold: product.sold_count || 0,
    categoryId: product.category_id,
    category: product.category_name,
    categorySlug: product.category_slug,
  };
}

function parseGallery(galleryHues, fallback) {
  if (galleryHues) {
    const hues = String(galleryHues).split(',').map((h) => parseInt(h, 10)).filter((h) => !Number.isNaN(h));
    if (hues.length) return hues;
  }
  return [fallback || 0];
}

function getCategories() {
  return db.prepare(
    `SELECT c.*, COUNT(p.id) AS product_count
     FROM categories c LEFT JOIN products p ON p.category_id = c.id
     GROUP BY c.id ORDER BY c.parent_id IS NOT NULL, c.name`
  ).all();
}

function getCategoryTree() {
  const rows = getCategories();
  const byId = new Map(rows.map((r) => [r.id, r]));
  const tree = [];
  for (const r of rows) {
    if (r.parent_id && byId.has(r.parent_id)) {
      const parent = byId.get(r.parent_id);
      parent.subcategories = parent.subcategories || [];
      parent.subcategories.push(r);
    } else {
      tree.push(r);
    }
  }
  return tree;
}

function resolveCategoryIds(slugOrName) {
  const row = db.prepare(
    `SELECT id FROM categories WHERE slug = ? OR name = ? COLLATE NOCASE LIMIT 1`
  ).get(slugOrName, slugOrName);
  if (!row) return null;
  const children = db.prepare('SELECT id FROM categories WHERE parent_id = ?').all(row.id);
  return [row.id, ...children.map((c) => c.id)];
}

const SORTS = {
  featured: 'p.featured DESC, p.rating DESC',
  best_selling: 'sold_count DESC, p.rating DESC',
  newest: 'p.created_at DESC, p.id DESC',
  price_asc: 'p.price ASC',
  price_desc: 'p.price DESC',
  az: 'p.name COLLATE NOCASE ASC',
  za: 'p.name COLLATE NOCASE DESC',
  rating: 'p.rating DESC, p.rating_count DESC',
};

function queryProducts(options = {}) {
  const {
    category, subcategory, q, brand, minPrice, maxPrice, availability,
    rating, discount, featured, rx, sort, limit = 24, offset = 0,
  } = options;

  const clauses = [];
  const params = [];

  if (subcategory) {
    const ids = resolveCategoryIds(subcategory);
    if (ids && ids.length) {
      clauses.push(`p.category_id IN (${ids.map(() => '?').join(',')})`);
      params.push(...ids);
    } else {
      clauses.push('1 = 0');
    }
  } else if (category) {
    const ids = resolveCategoryIds(category);
    if (ids && ids.length) {
      clauses.push(`p.category_id IN (${ids.map(() => '?').join(',')})`);
      params.push(...ids);
    } else {
      clauses.push('(c.slug = ? OR c.name = ?)');
      params.push(category, category);
    }
  }

  if (q) {
    clauses.push(`(p.name LIKE ? OR p.short_description LIKE ? OR p.description LIKE ? OR p.tags LIKE ? OR p.brand LIKE ?)`);
    const like = `%${q}%`;
    params.push(like, like, like, like, like);
  }

  if (brand) {
    clauses.push('p.brand = ? COLLATE NOCASE');
    params.push(brand);
  }
  if (minPrice !== undefined && minPrice !== '') {
    clauses.push('p.price >= ?');
    params.push(Number(minPrice));
  }
  if (maxPrice !== undefined && maxPrice !== '') {
    clauses.push('p.price <= ?');
    params.push(Number(maxPrice));
  }
  if (availability === 'in_stock') clauses.push('p.stock > 0');
  if (availability === 'out_of_stock') clauses.push('p.stock <= 0');
  if (rating && Number(rating) > 0) {
    clauses.push('p.rating >= ?');
    params.push(Number(rating));
  }
  if (discount && Number(discount) > 0) {
    clauses.push(`p.mrp > 0 AND ROUND(((p.mrp - p.price) / p.mrp) * 100) >= ?`);
    params.push(Number(discount));
  }
  if (featured === '1') clauses.push('p.featured = 1');
  if (rx === '1') clauses.push('p.is_prescription = 1');
  if (rx === '0') clauses.push('p.is_prescription = 0');

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const orderBy = SORTS[sort] || SORTS.featured;
  const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 24, 1), 100);
  const safeOffset = Math.max(parseInt(offset, 10) || 0, 0);

  const rows = db.prepare(`${PRODUCT_SELECT} ${where} ORDER BY ${orderBy} LIMIT ? OFFSET ?`).all(...params, safeLimit, safeOffset);
  const total = db.prepare(`SELECT COUNT(*) AS c FROM products p LEFT JOIN categories c ON c.id = p.category_id ${where}`).get(...params).c;

  return { products: rows.map(hydrate), total };
}

function autocomplete(q, limit = 8) {
  const like = `%${q}%`;
  const rows = db.prepare(
    `SELECT p.id, p.name, p.slug, p.price, p.mrp, p.image_hue, p.brand, c.name AS category_name
     FROM products p LEFT JOIN categories c ON c.id = p.category_id
     WHERE p.name LIKE ? OR p.short_description LIKE ? OR p.brand LIKE ?
     ORDER BY p.rating_count DESC LIMIT ?`
  ).all(like, like, like, Math.min(parseInt(limit, 10) || 8, 20));
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    slug: r.slug,
    price: r.price,
    mrp: r.mrp,
    discount: discountPercent(r.mrp, r.price),
    imageHue: r.image_hue,
    category: r.category_name,
  }));
}

function getProductBySlug(slug) {
  return db.prepare(`${PRODUCT_SELECT_FULL} WHERE p.slug = ?`).get(slug);
}

function related(productId, categoryId, limit = 4) {
  const rows = db.prepare(
    `${PRODUCT_SELECT} WHERE p.category_id = ? AND p.id != ? ORDER BY p.rating DESC LIMIT ?`
  ).all(categoryId, productId, limit);
  return rows.map(hydrate);
}

function frequentlyBoughtTogether(productId, limit = 3) {
  const rows = db.prepare(
    `SELECT p.*, c.name AS category_name, c.slug AS category_slug,
            (SELECT COALESCE(SUM(oi.qty), 0) FROM order_items oi WHERE oi.product_id = p.id) AS sold_count,
            COUNT(*) AS freq
     FROM order_items oi
     JOIN order_items oi2 ON oi2.order_id = oi.order_id AND oi2.product_id != oi.product_id
     JOIN products p ON p.id = oi2.product_id
     LEFT JOIN categories c ON c.id = p.category_id
     WHERE oi.product_id = ?
     GROUP BY p.id
     ORDER BY freq DESC
     LIMIT ?`
  ).all(productId, limit);
  return rows.map(hydrate);
}

function recommendedForUser(userId, limit = 4) {
  if (userId) {
    const cats = db.prepare(
      `SELECT DISTINCT p.category_id FROM order_items oi
       JOIN orders o ON o.id = oi.order_id AND o.status != 'cancelled'
       JOIN products p ON p.id = oi.product_id
       WHERE o.user_id = ? AND p.category_id IS NOT NULL`
    ).all(userId);
    if (cats.length) {
      const ids = cats.map((c) => c.category_id);
      const rows = db.prepare(
        `${PRODUCT_SELECT} WHERE p.category_id IN (${ids.map(() => '?').join(',')}) ORDER BY p.rating DESC LIMIT ?`
      ).all(...ids, limit);
      return rows.map(hydrate);
    }
  }
  return db.prepare(`${PRODUCT_SELECT} ORDER BY p.rating DESC, p.rating_count DESC LIMIT ?`).all(limit).map(hydrate);
}

function bestSellers(limit = 8) {
  return db.prepare(`${PRODUCT_SELECT} ORDER BY sold_count DESC, p.rating DESC LIMIT ?`).all(limit).map(hydrate);
}

function newest(limit = 8) {
  return db.prepare(`${PRODUCT_SELECT} ORDER BY p.created_at DESC, p.id DESC LIMIT ?`).all(limit).map(hydrate);
}

function getBrands() {
  return db.prepare(
    `SELECT COALESCE(NULLIF(brand, ''), 'Other') AS name, COUNT(*) AS product_count
     FROM products GROUP BY COALESCE(NULLIF(brand, ''), 'Other') ORDER BY name`
  ).all();
}

function getPriceBounds() {
  const row = db.prepare('SELECT MIN(price) AS min, MAX(price) AS max FROM products').get();
  return { min: Math.floor(row.min || 0), max: Math.ceil(row.max || 1000) };
}

// ---------------- Combos ----------------

function getCombos() {
  return db.prepare('SELECT * FROM combos WHERE is_active = 1 ORDER BY id').all().map((c) => {
    const items = db.prepare(
      `SELECT ci.qty, p.id, p.category_id, p.name, p.slug, p.short_description, 
         p.mrp, p.price, p.stock, p.is_prescription, p.featured, p.rating, 
         p.rating_count, p.image_hue, p.tags, p.brand, p.gallery_hues, p.created_at, p.updated_at,
         CASE WHEN p.image LIKE 'data:%' THEN 'data:image' ELSE p.image END AS image,
         c.name AS category_name, c.slug AS category_slug,
         (SELECT COALESCE(SUM(oi.qty), 0) FROM order_items oi WHERE oi.product_id = p.id) AS sold_count
       FROM combo_items ci JOIN products p ON p.id = ci.product_id
       LEFT JOIN categories c ON c.id = p.category_id
       WHERE ci.combo_id = ?`
    ).all(c.id).map((r) => ({ qty: r.qty, product: hydrate(r) }));
    const mrp = items.reduce((s, i) => s + i.product.mrp * i.qty, 0);
    const list = items.reduce((s, i) => s + i.product.price * i.qty, 0);
    const price = Math.round(list * (1 - (c.discount_percent || 0) / 100) * 100) / 100;
    return {
      id: c.id,
      name: c.name,
      slug: c.slug,
      description: c.description,
      discountPercent: c.discount_percent,
      imageHue: c.image_hue,
      items,
      mrp: Math.round(mrp * 100) / 100,
      price,
      discount: discountPercent(mrp, price),
      savings: Math.round((mrp - price) * 100) / 100,
    };
  });
}

module.exports = {
  PRODUCT_SELECT,
  hydrate,
  getCategories,
  getCategoryTree,
  resolveCategoryIds,
  queryProducts,
  autocomplete,
  getProductBySlug,
  related,
  frequentlyBoughtTogether,
  recommendedForUser,
  bestSellers,
  newest,
  getBrands,
  getPriceBounds,
  getCombos,
};
