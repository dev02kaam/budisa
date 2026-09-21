const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

async function run() {
  const nodes = new Map();
  const element = (id) => {
    if (!nodes.has(id)) nodes.set(id, { value: '', innerHTML: '', textContent: '', hidden: false,
      classList: { toggle() {} }, setAttribute() {} });
    return nodes.get(id);
  };
  const requests = [];
  const confirmations = [];
  let accept = false;
  let refreshes = 0;
  const context = vm.createContext({
    console, Intl, Date, AbortController,
    localStorage: { getItem: () => null },
    document: { body: element('body'), getElementById: element, querySelectorAll: () => [] },
    window: { confirm(message) { confirmations.push(message); return accept; } },
    requestJson: async (url, options) => { requests.push({ url, options }); },
    refreshVehicles: async () => { refreshes++; }
  });
  const source = fs.readFileSync(path.join(__dirname, '../public/js/app.js'), 'utf8');
  vm.runInContext(source.replace('boot();', `
    refreshVehicleViews = refreshVehicles;
    globalThis.client = { state, elements, renderAdminDevices, handleDeviceAction, loadAdminTrackers };
  `), context);
  const { state, elements, renderAdminDevices, handleDeviceAction, loadAdminTrackers } = context.client;
  const disabled = { imei: '356000000000950', licensePlate: '0950 DEL', enabled: false, status: 'disabled' };
  const active = { imei: '356000000000951', licensePlate: '0951 ACT', enabled: true, status: 'approved' };
  const pending = { imei: '356000000000952', licensePlate: '', enabled: false, status: 'pending' };
  state.adminTrackers = [disabled, active, pending];
  renderAdminDevices();
  assert.equal((elements.deviceAdminList.innerHTML.match(/data-device-action="delete"/g) || []).length, 1);
  assert.match(elements.deviceAdminList.innerHTML, /Eliminar vehículo 0950 DEL/);
  const button = { dataset: { deviceAction: 'delete', imei: disabled.imei } };
  await handleDeviceAction(button);
  assert.equal(confirmations.length, 1);
  assert.match(confirmations[0], /¿Estás seguro.*0950 DEL/);
  assert.match(confirmations[0], /histórico.*se conservará/);
  assert.equal(requests.length, 0, 'Cancel must never call DELETE');
  assert.equal(state.adminTrackers.length, 3);
  accept = true;
  await handleDeviceAction({ dataset: { deviceAction: 'delete', imei: active.imei } });
  assert.equal(requests.length, 0, 'Active vehicles cannot be removed from the client');
  assert.equal(confirmations.length, 1);
  await handleDeviceAction(button);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].options.method, 'DELETE');
  assert.equal(requests[0].url, `/api/trackers/${disabled.imei}`);
  assert.equal(state.adminTrackers.some((item) => item.imei === disabled.imei), false);
  assert.equal(refreshes, 1);
  assert.equal(state.syncing, false);
  assert.match(elements.adminFeedback.textContent, /eliminado.*histórico se conserva/);

  state.adminTrackers = [disabled];
  let rejectRequest;
  context.requestJson = () => new Promise((resolve, reject) => { rejectRequest = reject; });
  const deleting = handleDeviceAction(button);
  assert.equal(state.syncing, true);
  assert.match(elements.deviceAdminList.innerHTML, /data-device-action="delete"[^>]*disabled/);
  const promptCount = confirmations.length;
  await handleDeviceAction(button);
  assert.equal(confirmations.length, promptCount, 'Double clicks cannot submit twice');
  rejectRequest(new Error('No se ha podido conectar'));
  await deleting;
  assert.equal(state.adminTrackers.length, 1);
  assert.equal(state.syncing, false);
  assert.equal(state.adminBusyImei, '');
  assert.match(elements.adminFeedback.textContent, /No se ha podido conectar/);

  // A delayed list response from before deletion cannot resurrect the row.
  const waiting = [];
  context.requestJson = (url, options) => new Promise((resolve) => waiting.push({ options, resolve }));
  const oldList = loadAdminTrackers({ silent: true });
  const newList = loadAdminTrackers({ silent: true, force: true });
  assert.equal(waiting[0].options.signal.aborted, true);
  waiting[1].resolve([]);
  await newList;
  waiting[0].resolve([disabled]);
  await oldList;
  assert.equal(state.adminTrackers.length, 0);
  assert.equal(state.adminLoading, false);
  console.log('ok - eliminar requiere confirmacion, respeta cancelacion, bloquea duplicados y conserva errores');
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
