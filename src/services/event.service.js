const SensorEvent = require('../models/SensorEvent');
const TrackerPoint = require('../models/TrackerPoint');
const HeartbeatEvent = require('../models/HeartbeatEvent');
const Device = require('../models/Device');
const { getTelemetryDestinations } = require('../utils/telemetry');

function toValidDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getPointDate(point) {
  return toValidDate(point.positionAt)
    || toValidDate(point.gpsTimestamp)
    || toValidDate(point.gps?.timestamp)
    || toValidDate(point.receivedAt);
}

function buildCommonDoc(payload, category) {
  const rawGps = payload.gpsRaw || {};
  const gpsTimestamp = rawGps.gpsTimestamp ?? payload.gpsTimestamp ?? payload.gps?.timestamp ?? null;
  return {
    ...payload,
    category,
    gps: {
      latitude: rawGps.lat ?? payload.lat ?? null,
      longitude: rawGps.lon ?? payload.lon ?? null,
      altitude: payload.gps?.altitude ?? null,
      speed: rawGps.speed ?? payload.speed ?? null,
      heading: payload.gps?.heading ?? null,
      timestamp: rawGps.gpsTimestamp ?? payload.gpsTimestamp ?? null,
      locationSource: rawGps.locationSource ?? payload.locationSource ?? null,
      locationProvider: rawGps.locationProvider ?? payload.locationProvider ?? null,
      locationAccuracyMeters: rawGps.locationAccuracyMeters ?? payload.locationAccuracyMeters ?? null
    },
    lat: rawGps.lat ?? payload.lat ?? payload.gps?.latitude ?? null,
    lon: rawGps.lon ?? payload.lon ?? payload.gps?.longitude ?? null,
    speed: rawGps.speed ?? payload.speed ?? payload.gps?.speed ?? null,
    gpsTimestamp,
    positionAt: toValidDate(payload.positionAt) || toValidDate(gpsTimestamp),
    locationSource: rawGps.locationSource ?? payload.locationSource ?? payload.gps?.locationSource ?? null,
    locationProvider: rawGps.locationProvider ?? payload.locationProvider ?? payload.gps?.locationProvider ?? null,
    locationAccuracyMeters:
      rawGps.locationAccuracyMeters ?? payload.locationAccuracyMeters ?? payload.gps?.locationAccuracyMeters ?? null
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
    query.locationSource = { $ne: 'red' };
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

async function getTrackerPoints(filters = {}, limit = 5000) {
  const query = {
    'gps.latitude': { $ne: null },
    'gps.longitude': { $ne: null },
    'metadata.gpsValid': { $ne: false }
  };

  if (filters.deviceId) {
    query.deviceId = filters.deviceId;
  }

  if (filters.truckId) {
    query.truckId = filters.truckId;
  }

  if (filters.from || filters.to) {
    const range = {};
    if (filters.from) {
      range.$gte = new Date(filters.from);
    }
    if (filters.to) {
      range.$lt = new Date(filters.to);
    }
    query.$or = [
      { positionAt: range },
      { positionAt: null, receivedAt: range }
    ];
  }

  if (filters.from || filters.to) {
    return TrackerPoint.find(query).sort({ positionAt: 1, receivedAt: 1 }).limit(limit).lean();
  }

  const latest = await TrackerPoint.find(query).sort({ positionAt: -1, receivedAt: -1 }).limit(limit).lean();
  return latest.reverse();
}

function dayKeyFor(date) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Madrid',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date);
}

function haversineDistanceMeters(left, right) {
  const toRadians = (degrees) => (degrees * Math.PI) / 180;
  const earthRadius = 6371000;
  const deltaLatitude = toRadians(right.latitude - left.latitude);
  const deltaLongitude = toRadians(right.longitude - left.longitude);
  const latitude1 = toRadians(left.latitude);
  const latitude2 = toRadians(right.latitude);
  const a = Math.sin(deltaLatitude / 2) ** 2
    + Math.cos(latitude1) * Math.cos(latitude2) * Math.sin(deltaLongitude / 2) ** 2;
  return 2 * earthRadius * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function getTrackerDays(filters = {}, limit = 30) {
  const query = {
    'gps.latitude': { $ne: null },
    'gps.longitude': { $ne: null },
    'metadata.gpsValid': { $ne: false }
  };

  if (filters.deviceId) query.deviceId = filters.deviceId;
  if (filters.truckId) query.truckId = filters.truckId;

  const points = await TrackerPoint.find(query)
    .sort({ positionAt: -1, receivedAt: -1 })
    .limit(20000)
    .lean();
  const groups = new Map();

  points.forEach((point) => {
    const timestamp = getPointDate(point);
    const latitude = Number(point.gps?.latitude ?? point.lat);
    const longitude = Number(point.gps?.longitude ?? point.lon);
    if (!timestamp || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return;

    const imei = String(point.metadata?.imei || point.deviceId || point.truckId || 'Sin IMEI');
    const date = dayKeyFor(timestamp);
    const key = `${imei}|${date}`;
    const item = {
      timestamp,
      latitude,
      longitude,
      speed: Number(point.gps?.speed ?? point.speed ?? 0)
    };
    const group = groups.get(key) || {
      date,
      imei,
      pointCount: 0,
      startAt: timestamp,
      endAt: timestamp,
      maxSpeedKph: 0,
      distanceMeters: 0,
      ordered: []
    };

    group.pointCount += 1;
    if (timestamp < group.startAt) group.startAt = timestamp;
    if (timestamp > group.endAt) group.endAt = timestamp;
    group.maxSpeedKph = Math.max(group.maxSpeedKph, Number.isFinite(item.speed) ? item.speed : 0);
    group.ordered.push(item);
    groups.set(key, group);
  });

  return [...groups.values()]
    .map((group) => {
      group.ordered.sort((left, right) => left.timestamp - right.timestamp);
      for (let index = 1; index < group.ordered.length; index += 1) {
        group.distanceMeters += haversineDistanceMeters(group.ordered[index - 1], group.ordered[index]);
      }
      const { ordered, ...summary } = group;
      return summary;
    })
    .sort((left, right) => right.endAt - left.endAt)
    .slice(0, limit);
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
  getTrackerPoints,
  getTrackerDays,
  getTrailSummary,
  getDevices,
  getInsights,
  getHeartbeats
};
