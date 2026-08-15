const { env } = require('../config/env');

function notFoundHandler(req, res, next) {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ ok: false, code: 'NOT_FOUND', message: 'Endpoint not found.' });
  }
  res.status(404).render('errors/404', { title: 'Page not found' });
}

function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);

  const status = err.status || 500;
  const code = err.code || 'SERVER_ERROR';
  const message = err.message || 'Something went wrong on our side. Please try again.';

  if (err.name === 'PayloadTooLargeError') {
    return res.status(413).json({ ok: false, code: 'PAYLOAD_TOO_LARGE', message: 'Request too large.' });
  }

  if (status >= 500) {
    console.error('[ERROR]', err);
    if (env.nodeEnv === 'production') {
      const safe = 'Something went wrong on our side. Please try again.';
      if (req.path.startsWith('/api/')) {
        return res.status(500).json({ ok: false, code: 'SERVER_ERROR', message: safe });
      }
      return res.status(500).render('errors/500', { title: 'Something went wrong' });
    }
  }

  if (req.path.startsWith('/api/') || req.xhr) {
    return res.status(status).json({ ok: false, code, message, extra: err.extra || {} });
  }

  res.status(status).render('errors/error', { title: 'Error', status, code, message });
}

module.exports = { notFoundHandler, errorHandler };
