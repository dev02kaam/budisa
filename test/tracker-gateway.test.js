const assert = require('node:assert/strict');
const crypto = require('crypto');

process.env.USE_MEMORY_MONGO = 'true';
process.env.NODE_ENV = 'test';
process.env.TRACKER_SHARED_SECRET = 'test-shared-secret';
process.env.TRACKER_KEY_ID = 'gateway-v1';
process.env.APP_LOGIN_USER = 'admin';
process.env.APP_LOGIN_PASSWORD = 'test-login-password';
process.env.APP_COOKIE_SECURE = 'false';

const app = require('../src/app');
const { connectDb, disconnectDb } = require('../src/config/db');
const Tracker = require('../src/models/Tracker');
const TrackerPoint = require('../src/models/TrackerPoint');
const { registerTracker } = require('../src/services/tracker-gateway.service');
const {
  buildCanonicalTrackerRequest,
  sha256Hex
} = require('../src/utils/tracker-auth');

function startServer() {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, '127.0.0.1');
    server.once('error', reject);
    server.once('listening', () => resolve(server));
  });
}

function closeServer(server) {
  return new Promise((resolve) => server.close(resolve));
}

function buildPayload(imei = '356000000000001') {
  const now = Date.now();
  return {
    schemaVersion: 1,
    source: 'teltonika-gateway',
    device: {
      manufacturer: 'Teltonika',
      model: 'FTC880',
      imei,
      iccid: '89450012345678901234'
    },
    packet: {
      packetId: crypto.createHash('sha256').update(`${imei}-${now}`).digest('hex'),
      codec: '8E',
      recordCount: 2,
      receivedAt: new Date(now).toISOString()
    },
    records: [0, 1].map((index) => ({
      eventId: crypto.createHash('sha256').update(`${imei}-${now}-${index}`).digest('hex'),
      index,
      timestampMs: now - (1 - index) * 60_000,
      timestamp: new Date(now - (1 - index) * 60_000).toISOString(),
      priority: 0,
      gps: {
        latitude: 40.4168 + index * 0.001,
        longitude: -3.7038 + index * 0.001,
        altitudeM: 650,
        angleDeg: 180,
        satellites: 14,
        speedKph: 42 + index,
        valid: true
      },
      io: {
        eventId: 239,
        raw: { 16: 15342234, 21: 4 },
        known: {
          totalOdometerM: 15342234,
          gsmSignal: 4,
          ignition: true,
          movement: true,
          tipperRaised: index === 1,
          tiltAngleDeg: index === 1 ? 32 : 0
        }
      }
    }))
  };
}

function signedRequest(payload, nonce = crypto.randomUUID()) {
  const body = JSON.stringify(payload);
  const contentSha256 = sha256Hex(Buffer.from(body));
  const timestamp = String(Math.floor(Date.now() / 1000));
  const canonical = buildCanonicalTrackerRequest({
    keyId: 'gateway-v1',
    timestamp,
    nonce,
    contentSha256
  });
  const signature = crypto.createHmac('sha256', 'test-shared-secret').update(canonical).digest('hex');
  return {
    body,
    headers: {
      'Content-Type': 'application/json',
      'X-Tracker-Key-Id': 'gateway-v1',
      'X-Tracker-Timestamp': timestamp,
      'X-Tracker-Nonce': nonce,
      'X-Tracker-Content-SHA256': contentSha256,
      'X-Tracker-Signature': `v1=${signature}`
    }
  };
}

async function login(baseUrl) {
  const response = await fetch(`${baseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'test-login-password' })
  });
  const payload = await response.json();
  assert.equal(response.status, 200);
  const setCookie = response.headers.get('set-cookie') || '';
  assert.match(setCookie, /budisa_session=/);
  assert.match(setCookie, /HttpOnly/i);
  assert.match(setCookie, /SameSite=Strict/i);
  return {
    'Content-Type': 'application/json',
    Cookie: setCookie.split(';')[0],
    'X-Budisa-CSRF': payload.data.csrfToken
  };
}

async function run() {
  await connectDb();
  await registerTracker({
    imei: '356000000000001',
    licensePlate: '1234 abc'
  });
  const registeredTracker = await Tracker.findOne({ imei: '356000000000001' }).lean();
  assert.equal(registeredTracker.licensePlate, '1234 ABC');
  const server = await startServer();
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  try {
    const payload = buildPayload();
    const request = signedRequest(payload);
    const response = await fetch(`${baseUrl}/tracker`, {
      method: 'POST',
      headers: request.headers,
      body: request.body
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true, accepted: 2 });

    const saved = await TrackerPoint.find().sort({ positionAt: 1 }).lean();
    assert.equal(saved.length, 2);
    assert.equal(saved[0].deviceId, '356000000000001');
    assert.equal(saved[0].metadata.imei, '356000000000001');
    assert.equal(saved[0].metadata.ignition, true);
    assert.equal('speed' in saved[0].gps, false);

    const replay = await fetch(`${baseUrl}/tracker`, {
      method: 'POST',
      headers: request.headers,
      body: request.body
    });
    assert.equal(replay.status, 401);
    assert.equal((await replay.json()).code, 'INVALID_SIGNATURE');

    const duplicateRequest = signedRequest(payload);
    const duplicate = await fetch(`${baseUrl}/tracker`, {
      method: 'POST',
      headers: duplicateRequest.headers,
      body: duplicateRequest.body
    });
    assert.equal(duplicate.status, 200);
    assert.equal((await duplicate.json()).accepted, 2);
    assert.equal(await TrackerPoint.countDocuments(), 2);

    const trackerBeforeOldPacket = await Tracker.findOne({ imei: '356000000000001' }).lean();
    const oldPayload = JSON.parse(JSON.stringify(payload));
    oldPayload.packet.receivedAt = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const oldRequest = signedRequest(oldPayload);
    const oldResponse = await fetch(`${baseUrl}/tracker`, {
      method: 'POST',
      headers: oldRequest.headers,
      body: oldRequest.body
    });
    assert.equal(oldResponse.status, 200);
    const trackerAfterOldPacket = await Tracker.findOne({ imei: '356000000000001' }).lean();
    assert.equal(trackerAfterOldPacket.lastSeenAt.getTime(), trackerBeforeOldPacket.lastSeenAt.getTime());

    const unknownPayload = buildPayload('356000000000999');
    const unknownRequest = signedRequest(unknownPayload);
    const unknown = await fetch(`${baseUrl}/tracker`, {
      method: 'POST',
      headers: unknownRequest.headers,
      body: unknownRequest.body
    });
    assert.equal(unknown.status, 403);
    assert.equal((await unknown.json()).code, 'UNKNOWN_DEVICE');
    const pendingTracker = await Tracker.findOne({ imei: '356000000000999' }).lean();
    assert.equal(pendingTracker.approvalStatus, 'pending');
    assert.equal(pendingTracker.enabled, false);
    assert.equal(pendingTracker.name, undefined);
    assert.equal(pendingTracker.licensePlate, '');
    assert.ok(pendingTracker.lastAttemptAt);

    const unauthorizedRegistry = await fetch(`${baseUrl}/api/trackers`);
    assert.equal(unauthorizedRegistry.status, 401);

    const invalidLogin = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'incorrecta' })
    });
    assert.equal(invalidLogin.status, 401);

    const adminHeaders = await login(baseUrl);
    const csrfRejected = await fetch(`${baseUrl}/api/trackers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: adminHeaders.Cookie },
      body: JSON.stringify({ imei: '862129089568730', licensePlate: '1111 AAA' })
    });
    assert.equal(csrfRejected.status, 403);
    assert.equal((await csrfRejected.json()).code, 'INVALID_CSRF_TOKEN');

    const invalidRegistration = await fetch(`${baseUrl}/api/trackers`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({ imei: '123', licensePlate: '1111 AAA' })
    });
    assert.equal(invalidRegistration.status, 400);
    assert.equal((await invalidRegistration.json()).code, 'INVALID_IMEI');

    const invalidLicensePlate = await fetch(`${baseUrl}/api/trackers`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({ imei: '862129089568730', licensePlate: '@@@' })
    });
    assert.equal(invalidLicensePlate.status, 400);
    assert.equal((await invalidLicensePlate.json()).code, 'INVALID_LICENSE_PLATE');

    const registry = await fetch(`${baseUrl}/api/trackers`, { headers: adminHeaders });
    const registryBody = await registry.json();
    assert.equal(registry.status, 200);
    assert.equal(registryBody.data.find((tracker) => tracker.imei === '356000000000999').status, 'pending');

    const approvalWithoutLicensePlate = await fetch(`${baseUrl}/api/trackers/356000000000999`, {
      method: 'PATCH',
      headers: adminHeaders,
      body: JSON.stringify({ enabled: true })
    });
    assert.equal(approvalWithoutLicensePlate.status, 400);
    assert.equal((await approvalWithoutLicensePlate.json()).code, 'TRACKER_LICENSE_PLATE_REQUIRED');

    const approval = await fetch(`${baseUrl}/api/trackers/356000000000999`, {
      method: 'PATCH',
      headers: adminHeaders,
      body: JSON.stringify({ enabled: true, licensePlate: '5678 DEF' })
    });
    assert.equal(approval.status, 200);
    const approvalBody = await approval.json();
    assert.equal(approvalBody.data.status, 'approved');
    assert.equal(approvalBody.data.licensePlate, '5678 DEF');

    const approvedRetry = signedRequest(unknownPayload);
    const approvedResponse = await fetch(`${baseUrl}/tracker`, {
      method: 'POST',
      headers: approvedRetry.headers,
      body: approvedRetry.body
    });
    assert.equal(approvedResponse.status, 200);
    assert.deepEqual(await approvedResponse.json(), { ok: true, accepted: 2 });

    const disable = await fetch(`${baseUrl}/api/trackers/356000000000999`, {
      method: 'PATCH',
      headers: adminHeaders,
      body: JSON.stringify({ enabled: false })
    });
    assert.equal(disable.status, 200);
    assert.equal((await disable.json()).data.status, 'disabled');

    const disabledRequest = signedRequest(buildPayload('356000000000999'));
    const disabledResponse = await fetch(`${baseUrl}/tracker`, {
      method: 'POST',
      headers: disabledRequest.headers,
      body: disabledRequest.body
    });
    assert.equal(disabledResponse.status, 403);
    assert.equal((await Tracker.findOne({ imei: '356000000000999' }).lean()).approvalStatus, 'disabled');

    const manualRegistration = await fetch(`${baseUrl}/api/trackers`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({ imei: '862129089568731', licensePlate: '9012 GHI' })
    });
    assert.equal(manualRegistration.status, 201);
    const manualRegistrationBody = await manualRegistration.json();
    assert.equal(manualRegistrationBody.data.imei, '862129089568731');
    assert.equal(manualRegistrationBody.data.licensePlate, '9012 GHI');

    const csvImport = await fetch(`${baseUrl}/api/trackers/import`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({
        vehicles: [
          { rowNumber: 2, imei: '862129089568732', licensePlate: '3456 JKL' },
          { rowNumber: 3, imei: '862129089568733', licensePlate: '7890 MNO' },
          { rowNumber: 4, imei: '123', licensePlate: '1111 AAA' },
          { rowNumber: 5, imei: '862129089568732', licensePlate: '2222 BBB' }
        ]
      })
    });
    assert.equal(csvImport.status, 200);
    const csvImportBody = await csvImport.json();
    assert.equal(csvImportBody.data.importedCount, 2);
    assert.equal(csvImportBody.data.errorCount, 2);
    assert.equal(csvImportBody.data.errors.find((item) => item.rowNumber === 4).code, 'INVALID_IMEI');
    assert.equal(csvImportBody.data.errors.find((item) => item.rowNumber === 5).code, 'DUPLICATE_IMPORT_IMEI');
    const csvVehicle = await Tracker.findOne({ imei: '862129089568732' }).lean();
    assert.equal(csvVehicle.licensePlate, '3456 JKL');
    assert.equal(csvVehicle.approvalStatus, 'approved');

    const fleetResponse = await fetch(`${baseUrl}/api/fleet`, { headers: adminHeaders });
    const fleetBody = await fleetResponse.json();
    const liveDevice = fleetBody.data.find((device) => device.imei === '356000000000001');
    assert.equal(fleetResponse.status, 200);
    assert.equal(liveDevice.licensePlate, '1234 ABC');
    assert.equal(liveDevice.connectionStatus, 'online');
    assert.equal(liveDevice.gpsFix, true);
    assert.equal(liveDevice.latestPosition.satellites, 14);
    assert.equal(liveDevice.latestPosition.tipperRaised, true);
    assert.equal('speedKph' in liveDevice.latestPosition, false);

    const filteredResponse = await fetch(`${baseUrl}/api/tracker?imei=356000000000001`, { headers: adminHeaders });
    const filteredBody = await filteredResponse.json();
    assert.equal(filteredResponse.status, 200);
    assert.equal(filteredBody.data.length, 2);
    assert.equal('speed' in filteredBody.data[0].gps, false);

    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date());
    const daysResponse = await fetch(`${baseUrl}/api/tracker/days?imei=356000000000001&from=${today}&to=${today}`, { headers: adminHeaders });
    const daysBody = await daysResponse.json();
    assert.equal(daysResponse.status, 200);
    assert.equal(daysBody.data[0].imei, '356000000000001');
    assert.equal(daysBody.data[0].licensePlate, '1234 ABC');
    assert.equal(daysBody.data[0].pointCount, 2);
    assert.equal(daysBody.data[0].movementSeconds, 60);
    assert.equal(daysBody.data[0].tipEvents.length, 1);
    assert.equal(daysBody.data[0].tipEvents[0].latitude, 40.4178);

    const invalidRange = await fetch(`${baseUrl}/api/tracker/days?from=2026-08-31&to=2026-08-01`, { headers: adminHeaders });
    assert.equal(invalidRange.status, 400);
    assert.equal((await invalidRange.json()).code, 'INVALID_DATE_RANGE');

    const logoutResponse = await fetch(`${baseUrl}/auth/logout`, {
      method: 'POST',
      headers: adminHeaders,
      body: '{}'
    });
    assert.equal(logoutResponse.status, 200);
    const signedOutResponse = await fetch(`${baseUrl}/api/fleet`, { headers: adminHeaders });
    assert.equal(signedOutResponse.status, 401);

    console.log('ok - valida HMAC, registro pendiente, aprobacion, bloqueo e historico del gateway');
  } finally {
    await closeServer(server);
    await disconnectDb();
  }
}

run().catch((error) => {
  console.error('not ok - integracion gateway tracker');
  console.error(error);
  process.exitCode = 1;
});
