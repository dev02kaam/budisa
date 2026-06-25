const STORAGE_KEYS = {
  theme: 'budisa-theme',
  view: 'budisa-view',
  filters: 'budisa-filters',
  columns: 'budisa-history-columns',
  visibleColumns: 'budisa-visible-columns',
  selectedSensors: 'budisa-selected-sensors'
};

const SENSOR_COLORS = ['#6ea8ff', '#61d8b9', '#f6c177', '#b57bff', '#ff6c7a', '#8bd3ff'];
const SIGNAL_KEYS = ['bascula_subida', 'bascula_bajada', 'bascula_levantada', 'estado_estable', 'alerta'];
const SIGNAL_BAR_COLORS = ['#61d8b9', '#6ea8ff', '#f6c177', '#b57bff', '#ff6c7a'];

const COLUMN_DEFS = [
  { key: 'receivedAt', label: 'Fecha' },
  { key: 'deviceId', label: 'Dispositivo' },
  { key: 'truckId', label: 'Truck' },
  { key: 'signal', label: 'Señal' },
  { key: 'event', label: 'Evento' },
  { key: 'gpioState', label: 'GPIO' },
  { key: 'coords', label: 'GPS' },
  { key: 'battery', label: 'Batería' },
  { key: 'reason', label: 'Motivo' }
];

const FIELD_OPTIONS = [
  { value: 'signal', label: 'Señal' },
  { value: 'deviceId', label: 'Dispositivo' },
  { value: 'truckId', label: 'Truck' },
  { value: 'event', label: 'Evento' },
  { value: 'reason', label: 'Motivo' },
  { value: 'gpioState', label: 'GPIO' },
  { value: 'battery', label: 'Batería' },
  { value: 'receivedAt', label: 'Fecha' },
  { value: 'hasGps', label: 'Tiene GPS' }
];

const SIGNAL_LABELS = {
  bascula_subida: 'Báscula subida',
  bascula_bajada: 'Báscula bajada',
  bascula_levantada: 'Báscula levantada',
  estado_estable: 'Estado estable',
  alerta: 'Alerta',
  gps: 'GPS',
  control_heartbeat: 'Heartbeat de servicio'
};

const state = {
  theme: localStorage.getItem(STORAGE_KEYS.theme) || 'night',
  view: localStorage.getItem(STORAGE_KEYS.view) || 'dashboard',
  summary: null,
  allEvents: [],
  historyEvents: [],
  heartbeatEvents: [],
  filteredEvents: [],
  latestEvent: null,
  trail: [],
  devices: [],
  filters: loadFilters(),
  columns: loadColumns(),
  selectedSensors: loadSelectedSensors(),
  trackerDeviceId: 'raspberry-1',
  gpsMapInstance: null,
  gpsPolyline: null,
  gpsMarkers: [],
  dragColumnKey: null,
  columnDialogSelected: new Set(),
  refreshTimer: null
};

const elements = {
  body: document.body,
  apiStatus: document.getElementById('apiStatus'),
  themeToggleInput: document.getElementById('themeToggleInput'),
  navMenu: document.getElementById('navMenu'),
  pageIcon: document.getElementById('pageIcon'),
  pageTitle: document.getElementById('pageTitle'),
  totalEvents: document.getElementById('totalEvents'),
  deviceCount: document.getElementById('deviceCount'),
  latestSignal: document.getElementById('latestSignal'),
  latestCoords: document.getElementById('latestCoords'),
  liveDevice: document.getElementById('liveDevice'),
  liveSignal: document.getElementById('liveSignal'),
  liveTime: document.getElementById('liveTime'),
  liveBattery: document.getElementById('liveBattery'),
  signalChart: document.getElementById('signalChart'),
  sensorSelect: document.getElementById('sensorSelect'),
  addSensorBtn: document.getElementById('addSensorBtn'),
  sensorChips: document.getElementById('sensorChips'),
  liveBox: document.getElementById('liveBox'),
  filterBuilder: document.getElementById('filterBuilder'),
  filterChips: document.getElementById('filterChips'),
  addFilterBtn: document.getElementById('addFilterBtn'),
  clearFiltersBtn: document.getElementById('clearFiltersBtn'),
  resetColumnsBtn: document.getElementById('resetColumnsBtn'),
  exportCsvBtn: document.getElementById('exportCsvBtn'),
  columnDialog: document.getElementById('columnDialog'),
  columnDialogList: document.getElementById('columnDialogList'),
  columnDialogClose: document.getElementById('columnDialogClose'),
  columnDialogCancel: document.getElementById('columnDialogCancel'),
  columnDialogAdd: document.getElementById('columnDialogAdd'),
  historyHead: document.getElementById('historyHead'),
  eventsTable: document.getElementById('eventsTable'),
  historyCount: document.getElementById('historyCount'),
  gpsMap: document.getElementById('gpsMap'),
  trailCount: document.getElementById('trailCount'),
  boundsInfo: document.getElementById('boundsInfo'),
  trailList: document.getElementById('trailList'),
  views: Array.from(document.querySelectorAll('.view')),
  navButtons: Array.from(document.querySelectorAll('.nav-item'))
};

function loadFilters() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.filters);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) && parsed.length
      ? parsed
      : [{ id: crypto.randomUUID(), field: 'signal', op: 'contains', value: '' }];
  } catch {
    return [{ id: crypto.randomUUID(), field: 'signal', op: 'contains', value: '' }];
  }
}

function loadColumns() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.columns);
    const parsed = raw ? JSON.parse(raw) : null;
    if (!Array.isArray(parsed) || !parsed.length) {
      return COLUMN_DEFS.map((column) => column.key);
    }
    const allKeys = new Set(COLUMN_DEFS.map((column) => column.key));
    return parsed.filter((key) => allKeys.has(key));
  } catch {
    return COLUMN_DEFS.map((column) => column.key);
  }
}

function saveFilters() {
  localStorage.setItem(STORAGE_KEYS.filters, JSON.stringify(state.filters));
}

function saveColumns() {
  localStorage.setItem(STORAGE_KEYS.columns, JSON.stringify(state.columns));
}

function saveTheme() {
  localStorage.setItem(STORAGE_KEYS.theme, state.theme);
}

function saveView() {
  localStorage.setItem(STORAGE_KEYS.view, state.view);
}

function loadSelectedSensors() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.selectedSensors);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((value) => typeof value === 'string' && value.trim()) : [];
  } catch {
    return [];
  }
}

function saveSelectedSensors() {
  localStorage.setItem(STORAGE_KEYS.selectedSensors, JSON.stringify(state.selectedSensors));
}

function getVisibleSet() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.visibleColumns);
    const parsed = raw ? JSON.parse(raw) : null;
    if (!Array.isArray(parsed) || !parsed.length) {
      return new Set(COLUMN_DEFS.map((column) => column.key));
    }
    return new Set(parsed.filter((key) => COLUMN_DEFS.some((column) => column.key === key)));
  } catch {
    return new Set(COLUMN_DEFS.map((column) => column.key));
  }
}

function setVisibleSet(nextVisible) {
  localStorage.setItem(STORAGE_KEYS.visibleColumns, JSON.stringify([...nextVisible]));
}

function formatDate(value) {
  if (!value) return '-';
  return new Date(value).toLocaleString('es-ES');
}

function signalLabel(signal) {
  return SIGNAL_LABELS[signal] || signal || '-';
}

function getGpsLat(event) {
  const value = event?.gps?.latitude ?? event?.lat;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function getGpsLng(event) {
  const value = event?.gps?.longitude ?? event?.lon;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function formatGps(event) {
  const lat = getGpsLat(event);
  const lng = getGpsLng(event);
  if (lat === null || lng === null) {
    return 'Sin GPS';
  }
  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}

function formatCell(event, key) {
  if (key === 'receivedAt') return formatDate(event.receivedAt);
  if (key === 'signal') return signalLabel(event.signal);
  if (key === 'coords') return formatGps(event);
  if (key === 'gpioState') return String(event.gpioState ?? '-');
  if (key === 'battery') return event.battery ?? '-';
  if (key === 'reason') return event.reason || '-';
  return event[key] ?? '-';
}

function applyTheme() {
  elements.body.dataset.theme = state.theme;
  if (elements.themeToggleInput) {
    elements.themeToggleInput.checked = state.theme === 'night';
  }
  saveTheme();
}

const VIEW_ICONS = {
  dashboard: `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 7.5A1.5 1.5 0 0 1 5.5 6h8.1v6.2H18l2.3 2.4V17H19a2.8 2.8 0 1 0-5.6 0H10a2.8 2.8 0 1 0-5.6 0H3V9.5A2 2 0 0 1 5 7.5Zm.5 1.5v4.5h2.8V9H4.5Zm3.8 0v4.5H13V9H8.3Zm5.7 0v3.1h2.8l-1.5-1.6A1 1 0 0 0 14 11.7Zm-5.9 6.8a1.1 1.1 0 1 1-2.2 0 1.1 1.1 0 0 1 2.2 0Zm9 0a1.1 1.1 0 1 1-2.2 0 1.1 1.1 0 0 1 2.2 0Z"/>
    </svg>
  `,
  historico: `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7 5.5A2.5 2.5 0 0 1 9.5 3h5A2.5 2.5 0 0 1 17 5.5v13A2.5 2.5 0 0 1 14.5 21h-5A2.5 2.5 0 0 1 7 18.5v-13Zm2.5-.5a.5.5 0 0 0-.5.5v13a.5.5 0 0 0 .5.5h5a.5.5 0 0 0 .5-.5v-13a.5.5 0 0 0-.5-.5h-5Z"/>
      <path d="M10 9h4v2h-4zm0 4h4v2h-4z"/>
      <path d="M5 8H3v8h2zm16 0h-2v8h2z" opacity=".85"/>
    </svg>
  `,
  estado: `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 12h3.2l1.6-4.5c.3-.8 1.4-.8 1.7 0L12 17l1.9-5.2c.3-.8 1.4-.8 1.7 0l1.1 3.2H21" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M12 3c4.9 0 9 4 9 9s-4.1 9-9 9-9-4-9-9 4.1-9 9-9Z" fill="none" stroke="currentColor" stroke-width="1.4" opacity=".45"/>
    </svg>
  `,
  tracker: `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 2a7 7 0 0 0-7 7c0 4.7 7 13 7 13s7-8.3 7-13a7 7 0 0 0-7-7Zm0 9.5A2.5 2.5 0 1 1 12 6a2.5 2.5 0 0 1 0 5.5Z"/>
    </svg>
  `
};

function setView(view) {
  state.view = view;
  elements.views.forEach((section) => {
    section.classList.toggle('view-active', section.dataset.view === view);
  });
  elements.navButtons.forEach((button) => {
    button.classList.toggle('active', button.dataset.view === view);
  });

  const titles = {
    dashboard: 'Panel de control',
    historico: 'Histórico inteligente',
    estado: 'Estado de conectividad',
    tracker: 'Tracker GPS'
  };

  elements.pageTitle.textContent = titles[view] || titles.dashboard;
  if (elements.pageIcon) {
    elements.pageIcon.className = `page-icon page-icon-${view}`;
    elements.pageIcon.innerHTML = VIEW_ICONS[view] || VIEW_ICONS.dashboard;
  }
  if (view === 'tracker') {
    window.setTimeout(() => {
      state.gpsMapInstance?.invalidateSize();
      if (state.trail.length) {
        drawTrailMap(state.trail);
      }
    }, 0);
  }
  saveView();
}

function renderSummary() {
  if (!state.summary) return;
  elements.totalEvents.textContent = state.summary.totalEvents ?? 0;
  elements.deviceCount.textContent = state.summary.deviceCount ?? 0;
  elements.latestSignal.textContent = state.latestEvent ? signalLabel(state.latestEvent.signal) : '-';
  elements.latestCoords.textContent = state.latestEvent ? formatGps(state.latestEvent) : '-';
  ensureSelectedSensors();
  renderSensorSelector();
  renderSensorChips();
  renderSensorStack();
}

function ensureSelectedSensors() {
  const knownIds = new Set(state.devices.map((device) => device.deviceId));
  const eventIds = new Set(state.allEvents.flatMap((event) => [event.deviceId, event.truckId]).filter(Boolean));
  const validSelected = state.selectedSensors.filter((id) => knownIds.has(id) || eventIds.has(id));

  if (validSelected.length !== state.selectedSensors.length) {
    state.selectedSensors = validSelected;
    saveSelectedSensors();
  }

  if (!state.selectedSensors.length) {
    const fallback = state.latestEvent?.deviceId || state.latestEvent?.truckId || state.devices[0]?.deviceId;
    if (fallback) {
      state.selectedSensors = [fallback];
      saveSelectedSensors();
    }
  }
}

function getSensorLabel(sensorId) {
  const device = state.devices.find((item) => item.deviceId === sensorId);
  return device?.name || sensorId || 'Sensor';
}

function getLatestEventForSensor(sensorId) {
  return state.historyEvents.find((event) => event.deviceId === sensorId || event.truckId === sensorId) || null;
}

function getSensorColor(index) {
  return SENSOR_COLORS[index % SENSOR_COLORS.length];
}

function addSensor(sensorId) {
  const nextId = String(sensorId || '').trim();
  if (!nextId || state.selectedSensors.includes(nextId)) return;
  state.selectedSensors = [...state.selectedSensors, nextId];
  saveSelectedSensors();
  renderSummary();
  drawSignalChart();
}

function removeSensor(sensorId) {
  state.selectedSensors = state.selectedSensors.filter((id) => id !== sensorId);
  saveSelectedSensors();
  renderSummary();
  drawSignalChart();
}

function renderSensorSelector() {
  if (!elements.sensorSelect) return;
  const available = state.devices.filter((device) => !state.selectedSensors.includes(device.deviceId));
  const options = available
    .map((device) => `<option value="${escapeHtml(device.deviceId)}">${escapeHtml(device.name || device.deviceId)}</option>`)
    .join('');

  elements.sensorSelect.innerHTML = available.length
    ? `<option value="">Añadir sensor...</option>${options}`
    : '<option value="">No hay sensores disponibles</option>';
  elements.sensorSelect.disabled = !available.length;
  if (elements.addSensorBtn) {
    elements.addSensorBtn.disabled = !available.length;
  }
}

function renderSensorChips() {
  if (!elements.sensorChips) return;
  if (!state.selectedSensors.length) {
    elements.sensorChips.innerHTML = '<span class="sensor-empty">Añade uno o varios sensores para comparar su estado.</span>';
    return;
  }

  elements.sensorChips.innerHTML = state.selectedSensors
    .map((sensorId, index) => {
      const color = getSensorColor(index);
      const label = getSensorLabel(sensorId);
      return `
        <span class="sensor-chip" style="--sensor-color: ${color}">
          <span class="sensor-chip-color" style="background: ${color}"></span>
          <span>${escapeHtml(label)}</span>
          <button type="button" data-sensor-id="${escapeHtml(sensorId)}" aria-label="Quitar ${escapeHtml(label)}">x</button>
        </span>
      `;
    })
    .join('');

  elements.sensorChips.querySelectorAll('button[data-sensor-id]').forEach((button) => {
    button.addEventListener('click', () => removeSensor(button.dataset.sensorId));
  });
}

function renderSensorStack() {
  if (!elements.liveBox) return;
  if (!state.selectedSensors.length) {
    elements.liveBox.innerHTML = '<div class="sensor-empty">Selecciona sensores para ver su estado individual.</div>';
    return;
  }

  elements.liveBox.innerHTML = state.selectedSensors
    .map((sensorId, index) => {
      const color = getSensorColor(index);
      const latest = getLatestEventForSensor(sensorId);
      const device = state.devices.find((item) => item.deviceId === sensorId);
      const status = device?.status || (latest ? 'online' : 'offline');
      const signal = latest ? signalLabel(latest.signal) : 'Sin datos';
      const signalValue = latest?.signal || '-';
      const receivedAt = latest ? formatDate(latest.receivedAt) : '-';
      const battery = latest?.battery ?? '-';
      const coords = latest ? formatGps(latest) : '-';

      return `
        <article class="sensor-card" style="--sensor-color: ${color}">
          <div class="sensor-card-head">
            <div class="sensor-card-title">
              <span class="sensor-status-dot" aria-hidden="true"></span>
              <strong>${escapeHtml(device?.name || sensorId)}</strong>
            </div>
            <button class="sensor-remove" type="button" data-sensor-id="${escapeHtml(sensorId)}" aria-label="Quitar sensor">x</button>
          </div>
          <div class="sensor-status">
            <span>${escapeHtml(status === 'online' ? 'Conectado' : status === 'idle' ? 'Inactivo' : 'Sin datos')}</span>
            <span>·</span>
            <span>${escapeHtml(latest ? signal : 'Esperando lectura')}</span>
          </div>
          <div class="sensor-metrics">
            <div><span>Señal</span><strong>${escapeHtml(signalValue)}</strong></div>
            <div><span>Hora</span><strong>${escapeHtml(receivedAt)}</strong></div>
            <div><span>Batería</span><strong>${escapeHtml(String(battery))}</strong></div>
            <div><span>GPS</span><strong>${escapeHtml(coords)}</strong></div>
          </div>
        </article>
      `;
    })
    .join('');

  elements.liveBox.querySelectorAll('button[data-sensor-id]').forEach((button) => {
    button.addEventListener('click', () => removeSensor(button.dataset.sensorId));
  });
}

function buildSensorSignalCounts(sensorId) {
  const counts = Object.fromEntries(SIGNAL_KEYS.map((key) => [key, 0]));
  state.allEvents
    .filter((event) => event.deviceId === sensorId || event.truckId === sensorId)
    .forEach((event) => {
      if (counts[event.signal] !== undefined) {
        counts[event.signal] += 1;
      }
    });
  return counts;
}

function drawSignalChart() {
  const canvas = elements.signalChart;
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const ratio = window.devicePixelRatio || 1;
  const width = canvas.clientWidth || canvas.width;
  const height = canvas.clientHeight || canvas.height;
  canvas.width = width * ratio;
  canvas.height = height * ratio;
  ctx.resetTransform?.();
  ctx.scale(ratio, ratio);
  ctx.clearRect(0, 0, width, height);

  const sensors = state.selectedSensors.length ? state.selectedSensors : [state.latestEvent?.deviceId || state.latestEvent?.truckId].filter(Boolean);
  const hasData = sensors.length && sensors.some((sensorId) => {
    const counts = buildSensorSignalCounts(sensorId);
    return SIGNAL_KEYS.some((key) => (counts[key] || 0) > 0);
  });

  ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--text');
  ctx.font = '14px var(--font)';
  ctx.fillText('Actividad por sensor y tipo de señal', 16, 28);

  if (!sensors.length || !hasData) {
    drawEmptyChartPlaceholder(ctx, width, height, !sensors.length);
    return;
  }

  const countsBySensor = sensors.map((sensorId) => buildSensorSignalCounts(sensorId));
  const max = Math.max(1, ...countsBySensor.flatMap((counts) => SIGNAL_KEYS.map((key) => counts[key] || 0)));
  const chartLeft = 68;
  const chartRight = 20;
  const chartTop = 52;
  const chartBottom = 52;
  const chartWidth = width - chartLeft - chartRight;
  const chartHeight = height - chartTop - chartBottom;
  const groupWidth = chartWidth / SIGNAL_KEYS.length;
  const barWidth = Math.min(22, groupWidth / Math.max(1, sensors.length + 1));
  const yTicks = 4;
  const yStep = max / yTicks;

  ctx.strokeStyle = getComputedStyle(document.body).getPropertyValue('--line');
  ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--muted');
  ctx.font = '12px var(--font)';
  ctx.textAlign = 'right';

  for (let tick = 0; tick <= yTicks; tick += 1) {
    const value = Math.round(yStep * tick);
    const y = chartTop + chartHeight - (chartHeight / yTicks) * tick;
    ctx.beginPath();
    ctx.moveTo(chartLeft, y);
    ctx.lineTo(chartLeft + chartWidth, y);
    ctx.stroke();
    ctx.fillText(String(value), chartLeft - 10, y + 4);
  }

  ctx.textAlign = 'center';
  ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--muted');

  SIGNAL_KEYS.forEach((signalKey, signalIndex) => {
    const label = signalLabel(signalKey).replace(/^Báscula\s*/i, '');
    const groupX = chartLeft + signalIndex * groupWidth;
    ctx.fillText(label, groupX + groupWidth / 2, height - 18);

    countsBySensor.forEach((counts, sensorIndex) => {
      const value = counts[signalKey] || 0;
      const barHeight = (chartHeight * value) / max;
      const x = groupX + groupWidth * 0.15 + sensorIndex * (barWidth + 6);
      const y = chartTop + chartHeight - barHeight;
      const color = getSensorColor(sensorIndex);
      ctx.fillStyle = color;
      ctx.fillRect(x, y, barWidth, barHeight);
      if (value > 0) {
        ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--text');
        ctx.fillText(String(value), x + 2, y - 6);
      }
    });
  });

  sensors.forEach((sensorId, index) => {
    const color = getSensorColor(index);
    const label = getSensorLabel(sensorId);
    const legendX = chartLeft + chartWidth - 8;
    const legendY = 56 + index * 20;
    ctx.fillStyle = color;
    ctx.fillRect(legendX - 120, legendY - 10, 10, 10);
    ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--text');
    ctx.fillText(label, legendX - 104, legendY - 1);
  });

  ctx.textAlign = 'left';
  ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--muted');
  ctx.font = '11px var(--font)';
  ctx.fillText('Tipos de señal', chartLeft, height - 4);
}

function drawEmptyChartPlaceholder(ctx, width, height, needsSelection = false) {
  const textColor = getComputedStyle(document.body).getPropertyValue('--text');
  const mutedColor = getComputedStyle(document.body).getPropertyValue('--muted');
  const lineColor = getComputedStyle(document.body).getPropertyValue('--line');
  const chartLeft = 68;
  const chartRight = 20;
  const chartTop = 52;
  const chartBottom = 52;
  const innerWidth = width - chartLeft - chartRight;
  const innerHeight = height - chartTop - chartBottom;
  const bars = 12;

  ctx.save();
  ctx.strokeStyle = lineColor;
  ctx.lineWidth = 1;
  ctx.textAlign = 'right';
  ctx.font = '12px var(--font)';

  for (let i = 0; i <= 4; i += 1) {
    const y = chartTop + (innerHeight / 4) * i;
    ctx.beginPath();
    ctx.moveTo(chartLeft, y);
    ctx.lineTo(chartLeft + innerWidth, y);
    ctx.stroke();
    ctx.fillStyle = mutedColor;
    ctx.fillText(String(Math.round((4 - i) * 1)), chartLeft - 10, y + 4);
  }

  for (let i = 0; i < bars; i += 1) {
    const x = chartLeft + (innerWidth / bars) * i;
    ctx.beginPath();
    ctx.moveTo(x, chartTop);
    ctx.lineTo(x, chartTop + innerHeight);
    ctx.stroke();
  }

  const xLabels = SIGNAL_KEYS.map((key) => signalLabel(key).replace(/^Báscula\s*/i, ''));
  ctx.textAlign = 'center';
  ctx.fillStyle = mutedColor;
  xLabels.forEach((label, index) => {
    const x = chartLeft + ((innerWidth / xLabels.length) * index) + innerWidth / xLabels.length / 2;
    ctx.fillText(label, x, height - 24);
  });

  const placeholderBars = [
    { x: chartLeft + innerWidth * 0.18, h: innerHeight * 0.28, color: '#61d8b9' },
    { x: chartLeft + innerWidth * 0.34, h: innerHeight * 0.5, color: '#6ea8ff' },
    { x: chartLeft + innerWidth * 0.5, h: innerHeight * 0.22, color: '#f6c177' },
    { x: chartLeft + innerWidth * 0.66, h: innerHeight * 0.42, color: '#b57bff' }
  ];

  placeholderBars.forEach((bar) => {
    ctx.fillStyle = bar.color;
    ctx.globalAlpha = 0.18;
    ctx.fillRect(bar.x, chartTop + innerHeight - bar.h, 18, bar.h);
  });

  ctx.globalAlpha = 1;
  ctx.fillStyle = textColor;
  ctx.font = '600 15px var(--font)';
  ctx.textAlign = 'center';
  ctx.fillText(needsSelection ? 'Selecciona uno o varios sensores para comparar su actividad' : 'Sin datos suficientes para generar la comparativa', width / 2, height / 2 - 4);
  ctx.fillStyle = mutedColor;
  ctx.font = '13px var(--font)';
  ctx.fillText('La gráfica se activará cuando haya eventos de los sensores elegidos.', width / 2, height / 2 + 18);
  ctx.fillStyle = mutedColor;
  ctx.font = '11px var(--font)';
  ctx.textAlign = 'left';
  ctx.fillText('Tipos de señal', chartLeft, height - 4);
  ctx.save();
  ctx.translate(18, chartTop + innerHeight / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText('Volumen de eventos', 0, 0);
  ctx.restore();
  ctx.restore();
  ctx.textAlign = 'start';
}

function filterEvents(events, filters) {
  return events.filter((event) =>
    filters.every((filter) => {
      if (!filter || !filter.field || !filter.op) return true;
      const value = filter.value;

      if (filter.field === 'hasGps') {
        const hasGps = Number.isFinite(event.gps?.latitude) && Number.isFinite(event.gps?.longitude);
        return filter.op === 'yes' ? hasGps : !hasGps;
      }

      const fieldValue = getEventFieldValue(event, filter.field);

      if (fieldValue === null || fieldValue === undefined || fieldValue === '') {
        return false;
      }

      if (filter.field === 'receivedAt') {
        const eventTime = new Date(fieldValue).getTime();
        const compareTime = new Date(value).getTime();
        if (Number.isNaN(eventTime) || Number.isNaN(compareTime)) return false;
        if (filter.op === 'after') return eventTime >= compareTime;
        if (filter.op === 'before') return eventTime <= compareTime;
        return true;
      }

      if (['battery', 'gpioState'].includes(filter.field)) {
        const numberValue = Number(fieldValue);
        const compare = Number(value);
        if (Number.isNaN(numberValue) || Number.isNaN(compare)) return false;
        return compareNumber(numberValue, compare, filter.op);
      }

      const text = String(fieldValue).toLowerCase();
      const needle = String(value || '').toLowerCase();
      if (!needle) return true;

      switch (filter.op) {
        case 'equals':
          return text === needle;
        case 'not_equals':
          return text !== needle;
        case 'starts':
          return text.startsWith(needle);
        case 'ends':
          return text.endsWith(needle);
        default:
          return text.includes(needle);
      }
    })
  );
}

function getEventFieldValue(event, field) {
  if (field === 'signal') return event.signal;
  if (field === 'coords') return formatGps(event);
  if (field === 'truckId') return event.truckId || event.deviceId;
  if (field === 'event') return event.event;
  if (field === 'reason') return event.reason;
  if (field === 'battery') return event.battery;
  if (field === 'gpioState') return event.gpioState;
  if (field === 'receivedAt') return event.receivedAt;
  if (field === 'hasGps') return Number.isFinite(event.gps?.latitude) && Number.isFinite(event.gps?.longitude);
  return event[field];
}

function compareNumber(left, right, op) {
  switch (op) {
    case 'equals':
      return left === right;
    case 'not_equals':
      return left !== right;
    case 'gt':
      return left > right;
    case 'gte':
      return left >= right;
    case 'lt':
      return left < right;
    case 'lte':
      return left <= right;
    default:
      return left === right;
  }
}

function getFilterOperators(field) {
  const map = {
    signal: ['contains', 'equals', 'not_equals'],
    deviceId: ['contains', 'equals', 'starts', 'ends'],
    truckId: ['contains', 'equals', 'starts', 'ends'],
    event: ['contains', 'equals', 'starts', 'ends'],
    reason: ['contains', 'equals', 'starts', 'ends'],
    gpioState: ['equals', 'not_equals'],
    battery: ['equals', 'not_equals', 'gt', 'gte', 'lt', 'lte'],
    receivedAt: ['after', 'before'],
    hasGps: ['yes', 'no']
  };
  return map[field] || ['contains', 'equals'];
}

function operatorLabel(op) {
  return {
    contains: 'Contiene',
    equals: 'Igual a',
    not_equals: 'Distinto de',
    starts: 'Empieza por',
    ends: 'Termina en',
    gt: 'Mayor que',
    gte: 'Mayor o igual',
    lt: 'Menor que',
    lte: 'Menor o igual',
    after: 'Después de',
    before: 'Antes de',
    yes: 'Sí',
    no: 'No'
  }[op] || op;
}

function addFilterRow(filter = { id: crypto.randomUUID(), field: 'signal', op: 'contains', value: '' }) {
  state.filters.push(filter);
  saveFilters();
  renderFilters();
  applyCurrentFilters();
}

function updateFilterRow(id, patch) {
  state.filters = state.filters.map((filter) => (filter.id === id ? { ...filter, ...patch } : filter));
  saveFilters();
  renderFilters();
  applyCurrentFilters();
}

function removeFilterRow(id) {
  state.filters = state.filters.filter((filter) => filter.id !== id);
  if (!state.filters.length) {
    state.filters = [{ id: crypto.randomUUID(), field: 'signal', op: 'contains', value: '' }];
  }
  saveFilters();
  renderFilters();
  applyCurrentFilters();
}

function clearFilters() {
  state.filters = [{ id: crypto.randomUUID(), field: 'signal', op: 'contains', value: '' }];
  saveFilters();
  renderFilters();
  applyCurrentFilters();
}

function renderFilters() {
  elements.filterBuilder.innerHTML = state.filters
    .map((filter) => {
      const operators = getFilterOperators(filter.field);
      const inputType = filter.field === 'receivedAt' ? 'date' : ['battery', 'gpioState'].includes(filter.field) ? 'number' : 'text';
      const options = FIELD_OPTIONS.map(
        (option) => `<option value="${option.value}" ${option.value === filter.field ? 'selected' : ''}>${option.label}</option>`
      ).join('');
      const operatorOptions = operators
        .map((operator) => `<option value="${operator}" ${operator === filter.op ? 'selected' : ''}>${operatorLabel(operator)}</option>`)
        .join('');
      const valueControl = buildFilterValueControl(filter, inputType);

      return `
        <div class="filter-row" data-filter-id="${filter.id}">
          <select data-role="field">${options}</select>
          <select data-role="op">${operatorOptions}</select>
          ${valueControl}
          <button class="remove-filter" data-role="remove" type="button">x</button>
        </div>
      `;
    })
    .join('');

  elements.filterBuilder.querySelectorAll('.filter-row').forEach((row) => {
    const id = row.dataset.filterId;
    const fieldSelect = row.querySelector('[data-role="field"]');
    const opSelect = row.querySelector('[data-role="op"]');
    const valueControl = row.querySelector('[data-role="value"]');
    const removeButton = row.querySelector('[data-role="remove"]');

    fieldSelect.addEventListener('change', () => {
      const field = fieldSelect.value;
      const ops = getFilterOperators(field);
      updateFilterRow(id, {
        field,
        op: ops[0],
        value: field === 'hasGps' ? 'yes' : ''
      });
    });

    opSelect.addEventListener('change', () => updateFilterRow(id, { op: opSelect.value }));
    if (valueControl) {
      valueControl.addEventListener('input', () => updateFilterRow(id, { value: valueControl.value }));
      valueControl.addEventListener('change', () => updateFilterRow(id, { value: valueControl.value }));
    }
    removeButton.addEventListener('click', () => removeFilterRow(id));
  });

  renderFilterChips();
  renderTableColumns();
}

function buildFilterValueControl(filter, inputType) {
  if (filter.field === 'signal') {
    const options = Object.keys(SIGNAL_LABELS)
      .map((signalKey) => `<option value="${signalKey}" ${signalKey === filter.value ? 'selected' : ''}>${SIGNAL_LABELS[signalKey]}</option>`)
      .join('');
    return `<select data-role="value">${['<option value="">Selecciona señal</option>', options].join('')}</select>`;
  }

  if (filter.field === 'hasGps') {
    return `
      <select data-role="value">
        <option value="yes" ${String(filter.value || 'yes') === 'yes' ? 'selected' : ''}>Sí</option>
        <option value="no" ${String(filter.value) === 'no' ? 'selected' : ''}>No</option>
      </select>
    `;
  }

  const placeholder = filter.field === 'receivedAt' ? 'Fecha' : 'Valor';
  return `<input data-role="value" type="${inputType}" value="${escapeHtml(filter.value ?? '')}" placeholder="${placeholder}" />`;
}

function renderFilterChips() {
  const activeFilters = state.filters.filter((filter) => filter.value || filter.field === 'hasGps');
  elements.filterChips.innerHTML = activeFilters.length
    ? activeFilters
        .map((filter) => {
          const valueText = filter.field === 'hasGps' ? operatorLabel(filter.op) : filter.value;
          return `
            <span class="chip">
              <span>${filter.field} ${operatorLabel(filter.op)} ${escapeHtml(String(valueText || ''))}</span>
              <button type="button" data-filter-id="${filter.id}">x</button>
            </span>
          `;
        })
        .join('')
    : '<span class="muted">Sin filtros activos</span>';

  elements.filterChips.querySelectorAll('button[data-filter-id]').forEach((button) => {
    button.addEventListener('click', () => removeFilterRow(button.dataset.filterId));
  });
}

function setColumnOrder(order) {
  state.columns = order.filter((key) => COLUMN_DEFS.some((column) => column.key === key));
  COLUMN_DEFS.forEach((column) => {
    if (!state.columns.includes(column.key)) {
      state.columns.push(column.key);
    }
  });
  saveColumns();
  renderHistory();
  renderTableColumns();
}

function removeColumn(key) {
  const visible = getVisibleSet();
  if (visible.size <= 1) return;
  visible.delete(key);
  setVisibleSet(visible);
  renderHistory();
  renderTableColumns();
}

function addColumn(key) {
  if (!key) return;
  const visible = getVisibleSet();
  visible.add(key);
  setVisibleSet(visible);
  renderHistory();
  renderTableColumns();
}

function getVisibleColumns() {
  const visibleSet = getVisibleSet();
  return state.columns.filter((key) => visibleSet.has(key));
}

function renderTableColumns() {
  const visibleSet = getVisibleSet();
  const visibleColumns = state.columns.filter((key) => visibleSet.has(key));
  const hiddenColumns = state.columns.filter((key) => !visibleSet.has(key));

  const headCells = visibleColumns
    .map((key) => {
      const column = COLUMN_DEFS.find((item) => item.key === key);
      return `
        <th class="history-th" draggable="true" data-column-key="${key}">
          <div class="history-th-inner">
            <span class="history-th-label">${column.label}</span>
            <span class="history-th-actions">
              <button class="mini-action remove" type="button" data-action="remove" title="Quitar columna">x</button>
            </span>
          </div>
        </th>
      `;
    })
    .join('');

  const addCell = hiddenColumns.length
    ? `
      <th class="history-th history-th-add-cell">
        <button class="history-th-add" type="button" data-action="menu-toggle" title="Mostrar columnas ocultas">+</button>
      </th>
    `
    : '';

  elements.historyHead.innerHTML = `<tr>${headCells}${addCell}</tr>`;

  elements.historyHead.querySelectorAll('th.history-th').forEach((node) => {
    if (node.classList.contains('history-th-add-cell')) {
      const toggleBtn = node.querySelector('[data-action="menu-toggle"]');
      toggleBtn?.addEventListener('click', (event) => {
        event.stopPropagation();
        openColumnDialog();
      });
      return;
    }

    const key = node.dataset.columnKey;
    const removeBtn = node.querySelector('[data-action="remove"]');

    node.addEventListener('dragstart', () => {
      state.dragColumnKey = key;
      node.classList.add('dragging');
    });

    node.addEventListener('dragend', () => {
      state.dragColumnKey = null;
      node.classList.remove('dragging');
      elements.historyHead.querySelectorAll('th.history-th').forEach((item) => item.classList.remove('drag-over'));
    });

    node.addEventListener('dragover', (event) => {
      event.preventDefault();
      if (state.dragColumnKey && state.dragColumnKey !== key) {
        node.classList.add('drag-over');
      }
    });

    node.addEventListener('dragleave', () => node.classList.remove('drag-over'));
    node.addEventListener('drop', (event) => {
      event.preventDefault();
      const sourceKey = state.dragColumnKey;
      if (!sourceKey || sourceKey === key) return;
      const order = [...state.columns];
      const sourceIndex = order.indexOf(sourceKey);
      const targetIndex = order.indexOf(key);
      if (sourceIndex === -1 || targetIndex === -1) return;
      order.splice(sourceIndex, 1);
      order.splice(targetIndex, 0, sourceKey);
      setColumnOrder(order);
    });

    removeBtn?.addEventListener('click', (event) => {
      event.stopPropagation();
      removeColumn(key);
    });
  });

  if (elements.historyColumnMenu) {
    elements.historyColumnMenu.innerHTML = hiddenColumns.length
      ? `
        <div class="history-column-menu-head">
          <strong>Columnas ocultas</strong>
        <button type="button" class="history-column-menu-close" aria-label="Cerrar">&times;</button>
        </div>
        <div class="history-column-menu-list">
          ${hiddenColumns
            .map((key) => {
              const column = COLUMN_DEFS.find((item) => item.key === key);
              return `
                <button class="history-column-menu-item" type="button" data-action="add" data-column-key="${key}">
                  <span>${column.label}</span>
                  <span class="mini-action">+</span>
                </button>
              `;
            })
            .join('')}
        </div>
      `
      : '<div class="muted">No hay columnas quitadas.</div>';

    elements.historyColumnMenu.hidden = true;
    const closeButton = elements.historyColumnMenu.querySelector('.history-column-menu-close');
    closeButton?.addEventListener('click', () => {
      elements.historyColumnMenu.hidden = true;
    });
    elements.historyColumnMenu.querySelectorAll('[data-action="add"]').forEach((button) => {
      button.addEventListener('click', () => addColumn(button.dataset.columnKey));
    });
  }
}

function renderColumnDialog() {
  if (!elements.columnDialogList || !elements.columnDialogAdd) return;

  const visibleSet = getVisibleSet();
  const hiddenColumns = state.columns.filter((key) => !visibleSet.has(key));
  state.columnDialogSelected = new Set([...state.columnDialogSelected].filter((key) => hiddenColumns.includes(key)));

  elements.columnDialogList.innerHTML = hiddenColumns.length
    ? hiddenColumns
        .map((key) => {
          const column = COLUMN_DEFS.find((item) => item.key === key);
          const checkboxId = `column-dialog-${key}`;
          const checked = state.columnDialogSelected.has(key) ? 'checked' : '';
          return `
            <label class="column-dialog-item" for="${checkboxId}">
              <input id="${checkboxId}" type="checkbox" value="${key}" ${checked} />
              <span class="column-dialog-item-label">${column.label}</span>
              <span class="column-dialog-item-note">Oculta</span>
            </label>
          `;
        })
        .join('')
    : '<div class="column-dialog-empty">No hay columnas ocultas.</div>';

  const selectedCount = state.columnDialogSelected.size;
  elements.columnDialogAdd.hidden = selectedCount === 0;
  elements.columnDialogAdd.disabled = selectedCount === 0;
  elements.columnDialogAdd.textContent = selectedCount > 1 ? `Añadir ${selectedCount}` : 'Añadir';
}

function openColumnDialog() {
  if (!elements.columnDialog) return;
  state.columnDialogSelected = new Set();
  renderColumnDialog();
  if (typeof elements.columnDialog.showModal === 'function') {
    elements.columnDialog.showModal();
  } else {
    elements.columnDialog.setAttribute('open', '');
  }
  window.requestAnimationFrame(() => {
    elements.columnDialogList?.querySelector('input[type="checkbox"]')?.focus();
  });
}

function closeColumnDialog() {
  if (!elements.columnDialog) return;
  state.columnDialogSelected = new Set();
  if (elements.columnDialog.open) {
    elements.columnDialog.close();
  } else {
    elements.columnDialog.removeAttribute('open');
  }
}

function renderHistory() {
  const visibleColumns = getVisibleColumns();
  if (!visibleColumns.length) {
    elements.eventsTable.innerHTML = `<tr><td colspan="${Math.max(COLUMN_DEFS.length, 1)}" class="muted">No hay columnas visibles.</td></tr>`;
    elements.historyCount.textContent = `${state.filteredEvents.length} eventos visibles`;
    return;
  }

  elements.eventsTable.innerHTML = state.filteredEvents
    .map((event) => {
      const cells = visibleColumns
        .map((key) => `<td>${escapeHtml(String(formatCell(event, key)))}</td>`)
        .join('');
      return `<tr>${cells}</tr>`;
    })
    .join('');

  elements.historyCount.textContent = `${state.filteredEvents.length} eventos visibles`;
}

function applyCurrentFilters() {
  const completeFilters = state.filters.filter((filter) => {
    if (filter.field === 'hasGps') return !!filter.op;
    return filter.value !== undefined && String(filter.value).trim() !== '';
  });

  state.filteredEvents = filterEvents(state.historyEvents, completeFilters);
  renderHistory();
}

function renderTracker(trailPoints = []) {
  const visiblePoints = trailPoints.filter((event) => getGpsLat(event) !== null && getGpsLng(event) !== null);
  const trail = visiblePoints.slice(-100);
  state.trail = trail;
  drawTrailMap(trail);

  elements.trailList.innerHTML = trail.length
    ? trail
        .slice()
        .reverse()
        .map((event) => {
          const coords = formatGps(event);
          return `
            <div class="mini-item">
              <strong>${formatDate(event.receivedAt)}</strong>
              <div>${coords}</div>
              <small>${signalLabel(event.signal)} | ${event.deviceId} | ${event.reason || 'GPS_FIX'}</small>
            </div>
          `;
        })
        .join('')
    : '<div class="mini-item"><strong>Sin puntos</strong><small>No hay posiciones GPS guardadas</small></div>';
}

function drawTrailMap(points) {
  if (!elements.gpsMap) return;

  if (!window.L) {
    elements.gpsMap.innerHTML = '<div class="mini-item"><strong>Mapa no disponible</strong><small>No se ha podido cargar Leaflet/OpenStreetMap.</small></div>';
    elements.trailCount.textContent = '0 puntos';
    elements.boundsInfo.textContent = 'Mapa no disponible';
    return;
  }

  if (!state.gpsMapInstance) {
    state.gpsMapInstance = L.map(elements.gpsMap, {
      zoomControl: true,
      scrollWheelZoom: true
    }).setView([40.4168, -3.7038], 6);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap'
    }).addTo(state.gpsMapInstance);
  }

  state.gpsMarkers.forEach((marker) => marker.remove());
  state.gpsMarkers = [];
  if (state.gpsPolyline) {
    state.gpsPolyline.remove();
    state.gpsPolyline = null;
  }

  if (!points.length) {
    elements.trailCount.textContent = '0 puntos';
    elements.boundsInfo.textContent = 'Sin datos';
    return;
  }

  const latLngs = points.map((point) => [getGpsLat(point), getGpsLng(point)]);
  state.gpsPolyline = L.polyline(latLngs, {
    color: getComputedStyle(document.body).getPropertyValue('--accent').trim() || '#61d8b9',
    weight: 4,
    opacity: 0.9
  }).addTo(state.gpsMapInstance);

  points.forEach((point, index) => {
    const isLatest = index === points.length - 1;
    const icon = L.divIcon({
      className: '',
      html: `<span class="${isLatest ? 'gps-latest-marker' : 'gps-point-marker'}"></span>`,
      iconSize: isLatest ? [28, 28] : [12, 12],
      iconAnchor: isLatest ? [14, 14] : [6, 6]
    });
    const marker = L.marker(latLngs[index], { icon })
      .bindPopup(`
        <div class="gps-popup">
          <strong>${escapeHtml(formatDate(point.receivedAt))}</strong>
          <div>${escapeHtml(formatGps(point))}</div>
          <small>${escapeHtml(point.reason || signalLabel(point.signal))}</small>
        </div>
      `)
      .addTo(state.gpsMapInstance);
    state.gpsMarkers.push(marker);
  });

  state.gpsMapInstance.fitBounds(L.latLngBounds(latLngs), {
    padding: [32, 32],
    maxZoom: 17
  });

  const lats = latLngs.map(([lat]) => lat);
  const lngs = latLngs.map(([, lng]) => lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);

  elements.trailCount.textContent = `${points.length} puntos`;
  elements.boundsInfo.textContent = `${minLat.toFixed(4)}, ${minLng.toFixed(4)} -> ${maxLat.toFixed(4)}, ${maxLng.toFixed(4)}`;
}

function exportCsv() {
  const visibleColumns = getVisibleColumns();
  const headers = visibleColumns.map((key) => (COLUMN_DEFS.find((column) => column.key === key) || { label: key }).label);
  const rows = [headers.join(',')];

  state.filteredEvents.forEach((event) => {
    const line = visibleColumns
      .map((key) => csvEscape(formatCell(event, key)))
      .join(',');
    rows.push(line);
  });

  const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `budisa-historico-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}

async function refresh() {
  try {
    const [summary, events, devices] = await Promise.all([
      requestJson('/api/summary'),
      requestJson('/api/events/search?limit=1000'),
      requestJson('/api/devices').catch(() => [])
    ]);

    state.summary = summary;
    state.allEvents = events || [];
    state.historyEvents = state.allEvents.filter((event) => event.signal !== 'control_heartbeat' && event.signal !== 'gps');
    state.heartbeatEvents = state.allEvents.filter((event) => event.signal === 'control_heartbeat');
    state.devices = devices || [];
    state.latestEvent = summary.latestEvent || state.historyEvents[0] || null;
    state.trackerDeviceId = state.latestEvent?.truckId || state.latestEvent?.deviceId || state.devices[0]?.deviceId || state.trackerDeviceId;

    elements.apiStatus.textContent = 'Conectado';
    renderSummary();
    drawSignalChart();
    applyCurrentFilters();

    const trail = await requestJson(`/api/trail/${encodeURIComponent(state.trackerDeviceId)}?limit=100`);
    renderTracker(trail || []);
  } catch (error) {
    elements.apiStatus.textContent = 'Sin conexión';
    console.error(error);
  }
}

function setupListeners() {
  elements.navMenu.addEventListener('click', (event) => {
    const button = event.target.closest('.nav-item');
    if (!button) return;
    setView(button.dataset.view);
  });

  elements.themeToggleInput.addEventListener('change', () => {
    state.theme = elements.themeToggleInput.checked ? 'night' : 'day';
    applyTheme();
  });

  elements.addFilterBtn.addEventListener('click', () => addFilterRow());
  elements.clearFiltersBtn.addEventListener('click', clearFilters);
  elements.resetColumnsBtn.addEventListener('click', () => {
    state.columns = COLUMN_DEFS.map((column) => column.key);
    localStorage.removeItem(STORAGE_KEYS.visibleColumns);
    saveColumns();
    renderHistory();
    renderTableColumns();
  });
  elements.exportCsvBtn.addEventListener('click', exportCsv);

  elements.sensorSelect?.addEventListener('change', () => {
    if (elements.sensorSelect.value) {
      addSensor(elements.sensorSelect.value);
      elements.sensorSelect.value = '';
    }
  });
  elements.addSensorBtn?.addEventListener('click', () => {
    if (elements.sensorSelect?.value) {
      addSensor(elements.sensorSelect.value);
      elements.sensorSelect.value = '';
    }
  });

  elements.columnDialogClose?.addEventListener('click', closeColumnDialog);
  elements.columnDialogCancel?.addEventListener('click', closeColumnDialog);
  elements.columnDialog?.addEventListener('cancel', (event) => {
    event.preventDefault();
    closeColumnDialog();
  });
  elements.columnDialog?.addEventListener('click', (event) => {
    if (event.target === elements.columnDialog) {
      closeColumnDialog();
    }
  });
  elements.columnDialogList?.addEventListener('change', (event) => {
    const input = event.target.closest?.('input[type="checkbox"]');
    if (!input) return;
    if (input.checked) {
      state.columnDialogSelected.add(input.value);
    } else {
      state.columnDialogSelected.delete(input.value);
    }
    renderColumnDialog();
  });
  elements.columnDialogAdd?.addEventListener('click', () => {
    if (!state.columnDialogSelected.size) return;
    [...state.columnDialogSelected].forEach((key) => addColumn(key));
    closeColumnDialog();
  });

  window.addEventListener('resize', () => {
    if (state.summary) {
      drawSignalChart();
    }
    if (state.trail.length) {
      state.gpsMapInstance?.invalidateSize();
      drawTrailMap(state.trail);
    }
  });
}

function boot() {
  applyTheme();
  setView(state.view);
  renderFilters();
  renderTableColumns();
  setupListeners();
  refresh();
  state.refreshTimer = setInterval(refresh, 8000);
}

function csvEscape(value) {
  const text = String(value ?? '');
  if (/[",\n]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`;
  }
  return text;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

boot();



