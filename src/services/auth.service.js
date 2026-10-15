const crypto = require('crypto');
const AppSession = require('../models/AppSession');
const { config } = require('../config/env');

const SESSION_COOKIE = 'budisa_session';

function configuredAccounts() {
  return [
    { username: config.appLoginUser, password: config.appLoginPassword, role: 'admin' },
    { username: config.appSupportUser, password: config.appSupportPassword, role: 'support' }
  ].filter((account) => account.username && account.password);
}

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

async function createSession(username, role = 'admin') {
  const sessionToken = randomToken();
  const csrfToken = randomToken();
  const expiresAt = new Date(Date.now() + sessionMaxAgeMs());

  const session = await AppSession.create({
    tokenHash: hashToken(sessionToken),
    username,
    role,
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

  if (!session || !configuredAccounts().some((account) =>
    account.username === session.username && account.role === session.role)) return null;

  return session;
}

async function destroySession(session) {
  if (session?._id) {
    await AppSession.deleteOne({ _id: session._id });
  }
}

module.exports = {
  SESSION_COOKIE,
  clearSessionCookieOptions,
  configuredAccounts,
  createSession,
  destroySession,
  findSessionFromRequest,
  secureTextEqual,
  sessionCookieOptions
};
