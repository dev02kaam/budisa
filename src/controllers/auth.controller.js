const {
  SESSION_COOKIE,
  clearSessionCookieOptions,
  configuredAccounts,
  createSession,
  destroySession,
  findSessionFromRequest,
  secureTextEqual,
  sessionCookieOptions
} = require('../services/auth.service');

function publicSessionData(session) {
  return {
    authenticated: true,
    username: session.username,
    role: session.role,
    expiresAt: session.expiresAt,
    csrfToken: session.csrfToken
  };
}

async function login(req, res, next) {
  try {
    const accounts = configuredAccounts();
    if (!accounts.length) {
      const error = new Error('El acceso a Budisa todavía no está configurado en el servidor.');
      error.code = 'AUTH_NOT_CONFIGURED';
      error.statusCode = 503;
      throw error;
    }

    const username = typeof req.body?.username === 'string' ? req.body.username.trim() : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    const account = username.length <= 80
      && password.length <= 256
      && accounts.find((candidate) => secureTextEqual(username, candidate.username)
        && secureTextEqual(password, candidate.password));

    if (!account) {
      const error = new Error('Usuario o contraseña incorrectos.');
      error.code = 'INVALID_CREDENTIALS';
      error.statusCode = 401;
      throw error;
    }

    const { session, sessionToken } = await createSession(account.username, account.role);
    res.cookie(SESSION_COOKIE, sessionToken, sessionCookieOptions());
    return res.json({ ok: true, data: publicSessionData(session) });
  } catch (error) {
    return next(error);
  }
}

async function session(req, res, next) {
  try {
    const activeSession = await findSessionFromRequest(req);
    if (!activeSession) {
      return res.json({ ok: true, data: { authenticated: false } });
    }
    return res.json({ ok: true, data: publicSessionData(activeSession) });
  } catch (error) {
    return next(error);
  }
}

async function logout(req, res, next) {
  try {
    await destroySession(req.appSession);
    res.clearCookie(SESSION_COOKIE, clearSessionCookieOptions());
    return res.json({ ok: true, data: { signedOut: true } });
  } catch (error) {
    return next(error);
  }
}

module.exports = { login, logout, session };
