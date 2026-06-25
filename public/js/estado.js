(function () {
const STORAGE_KEYS = {
  filters: 'budisa-heartbeat-filters',
  columns: 'budisa-history-columns',
  visibleColumns: 'budisa-visible-columns'
};

const COLUMN_DEFS = [
  { key: 'receivedAt', label: 'Fecha' },
  { key: 'deviceId', label: 'Dispositivo' },
  { key: 'truckId', label: 'Truck' },
  { key: 'signal', label: 'Senal' },
  { key: 'event', label: 'Evento' },
  { key: 'gpioState', label: 'GPIO' },
  { key: 'coords', label: 'GPS' },
  { key: 'battery', label: 'Bateria' },
  { key: 'reason', label: 'Motivo' }
];

const FIELD_OPTIONS = [
  { value: 'signal', label: 'Senal' },
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
  gps: 'GPS',
  control_heartbeat: 'Heartbeat de servicio'
};

const state = {
  events: [],
  filteredEvents: [],
  filters: loadFilters()
};

const elements = {
  filterBuilder: document.getElementById('heartbeatFilterBuilder'),
  filterChips: document.getElementById('heartbeatFilterChips'),
  addFilterBtn: document.getElementById('heartbeatAddFilterBtn'),
  clearFiltersBtn: document.getElementById('heartbeatClearFiltersBtn'),
  resetColumnsBtn: document.getElementById('heartbeatResetColumnsBtn'),
  exportCsvBtn: document.getElementById('heartbeatExportCsvBtn'),
  head: document.getElementById('heartbeatHead'),
  table: document.getElementById('heartbeatEventsTable'),
  count: document.getElementById('heartbeatCount')
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

function saveFilters() {
  localStorage.setItem(STORAGE_KEYS.filters, JSON.stringify(state.filters));
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

function formatDate(value) {
  if (!value) return '-';
  return new Date(value).toLocaleString('es-ES');
}

function signalLabel(signal) {
  return SIGNAL_LABELS[signal] || signal || '-';
}

function formatGps(event) {
  const lat = event.gps?.latitude ?? event.lat;
  const lng = event.gps?.longitude ?? event.lon;
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

function buildFilterValueControl(filter, inputType) {
  if (filter.field === 'signal') {
    return `
      <select data-role="value">
        <option value="control_heartbeat" ${filter.value === 'control_heartbeat' ? 'selected' : ''}>Heartbeat de servicio</option>
      </select>
    `;
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

function addFilterRow(filter = { id: crypto.randomUUID(), field: 'signal', op: 'contains', value: '' }) {
  state.filters.push(filter);
  saveFilters();
  renderFilters();
  applyFilters();
}

function updateFilterRow(id, patch) {
  state.filters = state.filters.map((filter) => (filter.id === id ? { ...filter, ...patch } : filter));
  saveFilters();
  renderFilters();
  applyFilters();
}

function removeFilterRow(id) {
  state.filters = state.filters.filter((filter) => filter.id !== id);
  if (!state.filters.length) {
    state.filters = [{ id: crypto.randomUUID(), field: 'signal', op: 'contains', value: '' }];
  }
  saveFilters();
  renderFilters();
  applyFilters();
}

function clearFilters() {
  state.filters = [{ id: crypto.randomUUID(), field: 'signal', op: 'contains', value: '' }];
  saveFilters();
  renderFilters();
  applyFilters();
}

function renderFilters() {
  if (!elements.filterBuilder) return;
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
        value: field === 'hasGps' ? 'yes' : (field === 'signal' ? 'control_heartbeat' : '')
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
}

function renderFilterChips() {
  if (!elements.filterChips) return;
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

function renderTable() {
  if (!elements.head || !elements.table || !elements.count) return;
  const visibleSet = getVisibleSet();
  const visibleColumns = loadColumns().filter((key) => visibleSet.has(key));

  if (!visibleColumns.length) {
    elements.table.innerHTML = `<tr><td colspan="${Math.max(COLUMN_DEFS.length, 1)}" class="muted">No hay columnas visibles.</td></tr>`;
    elements.count.textContent = `${state.filteredEvents.length} heartbeats visibles`;
    return;
  }

  elements.head.innerHTML = `<tr>${visibleColumns
    .map((key) => {
      const column = COLUMN_DEFS.find((item) => item.key === key);
      return `<th class="history-th"><div class="history-th-inner"><span class="history-th-label">${column.label}</span></div></th>`;
    })
    .join('')}</tr>`;

  elements.table.innerHTML = state.filteredEvents
    .map((event) => {
      const cells = visibleColumns.map((key) => `<td>${escapeHtml(String(formatCell(event, key)))}</td>`).join('');
      return `<tr>${cells}</tr>`;
    })
    .join('');

  elements.count.textContent = `${state.filteredEvents.length} heartbeats visibles`;
}

function applyFilters() {
  const completeFilters = state.filters.filter((filter) => {
    if (filter.field === 'hasGps') return !!filter.op;
    return filter.value !== undefined && String(filter.value).trim() !== '';
  });

  state.filteredEvents = filterEvents(state.events, completeFilters);
  renderTable();
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

function exportCsv() {
  const visibleSet = getVisibleSet();
  const visibleColumns = loadColumns().filter((key) => visibleSet.has(key));
  const headers = visibleColumns.map((key) => (COLUMN_DEFS.find((column) => column.key === key) || { label: key }).label);
  const rows = [headers.join(',')];

  state.filteredEvents.forEach((event) => {
    const line = visibleColumns.map((key) => csvEscape(formatCell(event, key))).join(',');
    rows.push(line);
  });

  const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `budisa-heartbeat-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}

async function refresh() {
  try {
    state.events = await requestJson('/api/heartbeats?limit=1000');
    applyFilters();
  } catch (error) {
    console.error(error);
    if (elements.count) {
      elements.count.textContent = 'Sin conexion';
    }
  }
}

function setupListeners() {
  elements.addFilterBtn?.addEventListener('click', () => addFilterRow());
  elements.clearFiltersBtn?.addEventListener('click', clearFilters);
  elements.resetColumnsBtn?.addEventListener('click', () => {
    localStorage.removeItem(STORAGE_KEYS.columns);
    localStorage.removeItem(STORAGE_KEYS.visibleColumns);
    window.location.reload();
  });
  elements.exportCsvBtn?.addEventListener('click', exportCsv);
}

function boot() {
  renderFilters();
  setupListeners();
  refresh();
  setInterval(refresh, 8000);
}

boot();
})();
