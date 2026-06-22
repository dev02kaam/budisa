const STORAGE_KEYS = {
  theme: 'budisa-theme',
  view: 'budisa-view',
  filters: 'budisa-filters',
  columns: 'budisa-history-columns',
  visibleColumns: 'budisa-visible-columns'
};

const COLUMN_DEFS = [
  { key: 'receivedAt', label: 'Fecha' },
  { key: 'deviceId', label: 'Dispositivo' },
  { key: 'truckId', label: 'Truck' },
  { key: 'signal', label: 'Señal' },
  { key: 'event', label: 'Evento' },
  { key: 'gpioState', label: 'GPIO' },
  { key: 'coords', label: 'GPS' },
  { key: 'battery', label: 'Bateria' },
  { key: 'reason', label: 'Motivo' }
];

const FIELD_OPTIONS = [
  { value: 'signal', label: 'Señal' },
  { value: 'deviceId', label: 'Dispositivo' },
  { value: 'truckId', label: 'Truck' },
  { value: 'event', label: 'Evento' },
  { value: 'reason', label: 'Motivo' },
  { value: 'gpioState', label: 'GPIO' },
  { value: 'battery', label: 'Bateria' },
  { value: 'receivedAt', label: 'Fecha' },
  { value: 'hasGps', label: 'Tiene GPS' }
];

const SIGNAL_LABELS = {
  bascula_subida: 'Bascula subida',
  bascula_bajada: 'Bascula bajada',
  bascula_levantada: 'Bascula levantada',
  estado_estable: 'Estado estable',
  alerta: 'Alerta'
};

const state = {
  theme: localStorage.getItem(STORAGE_KEYS.theme) || 'night',
  view: localStorage.getItem(STORAGE_KEYS.view) || 'dashboard',
  summary: null,
  allEvents: [],
  filteredEvents: [],
  latestEvent: null,
  trail: [],
  filters: loadFilters(),
  columns: loadColumns(),
  trackerDeviceId: 'raspberry-1',
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

function formatGps(event) {
  const lat = event.gps?.latitude;
  const lng = event.gps?.longitude;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
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
    historico: 'Historico inteligente',
    tracker: 'Tracker GPS'
  };

  elements.pageTitle.textContent = titles[view] || titles.dashboard;
  if (elements.pageIcon) {
    elements.pageIcon.className = `page-icon page-icon-${view}`;
    elements.pageIcon.innerHTML = VIEW_ICONS[view] || VIEW_ICONS.dashboard;
  }
  saveView();
}

function renderSummary() {
  if (!state.summary) return;
  elements.totalEvents.textContent = state.summary.totalEvents ?? 0;
  elements.deviceCount.textContent = state.summary.deviceCount ?? 0;
  elements.latestSignal.textContent = state.latestEvent ? signalLabel(state.latestEvent.signal) : '-';
  elements.latestCoords.textContent = state.latestEvent ? formatGps(state.latestEvent) : '-';
  elements.liveDevice.textContent = state.latestEvent?.deviceId || '-';
  elements.liveSignal.textContent = state.latestEvent ? signalLabel(state.latestEvent.signal) : '-';
  elements.liveTime.textContent = state.latestEvent ? formatDate(state.latestEvent.receivedAt) : '-';
  elements.liveBattery.textContent = state.latestEvent?.battery ?? '-';
}

function drawSignalChart(summary) {
  const canvas = elements.signalChart;
  if (!canvas || !summary) return;
  const ctx = canvas.getContext('2d');
  const ratio = window.devicePixelRatio || 1;
  const width = canvas.clientWidth || canvas.width;
  const height = canvas.clientHeight || canvas.height;
  canvas.width = width * ratio;
  canvas.height = height * ratio;
  ctx.resetTransform?.();
  ctx.scale(ratio, ratio);
  ctx.clearRect(0, 0, width, height);

  const values = [
    summary.signalCounts.bascula_subida || 0,
    summary.signalCounts.bascula_bajada || 0,
    summary.signalCounts.bascula_levantada || 0
  ];
  const labels = ['Subida', 'Bajada', 'Levantada'];
  const max = Math.max(1, ...values);
  const barWidth = (width - 120) / values.length;

  ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--text');
  ctx.font = '14px var(--font)';
  ctx.fillText('Actividad por tipo de señal', 16, 28);

  values.forEach((value, index) => {
    const x = 50 + index * barWidth;
    const h = ((height - 80) * value) / max;
    const y = height - 40 - h;
    const palette = ['#61d8b9', '#6ea8ff', '#f6c177'];
    ctx.fillStyle = palette[index];
    ctx.fillRect(x, y, barWidth * 0.48, h);
    ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--muted');
    ctx.fillText(labels[index], x - 4, height - 16);
    ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--text');
    ctx.fillText(String(value), x + 4, y - 8);
  });
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
    after: 'Despues de',
    before: 'Antes de',
    yes: 'Si',
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
        <option value="yes" ${String(filter.value || 'yes') === 'yes' ? 'selected' : ''}>Si</option>
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
          <button type="button" class="history-column-menu-close" aria-label="Cerrar">×</button>
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

  state.filteredEvents = filterEvents(state.allEvents, completeFilters);
  renderHistory();
}

function renderTracker(trailPoints = []) {
  const visiblePoints = trailPoints.filter((event) => Number.isFinite(event.gps?.latitude) && Number.isFinite(event.gps?.longitude));
  const trail = visiblePoints.slice(-30);
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
              <small>${signalLabel(event.signal)} | ${event.deviceId}</small>
            </div>
          `;
        })
        .join('')
    : '<div class="mini-item"><strong>Sin puntos</strong><small>No hay posiciones GPS guardadas</small></div>';
}

function drawTrailMap(points) {
  const svg = elements.gpsMap;
  const width = 400;
  const height = 320;
  const padding = 20;
  svg.innerHTML = '';

  for (let i = 0; i <= 8; i += 1) {
    const y = padding + ((height - padding * 2) / 8) * i;
    const x = padding + ((width - padding * 2) / 8) * i;
    svg.insertAdjacentHTML('beforeend', `<line x1="${padding}" y1="${y}" x2="${width - padding}" y2="${y}" stroke="rgba(255,255,255,0.08)" />`);
    svg.insertAdjacentHTML('beforeend', `<line x1="${x}" y1="${padding}" x2="${x}" y2="${height - padding}" stroke="rgba(255,255,255,0.08)" />`);
  }

  if (!points.length) {
    svg.insertAdjacentHTML('beforeend', `<text x="50%" y="50%" fill="var(--muted)" text-anchor="middle">Sin puntos GPS</text>`);
    elements.trailCount.textContent = '0 puntos';
    elements.boundsInfo.textContent = 'Sin datos';
    return;
  }

  const lats = points.map((point) => point.gps.latitude);
  const lngs = points.map((point) => point.gps.longitude);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const latSpan = maxLat - minLat || 1;
  const lngSpan = maxLng - minLng || 1;

  const path = points
    .map((point, index) => {
      const x = padding + ((point.gps.longitude - minLng) / lngSpan) * (width - padding * 2);
      const y = height - padding - ((point.gps.latitude - minLat) / latSpan) * (height - padding * 2);
      return `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(' ');

  svg.insertAdjacentHTML('beforeend', `<path d="${path}" fill="none" style="stroke: var(--accent); stroke-width: 3; stroke-linecap: round; stroke-linejoin: round;" />`);

  points.forEach((point, index) => {
    const x = padding + ((point.gps.longitude - minLng) / lngSpan) * (width - padding * 2);
    const y = height - padding - ((point.gps.latitude - minLat) / latSpan) * (height - padding * 2);
    svg.insertAdjacentHTML(
      'beforeend',
      `<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="${index === points.length - 1 ? 6 : 4}" style="fill: ${index === points.length - 1 ? 'var(--accent-2)' : 'var(--text)'};" />`
    );
  });

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
    const [summary, events] = await Promise.all([
      requestJson('/api/summary'),
      requestJson('/api/events/search?limit=1000'),
    ]);

    state.summary = summary;
    state.allEvents = events || [];
    state.latestEvent = summary.latestEvent || state.allEvents[0] || null;
    state.trackerDeviceId = state.latestEvent?.truckId || state.latestEvent?.deviceId || state.trackerDeviceId;

    elements.apiStatus.textContent = 'Conectado';
    renderSummary();
    drawSignalChart(summary);
    applyCurrentFilters();

    const trail = await requestJson(`/api/trail/${encodeURIComponent(state.trackerDeviceId)}?limit=30`);
    renderTracker(trail || []);
  } catch (error) {
    elements.apiStatus.textContent = 'Sin conexion';
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
      drawSignalChart(state.summary);
    }
    if (state.trail.length) {
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
