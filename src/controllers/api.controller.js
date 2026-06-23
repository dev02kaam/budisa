const eventService = require('../services/event.service');

const allowedSignals = new Set([
  'bascula_subida',
  'bascula_bajada',
  'bascula_levantada',
  'estado_estable',
  'alerta'
]);

function normalizePayload(body) {
  const truckId = String(body.truckId || body.truck_id || body.deviceId || body.device_id || 'raspberry-1').trim();
  const deviceId = truckId;
  const signal = String(body.signal || body.event || body.estado || '').trim();
  const latitudeRaw = body.latitude ?? body.lat ?? body.gps?.latitude;
  const longitudeRaw = body.longitude ?? body.lon ?? body.gps?.longitude;
  const latitude = latitudeRaw === null || latitudeRaw === undefined || latitudeRaw === '' ? null : Number(latitudeRaw);
  const longitude = longitudeRaw === null || longitudeRaw === undefined || longitudeRaw === '' ? null : Number(longitudeRaw);
  const altitude = body.altitude ?? body.gps?.altitude ?? null;
  const speed = body.speed ?? body.gps?.speed ?? null;
  const heading = body.heading ?? body.gps?.heading ?? null;
  const eventId = String(body.eventId || body.event_id || body.idempotencyKey || '').trim();
  const eventName = String(body.event || body.signal || body.estado || signal).trim();

  if (!truckId) {
    throw new Error('truckId es obligatorio');
  }

  if (!allowedSignals.has(signal)) {
    throw new Error('signal inválido');
  }

  return {
    eventId: eventId || undefined,
    deviceId,
    truckId,
    signal,
    event: eventName,
    gpio: Number(body.gpio ?? body.gpioPin ?? 17),
    gpioState: Number(body.gpioState ?? body.gpio_state ?? (signal === 'bascula_bajada' ? 1 : 0)),
    reason: body.reason ?? null,
    thresholdSeconds: body.thresholdSeconds ?? body.threshold_seconds ?? null,
    gps: {
      latitude: latitude === null || Number.isNaN(latitude) ? null : latitude,
      longitude: longitude === null || Number.isNaN(longitude) ? null : longitude,
      altitude: altitude === null || altitude === undefined ? null : Number(altitude),
      speed: speed === null || speed === undefined ? null : Number(speed),
      heading: heading === null || heading === undefined ? null : Number(heading),
      timestamp: body.gpsTimestamp ?? body.gps_timestamp ?? body.gps?.timestamp ?? null
    },
    battery: body.battery === undefined || body.battery === null ? null : Number(body.battery),
    source: body.source || 'raspberry',
    metadata: body.metadata || {}
  };
}

async function ingestTelemetry(req, res, next) {
  try {
    const payload = normalizePayload(req.body);
    const event = await eventService.createEvent(payload);
    res.status(201).json({ ok: true, event });
  } catch (error) {
    next(error);
  }
}

async function summary(req, res, next) {
  try {
    const data = await eventService.getSummary();
    res.json({ ok: true, data });
  } catch (error) {
    next(error);
  }
}

async function latest(req, res, next) {
  try {
    const limit = Math.min(Number(req.query.limit || 20), 500);
    const events = await eventService.getLatestEvents(limit);
    res.json({ ok: true, data: events });
  } catch (error) {
    next(error);
  }
}

async function search(req, res, next) {
  try {
    const limit = Math.min(Number(req.query.limit || 200), 1000);
    const events = await eventService.getEvents(
      {
        deviceId: req.query.deviceId,
        truckId: req.query.truckId,
        signal: req.query.signal,
        gpioState: req.query.gpioState,
        hasGps: String(req.query.hasGps || '').toLowerCase() === 'true',
        from: req.query.from,
        to: req.query.to,
        q: req.query.q,
        minBattery: req.query.minBattery,
        maxBattery: req.query.maxBattery
      },
      limit
    );
    res.json({ ok: true, data: events });
  } catch (error) {
    next(error);
  }
}

async function trail(req, res, next) {
  try {
    const limit = Math.min(Number(req.query.limit || 100), 500);
    const deviceId = String(req.params.deviceId || 'raspberry-1');
    const points = await eventService.getTrail(deviceId, limit);
    res.json({ ok: true, data: points });
  } catch (error) {
    next(error);
  }
}

async function devices(req, res, next) {
  try {
    const list = await eventService.getDevices();
    res.json({ ok: true, data: list });
  } catch (error) {
    next(error);
  }
}

async function insights(req, res, next) {
  try {
    const data = await eventService.getInsights();
    res.json({ ok: true, data });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  ingestTelemetry,
  summary,
  latest,
  search,
  trail,
  devices,
  insights
};
