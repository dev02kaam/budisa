const allowedSignals = new Set([
  'bascula_subida',
  'bascula_bajada',
  'bascula_levantada',
  'estado_estable',
  'alerta',
  'gps',
  'control_heartbeat'
]);

function toNullableNumber(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const numericValue = Number(value);
  return Number.isNaN(numericValue) ? null : numericValue;
}

function normalizePayload(body = {}) {
  const truckId = String(body.truckId || body.truck_id || body.deviceId || body.device_id || 'raspberry-1').trim();
  const deviceId = truckId;
  const signal = String(body.signal || body.event || body.estado || '').trim();
  const latitudeRaw = body.latitude ?? body.lat ?? body.gps?.latitude;
  const longitudeRaw = body.longitude ?? body.lon ?? body.gps?.longitude;
  const altitude = body.altitude ?? body.gps?.altitude ?? null;
  const speed = body.speed ?? body.gps?.speed ?? null;
  const heading = body.heading ?? body.gps?.heading ?? null;
  const eventId = String(body.eventId || body.event_id || body.idempotencyKey || '').trim();
  const eventName = String(body.event || body.signal || body.estado || signal).trim();
  const isControlHeartbeat = signal === 'control_heartbeat';
  const isGpsOnly = signal === 'gps';
  const latitude = toNullableNumber(latitudeRaw);
  const longitude = toNullableNumber(longitudeRaw);
  const hasGps = Number.isFinite(latitude) && Number.isFinite(longitude);

  if (!truckId) {
    throw new Error('truckId es obligatorio');
  }

  if (!allowedSignals.has(signal)) {
    throw new Error('signal invalido');
  }

  const rawGpio = body.gpio ?? body.gpioPin;
  const rawGpioState = body.gpioState ?? body.gpio_state;
  const gpio = rawGpio === null || rawGpio === undefined || rawGpio === ''
    ? (isControlHeartbeat || isGpsOnly ? null : 17)
    : Number(rawGpio);
  const gpioState = rawGpioState === null || rawGpioState === undefined || rawGpioState === ''
    ? (isControlHeartbeat || isGpsOnly ? null : Number(signal === 'bascula_bajada' ? 1 : 0))
    : Number(rawGpioState);

  return {
    eventId: eventId || undefined,
    deviceId,
    truckId,
    signal,
    event: eventName,
    gpio,
    gpioState,
    reason: body.reason ?? null,
    thresholdSeconds: body.thresholdSeconds ?? body.threshold_seconds ?? null,
    gps: {
      latitude,
      longitude,
      altitude: toNullableNumber(altitude),
      speed: toNullableNumber(speed),
      heading: toNullableNumber(heading),
      timestamp: body.gpsTimestamp ?? body.gps_timestamp ?? body.gps?.timestamp ?? null
    },
    gpsRaw: {
      lat: latitudeRaw ?? null,
      lon: longitudeRaw ?? null,
      speed: body.speed ?? body.gps?.speed ?? null,
      gpsTimestamp: body.gpsTimestamp ?? body.gps_timestamp ?? body.gps?.timestamp ?? null
    },
    battery: body.battery === undefined || body.battery === null ? null : Number(body.battery),
    source: body.source || 'raspberry',
    metadata: body.metadata || {},
    kind: isControlHeartbeat ? 'state' : hasGps ? 'history_tracker' : 'history'
  };
}

function getTelemetryDestinations(payload) {
  if (payload.kind === 'state' || payload.signal === 'control_heartbeat') {
    return ['state'];
  }

  if (payload.kind === 'history_tracker' || (Number.isFinite(payload.gps?.latitude) && Number.isFinite(payload.gps?.longitude))) {
    return ['history', 'tracker'];
  }

  return ['history'];
}

module.exports = {
  allowedSignals,
  normalizePayload,
  toNullableNumber,
  getTelemetryDestinations
};
