(() => {
const STORAGE_KEYS = {
  theme: 'budisa-theme',
  view: 'budisa-view',
  selectedImei: 'budisa-selected-imei',
  liveSelection: 'budisa-live-selection'
};

const VIEW_META = {
  dashboard: {
    title: 'Resumen de flota',
    subtitle: 'La situación general de todos los vehículos, de un vistazo.'
  },
  mapa: {
    title: 'Mapa en vivo',
    subtitle: 'Sigue solo los vehículos activos que elijas.'
  },
  historico: {
    title: 'Histórico de actividad',
    subtitle: 'Tiempo en movimiento y basculaciones de cada vehículo por jornada.'
  },
  estado: {
    title: 'Estado de la flota',
    subtitle: 'Autorización, conexión y fix GPS sin ruido adicional.'
  },
  vehiculos: {
    title: 'Gestión de vehículos',
    subtitle: 'Matrícula asociada de forma segura a cada IMEI.'
  }
};

function readStoredImeiList() {
  const stored = localStorage.getItem(STORAGE_KEYS.liveSelection);
  if (stored === null) return null;
  try {
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed.filter((imei) => typeof imei === 'string') : [];
  } catch {
    return [];
  }
}

const storedLiveSelection = readStoredImeiList();

const CONNECTION_META = {
  online: { label: 'En línea', className: 'is-online' },
  stale: { label: 'Intermitente', className: 'is-stale' },
  offline: { label: 'Sin enlace', className: 'is-offline' },
  waiting: { label: 'Esperando datos', className: 'is-waiting' },
  pending: { label: 'Pendiente', className: 'is-pending' },
  disabled: { label: 'Deshabilitado', className: 'is-disabled' }
};

const APPROVAL_META = {
  approved: { label: 'Activo', className: 'is-approved' },
  pending: { label: 'Pendiente', className: 'is-pending' },
  disabled: { label: 'Deshabilitado', className: 'is-disabled' }
};

const state = {
  theme: localStorage.getItem(STORAGE_KEYS.theme) || 'night',
  view: localStorage.getItem(STORAGE_KEYS.view) === 'dispositivos'
    ? 'vehiculos'
    : (localStorage.getItem(STORAGE_KEYS.view) || 'dashboard'),
  fleet: [],
  days: [],
  todayDays: [],
  gateway: null,
  authenticated: false,
  sessionUser: '',
  selectedImei: localStorage.getItem(STORAGE_KEYS.selectedImei) || '',
  fleetMap: null,
  fleetTileLayer: null,
  fleetMarkers: new Map(),
  mapHasFit: false,
  liveMap: null,
  liveTileLayer: null,
  liveMarkers: new Map(),
  liveTrailLayers: [],
  liveTrails: new Map(),
  liveSelectedImeis: new Set(storedLiveSelection || []),
  liveSelectionHydrated: storedLiveSelection !== null,
  liveMapHasFit: false,
  tipLocationMap: null,
  tipLocationTileLayer: null,
  tipLocationMarker: null,
  adminTrackers: [],
  adminLoading: false,
  adminBusyImei: '',
  daysFingerprint: '',
  historyLoaded: false,
  historyLoading: false,
  historyError: '',
  openTipFolders: new Set(),
  syncing: false,
  refreshing: false,
  refreshTick: 0,
  refreshTimer: null
};

const elements = {
  body: document.body,
  loginGate: document.getElementById('loginGate'),
  loginForm: document.getElementById('loginForm'),
  loginUsername: document.getElementById('loginUsername'),
  loginPassword: document.getElementById('loginPassword'),
  loginSubmit: document.getElementById('loginSubmit'),
  loginFeedback: document.getElementById('loginFeedback'),
  appShell: document.getElementById('appShell'),
  logoutButton: document.getElementById('logoutButton'),
  sessionUsername: document.getElementById('sessionUsername'),
  syncOverlay: document.getElementById('syncOverlay'),
  syncTitle: document.getElementById('syncTitle'),
  syncMessage: document.getElementById('syncMessage'),
  navMenu: document.getElementById('navMenu'),
  navButtons: Array.from(document.querySelectorAll('.nav-item')),
  viewLinks: Array.from(document.querySelectorAll('[data-view-link]')),
  views: Array.from(document.querySelectorAll('.view')),
  pageTitle: document.getElementById('pageTitle'),
  pageSubtitle: document.getElementById('pageSubtitle'),
  themeToggle: document.getElementById('themeToggleInput'),
  apiStatus: document.getElementById('apiStatus'),
  metricDevices: document.getElementById('metricDevices'),
  metricOnline: document.getElementById('metricOnline'),
  metricFix: document.getElementById('metricFix'),
  metricDistance: document.getElementById('metricDistance'),
  metricMoving: document.getElementById('metricMoving'),
  metricStopped: document.getElementById('metricStopped'),
  metricNoSignal: document.getElementById('metricNoSignal'),
  metricPending: document.getElementById('metricPending'),
  fitFleetBtn: document.getElementById('fitFleetBtn'),
  fleetMap: document.getElementById('fleetMap'),
  fleetMapEmpty: document.getElementById('fleetMapEmpty'),
  liveMap: document.getElementById('liveMap'),
  liveMapEmpty: document.getElementById('liveMapEmpty'),
  liveMapEmptyTitle: document.getElementById('liveMapEmptyTitle'),
  liveMapEmptyMessage: document.getElementById('liveMapEmptyMessage'),
  liveVehiclePickerToggle: document.getElementById('liveVehiclePickerToggle'),
  liveVehiclePickerPanel: document.getElementById('liveVehiclePickerPanel'),
  livePickerClose: document.getElementById('livePickerClose'),
  liveVehicleOptions: document.getElementById('liveVehicleOptions'),
  liveSelectedCount: document.getElementById('liveSelectedCount'),
  liveSelectAll: document.getElementById('liveSelectAll'),
  liveClearSelection: document.getElementById('liveClearSelection'),
  fitLiveMapBtn: document.getElementById('fitLiveMapBtn'),
  fleetNowCount: document.getElementById('fleetNowCount'),
  dashboardSearch: document.getElementById('dashboardSearch'),
  fleetNowList: document.getElementById('fleetNowList'),
  historySearch: document.getElementById('historySearch'),
  historyFrom: document.getElementById('historyFrom'),
  historyTo: document.getElementById('historyTo'),
  historyFilters: document.getElementById('historyFilters'),
  clearHistoryFilters: document.getElementById('clearHistoryFilters'),
  historyTotals: document.getElementById('historyTotals'),
  historyRouteList: document.getElementById('historyRouteList'),
  statusTable: document.getElementById('statusTable'),
  devicesAdminWorkspace: document.getElementById('devicesAdminWorkspace'),
  deviceCreateForm: document.getElementById('deviceCreateForm'),
  deviceLicensePlateInput: document.getElementById('deviceLicensePlateInput'),
  deviceImeiInput: document.getElementById('deviceImeiInput'),
  deviceCreateButton: document.getElementById('deviceCreateButton'),
  vehicleCsvForm: document.getElementById('vehicleCsvForm'),
  vehicleCsvInput: document.getElementById('vehicleCsvInput'),
  vehicleCsvFileName: document.getElementById('vehicleCsvFileName'),
  vehicleCsvTemplate: document.getElementById('vehicleCsvTemplate'),
  vehicleCsvImportButton: document.getElementById('vehicleCsvImportButton'),
  deviceAdminSearch: document.getElementById('deviceAdminSearch'),
  adminFeedback: document.getElementById('adminFeedback'),
  deviceAdminSummary: document.getElementById('deviceAdminSummary'),
  deviceAdminList: document.getElementById('deviceAdminList'),
  tipLocationDialog: document.getElementById('tipLocationDialog'),
  tipLocationDialogTitle: document.getElementById('tipLocationDialogTitle'),
  tipLocationDialogMeta: document.getElementById('tipLocationDialogMeta'),
  tipLocationMap: document.getElementById('tipLocationMap'),
  tipLocationDialogClose: document.getElementById('tipLocationDialogClose')
};

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function deviceLicensePlate(device) {
  return String(device?.licensePlate || '').trim().toUpperCase() || 'Sin matrícula';
}

function activeFleet() {
  return state.fleet.filter((device) => device.authorizationStatus === 'approved');
}

function deviceIsMoving(device) {
  const position = device?.latestPosition;
  return Boolean(position && position.movement === true);
}

function liveActivityPresentation(device) {
  if (device.connectionStatus !== 'online') {
    return { label: 'Sin enlace', className: 'is-offline' };
  }
  if (deviceIsMoving(device)) {
    return { label: 'En movimiento', className: 'is-moving' };
  }
  return { label: 'Detenido', className: 'is-stopped' };
}

function normalizeLicensePlate(value) {
  return String(value || '').trim().toUpperCase().replace(/\s+/g, ' ');
}

function normalizeCsvHeader(value) {
  return String(value || '')
    .replace(/^\uFEFF/, '')
    .trim()
    .toLocaleLowerCase('es')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function detectCsvDelimiter(text) {
  let inQuotes = false;
  let commas = 0;
  let semicolons = 0;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"') {
      if (inQuotes && text[index + 1] === '"') index += 1;
      else inQuotes = !inQuotes;
    } else if (!inQuotes && (character === '\n' || character === '\r')) {
      break;
    } else if (!inQuotes && character === ',') commas += 1;
    else if (!inQuotes && character === ';') semicolons += 1;
  }
  return semicolons > commas ? ';' : ',';
}

function parseCsvTable(text) {
  const source = String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const delimiter = detectCsvDelimiter(source);
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  let lineNumber = 1;
  let rowLineNumber = 1;

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (character === '"') {
      if (inQuotes && source[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (inQuotes) {
        inQuotes = false;
      } else if (!field) {
        inQuotes = true;
      } else {
        field += character;
      }
      continue;
    }

    if (character === '\n') {
      lineNumber += 1;
      if (inQuotes) {
        field += '\n';
      } else {
        row.push(field);
        if (row.some((value) => String(value).trim())) rows.push({ fields: row, rowNumber: rowLineNumber });
        row = [];
        field = '';
        rowLineNumber = lineNumber;
      }
      continue;
    }

    if (character === delimiter && !inQuotes) {
      row.push(field);
      field = '';
    } else {
      field += character;
    }
  }

  if (inQuotes) throw new Error('El CSV contiene una comilla sin cerrar.');
  row.push(field);
  if (row.some((value) => String(value).trim())) rows.push({ fields: row, rowNumber: rowLineNumber });
  return rows;
}

function parseVehicleCsv(text) {
  const rows = parseCsvTable(text);
  if (rows.length < 2) {
    throw new Error('El CSV debe incluir una cabecera y al menos un vehículo.');
  }

  const headers = rows[0].fields.map(normalizeCsvHeader);
  const findHeader = (aliases) => headers.findIndex((header) => aliases.includes(header));
  const indexes = {
    imei: findHeader(['imei']),
    licensePlate: findHeader(['matricula', 'licenseplate', 'plate'])
  };
  if (Object.values(indexes).some((index) => index < 0)) {
    throw new Error('La cabecera debe contener las columnas imei y matricula.');
  }

  const dataRows = rows.slice(1);
  if (dataRows.length > 250) throw new Error('Cada CSV puede contener como máximo 250 vehículos.');

  const vehicles = [];
  const errors = [];
  const seenImeis = new Set();
  dataRows.forEach(({ fields, rowNumber }) => {
    const imei = String(fields[indexes.imei] || '').trim();
    const licensePlate = normalizeLicensePlate(fields[indexes.licensePlate]);
    let error = '';

    if (!/^\d{15}$/.test(imei)) error = 'el IMEI debe conservar exactamente 15 dígitos';
    else if (!licensePlate || !/^[A-Z0-9 -]{1,20}$/.test(licensePlate)) error = 'la matrícula no es válida';
    else if (seenImeis.has(imei)) error = 'el IMEI está repetido en el archivo';

    if (error) {
      errors.push({ rowNumber, imei, error });
      return;
    }
    seenImeis.add(imei);
    vehicles.push({ rowNumber, imei, licensePlate });
  });

  return { vehicles, errors };
}

function summarizeImportErrors(errors, maximum = 4) {
  if (!errors.length) return '';
  const visible = errors.slice(0, maximum).map((item) => `fila ${item.rowNumber}: ${item.error}`).join('; ');
  const remaining = errors.length - maximum;
  return `${visible}${remaining > 0 ? `; y ${remaining} más` : ''}.`;
}

function matchesDeviceQuery(device, query) {
  return deviceLicensePlate(device).toLocaleLowerCase('es').includes(query);
}

function formatDateTime(value, empty = 'Sin datos') {
  if (!value) return empty;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return empty;
  return date.toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' });
}

function formatLongDate(value) {
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  }).format(date);
}

function formatTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
}

function formatRelative(value) {
  if (!value) return 'Nunca';
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return 'Sin datos';
  const deltaSeconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000));
  if (deltaSeconds < 60) return 'Ahora';
  if (deltaSeconds < 3600) return `Hace ${Math.floor(deltaSeconds / 60)} min`;
  if (deltaSeconds < 86400) return `Hace ${Math.floor(deltaSeconds / 3600)} h`;
  return `Hace ${Math.floor(deltaSeconds / 86400)} d`;
}

function formatDistance(meters) {
  const value = Number(meters || 0);
  if (value < 1000) return `${Math.round(value)} m`;
  return `${(value / 1000).toLocaleString('es-ES', { maximumFractionDigits: 1 })} km`;
}

function formatDuration(seconds) {
  const total = Math.max(0, Number(seconds || 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  if (hours) return `${hours} h ${minutes} min`;
  return `${minutes} min`;
}

function connectionPresentation(status) {
  return CONNECTION_META[status] || CONNECTION_META.offline;
}

function approvalPresentation(status) {
  return APPROVAL_META[status] || APPROVAL_META.disabled;
}

function statusBadge(presentation) {
  return `<span class="state-badge ${presentation.className}">${escapeHtml(presentation.label)}</span>`;
}

function localDayKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function setApiStatus(status, label) {
  elements.apiStatus.className = `api-status ${status ? `is-${status}` : ''}`.trim();
  elements.apiStatus.querySelector('span').textContent = label;
}

function setSyncing(active, title = 'Actualizando la flota', message = 'Guardando los cambios y sincronizando todos los datos.') {
  state.syncing = active;
  elements.syncTitle.textContent = title;
  elements.syncMessage.textContent = message;
  elements.syncOverlay.hidden = !active;
  elements.appShell.setAttribute('aria-busy', String(active));
  elements.body.classList.toggle('is-syncing', active);
}

function stopRefreshTimer() {
  if (state.refreshTimer) window.clearInterval(state.refreshTimer);
  state.refreshTimer = null;
  state.refreshTick = 0;
}

function showLogin(message = '') {
  stopRefreshTimer();
  state.authenticated = false;
  state.sessionUser = '';
  window.apiClient.setCsrfToken('');
  setSyncing(false);
  elements.appShell.hidden = true;
  elements.loginGate.hidden = false;
  elements.loginFeedback.textContent = message;
  elements.loginPassword.value = '';
  setLivePickerOpen(false);
  closeTipLocationDialog();
  window.setTimeout(() => elements.loginPassword.focus(), 0);
}

function startRefreshTimer() {
  stopRefreshTimer();
  state.refreshTimer = window.setInterval(async () => {
    if (!state.syncing && !state.refreshing && state.authenticated) {
      state.refreshTick += 1;
      const shouldRefresh = state.view === 'mapa' || state.refreshTick % 3 === 0;
      if (!shouldRefresh) return;
      state.refreshing = true;
      try {
        await Promise.all([
          refreshPublicData({ silent: true }),
          state.view === 'vehiculos' ? loadAdminTrackers({ silent: true }) : Promise.resolve()
        ]);
      } finally {
        state.refreshing = false;
      }
    }
  }, 5000);
}

async function enterAuthenticatedApp(session) {
  state.authenticated = true;
  state.sessionUser = session.username || 'admin';
  window.apiClient.setCsrfToken(session.csrfToken || '');
  elements.sessionUsername.textContent = state.sessionUser;
  elements.loginGate.hidden = true;
  elements.appShell.hidden = false;
  setView(state.view);
  await refreshPublicData();
  startRefreshTimer();
}

async function checkSession() {
  try {
    const session = await requestJson('/auth/session', { notifyUnauthorized: false });
    if (!session.authenticated) {
      showLogin();
      return;
    }
    await enterAuthenticatedApp(session);
  } catch (error) {
    showLogin(error.status === 401 ? '' : 'No se ha podido comprobar la sesión. Vuelve a intentarlo.');
  }
}

async function login(event) {
  event.preventDefault();
  if (elements.loginSubmit.disabled) return;

  elements.loginSubmit.disabled = true;
  elements.loginSubmit.querySelector('span').textContent = 'Comprobando acceso…';
  elements.loginFeedback.textContent = '';
  try {
    const session = await requestJson('/auth/login', {
      method: 'POST',
      notifyUnauthorized: false,
      body: JSON.stringify({
        username: elements.loginUsername.value.trim(),
        password: elements.loginPassword.value
      })
    });
    elements.loginPassword.value = '';
    await enterAuthenticatedApp(session);
  } catch (error) {
    elements.loginFeedback.textContent = error.message;
    elements.loginPassword.select();
  } finally {
    elements.loginSubmit.disabled = false;
    elements.loginSubmit.querySelector('span').textContent = 'Entrar en Budisa';
  }
}

async function logout() {
  if (elements.logoutButton.disabled) return;
  elements.logoutButton.disabled = true;
  try {
    await requestJson('/auth/logout', { method: 'POST', body: '{}' });
  } catch (error) {
    if (error.status !== 401) console.error(error);
  } finally {
    elements.logoutButton.disabled = false;
    showLogin('Sesión cerrada correctamente.');
  }
}

function applyTheme() {
  elements.body.dataset.theme = state.theme;
  elements.themeToggle.checked = state.theme === 'night';
  localStorage.setItem(STORAGE_KEYS.theme, state.theme);
}

function setView(view) {
  const next = VIEW_META[view] ? view : 'dashboard';
  state.view = next;
  localStorage.setItem(STORAGE_KEYS.view, next);
  elements.views.forEach((element) => element.classList.toggle('view-active', element.dataset.view === next));
  elements.views.forEach((element) => {
    const isHidden = element.dataset.view !== next;
    element.hidden = isHidden;
    element.setAttribute('aria-hidden', String(isHidden));
  });
  elements.navButtons.forEach((button) => button.classList.toggle('active', button.dataset.view === next));
  elements.pageTitle.textContent = VIEW_META[next].title;
  elements.pageSubtitle.textContent = VIEW_META[next].subtitle;
  if (next !== 'mapa') setLivePickerOpen(false);

  if (next === 'dashboard') {
    setTimeout(() => {
      ensureFleetMap();
      state.fleetMap?.invalidateSize();
      renderFleetMap();
    }, 0);
  }
  if (next === 'mapa') {
    setTimeout(() => {
      ensureLiveMap();
      state.liveMap?.invalidateSize();
      renderLiveMap();
    }, 0);
  }
  if (next === 'historico' && !state.historyLoaded) {
    loadHistoryData();
  }
  if (next === 'vehiculos' && !state.adminTrackers.length) {
    loadAdminTrackers();
  }
}

function renderMetrics() {
  const active = activeFleet();
  const activeImeis = new Set(active.map((device) => device.imei));
  const online = active.filter((device) => device.connectionStatus === 'online');
  const withFix = active.filter((device) => device.gpsFix);
  const moving = active.filter((device) => device.connectionStatus === 'online' && deviceIsMoving(device));
  const stopped = active.filter((device) => device.connectionStatus === 'online' && device.latestPosition && !deviceIsMoving(device));
  const noSignal = active.filter((device) => device.connectionStatus !== 'online');
  const pending = state.fleet.filter((device) => device.authorizationStatus === 'pending');
  const distanceToday = state.todayDays
    .filter((day) => activeImeis.has(day.imei))
    .reduce((sum, day) => sum + Number(day.distanceMeters || 0), 0);

  elements.metricDevices.textContent = String(active.length);
  elements.metricOnline.textContent = String(online.length);
  elements.metricFix.textContent = String(withFix.length);
  elements.metricDistance.textContent = formatDistance(distanceToday);
  elements.metricMoving.textContent = String(moving.length);
  elements.metricStopped.textContent = String(stopped.length);
  elements.metricNoSignal.textContent = String(noSignal.length);
  elements.metricPending.textContent = String(pending.length);
}

function filteredDashboardFleet() {
  const query = elements.dashboardSearch.value.trim().toLocaleLowerCase('es');
  if (!query) return state.fleet;
  return state.fleet.filter((device) => matchesDeviceQuery(device, query));
}

function renderFleetList() {
  const devices = filteredDashboardFleet();
  elements.fleetNowCount.textContent = `${devices.length} ${devices.length === 1 ? 'vehículo' : 'vehículos'}`;

  if (!devices.length) {
    elements.fleetNowList.innerHTML = `
      <div class="empty-state"><strong>No hay coincidencias</strong><p>Prueba con otra matrícula.</p></div>
    `;
    return;
  }

  elements.fleetNowList.innerHTML = devices.map((device) => {
    const connection = connectionPresentation(device.connectionStatus);
    const hasPosition = Boolean(device.latestPosition);
    const mapAction = hasPosition ? 'Ver en mapa' : 'Sin posición';
    return `
      <button class="fleet-vehicle-row${state.selectedImei === device.imei ? ' is-selected' : ''}" type="button" data-select-imei="${escapeHtml(device.imei)}" aria-pressed="${state.selectedImei === device.imei}" aria-label="${escapeHtml(`${deviceLicensePlate(device)} · ${connection.label} · ${mapAction}`)}">
        <span class="vehicle-row-title"><strong>${escapeHtml(deviceLicensePlate(device))}</strong></span>
        <span class="vehicle-row-map-action${hasPosition ? '' : ' is-unavailable'}">${mapAction}${hasPosition ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 7 7-7 7-1.4-1.4 5.6-5.6-5.6-5.6L9 5Z"/></svg>' : ''}</span>
        <span class="vehicle-row-meta">${statusBadge(connection)}<span>${device.gpsFix ? 'Fix GPS' : 'Sin fix GPS'}</span><span>${formatRelative(device.lastSeenAt)}</span></span>
      </button>
    `;
  }).join('');
}

function ensureFleetMap() {
  if (state.fleetMap || !window.L) return;
  state.fleetMap = L.map(elements.fleetMap, { zoomControl: true }).setView([40.2, -3.7], 6);
  state.fleetTileLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    className: 'budisa-map-tiles',
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
  }).addTo(state.fleetMap);
  L.control.scale({ imperial: false, position: 'bottomleft' }).addTo(state.fleetMap);
}

function vehicleMarkerIcon(device) {
  const online = device.connectionStatus === 'online' ? ' is-online' : '';
  return L.divIcon({
    className: '',
    iconSize: [34, 34],
    iconAnchor: [17, 17],
    html: `<span class="fleet-map-marker${online}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6.5h11.5v9H3v-9Zm12.8 3H19l2 2.4v3.6h-1.2a2.6 2.6 0 0 0-5.1 0h-1V8.2h2.1v1.3ZM8 18.7a2.2 2.2 0 1 1 0-4.4 2.2 2.2 0 0 1 0 4.4Zm9.3 0a2.2 2.2 0 1 1 0-4.4 2.2 2.2 0 0 1 0 4.4Z"/></svg></span>`
  });
}

function fleetBounds() {
  const positions = activeFleet()
    .map((device) => device.latestPosition)
    .filter(Boolean)
    .map((position) => [position.latitude, position.longitude]);
  return positions.length ? L.latLngBounds(positions) : null;
}

function fitFleetMap() {
  ensureFleetMap();
  const bounds = fleetBounds();
  if (!bounds || !state.fleetMap) return;
  if (bounds.getNorthEast().equals(bounds.getSouthWest())) {
    state.fleetMap.setView(bounds.getCenter(), 15);
  } else {
    state.fleetMap.fitBounds(bounds, { padding: [46, 46], maxZoom: 16 });
  }
  state.mapHasFit = true;
}

function renderFleetMap() {
  ensureFleetMap();
  if (!state.fleetMap) return;
  state.fleetMarkers.forEach((marker) => marker.remove());
  state.fleetMarkers.clear();

  const devicesWithPosition = activeFleet().filter((device) => device.latestPosition);
  elements.fleetMapEmpty.hidden = devicesWithPosition.length > 0;

  devicesWithPosition.forEach((device) => {
    const position = device.latestPosition;
    const marker = L.marker([position.latitude, position.longitude], { icon: vehicleMarkerIcon(device) })
      .addTo(state.fleetMap)
      .bindPopup(`<strong class="map-popup-title">${escapeHtml(deviceLicensePlate(device))}</strong><span class="map-popup-imei">${escapeHtml(formatRelative(device.lastSeenAt))}</span>`);
    marker.on('click', () => selectDevice(device.imei, { focusMap: false }));
    state.fleetMarkers.set(device.imei, marker);
  });

  if (!state.mapHasFit && devicesWithPosition.length) fitFleetMap();
}

function selectDevice(imei, { focusMap = true } = {}) {
  state.selectedImei = imei;
  localStorage.setItem(STORAGE_KEYS.selectedImei, imei);
  renderFleetList();
  const marker = state.fleetMarkers.get(imei);
  if (focusMap && marker && state.fleetMap) {
    state.fleetMap.setView(marker.getLatLng(), Math.max(state.fleetMap.getZoom(), 14));
    marker.openPopup();
  }
}

function persistLiveSelection() {
  localStorage.setItem(STORAGE_KEYS.liveSelection, JSON.stringify(Array.from(state.liveSelectedImeis)));
}

function syncLiveSelection() {
  const activeImeis = new Set(activeFleet().map((device) => device.imei));
  let changed = false;

  if (!state.liveSelectionHydrated && activeImeis.size) {
    state.liveSelectedImeis = new Set(activeImeis);
    state.liveSelectionHydrated = true;
    changed = true;
  } else {
    Array.from(state.liveSelectedImeis).forEach((imei) => {
      if (!activeImeis.has(imei)) {
        state.liveSelectedImeis.delete(imei);
        changed = true;
      }
    });
  }

  if (changed) persistLiveSelection();
}

function setLivePickerOpen(open) {
  elements.liveVehiclePickerPanel.hidden = !open;
  elements.liveVehiclePickerToggle.setAttribute('aria-expanded', String(open));
}

function renderLiveVehicleOptions() {
  syncLiveSelection();
  const devices = activeFleet()
    .slice()
    .sort((left, right) => deviceLicensePlate(left).localeCompare(deviceLicensePlate(right), 'es'));
  const count = state.liveSelectedImeis.size;
  elements.liveSelectedCount.textContent = `${count} ${count === 1 ? 'seleccionado' : 'seleccionados'}`;
  elements.liveSelectAll.disabled = !devices.length || count === devices.length;
  elements.liveClearSelection.disabled = count === 0;
  elements.fitLiveMapBtn.disabled = !devices.some((device) => state.liveSelectedImeis.has(device.imei) && device.latestPosition);

  if (!devices.length) {
    elements.liveVehicleOptions.innerHTML = '<div class="live-options-empty">Todavía no hay vehículos activos.</div>';
    return;
  }

  elements.liveVehicleOptions.innerHTML = devices.map((device) => {
    const activity = liveActivityPresentation(device);
    const checked = state.liveSelectedImeis.has(device.imei);
    return `
      <label class="live-vehicle-option${checked ? ' is-selected' : ''}">
        <input type="checkbox" value="${escapeHtml(device.imei)}" ${checked ? 'checked' : ''} />
        <span class="live-option-check" aria-hidden="true"><svg viewBox="0 0 16 16"><path d="m3.2 8.1 3 3.1 6.6-6.6"/></svg></span>
        <span class="live-option-copy"><strong>${escapeHtml(deviceLicensePlate(device))}</strong><small>${escapeHtml(activity.label)}</small></span>
        <i class="live-option-status ${activity.className}" aria-hidden="true"></i>
      </label>
    `;
  }).join('');
}

function ensureLiveMap() {
  if (state.liveMap || !window.L) return;
  state.liveMap = L.map(elements.liveMap, { zoomControl: true }).setView([40.2, -3.7], 6);
  state.liveTileLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    className: 'budisa-map-tiles',
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
  }).addTo(state.liveMap);
  L.control.scale({ imperial: false, position: 'bottomleft' }).addTo(state.liveMap);
}

function liveMarkerIcon(device) {
  const activity = liveActivityPresentation(device);
  const heading = Number(device.latestPosition?.heading || 0);
  return L.divIcon({
    className: '',
    iconSize: [42, 42],
    iconAnchor: [21, 21],
    html: `<span class="live-map-marker ${activity.className}" style="--vehicle-heading:${heading}deg"><i></i><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6.5h11.5v9H3v-9Zm12.8 3H19l2 2.4v3.6h-1.2a2.6 2.6 0 0 0-5.1 0h-1V8.2h2.1v1.3ZM8 18.7a2.2 2.2 0 1 1 0-4.4 2.2 2.2 0 0 1 0 4.4Zm9.3 0a2.2 2.2 0 1 1 0-4.4 2.2 2.2 0 0 1 0 4.4Z"/></svg></span>`
  });
}

function rememberLivePosition(device) {
  const position = device.latestPosition;
  if (!position) return;
  const latitude = Number(position.latitude);
  const longitude = Number(position.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;

  const trail = state.liveTrails.get(device.imei) || [];
  const previous = trail[trail.length - 1];
  if (!previous || previous[0] !== latitude || previous[1] !== longitude) {
    trail.push([latitude, longitude]);
    if (trail.length > 160) trail.splice(0, trail.length - 160);
    state.liveTrails.set(device.imei, trail);
  }
}

function selectedLiveDevices() {
  return activeFleet().filter((device) => state.liveSelectedImeis.has(device.imei));
}

function liveMapBounds() {
  const positions = selectedLiveDevices()
    .map((device) => device.latestPosition)
    .filter(Boolean)
    .map((position) => [position.latitude, position.longitude]);
  return positions.length ? L.latLngBounds(positions) : null;
}

function fitLiveMap() {
  ensureLiveMap();
  const bounds = liveMapBounds();
  if (!bounds || !state.liveMap) return;
  if (bounds.getNorthEast().equals(bounds.getSouthWest())) {
    state.liveMap.setView(bounds.getCenter(), 15);
  } else {
    state.liveMap.fitBounds(bounds, { padding: [70, 70], maxZoom: 16 });
  }
  state.liveMapHasFit = true;
}

function renderLiveMapEmpty(selectedDevices, devicesWithPosition) {
  if (!activeFleet().length) {
    elements.liveMapEmptyTitle.textContent = 'No hay vehículos activos';
    elements.liveMapEmptyMessage.textContent = 'Aprueba un vehículo cuando el receptor detecte su IMEI para poder seguirlo aquí.';
    elements.liveMapEmpty.hidden = false;
    return;
  }
  if (!selectedDevices.length) {
    elements.liveMapEmptyTitle.textContent = 'Elige qué vehículos quieres seguir';
    elements.liveMapEmptyMessage.textContent = 'Puedes mostrar uno, varios o toda la flota activa desde el selector.';
    elements.liveMapEmpty.hidden = false;
    return;
  }
  if (!devicesWithPosition.length) {
    elements.liveMapEmptyTitle.textContent = 'Esperando la primera posición';
    elements.liveMapEmptyMessage.textContent = 'Los vehículos elegidos aparecerán en cuanto envíen un punto GPS válido.';
    elements.liveMapEmpty.hidden = false;
    return;
  }
  elements.liveMapEmpty.hidden = true;
}

function renderLiveMap() {
  ensureLiveMap();
  if (!state.liveMap) return;

  state.liveMarkers.forEach((marker) => marker.remove());
  state.liveMarkers.clear();
  state.liveTrailLayers.forEach((layer) => layer.remove());
  state.liveTrailLayers = [];

  const selectedDevices = selectedLiveDevices();
  const devicesWithPosition = selectedDevices.filter((device) => device.latestPosition);
  renderLiveMapEmpty(selectedDevices, devicesWithPosition);

  devicesWithPosition.forEach((device) => {
    rememberLivePosition(device);
    const trail = state.liveTrails.get(device.imei) || [];
    if (trail.length > 1) {
      const casing = L.polyline(trail, { color: '#07111c', weight: 7, opacity: 0.5, interactive: false }).addTo(state.liveMap);
      const route = L.polyline(trail, { color: '#2dd4bf', weight: 3, opacity: 0.92, interactive: false }).addTo(state.liveMap);
      state.liveTrailLayers.push(casing, route);
    }

    const position = device.latestPosition;
    const activity = liveActivityPresentation(device);
    const marker = L.marker([position.latitude, position.longitude], {
      icon: liveMarkerIcon(device),
      zIndexOffset: activity.className === 'is-moving' ? 200 : 100
    })
      .addTo(state.liveMap)
      .bindPopup(`<strong class="map-popup-title">${escapeHtml(deviceLicensePlate(device))}</strong><span class="live-popup-status ${activity.className}">${escapeHtml(activity.label)}</span>`);
    state.liveMarkers.set(device.imei, marker);
  });

  if (!state.liveMapHasFit && devicesWithPosition.length) {
    fitLiveMap();
  } else if (devicesWithPosition.length === 1) {
    const position = devicesWithPosition[0].latestPosition;
    state.liveMap.panInside([position.latitude, position.longitude], { padding: [80, 80] });
  }
}

function updateLiveSelection(imeis) {
  const activeImeis = new Set(activeFleet().map((device) => device.imei));
  state.liveSelectedImeis = new Set(Array.from(imeis).filter((imei) => activeImeis.has(imei)));
  state.liveSelectionHydrated = true;
  state.liveMapHasFit = false;
  persistLiveSelection();
  renderLiveVehicleOptions();
  renderLiveMap();
}

function filteredDays() {
  const query = elements.historySearch.value.trim().toLocaleLowerCase('es');
  const from = elements.historyFrom.value;
  const to = elements.historyTo.value;
  return state.days.filter((day) => {
    const licensePlate = day.licensePlate || state.fleet.find((device) => device.imei === day.imei)?.licensePlate || '';
    if (query && !licensePlate.toLocaleLowerCase('es').includes(query)) return false;
    if (from && day.date < from) return false;
    if (to && day.date > to) return false;
    return true;
  });
}

function renderHistory() {
  if (state.historyLoading) {
    elements.historyRouteList.innerHTML = `<div class="empty-state"><strong>Cargando jornadas…</strong><p>Consultando únicamente la actividad del intervalo seleccionado.</p></div>`;
    return;
  }
  if (state.historyError) {
    elements.historyRouteList.innerHTML = `<div class="empty-state"><strong>No se ha podido cargar el histórico</strong><p>${escapeHtml(state.historyError)}</p></div>`;
    return;
  }

  const days = filteredDays();
  const totalMovementSeconds = days.reduce((sum, day) => sum + Number(day.movementSeconds || 0), 0);
  const totalTipEvents = days.reduce((sum, day) => sum + (day.tipEvents?.length || 0), 0);
  elements.historyTotals.innerHTML = `
    <span><strong>${days.length}</strong> ${days.length === 1 ? 'jornada' : 'jornadas'}</span>
    <span><strong>${formatDuration(totalMovementSeconds)}</strong> en movimiento</span>
    <span><strong>${totalTipEvents}</strong> ${totalTipEvents === 1 ? 'basculación' : 'basculaciones'}</span>
  `;

  if (!days.length) {
    elements.historyRouteList.innerHTML = `<div class="empty-state"><strong>No hay jornadas para estos filtros</strong><p>Cuando lleguen posiciones GPS, Budisa agrupará automáticamente la actividad por vehículo y día.</p></div>`;
    return;
  }

  elements.historyRouteList.innerHTML = days.map((day) => {
    const licensePlate = day.licensePlate || state.fleet.find((device) => device.imei === day.imei)?.licensePlate || '';
    const tipEvents = Array.isArray(day.tipEvents) ? day.tipEvents : [];
    const folderKey = `${day.imei}|${day.date}`;
    const tipEventsContent = tipEvents.length
      ? `<details class="tip-events-folder" data-tip-folder-key="${escapeHtml(folderKey)}"${state.openTipFolders.has(folderKey) ? ' open' : ''}>
          <summary><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 5.5h7l2 2H21v11H3v-13Zm2 4v7h14v-7H5Z"/></svg><span>${tipEvents.length} ${tipEvents.length === 1 ? 'basculación' : 'basculaciones'}</span></summary>
          <div class="tip-events-list">${tipEvents.map((event, index) => `
            <button type="button" data-open-tip data-tip-latitude="${escapeHtml(event.latitude)}" data-tip-longitude="${escapeHtml(event.longitude)}" data-tip-timestamp="${escapeHtml(event.timestamp)}" data-tip-plate="${escapeHtml(licensePlate || 'Sin matrícula')}">
              <time datetime="${escapeHtml(event.timestamp)}">${escapeHtml(formatTime(event.timestamp))}</time>
              <span>${Number(event.latitude).toFixed(5)}, ${Number(event.longitude).toFixed(5)}</span>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a7 7 0 0 0-7 7c0 5.3 7 13 7 13s7-7.7 7-13a7 7 0 0 0-7-7Zm0 10.2A3.2 3.2 0 1 1 12 5.8a3.2 3.2 0 0 1 0 6.4Z"/></svg>
            </button>`).join('')}</div>
        </details>`
      : '<span class="tip-events-empty">Sin basculaciones</span>';
    return `
      <article class="route-ledger-row">
        <div class="route-vehicle" data-label="Vehículo"><strong>${escapeHtml(licensePlate || 'Sin matrícula')}</strong></div>
        <time data-label="Fecha" datetime="${escapeHtml(day.date)}">${escapeHtml(formatLongDate(day.date))}</time>
        <strong class="movement-duration" data-label="Tiempo en movimiento">${escapeHtml(formatDuration(day.movementSeconds))}</strong>
        <div class="tip-events-cell" data-label="Basculaciones">${tipEventsContent}</div>
      </article>
    `;
  }).join('');
}

function setDefaultHistoryRange() {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 29);
  elements.historyFrom.value = localDayKey(from);
  elements.historyTo.value = localDayKey(to);
}

async function loadHistoryData({ force = false } = {}) {
  if (state.historyLoading || (state.historyLoaded && !force)) return;
  state.historyLoading = true;
  state.historyError = '';
  renderHistory();
  const query = new URLSearchParams({ limit: '1000' });
  if (elements.historyFrom.value) query.set('from', elements.historyFrom.value);
  if (elements.historyTo.value) query.set('to', elements.historyTo.value);

  try {
    const days = await requestJson(`/api/tracker/days?${query.toString()}`);
    state.days = days || [];
    state.daysFingerprint = state.days.map((day) => `${day.imei}:${day.date}:${day.movementSeconds}:${day.tipEvents?.length || 0}:${day.endAt}`).join('|');
    state.historyLoaded = true;
  } catch (error) {
    state.historyError = error.message;
  } finally {
    state.historyLoading = false;
    renderHistory();
  }
}

function renderStatus() {
  if (!state.fleet.length) {
    elements.statusTable.innerHTML = `<div class="empty-state"><strong>No hay vehículos registrados</strong><p>Añade el primer IMEI desde la pestaña Vehículos.</p></div>`;
    return;
  }

  const connectionOrder = { online: 0, stale: 1, waiting: 2, offline: 3, pending: 4, disabled: 5 };
  const devices = state.fleet.slice().sort((left, right) => (
    (connectionOrder[left.connectionStatus] ?? 9) - (connectionOrder[right.connectionStatus] ?? 9)
    || deviceLicensePlate(left).localeCompare(deviceLicensePlate(right), 'es')
  ));

  elements.statusTable.innerHTML = `
    <div class="status-table-head" aria-hidden="true"><span>Vehículo</span><span>Modelo</span><span>Autorización</span><span>Conexión</span><span>GPS</span><span>Último dato</span></div>
    ${devices.map((device) => {
      const approval = approvalPresentation(device.authorizationStatus);
      const connection = connectionPresentation(device.connectionStatus);
      const fix = device.gpsFix
        ? { label: 'Fix GPS', className: 'is-fix' }
        : { label: 'Sin fix', className: 'is-no-fix' };
      return `
        <article class="status-device-row">
          <div class="status-device-identity" data-label="Vehículo"><strong>${escapeHtml(deviceLicensePlate(device))}</strong><span>IMEI ${escapeHtml(device.imei)}</span></div>
          <span class="status-device-model" data-label="Modelo">${escapeHtml([device.manufacturer, device.model].filter(Boolean).join(' ') || 'Sin identificar')}</span>
          <div data-label="Autorización">${statusBadge(approval)}</div>
          <div data-label="Conexión">${statusBadge(connection)}</div>
          <div data-label="GPS">${statusBadge(fix)}</div>
          <time class="status-last-seen" data-label="Último dato">${escapeHtml(formatDateTime(device.lastSeenAt))}</time>
        </article>
      `;
    }).join('')}
  `;
}

function renderPublicViews() {
  if (!state.selectedImei || !state.fleet.some((device) => device.imei === state.selectedImei)) {
    state.selectedImei = state.fleet.find((device) => device.authorizationStatus === 'approved')?.imei || state.fleet[0]?.imei || '';
  }
  renderMetrics();
  renderFleetList();
  renderLiveVehicleOptions();
  renderHistory();
  renderStatus();
  if (state.view === 'dashboard') renderFleetMap();
  if (state.view === 'mapa') renderLiveMap();
}

function setAdminFeedback(message = '', type = '') {
  elements.adminFeedback.textContent = message;
  elements.adminFeedback.classList.toggle('is-success', type === 'success');
  elements.adminFeedback.classList.toggle('is-error', type === 'error');
  elements.adminFeedback.classList.toggle('is-warning', type === 'warning');
}

function renderAdminSummary() {
  const approved = state.adminTrackers.filter((tracker) => tracker.status === 'approved').length;
  const pending = state.adminTrackers.filter((tracker) => tracker.status === 'pending').length;
  elements.deviceAdminSummary.innerHTML = `<span><strong>${approved}</strong> activos</span><span><strong>${pending}</strong> pendientes</span>`;
}

function filteredAdminTrackers() {
  const query = elements.deviceAdminSearch.value.trim().toLocaleLowerCase('es');
  if (!query) return state.adminTrackers;
  return state.adminTrackers.filter((tracker) => matchesDeviceQuery(tracker, query));
}

function renderAdminDevices() {
  renderAdminSummary();
  if (state.adminLoading) {
    elements.deviceAdminList.innerHTML = `<div class="empty-state"><strong>Consultando vehículos…</strong><p>Sincronizando el registro guardado en MongoDB.</p></div>`;
    return;
  }

  const trackers = filteredAdminTrackers();
  if (!trackers.length) {
    elements.deviceAdminList.innerHTML = `<div class="empty-state"><strong>No hay vehículos para mostrar</strong><p>Añade un IMEI, importa un CSV o espera a que se conecte un localizador.</p></div>`;
    return;
  }

  elements.deviceAdminList.innerHTML = `
    <div class="device-admin-head" aria-hidden="true"><span>Matrícula</span><span>IMEI</span><span>Estado</span><span>Actividad</span><span>Acciones</span></div>
    ${trackers.map((tracker) => {
      const presentation = approvalPresentation(tracker.status);
      const busy = state.adminBusyImei === tracker.imei;
      const action = tracker.status === 'pending' ? 'approve' : tracker.status === 'approved' ? 'disable' : 'reactivate';
      const actionLabel = tracker.status === 'pending' ? 'Aprobar' : tracker.status === 'approved' ? 'Deshabilitar' : 'Reactivar';
      return `
        <article class="device-admin-row" data-status="${escapeHtml(tracker.status)}" data-device-row="${escapeHtml(tracker.imei)}">
          <div class="device-identity-editor" data-label="Matrícula"><label><span>Matrícula</span><input aria-label="Matrícula de ${escapeHtml(tracker.imei)}" data-license-plate-input="${escapeHtml(tracker.imei)}" maxlength="20" value="${escapeHtml(tracker.licensePlate || '')}" placeholder="1234 ABC" autocapitalize="characters" spellcheck="false" ${busy ? 'disabled' : ''} /></label><button class="row-action" type="button" data-device-action="save" data-imei="${escapeHtml(tracker.imei)}" ${busy ? 'disabled' : ''}>Guardar</button></div>
          <div class="device-imei" data-label="IMEI"><strong>${escapeHtml(tracker.imei)}</strong></div>
          <div data-label="Estado">${statusBadge(presentation)}</div>
          <div class="device-admin-date" data-label="Actividad">${tracker.lastSeenAt ? `Dato: ${escapeHtml(formatRelative(tracker.lastSeenAt))}` : tracker.lastAttemptAt ? `Intento: ${escapeHtml(formatRelative(tracker.lastAttemptAt))}` : 'Sin actividad'}</div>
          <div class="device-admin-actions" data-label="Acciones"><button class="row-action ${action === 'disable' ? 'is-danger' : 'is-primary'}" type="button" data-device-action="${action}" data-imei="${escapeHtml(tracker.imei)}" ${busy ? 'disabled' : ''}>${busy ? 'Guardando…' : actionLabel}</button></div>
        </article>
      `;
    }).join('')}
  `;
}

async function loadAdminTrackers({ silent = false } = {}) {
  if (state.adminLoading) return;
  state.adminLoading = true;
  if (!silent) setAdminFeedback('Consultando el registro…');
  renderAdminDevices();
  try {
    state.adminTrackers = await requestJson('/api/trackers');
    if (!silent) setAdminFeedback('Registro actualizado.', 'success');
  } catch (error) {
    setAdminFeedback(error.message, 'error');
  } finally {
    state.adminLoading = false;
    renderAdminDevices();
  }
}

async function refreshVehicleViews() {
  await Promise.all([
    loadAdminTrackers({ silent: true }),
    refreshPublicData({ silent: true }),
    state.historyLoaded ? loadHistoryData({ force: true }) : Promise.resolve()
  ]);
}

function updateCsvSelection() {
  const file = elements.vehicleCsvInput.files?.[0] || null;
  elements.vehicleCsvFileName.textContent = file ? file.name : 'Ningún archivo seleccionado';
  elements.vehicleCsvImportButton.disabled = !file || state.syncing;
}

function downloadVehicleCsvTemplate() {
  const blob = new Blob(['\uFEFFimei;matricula\r\n'], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'plantilla-vehiculos-budisa.csv';
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

async function importVehicleCsv(event) {
  event.preventDefault();
  const file = elements.vehicleCsvInput.files?.[0] || null;
  if (!file) {
    setAdminFeedback('Selecciona un archivo CSV antes de importar.', 'error');
    elements.vehicleCsvInput.focus();
    return;
  }
  if (file.size > 512 * 1024) {
    setAdminFeedback('El CSV supera 512 KB. Divídelo en archivos de hasta 250 vehículos.', 'error');
    return;
  }

  let parsed;
  try {
    parsed = parseVehicleCsv(await file.text());
  } catch (error) {
    setAdminFeedback(error.message, 'error');
    return;
  }

  if (!parsed.vehicles.length) {
    setAdminFeedback(`No hay filas válidas para importar. ${summarizeImportErrors(parsed.errors)}`, 'error');
    return;
  }

  elements.vehicleCsvImportButton.disabled = true;
  setSyncing(
    true,
    'Importando vehículos',
    `Validando y guardando ${parsed.vehicles.length} ${parsed.vehicles.length === 1 ? 'vehículo' : 'vehículos'} en Budisa.`
  );
  try {
    const result = await requestJson('/api/trackers/import', {
      method: 'POST',
      body: JSON.stringify({ vehicles: parsed.vehicles })
    });
    await refreshVehicleViews();
    const errors = [...parsed.errors, ...(result.errors || [])];
    const imported = Number(result.importedCount || 0);
    if (errors.length) {
      setAdminFeedback(
        `Importados ${imported} de ${parsed.vehicles.length + parsed.errors.length}. No se procesaron ${errors.length}: ${summarizeImportErrors(errors)}`,
        'warning'
      );
    } else {
      setAdminFeedback(`${imported} ${imported === 1 ? 'vehículo importado' : 'vehículos importados'} correctamente.`, 'success');
      elements.vehicleCsvForm.reset();
    }
  } catch (error) {
    setAdminFeedback(error.message, 'error');
  } finally {
    setSyncing(false);
    updateCsvSelection();
  }
}

async function createDevice(event) {
  event.preventDefault();
  const licensePlate = normalizeLicensePlate(elements.deviceLicensePlateInput.value);
  const imei = elements.deviceImeiInput.value.trim();
  if (!licensePlate || !/^[A-Z0-9 -]{1,20}$/.test(licensePlate)) {
    setAdminFeedback('Escribe una matrícula válida con letras, números, espacios o guiones.', 'error');
    elements.deviceLicensePlateInput.focus();
    return;
  }
  if (!/^\d{15}$/.test(imei)) {
    setAdminFeedback('El IMEI debe contener exactamente 15 dígitos.', 'error');
    elements.deviceImeiInput.focus();
    return;
  }

  state.adminBusyImei = imei;
  elements.deviceCreateButton.disabled = true;
  elements.deviceCreateButton.textContent = 'Añadiendo…';
  setAdminFeedback(`Añadiendo ${licensePlate}…`);
  setSyncing(true, 'Añadiendo vehículo', `Guardando ${licensePlate} y actualizando la flota.`);
  try {
    await requestJson('/api/trackers', { method: 'POST', body: JSON.stringify({ imei, licensePlate }) });
    elements.deviceCreateForm.reset();
    setAdminFeedback(`${licensePlate} añadido y habilitado.`, 'success');
    await refreshVehicleViews();
  } catch (error) {
    setAdminFeedback(error.message, 'error');
  } finally {
    state.adminBusyImei = '';
    elements.deviceCreateButton.disabled = false;
    elements.deviceCreateButton.textContent = 'Añadir vehículo';
    setSyncing(false);
    renderAdminDevices();
  }
}

function licensePlateInputFor(imei) {
  return elements.deviceAdminList.querySelector(`[data-license-plate-input="${CSS.escape(imei)}"]`);
}

async function handleDeviceAction(button) {
  const imei = button.dataset.imei;
  const action = button.dataset.deviceAction;
  const licensePlate = normalizeLicensePlate(licensePlateInputFor(imei)?.value);
  if (!imei || !action) return;
  if ((action === 'save' || action === 'approve' || action === 'reactivate')
    && (!licensePlate || !/^[A-Z0-9 -]{1,20}$/.test(licensePlate))) {
    setAdminFeedback('Asigna una matrícula válida antes de guardar o habilitar el vehículo.', 'error');
    licensePlateInputFor(imei)?.focus();
    return;
  }
  if (action === 'disable' && !window.confirm(`¿Deshabilitar ${licensePlate || imei}? Dejará de aceptar posiciones hasta que lo reactives.`)) return;

  const payload = action === 'save'
    ? { licensePlate }
    : action === 'disable'
      ? { enabled: false }
      : { enabled: true, licensePlate };
  state.adminBusyImei = imei;
  renderAdminDevices();
  setAdminFeedback(`${action === 'disable' ? 'Deshabilitando' : 'Guardando'} ${licensePlate || imei}…`);
  setSyncing(true, 'Actualizando vehículo', `Aplicando los cambios de ${licensePlate || imei} en toda la aplicación.`);
  try {
    await requestJson(`/api/trackers/${encodeURIComponent(imei)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload)
    });
    setAdminFeedback(`${licensePlate || imei} actualizado.`, 'success');
    await refreshVehicleViews();
  } catch (error) {
    setAdminFeedback(error.message, 'error');
  } finally {
    state.adminBusyImei = '';
    setSyncing(false);
    renderAdminDevices();
  }
}

function tipLocationIcon() {
  return L.divIcon({
    className: '',
    iconSize: [36, 36],
    iconAnchor: [18, 34],
    html: '<span class="tip-location-marker"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a7 7 0 0 0-7 7c0 5.3 7 13 7 13s7-7.7 7-13a7 7 0 0 0-7-7Zm0 10.2A3.2 3.2 0 1 1 12 5.8a3.2 3.2 0 0 1 0 6.4Z"/></svg></span>'
  });
}

function ensureTipLocationMap() {
  if (state.tipLocationMap || !window.L) return;
  state.tipLocationMap = L.map(elements.tipLocationMap).setView([40.2, -3.7], 6);
  state.tipLocationTileLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    className: 'budisa-map-tiles',
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
  }).addTo(state.tipLocationMap);
}

function openTipLocation(button) {
  const latitude = Number(button.dataset.tipLatitude);
  const longitude = Number(button.dataset.tipLongitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;
  const plate = button.dataset.tipPlate || 'Sin matrícula';
  const timestamp = button.dataset.tipTimestamp;
  elements.tipLocationDialogTitle.textContent = `${plate} · Basculación`;
  elements.tipLocationDialogMeta.textContent = `${formatDateTime(timestamp)} · ${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
  elements.tipLocationDialog.showModal();
  ensureTipLocationMap();
  state.tipLocationMap?.invalidateSize();
  state.tipLocationMarker?.remove();
  state.tipLocationMarker = L.marker([latitude, longitude], { icon: tipLocationIcon() }).addTo(state.tipLocationMap);
  state.tipLocationMap.setView([latitude, longitude], 17);
}

function closeTipLocationDialog() {
  if (elements.tipLocationDialog.open) elements.tipLocationDialog.close();
}

async function refreshPublicData({ silent = false } = {}) {
  if (!silent) setApiStatus('', 'Actualizando');
  try {
    const today = localDayKey();
    const [fleet, days, gateway] = await Promise.all([
      requestJson('/api/fleet'),
      requestJson(`/api/tracker/days?from=${encodeURIComponent(today)}&to=${encodeURIComponent(today)}&limit=1000`),
      requestJson('/api/tracker/status').catch(() => null)
    ]);
    state.fleet = fleet || [];
    state.todayDays = days || [];
    state.gateway = gateway;
    setApiStatus('online', 'Conectado');
    renderPublicViews();
  } catch (error) {
    console.error(error);
    if (error.status === 401) return;
    setApiStatus('error', 'Sin conexión');
  }
}

function setupListeners() {
  elements.navMenu.addEventListener('click', (event) => {
    const button = event.target.closest('.nav-item');
    if (button) setView(button.dataset.view);
  });
  elements.viewLinks.forEach((link) => link.addEventListener('click', (event) => {
    event.preventDefault();
    setView(link.dataset.viewLink);
  }));
  elements.themeToggle.addEventListener('change', () => {
    state.theme = elements.themeToggle.checked ? 'night' : 'day';
    applyTheme();
  });
  elements.fitFleetBtn.addEventListener('click', fitFleetMap);
  elements.dashboardSearch.addEventListener('input', renderFleetList);
  elements.fleetNowList.addEventListener('click', (event) => {
    const button = event.target.closest('[data-select-imei]');
    if (button) selectDevice(button.dataset.selectImei);
  });

  elements.liveVehiclePickerToggle.addEventListener('click', () => {
    setLivePickerOpen(elements.liveVehiclePickerPanel.hidden);
  });
  elements.livePickerClose.addEventListener('click', () => setLivePickerOpen(false));
  elements.liveSelectAll.addEventListener('click', () => {
    updateLiveSelection(new Set(activeFleet().map((device) => device.imei)));
  });
  elements.liveClearSelection.addEventListener('click', () => updateLiveSelection(new Set()));
  elements.liveVehicleOptions.addEventListener('change', (event) => {
    const input = event.target.closest('input[type="checkbox"]');
    if (!input) return;
    const next = new Set(state.liveSelectedImeis);
    if (input.checked) next.add(input.value);
    else next.delete(input.value);
    updateLiveSelection(next);
  });
  elements.fitLiveMapBtn.addEventListener('click', fitLiveMap);

  elements.historySearch.addEventListener('input', renderHistory);
  [elements.historyFrom, elements.historyTo].forEach((input) => input.addEventListener('change', () => {
    state.historyLoaded = false;
    loadHistoryData();
  }));
  elements.clearHistoryFilters.addEventListener('click', () => {
    elements.historySearch.value = '';
    setDefaultHistoryRange();
    state.historyLoaded = false;
    loadHistoryData();
  });
  elements.historyRouteList.addEventListener('click', (event) => {
    const button = event.target.closest('[data-open-tip]');
    if (button) openTipLocation(button);
  });
  elements.historyRouteList.addEventListener('toggle', (event) => {
    const folder = event.target.closest?.('.tip-events-folder');
    const folderKey = folder?.dataset.tipFolderKey;
    if (!folderKey) return;
    if (folder.open) state.openTipFolders.add(folderKey);
    else state.openTipFolders.delete(folderKey);
  }, true);

  elements.loginForm.addEventListener('submit', login);
  elements.logoutButton.addEventListener('click', logout);
  elements.vehicleCsvInput.addEventListener('change', updateCsvSelection);
  elements.vehicleCsvTemplate.addEventListener('click', downloadVehicleCsvTemplate);
  elements.vehicleCsvForm.addEventListener('submit', importVehicleCsv);
  elements.deviceCreateForm.addEventListener('submit', createDevice);
  elements.deviceAdminSearch.addEventListener('input', renderAdminDevices);
  elements.deviceAdminList.addEventListener('click', (event) => {
    const button = event.target.closest('[data-device-action]');
    if (button) handleDeviceAction(button);
  });

  elements.tipLocationDialogClose.addEventListener('click', closeTipLocationDialog);
  elements.tipLocationDialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    closeTipLocationDialog();
  });
  elements.tipLocationDialog.addEventListener('click', (event) => {
    if (event.target === elements.tipLocationDialog) closeTipLocationDialog();
  });

  window.addEventListener('resize', () => {
    if (state.view === 'dashboard') state.fleetMap?.invalidateSize();
    if (state.view === 'mapa') state.liveMap?.invalidateSize();
    if (elements.tipLocationDialog.open) state.tipLocationMap?.invalidateSize();
  });
  document.addEventListener('click', (event) => {
    if (!elements.liveVehiclePickerPanel.hidden && !event.target.closest('.live-map-controls')) {
      setLivePickerOpen(false);
    }
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !elements.liveVehiclePickerPanel.hidden) setLivePickerOpen(false);
  });
}

function boot() {
  applyTheme();
  setDefaultHistoryRange();
  renderAdminDevices();
  setupListeners();
  window.apiClient.setUnauthorizedHandler(() => showLogin('Tu sesión ha caducado. Vuelve a iniciar sesión.'));
  checkSession();
}

boot();
})();
