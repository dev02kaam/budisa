const assert = require('node:assert/strict');
const crypto = require('crypto');

process.env.USE_MEMORY_MONGO = 'true';
process.env.TRACKER_SHARED_SECRET = 'test-shared-secret';
process.env.TRACKER_ADMIN_TOKEN = 'test-admin-token';
process.env.TRACKER_KEY_ID = 'gateway-v1';

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
        known: { totalOdometerM: 15342234, gsmSignal: 4, ignition: true, movement: true }
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

async function run() {
  await connectDb();
  await registerTracker({
    imei: '356000000000001',
    name: 'Hormigonera Norte'
  });
  const registeredTracker = await Tracker.findOne({ imei: '356000000000001' }).lean();
  assert.equal(registeredTracker.name, 'Hormigonera Norte');
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
    assert.equal(pendingTracker.name, '');
    assert.ok(pendingTracker.lastAttemptAt);

    const unauthorizedRegistry = await fetch(`${baseUrl}/api/trackers`);
    assert.equal(unauthorizedRegistry.status, 401);

    const adminHeaders = {
      'Content-Type': 'application/json',
      'X-Tracker-Admin-Token': 'test-admin-token'
    };
    const invalidRegistration = await fetch(`${baseUrl}/api/trackers`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({ imei: '123', name: 'Prueba' })
    });
    assert.equal(invalidRegistration.status, 400);
    assert.equal((await invalidRegistration.json()).code, 'INVALID_IMEI');

    const registry = await fetch(`${baseUrl}/api/trackers`, { headers: adminHeaders });
    const registryBody = await registry.json();
    assert.equal(registry.status, 200);
    assert.equal(registryBody.data.find((tracker) => tracker.imei === '356000000000999').status, 'pending');

    const approval = await fetch(`${baseUrl}/api/trackers/356000000000999`, {
      method: 'PATCH',
      headers: adminHeaders,
      body: JSON.stringify({ enabled: true, name: 'Camión Patio' })
    });
    assert.equal(approval.status, 200);
    const approvalBody = await approval.json();
    assert.equal(approvalBody.data.status, 'approved');
    assert.equal(approvalBody.data.name, 'Camión Patio');

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
      body: JSON.stringify({ imei: '862129089568731', name: 'Camión 01' })
    });
    assert.equal(manualRegistration.status, 201);
    const manualRegistrationBody = await manualRegistration.json();
    assert.equal(manualRegistrationBody.data.imei, '862129089568731');
    assert.equal(manualRegistrationBody.data.name, 'Camión 01');

    const fleetResponse = await fetch(`${baseUrl}/api/fleet`);
    const fleetBody = await fleetResponse.json();
    const liveDevice = fleetBody.data.find((device) => device.imei === '356000000000001');
    assert.equal(fleetResponse.status, 200);
    assert.equal(liveDevice.name, 'Hormigonera Norte');
    assert.equal(liveDevice.connectionStatus, 'online');
    assert.equal(liveDevice.gpsFix, true);
    assert.equal(liveDevice.latestPosition.satellites, 14);

    const filteredResponse = await fetch(`${baseUrl}/api/tracker?imei=356000000000001`);
    const filteredBody = await filteredResponse.json();
    assert.equal(filteredResponse.status, 200);
    assert.equal(filteredBody.data.length, 2);

    const daysResponse = await fetch(`${baseUrl}/api/tracker/days?imei=356000000000001`);
    const daysBody = await daysResponse.json();
    assert.equal(daysResponse.status, 200);
    assert.equal(daysBody.data[0].imei, '356000000000001');
    assert.equal(daysBody.data[0].name, 'Hormigonera Norte');
    assert.equal(daysBody.data[0].pointCount, 2);

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
