const SensorEvent = require('../models/SensorEvent');
const Device = require('../models/Device');

async function createEvent(payload) {
  const deviceId = payload.deviceId || payload.truckId;
  const event = await SensorEvent.create({
    ...payload,
    eventId: payload.eventId || `${payload.truckId}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    deviceId,
    truckId: payload.truckId || deviceId
  });
  await Device.updateOne(
    { deviceId },
    {
      $set: {
        deviceId,
        name: payload.metadata?.deviceName || deviceId,
        lastSeenAt: event.receivedAt,
        lastSignal: payload.signal,
        lastGps: payload.gps,
        status: 'online'
      }
    },
    { upsert: true }
  );

  return event;
}

async function getLatestEvents(limit = 20) {
  return SensorEvent.find().sort({ receivedAt: -1 }).limit(limit).lean();
}

async function getEvents(filters = {}, limit = 200) {
  const query = {};

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
    SensorEvent.findOne({ signal: { $ne: 'control_heartbeat' } }).sort({ receivedAt: -1 }).lean(),
    SensorEvent.countDocuments(),
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
  return SensorEvent.find({ deviceId }).sort({ receivedAt: 1 }).limit(limit).lean();
}

async function getTrailSummary(deviceId, limit = 30) {
  const points = await SensorEvent.find({
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
    SensorEvent.find({ receivedAt: { $gte: lastHour }, signal: { $ne: 'control_heartbeat' } }).sort({ receivedAt: -1 }).lean(),
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

module.exports = {
  createEvent,
  getLatestEvents,
  getEvents,
  getSummary,
  getTrail,
  getTrailSummary,
  getDevices,
  getInsights
};
