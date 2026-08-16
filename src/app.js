const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');
const { migrate } = require('./config/db');
const { seedAdmin } = require('./scripts/seedAdmin');
const { optionalAuth, setViewLocals } = require('./middleware/auth');
const { notFoundHandler, errorHandler } = require('./middleware/errorHandler');
const img = require('./services/img');
const pages = require('./routes/pages.routes');

const authRoutes = require('./routes/auth.routes');
const contentRoutes = require('./routes/content.routes');
const couponRoutes = require('./routes/coupons.routes');
const reviewRoutes = require('./routes/reviews.routes');
const catalogRoutes = require('./routes/catalog.routes');
const cartRoutes = require('./routes/cart.routes');
const wishlistRoutes = require('./routes/wishlist.routes');
const ordersRoutes = require('./routes/orders.routes');
const accountRoutes = require('./routes/account.routes');
const adminRoutes = require('./routes/admin.routes');

function createApp() {
  migrate();
  seedAdmin();

  const app = express();
  app.set('view engine', 'ejs');
  app.set('views', path.join(process.cwd(), 'views'));
  app.disable('x-powered-by');

  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));
  app.use(cookieParser());
  app.use(optionalAuth);
  app.use(setViewLocals);

  app.use(express.static(path.join(process.cwd(), 'public'), {
    maxAge: process.env.NODE_ENV === 'production' ? '7d' : 0,
  }));

  const uploadDir = process.env.AWS_LAMBDA_FUNCTION_NAME
    ? path.join('/tmp', 'uploads')
    : path.join(process.cwd(), 'data', 'uploads');

  app.use('/uploads', express.static(uploadDir, {
    maxAge: process.env.NODE_ENV === 'production' ? '7d' : 0,
  }));

  app.get('/img/:kind/:spec.svg', img.serve);

  app.use('/api/auth', authRoutes);
  app.use('/api', contentRoutes);
  app.use('/api', couponRoutes);
  app.use('/api', reviewRoutes);
  app.use('/api', catalogRoutes);
  app.use('/api', cartRoutes);
  app.use('/api', wishlistRoutes);
  app.use('/api', ordersRoutes);
  app.use('/api/account', accountRoutes);
  app.use('/api/admin', adminRoutes);

  app.get('/health', (req, res) => res.json({ ok: true, service: 'biosym', time: new Date().toISOString() }));

  app.use('/', pages);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

module.exports = { createApp };
