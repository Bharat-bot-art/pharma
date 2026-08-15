const { db } = require('../config/db');

function logAudit(req, action, entity, entity_id, details) {
  try {
    const adminId = req.user ? req.user.id : null;
    if (!adminId) return;
    
    // Only trust the first proxy IP if running behind a proxy like Nginx
    const ip = req.headers['x-forwarded-for'] ? req.headers['x-forwarded-for'].split(',')[0].trim() : req.socket.remoteAddress;

    db.prepare(`
      INSERT INTO audit_logs (admin_id, action, entity, entity_id, details, ip_address)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(adminId, action, entity, entity_id, details ? JSON.stringify(details) : null, ip);
  } catch (err) {
    console.error('Audit Log Error:', err);
  }
}

// Middleware factory for easier route-level integration
function audit(action, entity, extractEntityId = (req) => req.params.id) {
  return (req, res, next) => {
    // We hook into the response finish event so we only log successful actions
    res.on('finish', () => {
      // Only log on successful creation, update, or deletion
      if (res.statusCode >= 200 && res.statusCode < 300) {
        let entityId = null;
        try {
          entityId = extractEntityId(req, res);
        } catch (e) {
          // ignore
        }
        
        let details = null;
        if (req.method !== 'GET' && req.method !== 'DELETE') {
          // Clone body and remove sensitive info if needed
          details = { ...req.body };
          delete details.password;
        }

        logAudit(req, action, entity, entityId, details);
      }
    });
    next();
  };
}

module.exports = { logAudit, audit };
