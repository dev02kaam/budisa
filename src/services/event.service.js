const SensorEvent = require('../models/SensorEvent');
const TrackerPoint = require('../models/TrackerPoint');
const HeartbeatEvent = require('../models/HeartbeatEvent');
const Device = require('../models/Device');
const { getTelemetryDestinations } = require('../utils/telemetry');

function buildCommonDoc(payload, category) {
  const rawGps = payload.gpsRaw || {};
  return {
    ...payload,
    category,
    gps: payload.gps || {
      latitude: rawGps.lat ?? payload.lat ?? null,
      longitude: rawGps.lon ?? payload.lon ?? null,
      altitude: null,
      speed: rawGps.speed ?? payload.speed ?? null,
      heading: null,
      timestamp: rawGps.gpsTimestamp ?? payload.gpsTimestamp ?? null
    },
    lat: rawGps.lat ?? payload.lat ?? payload.gps?.latitude ?? null,
    lon: rawGps.lon ?? payload.lon ?? payload.gps?.longitude ?? null,
    speed: rawGps.speed ?? payload.speed ?? payload.gps?.speed ?? null,
    gpsTimestamp: rawGps.gpsTimestamp ?? payload.gpsTimestamp ?? payload.gps?.timestamp ?? null
  };
}

async function createEvent(payload) {
  const deviceId = payload.deviceId || payload.truckId;
  const eventId = payload.eventId || `${payload.truckId}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const basePayload = {
    ...payload,
    eventId,
    deviceId,
    truckId: payload.truckId || deviceId
  };

  const saved = [];

  const destinations = getTelemetryDestinations(basePayload);

  if (destinations.includes('state')) {
    saved.push(await HeartbeatEvent.create(buildCommonDoc(basePayload, 'state')));
  }

  if (destinations.includes('history')) {
    saved.push(await SensorEvent.create(buildCommonDoc(basePayload, 'history')));
  }

  if (destinations.includes('tracker')) {
    saved.push(await TrackerPoint.create(buildCommonDoc(basePayload, 'tracker')));
  }

  await Device.updateOne(
    { deviceId },
    {
      $set: {
        deviceId,
        name: payload.metadata?.deviceName || deviceId,
        lastSeenAt: saved[0].receivedAt,
        lastSignal: payload.signal,
        lastGps: payload.gps || null,
        status: 'online'
      }
    },
    { upsert: true }
  );

  return saved[0];
}

async function getLatestEvents(limit = 20) {
  return SensorEvent.find({ signal: { $nin: ['control_heartbeat', 'gps'] } }).sort({ receivedAt: -1 }).limit(limit).lean();
}

async function getEvents(filters = {}, limit = 200) {
  const query = {
    signal: { $nin: ['control_heartbeat', 'gps'] }
  };

  if (filters.deviceId) {
    query.deviceId = filters.deviceId;
  }

  if (filters.truckId) {
    query.truckId = filters.truckId;
  }

  if (filters.signal) {
    query.signal = filters.signal;
  }

  if (filters.gpioState !== undefined && filters.gpioState !== null && filters.gpioState !== '') {
    query.gpioState = Number(filters.gpioState);
  }

  if (filters.hasGps === true) {
    query['gps.latitude'] = { $ne: null };
    query['gps.longitude'] = { $ne: null };
  }

  if (filters.from || filters.to) {
    query.receivedAt = {};
    if (filters.from) {
      query.receivedAt.$gte = new Date(filters.from);
    }
    if (filters.to) {
      query.receivedAt.$lte = new Date(filters.to);
    }
  }

  if (filters.q) {
    const matcher = new RegExp(String(filters.q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    query.$or = [
      { event: matcher },
      { reason: matcher },
      { deviceId: matcher },
      { truckId: matcher },
      { signal: matcher }
    ];
  }

  if (filters.minBattery !== undefined && filters.minBattery !== '') {
    query.battery = query.battery || {};
    query.battery.$gte = Number(filters.minBattery);
  }

  if (filters.maxBattery !== undefined && filters.maxBattery !== '') {
    query.battery = query.battery || {};
    query.battery.$lte = Number(filters.maxBattery);
  }

  return SensorEvent.find(query).sort({ receivedAt: -1 }).limit(limit).lean();
}

async function getSummary() {
  const [latestEvent, totalEvents, subidaCount, bajadaCount, levantadaCount, estableCount, alertaCount] = await Promise.all([
    SensorEvent.findOne({ signal: { $nin: ['control_heartbeat', 'gps'] } }).sort({ receivedAt: -1 }).lean(),
    SensorEvent.countDocuments({ signal: { $nin: ['control_heartbeat', 'gps'] } }),
    SensorEvent.countDocuments({ signal: 'bascula_subida' }),
    SensorEvent.countDocuments({ signal: 'bascula_bajada' }),
    SensorEvent.countDocuments({ signal: 'bascula_levantada' }),
    SensorEvent.countDocuments({ signal: 'estado_estable' }),
    SensorEvent.countDocuments({ signal: 'alerta' })
  ]);

  const deviceCount = await Device.countDocuments();

  return {
    latestEvent,
    totalEvents,
    deviceCount,
    signalCounts: {
      bascula_subida: subidaCount,
      bascula_bajada: bajadaCount,
      bascula_levantada: levantadaCount,
      estado_estable: estableCount,
      alerta: alertaCount
    }
  };
}

async function getTrail(deviceId, limit = 100) {
  return TrackerPoint.find({ deviceId }).sort({ receivedAt: 1 }).limit(limit).lean();
}

async function getTrailSummary(deviceId, limit = 30) {
  const points = await TrackerPoint.find({
    deviceId,
    'gps.latitude': { $ne: null },
    'gps.longitude': { $ne: null }
  })
    .sort({ receivedAt: -1 })
    .limit(limit)
    .lean();

  const ordered = points.reverse();
  return ordered.map((event, index) => ({
    ...event,
    sequence: index + 1
  }));
}

async function getDevices() {
  return Device.find().sort({ lastSeenAt: -1 }).lean();
}

async function getInsights() {
  const lastHour = new Date(Date.now() - 60 * 60 * 1000);
  const [recentEvents, recentAlertCount] = await Promise.all([
    SensorEvent.find({ receivedAt: { $gte: lastHour }, signal: { $nin: ['control_heartbeat', 'gps'] } }).sort({ receivedAt: -1 }).lean(),
    SensorEvent.countDocuments({ signal: 'alerta', receivedAt: { $gte: lastHour } })
  ]);

  const rapidFlipCount = recentEvents.reduce((count, event, index, array) => {
    const previous = array[index + 1];
    if (!previous) return count;
    return previous.signal !== event.signal ? count + 1 : count;
  }, 0);

  return {
    recentAlertCount,
    rapidFlipCount,
    recentEvents: recentEvents.slice(0, 10)
  };
}

async function getHeartbeats(limit = 200) {
  return HeartbeatEvent.find().sort({ receivedAt: -1 }).limit(limit).lean();
}

module.exports = {
  createEvent,
  getLatestEvents,
  getEvents,
  getSummary,
  getTrail,
  getTrailSummary,
  getDevices,
  getInsights,
  getHeartbeats
};
