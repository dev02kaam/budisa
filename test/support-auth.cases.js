const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const AppSession = require('../src/models/AppSession');
const { config } = require('../src/config/env');

module.exports = async function supportAuthCases({ baseUrl, adminHeaders, login }) {
  const getSession = (headers) => fetch(`${baseUrl}/auth/session`, { headers }).then((response) => response.json());
  const tryLogin = (password) => fetch(`${baseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'support@example.com', password, role: 'support' })
  });
  assert.equal((await tryLogin('incorrect-password')).status, 401);
  const supportHeaders = await login(baseUrl, 'support@example.com', 'test-support-password', 'support');
  const restored = (await getSession(supportHeaders)).data;
  assert.equal(restored.authenticated, true);
  assert.equal(restored.role, 'support');
  assert.equal(restored.username, 'support@example.com');
  assert.equal('password' in restored, false);
  assert.equal((await fetch(`${baseUrl}/api/fleet`, { headers: supportHeaders })).status, 200);
  assert.equal((await fetch(`${baseUrl}/api/trackers`, { headers: supportHeaders })).status, 200);
  assert.equal((await fetch(`${baseUrl}/api/tracker/debug`, { headers: supportHeaders })).status, 200);
  assert.equal((await fetch(`${baseUrl}/auth/logout`, {
    method: 'POST', headers: { Cookie: supportHeaders.Cookie }, body: '{}'
  })).status, 403, 'Support sessions still require CSRF protection');

  // An administrator session created before roles existed stays an administrator.
  const token = adminHeaders.Cookie.slice('budisa_session='.length);
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  await AppSession.collection.updateOne({ tokenHash }, { $unset: { role: '' } });
  assert.equal((await getSession(adminHeaders)).data.role, 'admin');
  assert.equal((await fetch(`${baseUrl}/api/tracker/debug`, { headers: adminHeaders })).status, 403);

  // Removing either support setting disables login and previously issued sessions.
  const supportUser = config.appSupportUser;
  const supportPassword = config.appSupportPassword;
  try {
    config.appSupportPassword = '';
    assert.equal((await getSession(supportHeaders)).data.authenticated, false);
    assert.equal((await fetch(`${baseUrl}/api/tracker/debug`, { headers: supportHeaders })).status, 401);
    assert.equal((await tryLogin('test-support-password')).status, 401);
    assert.equal((await getSession(adminHeaders)).data.authenticated, true);
    config.appSupportPassword = supportPassword;
    config.appSupportUser = '';
    assert.equal((await getSession(supportHeaders)).data.authenticated, false);
  } finally {
    config.appSupportUser = supportUser;
    config.appSupportPassword = supportPassword;
  }
  console.log('ok - soporte conserva su rol y CSRF; admin, sesiones antiguas y accesos desactivados no acceden a debug');
  return supportHeaders;
};
