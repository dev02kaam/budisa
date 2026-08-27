const crypto = require('crypto');
const AppSession = require('../models/AppSession');
const { config } = require('../config/env');

const SESSION_COOKIE = 'budisa_session';

function randomToken() {
  return crypto.randomBytes(32).toString('base64url');
}

function hashToken(value) {
  return crypto.createHash('sha256').update(String(value || ''), 'utf8').digest('hex');
}

function secureTextEqual(left, right) {
  const leftHash = Buffer.from(hashToken(left), 'hex');
  const rightHash = Buffer.from(hashToken(right), 'hex');
  return crypto.timingSafeEqual(leftHash, rightHash);
}

function sessionMaxAgeMs() {
  return config.appSessionHours * 60 * 60 * 1000;
}

function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: config.appCookieSecure,
    sameSite: 'strict',
    path: '/',
    maxAge: sessionMaxAgeMs()
  };
}

function clearSessionCookieOptions() {
  const { maxAge, ...options } = sessionCookieOptions();
  return options;
}

async function createSession(username) {
  const sessionToken = randomToken();
  const csrfToken = randomToken();
  const expiresAt = new Date(Date.now() + sessionMaxAgeMs());

  const session = await AppSession.create({
    tokenHash: hashToken(sessionToken),
    username,
    csrfToken,
    expiresAt
  });

  return { session, sessionToken, csrfToken };
}

async function findSessionFromRequest(req) {
  const sessionToken = req.cookies?.[SESSION_COOKIE];
  if (!sessionToken || sessionToken.length > 128) return null;

  const session = await AppSession.findOne({
    tokenHash: hashToken(sessionToken),
    expiresAt: { $gt: new Date() }
  });

  return session || null;
}

async function destroySession(session) {
  if (session?._id) {
    await AppSession.deleteOne({ _id: session._id });
  }
}

module.exports = {
  SESSION_COOKIE,
  clearSessionCookieOptions,
  createSession,
  destroySession,
  findSessionFromRequest,
  secureTextEqual,
  sessionCookieOptions
};
