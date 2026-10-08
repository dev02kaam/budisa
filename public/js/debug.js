(() => {
  const el = (id) => document.getElementById(id);
  const state = { items: [], nextCursor: null, before: '', date: '', imei: '',
    request: null, detailRequest: null, loaded: false, error: '', updatedAt: null,
    packet: null, packetId: '', trigger: null };
  const escape = (value) => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
  const dateTime = (value) => value ? new Date(value).toLocaleString('es-ES', {
    timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
  }) : 'Sin fecha';
  const result = (packet) => packet.statusCode < 300 ? 'Aceptado' : (packet.code || 'Rechazado');

  function render() {
    el('debugRefresh').disabled = Boolean(state.request);
    el('debugOlder').disabled = Boolean(state.request);
    el('debugLatest').disabled = Boolean(state.request);
    el('debugPacketList').setAttribute('aria-busy', String(Boolean(state.request)));
    el('debugUpdateStatus').classList.toggle('is-error', Boolean(state.error));
    el('debugUpdateStatus').textContent = state.error
      ? `${state.error} Pulsa Actualizar para reintentar.${state.loaded ? ' Se mantienen los últimos datos cargados.' : ''}`
      : state.request ? 'Consultando recepciones…'
      : `Actualizado: ${dateTime(state.updatedAt)} · ${state.before ? 'Consultando envíos anteriores.' : 'Actualización automática cada 5 s.'}`;
    el('debugLatest').hidden = !state.before;
    el('debugOlder').hidden = !state.nextCursor;
    el('debugPageSummary').textContent = state.loaded ? `${state.items.length} envíos en esta página` : '';
    // Keep the clicked row and keyboard focus in place when polling returns identical data.
    const markup = state.items.length ? state.items.map((packet) => `
      <button class="debug-packet-row" type="button" data-debug-id="${escape(packet._id)}" aria-haspopup="dialog">
        <time data-label="Recepción">${escape(dateTime(packet.receivedAt))}</time>
        <span class="debug-identity" data-label="Tracker / IMEI">${escape(packet.imei || 'Sin identificar')}<small>${packet.transport === 'tcp' ? 'TCP local' : 'Gateway HTTPS'}</small></span>
        <span data-label="Registros">${packet.accepted} / ${packet.recordCount}<small>aceptados / recibidos</small></span>
        <span data-label="Resultado"><span class="state-badge ${packet.statusCode < 300 ? 'is-approved' : 'is-debug-rejected'}">${escape(result(packet))}</span><small>${packet.transport === 'https' ? 'HTTP ' : 'Código '}${packet.statusCode}</small></span>
        <span class="debug-packet-action">Abrir paquete <span aria-hidden="true">→</span></span>
      </button>`).join('') : `<div class="empty-state"><strong>${state.request ? 'Cargando envíos…' : state.error ? 'No se pueden consultar los envíos' : 'Todavía no hay envíos'}</strong><p>${state.date || state.imei ? 'No hay recepciones que coincidan con estos filtros.' : 'Las nuevas recepciones aparecerán aquí, también cuando sean rechazadas.'}</p></div>`;
    const list = el('debugPacketList');
    if (list.innerHTML !== markup) {
      const focusedPacketId = list.contains(document.activeElement)
        ? document.activeElement.closest('[data-debug-id]')?.dataset.debugId : null;
      list.innerHTML = markup;
      if (focusedPacketId) (findPacketButton(focusedPacketId) || el('debugDate')).focus();
    }
  }

  function findPacketButton(id) {
    return [...el('debugPacketList').querySelectorAll('[data-debug-id]')]
      .find((button) => button.dataset.debugId === id);
  }

  async function load({ automatic = false } = {}) {
    if (state.request || (automatic && state.before)) return;
    const controller = new AbortController();
    state.request = controller;
    state.error = '';
    const query = new URLSearchParams();
    if (state.imei) query.set('imei', state.imei);
    if (state.date) query.set('date', state.date);
    if (state.before) query.set('before', state.before);
    render();
    try {
      const data = await window.requestJson(`/api/tracker/debug?${query}`, { signal: controller.signal });
      if (state.request !== controller) return;
      state.items = data.items;
      state.nextCursor = data.nextCursor;
      state.loaded = true;
      state.updatedAt = new Date();
    } catch (error) {
      if (state.request !== controller || error.name === 'AbortError' || error.status === 401) return;
      state.error = error.message;
    } finally {
      if (state.request === controller) { state.request = null; render(); }
    }
  }

  function changePage(before = '') {
    state.request?.abort();
    state.request = null;
    state.before = before;
    state.items = [];
    state.nextCursor = null;
    state.loaded = false;
    load();
  }

  async function openPacket(id, trigger) {
    state.detailRequest?.abort();
    const controller = new AbortController();
    state.detailRequest = controller;
    state.packet = null;
    state.packetId = id;
    state.trigger = trigger || state.trigger;
    el('debugPacketContent').hidden = true;
    el('debugPacketRetry').hidden = true;
    el('debugPacketStatus').textContent = 'Cargando el paquete completo…';
    el('debugPacketTitle').textContent = 'Paquete del tracker';
    el('debugPacketMeta').textContent = 'Recepción registrada';
    if (!el('debugPacketDialog').open) el('debugPacketDialog').showModal();
    try {
      const packet = await window.requestJson(`/api/tracker/debug/${encodeURIComponent(id)}`, { signal: controller.signal });
      if (state.detailRequest !== controller) return;
      state.packet = packet;
      el('debugPacketTitle').textContent = packet.imei || 'Tracker sin identificar';
      el('debugPacketMeta').textContent = `${dateTime(packet.receivedAt)} · Europe/Madrid`;
      const fields = [
        ['Resultado', `${result(packet)} · ${packet.statusCode}`],
        ['Registros aceptados / recibidos', `${packet.accepted} / ${packet.recordCount}`],
        ['Origen', packet.transport === 'tcp' ? 'TCP local' : 'Gateway HTTPS'],
        ['Recepción en gateway', packet.gatewayReceivedAt ? dateTime(packet.gatewayReceivedAt) : 'No disponible'],
        ['Identificador del paquete', packet.packetId || 'No disponible'],
        ...(packet.diagnosticCode ? [['Diagnóstico', packet.diagnosticCode]] : [])
      ];
      el('debugPacketSummary').innerHTML = fields.map(([label, value]) => `<div><dt>${escape(label)}</dt><dd>${escape(value)}</dd></div>`).join('');
      el('debugPayload').textContent = packet.payload === null ? (packet.rawBody || 'Sin cuerpo JSON disponible.') : JSON.stringify(packet.payload, null, 2);
      el('debugResponse').textContent = JSON.stringify(packet.response, null, 2);
      el('debugRawBody').textContent = packet.rawBody || 'Sin cuerpo disponible.';
      el('debugRawFrame').textContent = packet.rawFrameHex || '';
      el('debugFrameSection').hidden = !packet.rawFrameHex;
      el('debugCopy').disabled = !packet.rawBody;
      el('debugCopy').textContent = 'Copiar JSON';
      el('debugPacketStatus').textContent = '';
      el('debugPacketContent').hidden = false;
    } catch (error) {
      if (state.detailRequest !== controller || error.name === 'AbortError' || error.status === 401) return;
      el('debugPacketStatus').textContent = error.message;
      el('debugPacketRetry').hidden = false;
    } finally {
      if (state.detailRequest === controller) state.detailRequest = null;
    }
  }

  function closePacket() {
    state.detailRequest?.abort();
    state.detailRequest = null;
    state.packet = null;
    el('debugPacketDialog').close();
    const trigger = findPacketButton(state.packetId)
      || (state.trigger?.isConnected ? state.trigger : null) || el('debugDate');
    trigger.focus();
  }

  function reset() {
    state.request?.abort();
    state.request = null;
    closePacket();
    state.items = [];
    state.nextCursor = null;
    state.before = '';
    state.loaded = false;
    state.error = '';
    state.updatedAt = null;
    el('debugPacketList').replaceChildren();
    // Clear received payloads when the private session ends.
    ['debugPayload', 'debugResponse', 'debugRawBody', 'debugRawFrame', 'debugPacketSummary'].forEach((id) => el(id).textContent = '');
  }

  el('debugRefresh').addEventListener('click', () => load());
  el('debugFilters').addEventListener('submit', (event) => {
    event.preventDefault();
    state.date = el('debugDate').value;
    state.imei = el('debugImei').value.trim();
    changePage();
  });
  el('debugClear').addEventListener('click', () => {
    el('debugFilters').reset();
    state.date = '';
    state.imei = '';
    changePage();
  });
  el('debugOlder').addEventListener('click', () => changePage(state.nextCursor));
  el('debugLatest').addEventListener('click', () => changePage());
  el('debugPacketList').addEventListener('click', (event) => {
    const button = event.target.closest('[data-debug-id]');
    if (button) openPacket(button.dataset.debugId, button);
  });
  el('debugPacketRetry').addEventListener('click', () => openPacket(state.packetId));
  el('debugPacketClose').addEventListener('click', closePacket);
  el('debugPacketDialog').addEventListener('cancel', (event) => { event.preventDefault(); closePacket(); });
  el('debugPacketDialog').addEventListener('click', (event) => { if (event.target === el('debugPacketDialog')) closePacket(); });
  el('debugCopy').addEventListener('click', async () => {
    if (!state.packet) return;
    const packet = state.packet;
    try {
      await navigator.clipboard.writeText(packet.rawBody);
      if (state.packet === packet) el('debugPacketStatus').textContent = 'JSON original copiado.';
    } catch {
      if (state.packet === packet) el('debugPacketStatus').textContent = 'No se ha podido copiar. Puedes seleccionar el texto del paquete y copiarlo.';
    }
  });
  window.trackerDebug = { load, reset };
})();
