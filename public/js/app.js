(() => {
const STORAGE_KEYS = {
  theme: 'budisa-theme',
  view: 'budisa-view',
  selectedImei: 'budisa-selected-imei',
  adminToken: 'budisa-tracker-admin-token'
};

const VIEW_META = {
  dashboard: {
    title: 'Flota en directo',
    subtitle: 'Situación actual de todos los vehículos conectados.'
  },
  historico: {
    title: 'Histórico de rutas',
    subtitle: 'Jornadas completas, distancia y recorrido de cada vehículo.'
  },
  estado: {
    title: 'Estado de la flota',
    subtitle: 'Autorización, conexión y fix GPS sin ruido adicional.'
  },
  dispositivos: {
    title: 'Gestión de dispositivos',
    subtitle: 'Nombre y matrícula asociados de forma segura a cada IMEI.'
  }
};

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
  view: localStorage.getItem(STORAGE_KEYS.view) || 'dashboard',
  fleet: [],
  days: [],
  gateway: null,
  selectedImei: localStorage.getItem(STORAGE_KEYS.selectedImei) || '',
  fleetMap: null,
  fleetTileLayer: null,
  fleetMarkers: new Map(),
  mapHasFit: false,
  routeMap: null,
  routeTileLayer: null,
  routeLayers: [],
  adminToken: sessionStorage.getItem(STORAGE_KEYS.adminToken) || '',
  adminTrackers: [],
  adminLoading: false,
  adminBusyImei: '',
  daysFingerprint: '',
  refreshTimer: null
};

const elements = {
  body: document.body,
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
  fitFleetBtn: document.getElementById('fitFleetBtn'),
  fleetMap: document.getElementById('fleetMap'),
  fleetMapEmpty: document.getElementById('fleetMapEmpty'),
  vehicleInspector: document.getElementById('vehicleInspector'),
  fleetNowCount: document.getElementById('fleetNowCount'),
  dashboardSearch: document.getElementById('dashboardSearch'),
  fleetNowList: document.getElementById('fleetNowList'),
  historySearch: document.getElementById('historySearch'),
  historyDevice: document.getElementById('historyDevice'),
  historyFrom: document.getElementById('historyFrom'),
  historyTo: document.getElementById('historyTo'),
  historyFilters: document.getElementById('historyFilters'),
  clearHistoryFilters: document.getElementById('clearHistoryFilters'),
  historyTotals: document.getElementById('historyTotals'),
  historyRouteList: document.getElementById('historyRouteList'),
  statusTable: document.getElementById('statusTable'),
  adminUnlockForm: document.getElementById('adminUnlockForm'),
  adminTokenInput: document.getElementById('adminTokenInput'),
  devicesAdminWorkspace: document.getElementById('devicesAdminWorkspace'),
  deviceCreateForm: document.getElementById('deviceCreateForm'),
  deviceNameInput: document.getElementById('deviceNameInput'),
  deviceLicensePlateInput: document.getElementById('deviceLicensePlateInput'),
  deviceImeiInput: document.getElementById('deviceImeiInput'),
  deviceCreateButton: document.getElementById('deviceCreateButton'),
  deviceAdminSearch: document.getElementById('deviceAdminSearch'),
  adminLockButton: document.getElementById('adminLockButton'),
  adminFeedback: document.getElementById('adminFeedback'),
  deviceAdminSummary: document.getElementById('deviceAdminSummary'),
  deviceAdminList: document.getElementById('deviceAdminList'),
  routeDialog: document.getElementById('routeDialog'),
  routeDialogTitle: document.getElementById('routeDialogTitle'),
  routeDialogMeta: document.getElementById('routeDialogMeta'),
  routeDialogStats: document.getElementById('routeDialogStats'),
  routeDialogMap: document.getElementById('routeDialogMap'),
  routeDialogClose: document.getElementById('routeDialogClose')
};

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function deviceName(device) {
  return String(device?.name || '').trim() || 'Sin nombre';
}

function deviceLicensePlate(device) {
  return String(device?.licensePlate || '').trim().toUpperCase() || 'Sin matrícula';
}

function normalizeLicensePlate(value) {
  return String(value || '').trim().toUpperCase().replace(/\s+/g, ' ');
}

function matchesDeviceQuery(device, query) {
  return device.imei.includes(query)
    || deviceName(device).toLocaleLowerCase('es').includes(query)
    || deviceLicensePlate(device).toLocaleLowerCase('es').includes(query);
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

function dayRange(dateString) {
  const from = new Date(`${dateString}T00:00:00`);
  const to = new Date(from);
  to.setDate(to.getDate() + 1);
  return { from: from.toISOString(), to: to.toISOString() };
}

function setApiStatus(status, label) {
  elements.apiStatus.className = `api-status ${status ? `is-${status}` : ''}`.trim();
  elements.apiStatus.querySelector('span').textContent = label;
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

  if (next === 'dashboard') {
    setTimeout(() => {
      ensureFleetMap();
      state.fleetMap?.invalidateSize();
      renderFleetMap();
    }, 0);
  }
  if (next === 'dispositivos' && state.adminToken && !state.adminTrackers.length) {
    loadAdminTrackers();
  }
}

function renderMetrics() {
  const active = state.fleet.filter((device) => device.authorizationStatus === 'approved');
  const online = active.filter((device) => device.connectionStatus === 'online');
  const withFix = active.filter((device) => device.gpsFix);
  const today = localDayKey();
  const distanceToday = state.days
    .filter((day) => day.date === today)
    .reduce((sum, day) => sum + Number(day.distanceMeters || 0), 0);

  elements.metricDevices.textContent = String(state.fleet.length);
  elements.metricOnline.textContent = String(online.length);
  elements.metricFix.textContent = String(withFix.length);
  elements.metricDistance.textContent = formatDistance(distanceToday);
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
      <div class="empty-state"><strong>No hay coincidencias</strong><p>Prueba con otro nombre, matrícula o parte del IMEI.</p></div>
    `;
    return;
  }

  elements.fleetNowList.innerHTML = devices.map((device) => {
    const connection = connectionPresentation(device.connectionStatus);
    const position = device.latestPosition;
    return `
      <button class="fleet-vehicle-row${state.selectedImei === device.imei ? ' is-selected' : ''}" type="button" data-select-imei="${escapeHtml(device.imei)}">
        <span class="vehicle-row-title"><strong>${escapeHtml(deviceName(device))}</strong><small>${escapeHtml(deviceLicensePlate(device))} · IMEI ${escapeHtml(device.imei)}</small></span>
        <span class="vehicle-row-speed">${position ? `${Math.round(position.speedKph)} km/h` : '—'}</span>
        <span class="vehicle-row-meta">${statusBadge(connection)}<span>${device.gpsFix ? `${position?.satellites || 0} satélites` : 'Sin fix GPS'}</span><span>${formatRelative(device.lastSeenAt)}</span></span>
      </button>
    `;
  }).join('');
}

function renderVehicleInspector() {
  const device = state.fleet.find((item) => item.imei === state.selectedImei);
  if (!device) {
    elements.vehicleInspector.innerHTML = `
      <div><span>Vehículo seleccionado</span><strong>Selecciona un dispositivo de la lista</strong></div>
      <dl><div><dt>Velocidad</dt><dd>—</dd></div><div><dt>Satélites</dt><dd>—</dd></div><div><dt>Contacto</dt><dd>—</dd></div><div><dt>Último dato</dt><dd>—</dd></div></dl>
    `;
    return;
  }
  const position = device.latestPosition;
  const ignition = position?.ignition === true ? 'Encendido' : position?.ignition === false ? 'Apagado' : '—';
  elements.vehicleInspector.innerHTML = `
    <div><span>Vehículo seleccionado</span><strong>${escapeHtml(deviceName(device))} · ${escapeHtml(deviceLicensePlate(device))}</strong><small>IMEI ${escapeHtml(device.imei)}</small></div>
    <dl>
      <div><dt>Velocidad</dt><dd>${position ? `${Math.round(position.speedKph)} km/h` : '—'}</dd></div>
      <div><dt>Satélites</dt><dd>${position ? String(position.satellites || 0) : '—'}</dd></div>
      <div><dt>Contacto</dt><dd>${ignition}</dd></div>
      <div><dt>Último dato</dt><dd>${formatRelative(device.lastSeenAt)}</dd></div>
    </dl>
  `;
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
  const positions = state.fleet
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

  const devicesWithPosition = state.fleet.filter((device) => device.latestPosition);
  elements.fleetMapEmpty.hidden = devicesWithPosition.length > 0;

  devicesWithPosition.forEach((device) => {
    const position = device.latestPosition;
    const marker = L.marker([position.latitude, position.longitude], { icon: vehicleMarkerIcon(device) })
      .addTo(state.fleetMap)
      .bindPopup(`<strong class="map-popup-title">${escapeHtml(deviceName(device))}</strong><span class="map-popup-imei">${escapeHtml(deviceLicensePlate(device))} · IMEI ${escapeHtml(device.imei)}</span><br>${Math.round(position.speedKph)} km/h · ${escapeHtml(formatRelative(device.lastSeenAt))}`);
    marker.on('click', () => selectDevice(device.imei, { focusMap: false }));
    state.fleetMarkers.set(device.imei, marker);
  });

  if (!state.mapHasFit && devicesWithPosition.length) fitFleetMap();
}

function selectDevice(imei, { focusMap = true } = {}) {
  state.selectedImei = imei;
  localStorage.setItem(STORAGE_KEYS.selectedImei, imei);
  renderFleetList();
  renderVehicleInspector();
  const marker = state.fleetMarkers.get(imei);
  if (focusMap && marker && state.fleetMap) {
    state.fleetMap.setView(marker.getLatLng(), Math.max(state.fleetMap.getZoom(), 14));
    marker.openPopup();
  }
}

function renderHistoryDeviceOptions() {
  const selected = elements.historyDevice.value;
  const options = state.fleet
    .slice()
    .sort((left, right) => deviceName(left).localeCompare(deviceName(right), 'es'))
    .map((device) => `<option value="${escapeHtml(device.imei)}">${escapeHtml(deviceName(device))} · ${escapeHtml(deviceLicensePlate(device))} · ${escapeHtml(device.imei)}</option>`)
    .join('');
  elements.historyDevice.innerHTML = `<option value="">Todos los vehículos</option>${options}`;
  elements.historyDevice.value = state.fleet.some((device) => device.imei === selected) ? selected : '';
}

function filteredDays() {
  const query = elements.historySearch.value.trim().toLocaleLowerCase('es');
  const imei = elements.historyDevice.value;
  const from = elements.historyFrom.value;
  const to = elements.historyTo.value;
  return state.days.filter((day) => {
    const name = day.name || state.fleet.find((device) => device.imei === day.imei)?.name || '';
    const licensePlate = day.licensePlate || state.fleet.find((device) => device.imei === day.imei)?.licensePlate || '';
    if (query
      && !day.imei.includes(query)
      && !name.toLocaleLowerCase('es').includes(query)
      && !licensePlate.toLocaleLowerCase('es').includes(query)) return false;
    if (imei && day.imei !== imei) return false;
    if (from && day.date < from) return false;
    if (to && day.date > to) return false;
    return true;
  });
}

function renderHistory() {
  const days = filteredDays();
  const totalDistance = days.reduce((sum, day) => sum + Number(day.distanceMeters || 0), 0);
  const totalPoints = days.reduce((sum, day) => sum + Number(day.pointCount || 0), 0);
  elements.historyTotals.innerHTML = `
    <span><strong>${days.length}</strong> ${days.length === 1 ? 'jornada' : 'jornadas'}</span>
    <span><strong>${formatDistance(totalDistance)}</strong> recorridos</span>
    <span><strong>${totalPoints.toLocaleString('es-ES')}</strong> puntos GPS</span>
  `;

  if (!days.length) {
    elements.historyRouteList.innerHTML = `<div class="empty-state"><strong>No hay jornadas para estos filtros</strong><p>Cuando lleguen posiciones GPS, Budisa agrupará automáticamente cada recorrido por vehículo y día.</p></div>`;
    return;
  }

  elements.historyRouteList.innerHTML = days.map((day) => {
    const name = day.name || state.fleet.find((device) => device.imei === day.imei)?.name || '';
    const licensePlate = day.licensePlate || state.fleet.find((device) => device.imei === day.imei)?.licensePlate || '';
    return `
      <article class="route-ledger-row">
        <div class="route-vehicle" data-label="Vehículo"><strong>${escapeHtml(name || 'Sin nombre')}</strong><small>${escapeHtml(licensePlate || 'Sin matrícula')} · IMEI ${escapeHtml(day.imei)}</small></div>
        <time data-label="Jornada" datetime="${escapeHtml(day.date)}">${escapeHtml(formatLongDate(day.date))}</time>
        <span data-label="Horario">${formatTime(day.startAt)}–${formatTime(day.endAt)}</span>
        <span class="route-distance" data-label="Distancia">${formatDistance(day.distanceMeters)}</span>
        <span data-label="Vel. máxima">${Math.round(Number(day.maxSpeedKph || 0))} km/h</span>
        <span data-label="Puntos">${Number(day.pointCount || 0).toLocaleString('es-ES')}</span>
        <button class="row-action route-open" type="button" data-open-route="${escapeHtml(day.imei)}" data-route-date="${escapeHtml(day.date)}">Ver ruta</button>
      </article>
    `;
  }).join('');
}

function renderStatus() {
  if (!state.fleet.length) {
    elements.statusTable.innerHTML = `<div class="empty-state"><strong>No hay dispositivos registrados</strong><p>Añade el primer IMEI desde la pestaña Dispositivos.</p></div>`;
    return;
  }

  const connectionOrder = { online: 0, stale: 1, waiting: 2, offline: 3, pending: 4, disabled: 5 };
  const devices = state.fleet.slice().sort((left, right) => (
    (connectionOrder[left.connectionStatus] ?? 9) - (connectionOrder[right.connectionStatus] ?? 9)
    || deviceName(left).localeCompare(deviceName(right), 'es')
  ));

  elements.statusTable.innerHTML = `
    <div class="status-table-head" aria-hidden="true"><span>Vehículo</span><span>Modelo</span><span>Autorización</span><span>Conexión</span><span>GPS</span><span>Último dato</span></div>
    ${devices.map((device) => {
      const approval = approvalPresentation(device.authorizationStatus);
      const connection = connectionPresentation(device.connectionStatus);
      const fix = device.gpsFix
        ? { label: `${device.latestPosition?.satellites || 0} satélites`, className: 'is-fix' }
        : { label: 'Sin fix', className: 'is-no-fix' };
      return `
        <article class="status-device-row">
          <div class="status-device-identity" data-label="Vehículo"><strong>${escapeHtml(deviceName(device))}</strong><span>${escapeHtml(deviceLicensePlate(device))} · ${escapeHtml(device.imei)}</span></div>
          <span class="status-device-model" data-label="Modelo">${escapeHtml(`${device.manufacturer || 'Teltonika'} ${device.model || ''}`.trim())}</span>
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
  renderVehicleInspector();
  renderHistoryDeviceOptions();
  renderHistory();
  renderStatus();
  if (state.view === 'dashboard') renderFleetMap();
}

async function requestAdmin(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-Tracker-Admin-Token': state.adminToken,
      ...(options.headers || {})
    }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.ok === false) {
    const error = new Error(payload.error || 'No se ha podido completar la operación.');
    error.status = response.status;
    error.code = payload.code;
    throw error;
  }
  return payload.data;
}

function setAdminFeedback(message = '', type = '') {
  elements.adminFeedback.textContent = message;
  elements.adminFeedback.classList.toggle('is-success', type === 'success');
  elements.adminFeedback.classList.toggle('is-error', type === 'error');
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
  const unlocked = Boolean(state.adminToken);
  elements.adminUnlockForm.hidden = unlocked;
  elements.devicesAdminWorkspace.hidden = !unlocked;
  renderAdminSummary();

  if (!unlocked) {
    elements.deviceAdminList.innerHTML = `<div class="empty-state"><strong>Administración bloqueada</strong><p>Introduce la clave para identificar, añadir o deshabilitar dispositivos.</p></div>`;
    return;
  }
  if (state.adminLoading) {
    elements.deviceAdminList.innerHTML = `<div class="empty-state"><strong>Consultando dispositivos…</strong><p>Sincronizando el registro guardado en MongoDB.</p></div>`;
    return;
  }

  const trackers = filteredAdminTrackers();
  if (!trackers.length) {
    elements.deviceAdminList.innerHTML = `<div class="empty-state"><strong>No hay dispositivos para mostrar</strong><p>Añade un IMEI o cambia el término de búsqueda.</p></div>`;
    return;
  }

  elements.deviceAdminList.innerHTML = `
    <div class="device-admin-head" aria-hidden="true"><span>Identificación</span><span>IMEI</span><span>Estado</span><span>Actividad</span><span>Acciones</span></div>
    ${trackers.map((tracker) => {
      const presentation = approvalPresentation(tracker.status);
      const busy = state.adminBusyImei === tracker.imei;
      const action = tracker.status === 'pending' ? 'approve' : tracker.status === 'approved' ? 'disable' : 'reactivate';
      const actionLabel = tracker.status === 'pending' ? 'Aprobar' : tracker.status === 'approved' ? 'Deshabilitar' : 'Reactivar';
      return `
        <article class="device-admin-row" data-status="${escapeHtml(tracker.status)}" data-device-row="${escapeHtml(tracker.imei)}">
          <div class="device-identity-editor" data-label="Identificación"><label><span>Nombre</span><input aria-label="Nombre operativo de ${escapeHtml(tracker.imei)}" data-name-input="${escapeHtml(tracker.imei)}" maxlength="80" value="${escapeHtml(tracker.name || '')}" placeholder="Asigna un nombre" ${busy ? 'disabled' : ''} /></label><label><span>Matrícula</span><input aria-label="Matrícula de ${escapeHtml(tracker.imei)}" data-license-plate-input="${escapeHtml(tracker.imei)}" maxlength="20" value="${escapeHtml(tracker.licensePlate || '')}" placeholder="1234 ABC" autocapitalize="characters" spellcheck="false" ${busy ? 'disabled' : ''} /></label><button class="row-action" type="button" data-device-action="save" data-imei="${escapeHtml(tracker.imei)}" ${busy ? 'disabled' : ''}>Guardar</button></div>
          <div class="device-imei" data-label="IMEI"><strong>${escapeHtml(tracker.imei)}</strong><small>${escapeHtml(`${tracker.manufacturer || 'Teltonika'} ${tracker.model || ''}`.trim())}</small></div>
          <div data-label="Estado">${statusBadge(presentation)}</div>
          <div class="device-admin-date" data-label="Actividad">${tracker.lastSeenAt ? `Dato: ${escapeHtml(formatRelative(tracker.lastSeenAt))}` : tracker.lastAttemptAt ? `Intento: ${escapeHtml(formatRelative(tracker.lastAttemptAt))}` : 'Sin actividad'}</div>
          <div class="device-admin-actions" data-label="Acciones"><button class="row-action ${action === 'disable' ? 'is-danger' : 'is-primary'}" type="button" data-device-action="${action}" data-imei="${escapeHtml(tracker.imei)}" ${busy ? 'disabled' : ''}>${busy ? 'Guardando…' : actionLabel}</button></div>
        </article>
      `;
    }).join('')}
  `;
}

async function loadAdminTrackers({ silent = false } = {}) {
  if (!state.adminToken || state.adminLoading) return;
  state.adminLoading = true;
  if (!silent) setAdminFeedback('Consultando el registro…');
  renderAdminDevices();
  try {
    state.adminTrackers = await requestAdmin('/api/trackers');
    if (!silent) setAdminFeedback('Registro actualizado.', 'success');
  } catch (error) {
    if (error.status === 401) {
      state.adminToken = '';
      sessionStorage.removeItem(STORAGE_KEYS.adminToken);
      setAdminFeedback('La clave no es válida. Revisa TRACKER_ADMIN_TOKEN.', 'error');
    } else {
      setAdminFeedback(error.message, 'error');
    }
  } finally {
    state.adminLoading = false;
    renderAdminDevices();
  }
}

async function unlockAdmin(event) {
  event.preventDefault();
  const token = elements.adminTokenInput.value.trim();
  if (!token) {
    setAdminFeedback('Introduce la clave de administración.', 'error');
    elements.adminTokenInput.focus();
    return;
  }
  state.adminToken = token;
  sessionStorage.setItem(STORAGE_KEYS.adminToken, token);
  elements.adminTokenInput.value = '';
  renderAdminDevices();
  await loadAdminTrackers();
}

function lockAdmin() {
  state.adminToken = '';
  state.adminTrackers = [];
  sessionStorage.removeItem(STORAGE_KEYS.adminToken);
  setAdminFeedback('Acceso administrativo cerrado.');
  renderAdminDevices();
}

async function createDevice(event) {
  event.preventDefault();
  const name = elements.deviceNameInput.value.trim();
  const licensePlate = normalizeLicensePlate(elements.deviceLicensePlateInput.value);
  const imei = elements.deviceImeiInput.value.trim();
  if (!name) {
    setAdminFeedback('Escribe un nombre reconocible para el vehículo.', 'error');
    elements.deviceNameInput.focus();
    return;
  }
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
  setAdminFeedback(`Añadiendo ${name} · ${licensePlate}…`);
  try {
    await requestAdmin('/api/trackers', { method: 'POST', body: JSON.stringify({ imei, name, licensePlate }) });
    elements.deviceCreateForm.reset();
    setAdminFeedback(`${name} · ${licensePlate} añadido y habilitado.`, 'success');
    await loadAdminTrackers({ silent: true });
    await refreshPublicData({ silent: true });
  } catch (error) {
    setAdminFeedback(error.message, 'error');
  } finally {
    state.adminBusyImei = '';
    elements.deviceCreateButton.disabled = false;
    elements.deviceCreateButton.textContent = 'Añadir dispositivo';
    renderAdminDevices();
  }
}

function nameInputFor(imei) {
  return elements.deviceAdminList.querySelector(`[data-name-input="${CSS.escape(imei)}"]`);
}

function licensePlateInputFor(imei) {
  return elements.deviceAdminList.querySelector(`[data-license-plate-input="${CSS.escape(imei)}"]`);
}

async function handleDeviceAction(button) {
  const imei = button.dataset.imei;
  const action = button.dataset.deviceAction;
  const name = nameInputFor(imei)?.value.trim() || '';
  const licensePlate = normalizeLicensePlate(licensePlateInputFor(imei)?.value);
  if (!imei || !action) return;
  if ((action === 'save' || action === 'approve' || action === 'reactivate') && !name) {
    setAdminFeedback('Asigna un nombre antes de guardar o habilitar el dispositivo.', 'error');
    nameInputFor(imei)?.focus();
    return;
  }
  if ((action === 'save' || action === 'approve' || action === 'reactivate')
    && (!licensePlate || !/^[A-Z0-9 -]{1,20}$/.test(licensePlate))) {
    setAdminFeedback('Asigna una matrícula válida antes de guardar o habilitar el dispositivo.', 'error');
    licensePlateInputFor(imei)?.focus();
    return;
  }
  if (action === 'disable' && !window.confirm(`¿Deshabilitar ${name || imei}${licensePlate ? ` · ${licensePlate}` : ''}? Dejará de aceptar posiciones hasta que lo reactives.`)) return;

  const payload = action === 'save'
    ? { name, licensePlate }
    : action === 'disable'
      ? { enabled: false }
      : { enabled: true, name, licensePlate };
  state.adminBusyImei = imei;
  renderAdminDevices();
  setAdminFeedback(`${action === 'disable' ? 'Deshabilitando' : 'Guardando'} ${name || imei}…`);
  try {
    await requestAdmin(`/api/trackers/${encodeURIComponent(imei)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload)
    });
    setAdminFeedback(`${name || imei} actualizado.`, 'success');
    await loadAdminTrackers({ silent: true });
    await refreshPublicData({ silent: true });
  } catch (error) {
    setAdminFeedback(error.message, 'error');
  } finally {
    state.adminBusyImei = '';
    renderAdminDevices();
  }
}

function endpointIcon(label, color) {
  return L.divIcon({
    className: '',
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    html: `<span class="route-endpoint" style="--marker-color:${color}">${label}</span>`
  });
}

function ensureRouteMap() {
  if (state.routeMap || !window.L) return;
  state.routeMap = L.map(elements.routeDialogMap).setView([40.2, -3.7], 6);
  state.routeTileLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    className: 'budisa-map-tiles',
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
  }).addTo(state.routeMap);
}

function clearRouteMap() {
  state.routeLayers.forEach((layer) => layer.remove());
  state.routeLayers = [];
}

function drawRoute(points) {
  ensureRouteMap();
  clearRouteMap();
  if (!state.routeMap || !points.length) return;
  const coords = points.map((point) => [Number(point.gps.latitude), Number(point.gps.longitude)]);
  const casing = L.polyline(coords, { color: '#07131f', weight: 8, opacity: 0.8 }).addTo(state.routeMap);
  const route = L.polyline(coords, { color: '#2dd4bf', weight: 4, opacity: 0.96 }).addTo(state.routeMap);
  const start = L.marker(coords[0], { icon: endpointIcon('A', '#2dd4bf') }).addTo(state.routeMap);
  const end = L.marker(coords[coords.length - 1], { icon: endpointIcon('B', '#4f8cff') }).addTo(state.routeMap);
  state.routeLayers.push(casing, route, start, end);
  const bounds = L.latLngBounds(coords);
  if (coords.length === 1) state.routeMap.setView(coords[0], 16);
  else state.routeMap.fitBounds(bounds, { padding: [44, 44], maxZoom: 17 });
}

async function openRoute(day) {
  const name = day.name || state.fleet.find((device) => device.imei === day.imei)?.name || 'Sin nombre';
  const licensePlate = day.licensePlate || state.fleet.find((device) => device.imei === day.imei)?.licensePlate || 'Sin matrícula';
  elements.routeDialogTitle.textContent = `${name} · ${licensePlate} · ${formatLongDate(day.date)}`;
  elements.routeDialogMeta.textContent = `IMEI ${day.imei} · ${formatTime(day.startAt)}–${formatTime(day.endAt)}`;
  elements.routeDialogStats.innerHTML = `
    <div><span>Distancia</span><strong>${formatDistance(day.distanceMeters)}</strong></div>
    <div><span>Duración</span><strong>${formatDuration(day.durationSeconds)}</strong></div>
    <div><span>Puntos GPS</span><strong>${Number(day.pointCount || 0).toLocaleString('es-ES')}</strong></div>
    <div><span>Velocidad máxima</span><strong>${Math.round(Number(day.maxSpeedKph || 0))} km/h</strong></div>
  `;
  elements.routeDialog.showModal();
  ensureRouteMap();
  state.routeMap?.invalidateSize();
  clearRouteMap();

  const { from, to } = dayRange(day.date);
  try {
    const points = await requestJson(`/api/tracker?imei=${encodeURIComponent(day.imei)}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&limit=20000`);
    drawRoute(points || []);
  } catch (error) {
    console.error(error);
    elements.routeDialogMeta.textContent = 'No se ha podido cargar el recorrido. Cierra y vuelve a intentarlo.';
  }
}

function closeRouteDialog() {
  if (elements.routeDialog.open) elements.routeDialog.close();
}

async function refreshPublicData({ silent = false } = {}) {
  if (!silent) setApiStatus('', 'Actualizando');
  try {
    const [fleet, days, gateway] = await Promise.all([
      requestJson('/api/fleet'),
      requestJson('/api/tracker/days?limit=1000'),
      requestJson('/api/tracker/status').catch(() => null)
    ]);
    const nextDays = days || [];
    const nextDaysFingerprint = nextDays.map((day) => `${day.imei}:${day.name}:${day.licensePlate}:${day.date}:${day.pointCount}:${day.endAt}`).join('|');
    const historyChanged = nextDaysFingerprint !== state.daysFingerprint;
    state.fleet = fleet || [];
    state.days = nextDays;
    state.daysFingerprint = nextDaysFingerprint;
    state.gateway = gateway;
    setApiStatus('online', 'Conectado');
    if (historyChanged || !elements.historyRouteList.children.length) {
      renderPublicViews();
    } else {
      renderMetrics();
      renderFleetList();
      renderVehicleInspector();
      renderHistoryDeviceOptions();
      renderStatus();
      if (state.view === 'dashboard') renderFleetMap();
    }
  } catch (error) {
    console.error(error);
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

  elements.historyFilters.addEventListener('input', renderHistory);
  elements.historyFilters.addEventListener('change', renderHistory);
  elements.clearHistoryFilters.addEventListener('click', () => {
    elements.historyFilters.reset();
    renderHistory();
  });
  elements.historyRouteList.addEventListener('click', (event) => {
    const button = event.target.closest('[data-open-route]');
    if (!button) return;
    const day = state.days.find((item) => item.imei === button.dataset.openRoute && item.date === button.dataset.routeDate);
    if (day) openRoute(day);
  });

  elements.adminUnlockForm.addEventListener('submit', unlockAdmin);
  elements.adminLockButton.addEventListener('click', lockAdmin);
  elements.deviceCreateForm.addEventListener('submit', createDevice);
  elements.deviceAdminSearch.addEventListener('input', renderAdminDevices);
  elements.deviceAdminList.addEventListener('click', (event) => {
    const button = event.target.closest('[data-device-action]');
    if (button) handleDeviceAction(button);
  });

  elements.routeDialogClose.addEventListener('click', closeRouteDialog);
  elements.routeDialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    closeRouteDialog();
  });
  elements.routeDialog.addEventListener('click', (event) => {
    if (event.target === elements.routeDialog) closeRouteDialog();
  });

  window.addEventListener('resize', () => {
    if (state.view === 'dashboard') state.fleetMap?.invalidateSize();
    if (elements.routeDialog.open) state.routeMap?.invalidateSize();
  });
}

function boot() {
  applyTheme();
  renderAdminDevices();
  setView(state.view);
  setupListeners();
  refreshPublicData();
  if (state.adminToken) loadAdminTrackers({ silent: true });
  state.refreshTimer = window.setInterval(() => refreshPublicData({ silent: true }), 10000);
}

boot();
})();
