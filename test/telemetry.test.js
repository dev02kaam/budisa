const assert = require('node:assert/strict');

const { normalizePayload, getTelemetryDestinations } = require('../src/utils/telemetry');

function run(name, fn) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

run('normaliza un evento normal de bascula', () => {
  const payload = normalizePayload({
    eventId: 'evt-1',
    truckId: 'LAB001',
    event: 'bascula_bajada',
    gpio: 17,
    gpioState: 1,
    reason: 'GPIO17_HIGH_RECUPERADO',
    thresholdSeconds: 10,
    lat: null,
    lon: null,
    speed: null,
    gpsTimestamp: null
  });

  assert.equal(payload.signal, 'bascula_bajada');
  assert.equal(payload.kind, 'history');
  assert.deepEqual(getTelemetryDestinations(payload), ['history']);
  assert.equal(payload.gpioState, 1);
  assert.equal(payload.reason, 'GPIO17_HIGH_RECUPERADO');
  assert.equal(payload.gps.latitude, null);
  assert.equal(payload.gps.longitude, null);
});

run('normaliza un evento gps valido', () => {
  const payload = normalizePayload({
    eventId: 'evt-1-gps',
    truckId: 'LAB001',
    event: 'gps',
    lat: 41.3879,
    lon: 2.16992,
    speed: 12.5,
    gpsTimestamp: '2026-06-25T11:06:08Z'
  });

  assert.equal(payload.signal, 'gps');
  assert.equal(payload.kind, 'tracker');
  assert.deepEqual(getTelemetryDestinations(payload), ['tracker']);
  assert.equal(payload.gpio, null);
  assert.equal(payload.gpioState, null);
  assert.equal(payload.gps.latitude, 41.3879);
  assert.equal(payload.gps.longitude, 2.16992);
  assert.equal(payload.gpsRaw.lat, 41.3879);
  assert.equal(payload.gpsRaw.lon, 2.16992);
});

run('normaliza un evento de bascula con gps para historico y tracker', () => {
  const payload = normalizePayload({
    eventId: 'evt-1-bascula-gps',
    truckId: 'LAB001',
    event: 'bascula_levantada',
    gpio: 17,
    gpioState: 0,
    reason: 'GPIO17_LOW_DETECTADO',
    thresholdSeconds: 10,
    lat: 38.99372,
    lon: -1.85479,
    speed: 0,
    gpsTimestamp: '2026-06-25T11:06:08Z'
  });

  assert.equal(payload.signal, 'bascula_levantada');
  assert.equal(payload.kind, 'history_tracker');
  assert.deepEqual(getTelemetryDestinations(payload), ['history', 'tracker']);
  assert.equal(payload.gps.latitude, 38.99372);
  assert.equal(payload.gps.longitude, -1.85479);
});

run('acepta un evento control heartbeat con gpioState null', () => {
  const payload = normalizePayload({
    eventId: 'evt-2',
    truckId: 'LAB001',
    event: 'control_heartbeat',
    reason: 'HEARTBEAT_SERVICIO',
    gpioState: null,
    thresholdSeconds: 0,
    lat: null,
    lon: null,
    speed: null,
    gpsTimestamp: null
  });

  assert.equal(payload.signal, 'control_heartbeat');
  assert.equal(payload.kind, 'state');
  assert.deepEqual(getTelemetryDestinations(payload), ['state']);
  assert.equal(payload.gpio, null);
  assert.equal(payload.gpioState, null);
  assert.equal(payload.reason, 'HEARTBEAT_SERVICIO');
  assert.equal(payload.thresholdSeconds, 0);
});

run('rechaza un evento con senal no soportada', () => {
  assert.throws(
    () =>
      normalizePayload({
        truckId: 'LAB001',
        event: 'otro_evento'
      }),
    /signal invalido/
  );
});

run('rechaza un evento gps sin coordenadas', () => {
  assert.throws(
    () =>
      normalizePayload({
        truckId: 'LAB001',
        event: 'gps',
        lat: null,
        lon: null
      }),
    /gps invalido/
  );
});
