const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { tipperState } = require('../src/utils/tipper');
const { registerTracker } = require('../src/services/tracker-gateway.service');

module.exports = async function checkEyeSensor({ baseUrl, adminHeaders, buildPayload, signedRequest }) {
  const angle = (value) => tipperState({ metadata: { rawIo: { 10832: value } } });
  assert.deepEqual(angle(35), { raised: true, angleDeg: 35 });
  assert.deepEqual(angle(30), { raised: false, angleDeg: 30 });
  assert.deepEqual(angle(32), { raised: null, angleDeg: 32 });
  assert.deepEqual(angle(65501), { raised: true, angleDeg: -35 });
  assert.deepEqual(angle(-30), { raised: false, angleDeg: -30 });
  for (const value of [null, '', ' ', true, {}, 250, 251, 181, 32768, Infinity, NaN]) {
    assert.equal(angle(value), null, `Invalid sensor value ${String(value)}`);
  }
  assert.equal(tipperState({ metadata: { knownIo: { tiltAngleDeg: null } } }), null);
  assert.equal(tipperState({ metadata: { knownIo: { tipperRaised: false }, rawIo: { 10832: 75 } } }).raised, false);

  async function send(imei, readings) {
    const payload = buildPayload(imei);
    payload.records = readings.map(({ time, roll, gps = false }, index) => ({
      ...payload.records[0], index, eventId: crypto.randomBytes(32).toString('hex'),
      timestampMs: Date.parse(time), timestamp: time,
      gps: { ...payload.records[0].gps, latitude: gps ? 40.4 : 0, longitude: gps ? -3.7 : 0, valid: gps },
      io: { eventId: roll === undefined ? 0 : 10832, known: {}, raw: roll === undefined ? {} : { 10832: roll } }
    }));
    payload.packet.recordCount = readings.length;
    const post = () => fetch(`${baseUrl}/tracker`, { method: 'POST', ...signedRequest(payload) });
    assert.equal((await post()).status, 200);
    return post;
  }
  async function days(imei, from = '2026-09-18', to = from) {
    const response = await fetch(`${baseUrl}/api/tracker/days?imei=${imei}&from=${from}&to=${to}`, { headers: adminHeaders });
    assert.equal(response.status, 200);
    return (await response.json()).data;
  }
  const imei = '356000000000801';
  await registerTracker({ imei, licensePlate: '0801 EYE' });
  const replay = await send(imei, [{ time: '2026-09-18T08:43:53Z', roll: 75 }]);
  assert.equal((await replay()).status, 200);
  let day = (await days(imei))[0];
  assert.equal(day.pointCount, 1);
  assert.equal(day.gpsPointCount, 0);
  assert.equal(day.distanceMeters, 0);
  assert.equal(day.tipEvents.length, 1);
  assert.deepEqual(day.tipEvents[0], {
    timestamp: '2026-09-18T08:43:53.000Z', endAt: null, durationSeconds: null,
    status: 'active', latitude: null, longitude: null, endLatitude: null, endLongitude: null
  });
  await send(imei, [
    { time: '2026-09-18T08:43:58Z' },
    { time: '2026-09-18T08:44:03Z', roll: 250 },
    { time: '2026-09-18T08:44:08Z', roll: 32 },
    { time: '2026-09-18T08:44:13Z', roll: 74 },
    { time: '2026-09-18T08:44:18Z' }
  ]);
  day = (await days(imei))[0];
  assert.equal(day.tipEvents.length, 1);
  assert.equal(day.tipEvents[0].endAt, null);
  const fleet = await fetch(`${baseUrl}/api/fleet`, { headers: adminHeaders }).then((r) => r.json());
  const device = fleet.data.find((item) => item.imei === imei);
  assert.equal(device.gpsFix, false);
  assert.equal(device.latestPosition, null);
  assert.equal(device.tipper.raised, true);
  assert.equal(device.tipper.angleDeg, 74);

  const closeReplay = await send(imei, [{ time: '2026-09-18T08:44:54Z', roll: 18, gps: true }]);
  assert.equal((await closeReplay()).status, 200);
  await send(imei, [{ time: '2026-09-18T08:44:55Z', roll: 18 }]);
  day = (await days(imei))[0];
  assert.equal(day.tipEvents.length, 1);
  assert.equal(day.tipEvents[0].status, 'completed');
  assert.equal(day.tipEvents[0].endAt, '2026-09-18T08:44:54.000Z');
  assert.equal(day.tipEvents[0].durationSeconds, 61);
  // A GPS fix only at the end must not invent a location for the start.
  assert.equal(day.tipEvents[0].latitude, null);
  assert.equal(day.tipEvents[0].endLatitude, 40.4);
  assert.equal(day.tipEvents[0].endLongitude, -3.7);
  assert.equal(day.gpsPointCount, 1);

  // Close arrives before start: reconstruction uses device time and stays idempotent.
  await send(imei, [{ time: '2026-09-18T08:46:53Z', roll: 30 }]);
  await send(imei, [{ time: '2026-09-18T08:45:53Z', roll: 35, gps: true }]);
  await send(imei, [
    { time: '2026-09-18T08:47:53Z', roll: 65501 },
    { time: '2026-09-18T08:48:23Z', roll: 65506 }
  ]);
  day = (await days(imei))[0];
  assert.deepEqual(day.tipEvents.map((event) => event.durationSeconds), [61, 60, 30]);
  assert.equal(day.tipEvents[1].latitude, 40.4);

  // Each cycle belongs to its start day, even with repeated raised readings next day.
  const midnightImei = '356000000000802';
  await registerTracker({ imei: midnightImei, licensePlate: '0802 EYE' });
  await send(midnightImei, [
    { time: '2026-09-18T21:59:50Z', roll: 35 },
    { time: '2026-09-18T22:00:02Z', roll: 45 },
    { time: '2026-09-18T22:00:05Z', roll: 251 },
    { time: '2026-09-18T22:00:10Z', roll: 30 }
  ]);
  const startDay = (await days(midnightImei))[0];
  assert.equal(startDay.tipEvents.length, 1);
  assert.equal(startDay.tipEvents[0].durationSeconds, 20);
  const endDay = (await days(midnightImei, '2026-09-19'))[0];
  assert.equal(endDay.tipEvents.length, 0);
  const both = await days(midnightImei, '2026-09-18', '2026-09-19');
  assert.equal(both.reduce((sum, item) => sum + item.tipEvents.length, 0), 1);
  assert.equal(both.find((item) => item.date === '2026-09-18').tipEvents[0].durationSeconds, 20);

  // A lowering sample without a start never creates an event; the dead band stays idle.
  const idleImei = '356000000000803';
  await registerTracker({ imei: idleImei, licensePlate: '0803 EYE' });
  await send(idleImei, [
    { time: '2026-09-18T08:00:00Z', roll: 30 },
    { time: '2026-09-18T08:01:00Z', roll: 34 },
    { time: '2026-09-18T08:02:00Z', roll: 30 }
  ]);
  assert.equal((await days(idleImei))[0].tipEvents.length, 0);
  console.log('ok - EYE empareja subida/bajada sin GPS, respeta 35/30 grados, duplicados, orden y medianoche');
};
