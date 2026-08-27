const express = require('express');
const { rateLimit } = require('express-rate-limit');
const auth = require('../controllers/auth.controller');
const { requireAppSession, requireCsrfForUnsafeMethods } = require('../middleware/app-auth.middleware');

const router = express.Router();
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  handler(req, res) {
    res.status(429).json({
      ok: false,
      code: 'LOGIN_RATE_LIMITED',
      error: 'Demasiados intentos. Espera 15 minutos antes de volver a probar.'
    });
  }
});

router.post('/login', loginLimiter, auth.login);
router.get('/session', auth.session);
router.post('/logout', requireAppSession, requireCsrfForUnsafeMethods, auth.logout);

module.exports = router;
