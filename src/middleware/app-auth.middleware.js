const { findSessionFromRequest, secureTextEqual } = require('../services/auth.service');

function unauthorized(message = 'Inicia sesión para acceder a Budisa.') {
  const error = new Error(message);
  error.code = 'AUTH_REQUIRED';
  error.statusCode = 401;
  return error;
}

async function requireAppSession(req, res, next) {
  try {
    const session = await findSessionFromRequest(req);
    if (!session) return next(unauthorized());
    req.appSession = session;
    req.appUser = { username: session.username };
    return next();
  } catch (error) {
    return next(error);
  }
}

function requireCsrfForUnsafeMethods(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();

  const csrfToken = req.get('X-Budisa-CSRF') || '';
  if (!csrfToken || !secureTextEqual(csrfToken, req.appSession?.csrfToken || '')) {
    const error = new Error('La sesión de seguridad ha caducado. Recarga la aplicación e inténtalo de nuevo.');
    error.code = 'INVALID_CSRF_TOKEN';
    error.statusCode = 403;
    return next(error);
  }

  return next();
}

module.exports = { requireAppSession, requireCsrfForUnsafeMethods };
