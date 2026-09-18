const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Exercise the shipped client polling and request ordering without a browser dependency.
function createClient() {
  const nodes = new Map();
  const element = (id) => {
    if (!nodes.has(id)) nodes.set(id, {
      value: '', textContent: '', innerHTML: '', dataset: {},
      classList: { toggle() {} },
      contains: () => false,
      querySelector: () => element(`${id}-child`)
    });
    return nodes.get(id);
  };
  let tick;
  const context = vm.createContext({
    console, URLSearchParams, AbortController, Intl, Date,
    URL: { createObjectURL: () => 'blob:test', revokeObjectURL() {} },
    localStorage: { getItem: () => null },
    document: { body: { ...element('body'), appendChild() {} }, activeElement: null, getElementById: element, querySelectorAll: () => [], createElement: () => ({ click() {}, remove() {} }) },
    window: {
      setInterval(callback, delay) { assert.equal(delay, 5000); tick = callback; return 1; },
      clearInterval() {}, setTimeout(callback) { callback(); }
    }
  });
  const source = fs.readFileSync(path.join(__dirname, '../public/js/app.js'), 'utf8');
  vm.runInContext(source.replace('boot();', `
    renderPublicViews = () => renderHistory();
    globalThis.client = { state, elements, localDayKey, loadHistoryData, setDefaultHistoryRange, startRefreshTimer, tipEventHasLocation, deviceIsTipping, routeSegments, liveWindowVehicles, exportHistoryPdf };
  `), context);
  return { context, ...context.client, tick: () => tick() };
}

async function run() {
  const app = createClient();
  const { state, elements } = app;
  state.authenticated = true;
  state.view = 'historico';
  app.setDefaultHistoryRange();
  const today = app.localDayKey();
  const row = { imei: '356000000000001', licensePlate: '1235 CDF', date: today, movementSeconds: 60, pointCount: 2, endAt: `${today}T09:01:00Z`, tipEvents: [] };
  let responseDays = [row];
  const requested = [];
  app.context.requestJson = async (url) => {
    requested.push(url);
    if (url.startsWith('/api/tracker/days?')) return responseDays;
    return [];
  };
  await app.loadHistoryData();
  assert.match(elements.historyRouteList.innerHTML, />1 min</);
  assert.match(elements.historyRouteList.innerHTML, /Hoy · En curso/);
  assert.match(elements.historyRouteList.innerHTML, /Ver mapa/);
  const initialMarkup = elements.historyRouteList.innerHTML;

  // An already loaded history must update on the first 5-second tick.
  responseDays = [{ ...row, movementSeconds: 120, pointCount: 3, endAt: `${today}T09:02:00Z` }];
  app.startRefreshTimer();
  await app.tick();
  assert.equal(state.days[0].movementSeconds, 120);
  assert.match(elements.historyRouteList.innerHTML, />2 min</);
  assert.notEqual(elements.historyRouteList.innerHTML, initialMarkup);
  assert.equal(requested.filter((url) => url.includes('limit=1000&from=')).length, 2);

  // Failed background updates keep the rows and can recover on the next poll.
  const successfulRequest = app.context.requestJson;
  const latestMarkup = elements.historyRouteList.innerHTML;
  app.context.requestJson = async () => { throw new Error('Conexión interrumpida'); };
  await app.loadHistoryData({ force: true, silent: true });
  assert.equal(elements.historyRouteList.innerHTML, latestMarkup);
  assert.match(elements.historyUpdateStatus.textContent, /se conservan los últimos datos/);
  app.context.requestJson = successfulRequest;
  await app.tick();
  assert.equal(state.historyError, '');

  // Changing filters while a previous request is pending must not drop the new query.
  state.historyFollowsToday = false;
  const pending = [];
  app.context.requestJson = (url, options) => new Promise((resolve) => pending.push({ url, options, resolve }));
  elements.historyFrom.value = '2026-03-01';
  elements.historyTo.value = '2026-03-02';
  const oldRequest = app.loadHistoryData({ force: true });
  elements.historyFrom.value = '2026-04-01';
  elements.historyTo.value = '2026-04-02';
  const newRequest = app.loadHistoryData({ force: true });
  assert.equal(pending[0].options.signal.aborted, true);
  pending[1].resolve([{ ...row, date: '2026-04-01', movementSeconds: 300 }]);
  await newRequest;
  pending[0].resolve([{ ...row, date: '2026-03-01', movementSeconds: 60 }]);
  await oldRequest;
  assert.equal(state.days[0].date, '2026-04-01');
  assert.match(elements.historyRouteList.innerHTML, />5 min</);

  // The default range follows Madrid midnight; an explicitly chosen interval stays fixed.
  assert.equal(app.localDayKey(new Date('2026-09-07T22:30:00Z')), '2026-09-08');
  app.context.requestJson = successfulRequest;
  state.historyFollowsToday = true;
  await app.loadHistoryData({ force: true });
  assert.equal(elements.historyTo.value, today);
  state.historyFollowsToday = false;
  elements.historyTo.value = '2026-04-02';
  elements.historyFrom.value = '2026-04-01';
  await app.loadHistoryData({ force: true });
  assert.equal(elements.historyTo.value, '2026-04-02');
  // Sensor cycles remain visible without GPS and only located starts open a map.
  responseDays = [{ ...row, date: '2026-04-01', gpsPointCount: 0, tipEvents: [
    { timestamp: '2026-04-01T08:43:53Z', endAt: '2026-04-01T08:44:54Z', durationSeconds: 61, status: 'completed', latitude: null, longitude: null },
    { timestamp: '2026-04-01T09:00:00Z', endAt: null, durationSeconds: null, status: 'active', latitude: null, longitude: null }
  ] }];
  await app.loadHistoryData({ force: true });
  assert.match(elements.historyRouteList.innerHTML, /Inicio/);
  assert.match(elements.historyRouteList.innerHTML, /Fin/);
  assert.match(elements.historyRouteList.innerHTML, /Duración: 1 min 1 s/);
  assert.match(elements.historyRouteList.innerHTML, /Pendiente de cierre/);
  assert.match(elements.historyRouteList.innerHTML, /Sin ubicación/);
  assert.match(elements.historyRouteList.innerHTML, /Sin posiciones GPS/);
  assert.doesNotMatch(elements.historyRouteList.innerHTML, /data-open-tip|data-open-route|0\.00000/);
  responseDays[0].gpsPointCount = 1;
  responseDays[0].tipEvents[0].latitude = 40.4;
  responseDays[0].tipEvents[0].longitude = -3.7;
  await app.loadHistoryData({ force: true });
  assert.equal((elements.historyRouteList.innerHTML.match(/data-open-tip/g) || []).length, 1);
  assert.match(elements.historyRouteList.innerHTML, /data-open-route/);
  assert.equal(app.tipEventHasLocation({ latitude: null, longitude: null }), false);
  assert.equal(app.deviceIsTipping({ tipper: { raised: true }, latestPosition: null }), true);
  responseDays[0].tipEvents[0].endLatitude = 40.401;
  responseDays[0].tipEvents[0].endLongitude = -3.701;
  await app.loadHistoryData({ force: true });
  assert.match(elements.historyRouteList.innerHTML, /data-tip-phase="start"/);
  assert.match(elements.historyRouteList.innerHTML, /data-tip-phase="end"/);
  assert.equal((elements.historyRouteList.innerHTML.match(/data-open-tip/g) || []).length, 2);

  const point = (movement, extra = {}) => ({ latitude: 40.4, longitude: -3.7, movement, ...extra });
  const segments = app.routeSegments([point(true), point(false), point(false), point(null), point(true), point(true, { breakBefore: true }), point(true)]);
  assert.equal(segments.map((segment) => segment.kind).join(','), 'moving,stopped,unknown,moving');
  assert.equal(segments[1].coordinates.length, 3);
  const now = Date.parse('2026-09-20T10:00:00Z');
  state.liveSelectedImeis.add(row.imei);
  state.liveActivity = { vehicles: [{ imei: row.imei, points: [
    point(true, { timestamp: '2026-09-20T08:59:59Z' }), point(false, { timestamp: '2026-09-20T09:00:00Z' })
  ], markers: [{ phase: 'start', timestamp: '2026-09-20T08:59:59Z' }, { phase: 'end', timestamp: '2026-09-20T09:00:00Z' }] }] };
  assert.equal(app.liveWindowVehicles(now)[0].points.length, 1);
  assert.equal(app.liveWindowVehicles(now)[0].markers.length, 1);
  assert.equal(app.liveWindowVehicles(now + 1000)[0].markers.length, 0);

  // Export captures exactly the visible filtered days; a row button selects just that row.
  state.days = [responseDays[0], { ...row, imei: '356000000000002', licensePlate: '9999 XYZ', date: '2026-04-01' }];
  elements.historySearch.value = '1235';
  let selection;
  app.context.window.apiClient = { requestBlob: async (url, options) => { selection = JSON.parse(options.body).days; return {}; } };
  await app.exportHistoryPdf();
  assert.deepEqual(selection, [{ imei: row.imei, date: '2026-04-01' }]);
  assert.match(elements.historyExportStatus.textContent, /PDF descargado: 1 jornada/);
  elements.historySearch.value = '';
  await app.exportHistoryPdf();
  assert.equal(selection.length, 2);
  await app.exportHistoryPdf(`${row.imei}|2026-04-01`);
  assert.equal(selection.length, 1);
  app.context.window.apiClient.requestBlob = async () => { throw new Error('Prueba sin conexión'); };
  await app.exportHistoryPdf();
  assert.match(elements.historyExportStatus.textContent, /No se ha podido exportar/);
  assert.equal(state.historyExporting, false);
  console.log('ok - historico actualiza durante el dia, conserva datos tras errores y respeta filtros concurrentes');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
