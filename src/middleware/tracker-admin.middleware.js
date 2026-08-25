const crypto = require('crypto');
const { config } = require('../config/env');

function secureTextEqual(left, right) {
  const leftBuffer = Buffer.from(String(left || ''));
  const rightBuffer = Buffer.from(String(right || ''));
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function requireTrackerAdmin(req, res, next) {
  if (!config.trackerAdminToken) {
    return res.status(503).json({
      ok: false,
      code: 'TRACKER_ADMIN_NOT_CONFIGURED',
      error: 'Configura TRACKER_ADMIN_TOKEN en Render para administrar dispositivos.'
    });
  }

  const suppliedToken = req.get('X-Tracker-Admin-Token');
  if (!secureTextEqual(suppliedToken, config.trackerAdminToken)) {
    return res.status(401).json({
      ok: false,
      code: 'INVALID_ADMIN_TOKEN',
      error: 'La clave de administración no es válida.'
    });
  }

  return next();
}

module.exports = { requireTrackerAdmin, secureTextEqual };
