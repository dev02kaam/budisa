const assert = require('node:assert/strict');
const Tracker = require('../src/models/Tracker');
const TrackerPoint = require('../src/models/TrackerPoint');
const { registerTracker } = require('../src/services/tracker-gateway.service');
const { getReportDays } = require('../src/services/report.service');

module.exports = async function checkTrackerDeletion({ baseUrl, adminHeaders, buildPayload, signedRequest }) {
  const imei = '356000000000950';
  const url = `${baseUrl}/api/trackers/${imei}`;
  await registerTracker({ imei, licensePlate: '0950 DEL' });
  const payload = buildPayload(imei);
  const send = () => fetch(`${baseUrl}/tracker`, { method: 'POST', ...signedRequest(payload) });
  assert.equal((await send()).status, 200);
  const before = await TrackerPoint.countDocuments({ deviceId: imei });
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date(payload.records[0].timestampMs));
  const remove = (headers = adminHeaders) => fetch(url, { method: 'DELETE', headers });
  assert.equal((await remove({})).status, 401);
  assert.equal((await remove({ Cookie: adminHeaders.Cookie })).status, 403);
  const active = await remove();
  assert.equal(active.status, 409);
  assert.equal((await active.json()).code, 'TRACKER_MUST_BE_DISABLED');
  assert.equal((await Tracker.findOne({ imei }).lean()).deletedAt, null);
  assert.equal((await fetch(`${baseUrl}/api/trackers/invalid`, { method: 'DELETE', headers: adminHeaders })).status, 400);
  assert.equal((await fetch(`${baseUrl}/api/trackers/356000000000951`, { method: 'DELETE', headers: adminHeaders })).status, 404);
  await Tracker.create({ imei: '356000000000952', enabled: false, approvalStatus: 'pending' });
  assert.equal((await fetch(`${baseUrl}/api/trackers/356000000000952`, { method: 'DELETE', headers: adminHeaders })).status, 409);
  const disable = () => fetch(url, { method: 'PATCH', headers: adminHeaders, body: JSON.stringify({ enabled: false }) });
  assert.equal((await disable()).status, 200);
  assert.equal((await remove()).status, 200);
  assert.ok((await Tracker.findOne({ imei }).lean()).deletedAt);
  const listed = (path) => fetch(`${baseUrl}${path}`, { headers: adminHeaders }).then((response) => response.json()).then((body) => body.data);
  for (const path of ['/api/trackers', '/api/fleet']) {
    assert.equal((await listed(path)).some((item) => item.imei === imei), false);
  }
  assert.equal((await listed('/api/tracker/live')).vehicles.some((item) => item.imei === imei), false);
  assert.equal(await TrackerPoint.countDocuments({ deviceId: imei }), before);
  const days = await getReportDays([{ imei, date }]);
  assert.equal(days[0].licensePlate, '0950 DEL');
  assert.equal(days[0].pointCount, before);
  assert.equal((await remove()).status, 404);
  assert.equal((await fetch(url, { method: 'PATCH', headers: adminHeaders, body: JSON.stringify({ enabled: true }) })).status, 404);

  // An unsolicited packet cannot rediscover or reactivate a removed vehicle.
  assert.equal((await send()).status, 403);
  assert.ok((await Tracker.findOne({ imei }).lean()).deletedAt);
  assert.equal((await listed('/api/trackers')).some((item) => item.imei === imei), false);
  assert.equal(await TrackerPoint.countDocuments({ deviceId: imei }), before);

  // A deliberate new registration (manual or CSV) can reuse the same IMEI.
  assert.equal((await fetch(`${baseUrl}/api/trackers`, { method: 'POST', headers: adminHeaders,
    body: JSON.stringify({ imei, licensePlate: '0950 DEL' }) })).status, 201);
  assert.equal((await Tracker.findOne({ imei }).lean()).deletedAt, null);
  assert.equal((await listed('/api/trackers')).some((item) => item.imei === imei), true);
  assert.equal((await disable()).status, 200);
  assert.equal((await remove()).status, 200);
  assert.equal((await fetch(`${baseUrl}/api/trackers/import`, { method: 'POST', headers: adminHeaders,
    body: JSON.stringify({ vehicles: [{ imei, licensePlate: '0950 DEL' }] }) })).status, 200);
  assert.equal((await Tracker.findOne({ imei }).lean()).deletedAt, null);
  console.log('ok - elimina solo deshabilitados, exige sesion y CSRF, conserva historico y evita reapariciones');
};
