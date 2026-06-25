const assert = require('node:assert/strict');

const { normalizePayload } = require('../src/utils/telemetry');

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
  assert.equal(payload.gpioState, 1);
  assert.equal(payload.reason, 'GPIO17_HIGH_RECUPERADO');
  assert.equal(payload.gps.latitude, null);
  assert.equal(payload.gps.longitude, null);
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
