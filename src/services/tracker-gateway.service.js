const Device = require('../models/Device');
const Tracker = require('../models/Tracker');
const TrackerPoint = require('../models/TrackerPoint');
const TrackerRequestNonce = require('../models/TrackerRequestNonce');
const { config } = require('../config/env');

class TrackerGatewayError extends Error {
  constructor(message, code, statusCode) {
    super(message);
    this.name = 'TrackerGatewayError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

function invalidPayload(message) {
  throw new TrackerGatewayError(message, 'INVALID_PAYLOAD', 400);
}

function finiteNumber(value, field, { min = -Infinity, max = Infinity } = {}) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max) {
    invalidPayload(`${field} no es valido`);
  }
  return number;
}

function validDate(value, field) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    invalidPayload(`${field} no es valido`);
  }
  return date;
}

function validateGatewayPayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    invalidPayload('El cuerpo debe ser un objeto JSON');
  }
  if (payload.schemaVersion !== 1 || payload.source !== 'teltonika-gateway') {
    invalidPayload('schemaVersion o source no soportado');
  }

  const imei = String(payload.device?.imei || '').trim();
  if (!/^\d{15}$/.test(imei)) {
    invalidPayload('device.imei debe contener 15 digitos');
  }
  if (!payload.packet || typeof payload.packet !== 'object') {
    invalidPayload('packet es obligatorio');
  }
  if (!Array.isArray(payload.records) || payload.records.length === 0 || payload.records.length > 255) {
    invalidPayload('records debe contener entre 1 y 255 registros');
  }
  if (Number(payload.packet.recordCount) !== payload.records.length) {
    invalidPayload('packet.recordCount no coincide con records.length');
  }

  const packetId = String(payload.packet.packetId || '').trim();
  if (!/^[a-f0-9]{32,128}$/i.test(packetId)) {
    invalidPayload('packet.packetId no es valido');
  }
  const receivedAt = validDate(payload.packet.receivedAt, 'packet.receivedAt');
  const seenEventIds = new Set();

  const records = payload.records.map((record, index) => {
    const eventId = String(record?.eventId || '').trim();
    if (!eventId || eventId.length > 200 || seenEventIds.has(eventId)) {
      invalidPayload(`records[${index}].eventId no es valido o esta duplicado`);
    }
    seenEventIds.add(eventId);

    const timestampMs = finiteNumber(record.timestampMs, `records[${index}].timestampMs`, { min: 0 });
    if (!Number.isSafeInteger(timestampMs)) {
      invalidPayload(`records[${index}].timestampMs no es un entero seguro`);
    }
    const timestamp = validDate(timestampMs, `records[${index}].timestampMs`);
    const gps = record.gps || {};
    const latitude = finiteNumber(gps.latitude, `records[${index}].gps.latitude`, { min: -90, max: 90 });
    const longitude = finiteNumber(gps.longitude, `records[${index}].gps.longitude`, { min: -180, max: 180 });
    const altitude = finiteNumber(gps.altitudeM ?? 0, `records[${index}].gps.altitudeM`);
    const heading = finiteNumber(gps.angleDeg ?? 0, `records[${index}].gps.angleDeg`, { min: 0, max: 360 });
    const satellites = finiteNumber(gps.satellites ?? 0, `records[${index}].gps.satellites`, { min: 0, max: 255 });
    const speed = finiteNumber(gps.speedKph ?? 0, `records[${index}].gps.speedKph`, { min: 0 });

    return {
      eventId,
      index: Number(record.index ?? index),
      timestamp,
      timestampMs,
      priority: Number(record.priority ?? 0),
      gps: {
        latitude,
        longitude,
        altitude,
        heading,
        satellites,
        speed,
        valid: gps.valid !== false
      },
      io: {
        eventId: record.io?.eventId ?? null,
        raw: record.io?.raw && typeof record.io.raw === 'object' ? record.io.raw : {},
        known: record.io?.known && typeof record.io.known === 'object' ? record.io.known : {}
      }
    };
  });

  return {
    imei,
    device: {
      manufacturer: String(payload.device?.manufacturer || 'Teltonika').slice(0, 80),
      model: String(payload.device?.model || 'FTC880').slice(0, 80),
      iccid: payload.device?.iccid ? String(payload.device.iccid).slice(0, 40) : null
    },
    packet: {
      packetId,
      codec: String(payload.packet.codec || '8E').slice(0, 16),
      recordCount: records.length,
      receivedAt
    },
    records
  };
}

function buildTrackerPoint(tracker, normalized, record) {
  return {
    eventId: record.eventId,
    deviceId: tracker.imei,
    signal: 'gps',
    event: 'gps',
    category: 'tracker',
    gpio: null,
    gpioState: null,
    reason: null,
    thresholdSeconds: null,
    lat: record.gps.latitude,
    lon: record.gps.longitude,
    speed: record.gps.speed,
    gpsTimestamp: record.timestamp.toISOString(),
    positionAt: record.timestamp,
    locationSource: 'gps',
    locationProvider: `${normalized.device.manufacturer} ${normalized.device.model}`.trim(),
    locationAccuracyMeters: null,
    gps: {
      latitude: record.gps.latitude,
      longitude: record.gps.longitude,
      altitude: record.gps.altitude,
      speed: record.gps.speed,
      heading: record.gps.heading,
      timestamp: record.timestamp.toISOString(),
      locationSource: 'gps',
      locationProvider: `${normalized.device.manufacturer} ${normalized.device.model}`.trim(),
      locationAccuracyMeters: null
    },
    source: 'teltonika-gateway',
    metadata: {
      trackerId: tracker._id,
      imei: normalized.imei,
      iccid: normalized.device.iccid,
      packetId: normalized.packet.packetId,
      codec: normalized.packet.codec,
      recordIndex: record.index,
      priority: record.priority,
      satellites: record.gps.satellites,
      gpsValid: record.gps.valid,
      eventIoId: record.io.eventId,
      ignition: record.io.known.ignition ?? null,
      movement: record.io.known.movement ?? null,
      totalOdometerM: record.io.known.totalOdometerM ?? null,
      knownIo: record.io.known,
      rawIo: record.io.raw
    },
    receivedAt: normalized.packet.receivedAt
  };
}

async function registerTracker({ imei, manufacturer = 'Teltonika', model = 'FTC880' }) {
  if (!/^\d{15}$/.test(String(imei || ''))) {
    throw new TrackerGatewayError('El IMEI debe contener 15 digitos', 'INVALID_IMEI', 400);
  }

  return Tracker.findOneAndUpdate(
    { imei: String(imei) },
    {
      $set: {
        manufacturer,
        model,
        enabled: true,
        approvalStatus: 'approved'
      }
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

async function recordTrackerAttempt(normalized) {
  const attempt = {
    manufacturer: normalized.device.manufacturer,
    model: normalized.device.model,
    iccid: normalized.device.iccid,
    lastAttemptAt: normalized.packet.receivedAt
  };

  try {
    return await Tracker.findOneAndUpdate(
      { imei: normalized.imei },
      {
        $set: attempt,
        $setOnInsert: {
          enabled: false,
          approvalStatus: 'pending',
          firstSeenAt: normalized.packet.receivedAt
        }
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  } catch (error) {
    if (error?.code !== 11000) throw error;
    return Tracker.findOneAndUpdate({ imei: normalized.imei }, { $set: attempt }, { new: true });
  }
}

function trackerStatus(tracker) {
  if (tracker.approvalStatus) return tracker.approvalStatus;
  return tracker.enabled ? 'approved' : tracker.lastAttemptAt ? 'pending' : 'disabled';
}

async function listTrackers() {
  const trackers = await Tracker.find().sort({ lastAttemptAt: -1, createdAt: -1 }).lean();
  const order = { pending: 0, approved: 1, disabled: 2 };
  return trackers
    .map((tracker) => ({
      imei: tracker.imei,
      status: trackerStatus(tracker),
      enabled: Boolean(tracker.enabled),
      manufacturer: tracker.manufacturer,
      model: tracker.model,
      iccid: tracker.iccid,
      firstSeenAt: tracker.firstSeenAt || tracker.createdAt || null,
      lastAttemptAt: tracker.lastAttemptAt || null,
      lastSeenAt: tracker.lastSeenAt || null,
      createdAt: tracker.createdAt,
      updatedAt: tracker.updatedAt
    }))
    .sort((left, right) => (order[left.status] ?? 9) - (order[right.status] ?? 9));
}

async function setTrackerApproval(imei, enabled) {
  if (!/^\d{15}$/.test(String(imei || ''))) {
    throw new TrackerGatewayError('El IMEI debe contener 15 digitos', 'INVALID_IMEI', 400);
  }

  const tracker = await Tracker.findOneAndUpdate(
    { imei: String(imei) },
    {
      $set: {
        enabled: Boolean(enabled),
        approvalStatus: enabled ? 'approved' : 'disabled'
      }
    },
    { new: true }
  );

  if (!tracker) {
    throw new TrackerGatewayError('IMEI no encontrado', 'TRACKER_NOT_FOUND', 404);
  }

  return tracker;
}

async function claimNonce({ keyId, nonce, toleranceSeconds }) {
  try {
    await TrackerRequestNonce.create({
      keyId,
      nonce,
      expiresAt: new Date(Date.now() + toleranceSeconds * 2000)
    });
  } catch (error) {
    if (error?.code === 11000) {
      throw new TrackerGatewayError('La peticion ya ha sido procesada', 'INVALID_SIGNATURE', 401);
    }
    throw error;
  }
}

async function releaseNonce({ keyId, nonce }) {
  await TrackerRequestNonce.deleteOne({ keyId, nonce }).catch(() => {});
}

async function ingestGatewayPacket(payload) {
  const normalized = validateGatewayPayload(payload);
  const tracker = await Tracker.findOne({ imei: normalized.imei, enabled: true });

  if (!tracker) {
    await recordTrackerAttempt(normalized);
    throw new TrackerGatewayError('IMEI no registrado', 'UNKNOWN_DEVICE', 403);
  }

  const operations = normalized.records.map((record) => ({
    updateOne: {
      filter: { eventId: record.eventId },
      update: { $setOnInsert: buildTrackerPoint(tracker, normalized, record) },
      upsert: true
    }
  }));

  await TrackerPoint.bulkWrite(operations, { ordered: false });

  const latestRecord = normalized.records.reduce((latest, record) => (
    record.timestamp > latest.timestamp ? record : latest
  ));
  const trackerUpdates = {
    lastSeenAt: normalized.packet.receivedAt,
    lastAttemptAt: normalized.packet.receivedAt,
    manufacturer: normalized.device.manufacturer,
    model: normalized.device.model,
    iccid: normalized.device.iccid
  };

  await Promise.all([
    Tracker.updateOne({ _id: tracker._id }, { $set: trackerUpdates }),
    Tracker.updateOne(
      { _id: tracker._id, firstSeenAt: null },
      { $set: { firstSeenAt: normalized.packet.receivedAt } }
    ),
    Device.updateOne(
      { deviceId: tracker.imei },
      {
        $set: {
          deviceId: tracker.imei,
          name: tracker.imei,
          lastSeenAt: normalized.packet.receivedAt,
          lastSignal: 'gps',
          lastGps: latestRecord.gps.valid
            ? {
                latitude: latestRecord.gps.latitude,
                longitude: latestRecord.gps.longitude,
                altitude: latestRecord.gps.altitude,
                speed: latestRecord.gps.speed,
                heading: latestRecord.gps.heading,
                locationSource: 'gps',
                locationProvider: `${normalized.device.manufacturer} ${normalized.device.model}`.trim(),
                locationAccuracyMeters: null
              }
            : null,
          status: 'online'
        }
      },
      { upsert: true }
    )
  ]);

  return normalized.records.length;
}

async function getGatewayStatus() {
  const [registeredDevices, pendingDevices, latestTracker] = await Promise.all([
    Tracker.countDocuments({ enabled: true }),
    Tracker.countDocuments({ approvalStatus: 'pending' }),
    Tracker.findOne({ enabled: true }).sort({ lastSeenAt: -1 }).lean()
  ]);

  return {
    configured: Boolean(config.trackerSharedSecret),
    keyId: config.trackerKeyId,
    publicEndpoint: `${config.teltonikaPublicHost}:${config.teltonikaPublicPort}`,
    internalTcpPort: config.teltonikaTcpPort,
    registeredDevices,
    pendingDevices,
    lastSeenAt: latestTracker?.lastSeenAt || null,
    latestDevice: latestTracker
      ? {
          imei: latestTracker.imei,
          model: latestTracker.model
        }
      : null
  };
}

module.exports = {
  TrackerGatewayError,
  claimNonce,
  getGatewayStatus,
  ingestGatewayPacket,
  listTrackers,
  recordTrackerAttempt,
  registerTracker,
  releaseNonce,
  setTrackerApproval,
  validateGatewayPayload
};
