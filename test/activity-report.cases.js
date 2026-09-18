const assert = require('node:assert/strict');
const Tracker = require('../src/models/Tracker');
const TrackerPoint = require('../src/models/TrackerPoint');
const { registerTracker } = require('../src/services/tracker-gateway.service');
const { getLiveActivity, getTrackerDayRoute } = require('../src/services/fleet.service');
const { getReportDays, reportRows, createReportPdf } = require('../src/services/report.service');

module.exports = async function checkActivityReport({ baseUrl, adminHeaders }) {
  const imei = '356000000000901';
  const disabledImei = '356000000000902';
  await registerTracker({ imei, licensePlate: '0901 PDF' });
  await registerTracker({ imei: disabledImei, licensePlate: '0902 PDF' });
  await Tracker.updateOne({ imei: disabledImei }, { enabled: false });
  const now = new Date('2026-09-20T10:00:00Z');
  const readings = [
    ['08:50', 40, true, true], // Start outside the live window.
    ['09:05', 20, true, true],
    ['09:06', null, false, true],
    ['09:07', 35, false, true],
    ['09:08', 32, false, true],
    ['09:09', 30, false, true],
    ['09:10', null, null, false],
    ['09:11', null, null, true],
    ['09:12', null, true, true],
    ['09:13', null, true, true],
    ['09:40', 35, false, false],
    ['10:01', 20, true, true] // Future record must not close the live event yet.
  ];
  await TrackerPoint.insertMany(readings.map(([time, roll, movement, gpsValid], index) => ({
    eventId: `activity-${index}`, deviceId: imei,
    positionAt: new Date(`2026-09-20T${time}:00Z`),
    gps: { latitude: gpsValid ? 40.4 + index / 1000 : 0, longitude: gpsValid ? -3.7 : 0 },
    metadata: { gpsValid, movement, rawIo: roll == null ? {} : { 10832: roll } }
  })));
  await TrackerPoint.create({ eventId: 'activity-disabled', deviceId: disabledImei, positionAt: now,
    gps: { latitude: 40.4, longitude: -3.7 }, metadata: { gpsValid: true } });
  const first = await getLiveActivity(now);
  assert.deepEqual(await getLiveActivity(now), first, 'Reload reconstructs exactly the same hour');
  assert.equal(first.vehicles.some((vehicle) => vehicle.imei === disabledImei), false);
  const vehicle = first.vehicles.find((item) => item.imei === imei);
  assert.deepEqual(vehicle.markers.map((marker) => marker.phase), ['end', 'start', 'end', 'start']);
  assert.equal(vehicle.markers[0].timestamp.toISOString(), '2026-09-20T09:05:00.000Z');
  assert.equal(vehicle.markers[1].latitude, 40.403);
  assert.equal(vehicle.markers[2].latitude, 40.405);
  assert.equal(vehicle.markers[3].latitude, null);
  assert.equal(vehicle.points.length, 8);
  assert.deepEqual(vehicle.points.slice(0, 3).map((point) => point.movement), [true, false, false]);
  assert.equal(vehicle.points.find((point) => point.timestamp.toISOString().includes('09:11')).breakBefore, true);
  assert.equal(vehicle.points.find((point) => point.timestamp.toISOString().includes('09:12')).breakBefore, false);
  const expired = (await getLiveActivity(new Date('2026-09-20T10:45:00Z'))).vehicles.find((item) => item.imei === imei);
  assert.deepEqual(expired.markers.map((marker) => marker.phase), ['end']);
  assert.equal(expired.points.length, 1);
  const route = await getTrackerDayRoute({ imei, date: '2026-09-20' });
  assert.equal(route.points[0].movement, true);
  assert.equal(route.points.some((point) => point.latitude === 0), false);
  assert.equal(route.points.at(-1).breakBefore, true);

  // Exact, possibly non-contiguous day selection; cycle close can be on an omitted day.
  const selection = [
    { imei: '356000000000802', date: '2026-09-18' },
    { imei: '356000000000803', date: '2026-09-18' },
    { imei, date: '2026-09-20' }
  ];
  const days = await getReportDays([...selection, selection[0]]);
  assert.equal(days.length, 3);
  assert.equal(days.find((day) => day.imei.endsWith('802')).tipEvents[0].durationSeconds, 20);
  const rows = reportRows(days);
  assert.equal(rows.length, 5);
  assert.equal(rows.some((row) => row[1] === 'Sin basculaciones'), true);
  assert.equal(rows.some((row) => row[2] === '40.40300, -3.70000' && row[4] === '40.40500, -3.70000'), true);
  assert.equal(rows.some((row) => row[1].includes('11:07:00') && row[3].includes('11:09:00')), true);
  for (const invalid of [[], [{ imei, date: '2026-02-30' }], [{ imei: { $ne: null }, date: '2026-09-20' }]]) {
    await assert.rejects(() => getReportDays(invalid), { statusCode: 400 });
  }
  await assert.rejects(() => getReportDays([{ imei, date: '2025-01-01' }]), { statusCode: 409 });
  const endpoint = `${baseUrl}/api/tracker/report`;
  const body = JSON.stringify({ days: selection });
  assert.equal((await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body })).status, 401);
  assert.equal((await fetch(endpoint, { method: 'POST', headers: { Cookie: adminHeaders.Cookie, 'Content-Type': 'application/json' }, body })).status, 403);
  const response = await fetch(endpoint, { method: 'POST', headers: adminHeaders, body });
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /application\/pdf/);
  assert.match(response.headers.get('content-disposition'), /attachment;.*-pack\.pdf/);
  const pdf = Buffer.from(await response.arrayBuffer());
  assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
  assert.match(pdf.subarray(-20).toString(), /%%EOF/);
  const pageCount = (buffer) => (buffer.toString('latin1').match(/\/Type \/Page\b/g) || []).length;
  assert.equal(pageCount(pdf), 1, 'Footer must not create extra blank pages');
  const sample = days.find((day) => day.imei === imei);
  const multipage = await createReportPdf([{ ...sample, tipEvents: Array.from({ length: 16 }, () => sample.tipEvents[0]) }]);
  assert.equal(pageCount(multipage), 2, 'Long tables paginate without blank footer pages');
  await TrackerPoint.insertMany([
    ['21T10:00', 35], ['22T10:00', 30], ['23T10:00', 35], ['23T10:01', 30]
  ].map(([time, roll], index) => ({
    eventId: `report-gap-${index}`, deviceId: imei, positionAt: new Date(`2026-09-${time}:00Z`),
    gps: { latitude: 40.4 + index / 1000, longitude: -3.7 }, metadata: { gpsValid: true, rawIo: { 10832: roll } }
  })));
  const separated = await getReportDays([{ imei, date: '2026-09-21' }, { imei, date: '2026-09-23' }]);
  assert.deepEqual(separated.map((day) => day.tipEvents.length), [1, 1]);
  assert.equal(separated[0].tipEvents[0].endAt.toISOString(), '2026-09-22T10:00:00.000Z');
  assert.ok(Math.abs(separated[0].tipEvents[0].endLatitude - 40.401) < 1e-9);
  assert.equal(separated[1].tipEvents[0].durationSeconds, 60);
  assert.equal((await fetch(`${baseUrl}/api/tracker/live`, { headers: adminHeaders })).status, 200);
  assert.equal((await fetch(`${baseUrl}/api/tracker/live`)).status, 401);
  console.log('ok - ultima hora persistente, posiciones de inicio/fin, recorridos y exportacion PDF filtrada y protegida');
};
