(() => {
  // FTC887 AVL definitions: https://wiki.teltonika-gps.com/view/FTC887_Teltonika_Data_Sending_Parameters_ID
  const ANGLE_KEYS = ['tipperAngleDeg', 'tiltAngleDeg', 'eyeAngleDeg', 'bedAngleDeg', 'bodyAngleDeg'];
  const STATE_KEYS = ['tipperRaised', 'tipperActive', 'bodyRaised', 'bedRaised', 'dumpBodyRaised', 'basculating', 'tiltAlert'];
  const SENSOR_IDS = {
    roll: [10832, 10833, 10834, 10835, 13480, 13481, 13482, 13483, 13484, 13485],
    pitch: [10816, 10817, 10818, 10819, 13474, 13475, 13476, 13477, 13478, 13479],
    lowBattery: [10820, 10821, 10822, 10823, 13253, 13254, 13255, 13256, 13257, 13258],
    temperature: [25, 26, 27, 28, 13227, 13228, 13229, 13230, 13231, 13232],
    humidity: [86, 104, 106, 108, 525, 13335, 13336, 13337, 13338, 13339],
    voltage: [29, 20, 22, 23, 523, 13222, 13223, 13224, 13225, 13226],
    signal: [13233, 13234, 13235, 13236, 13237, 13238, 13239, 13240, 13241, 13242]
  };
  const object = (value) => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const number = (value) => (typeof value === 'number' || (typeof value === 'string' && value.trim()))
    && Number.isFinite(Number(value)) ? Number(value) : null;
  const text = (value) => typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value ?? 'No enviado');
  const format = (value, decimals = 3) => value.toLocaleString('es-ES', { maximumFractionDigits: decimals, useGrouping: false });
  const unit = (value, suffix, scale = 1, decimals = 3) => {
    const parsed = number(value);
    return parsed === null ? (value == null ? 'No enviado' : `Dato no válido: ${text(value)}`) : `${format(parsed * scale, decimals)} ${suffix}`;
  };
  function boolean(value) {
    if (typeof value === 'string') value = value.trim().toLowerCase();
    if ([true, 1, '1', 'true', 'on', 'active', 'raised', 'open', 'yes'].includes(value)) return true;
    if ([false, 0, '0', 'false', 'off', 'inactive', 'lowered', 'closed', 'no'].includes(value)) return false;
    return null;
  }
  const yesNo = (value, yes, no) => boolean(value) === true ? yes : boolean(value) === false ? no : 'No enviado o no válido';
  function signed(value, bits) {
    let parsed = number(value);
    if (parsed === null || !Number.isInteger(parsed)) return null;
    if (parsed >= 2 ** (bits - 1) && parsed < 2 ** bits) parsed -= 2 ** bits;
    return parsed;
  }
  function angle(value, bits, limit) {
    const parsed = signed(value, bits);
    return parsed === null || Math.abs(parsed) > limit ? `Sin ángulo válido (valor recibido: ${text(value)})` : `${format(parsed)}°`;
  }
  function timestamp(record) {
    const ms = number(record.timestampMs);
    const date = ms !== null ? new Date(ms) : typeof record.timestamp === 'string' ? new Date(record.timestamp) : null;
    return date && Number.isFinite(date.getTime()) ? date.toISOString() : null;
  }

  function hasGpsPosition(input) {
    const record = object(input), gps = object(record.gps), io = object(record.io);
    const known = object(io.known), raw = object(io.raw);
    const gnss = number(known.gnssStatus ?? raw[69]);
    const lat = number(gps.latitude), lon = number(gps.longitude);
    const validCoordinates = lat !== null && lon !== null && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 && !(lat === 0 && lon === 0);
    return validCoordinates && boolean(gps.valid) !== false && gnss !== 0 && gnss !== 2 && gnss !== 3
      && (boolean(gps.valid) === true || gnss === 1 || number(gps.satellites) > 0);
  }

  // Shared with server filtering: a reading is not proof that a tipping cycle occurred.
  function classify(payload) {
    const records = object(payload).records;
    if (!Array.isArray(records)) return [];
    let gps = false, tipper = false;
    for (const input of records) {
      const record = object(input), io = object(record.io), known = object(io.known), raw = object(io.raw);
      gps ||= hasGpsPosition(record);
      tipper ||= STATE_KEYS.some((key) => boolean(known[key]) !== null)
        || ANGLE_KEYS.some((key) => number(known[key]) !== null && Math.abs(number(known[key])) <= 180)
        || [['roll', 16, 180], ['pitch', 8, 90]].some(([kind, bits, limit]) => SENSOR_IDS[kind].some((id) => {
          const degrees = signed(raw[id], bits);
          return degrees !== null && Math.abs(degrees) <= limit;
        }));
      if (gps && tipper) break;
    }
    return [...(gps ? ['gps'] : []), ...(tipper ? ['tipper'] : [])];
  }

  function summarizeRecord(input) {
    const record = object(input), gps = object(record.gps), io = object(record.io);
    const raw = object(io.raw), known = object(io.known);
    const usedRaw = new Set(), usedKnown = new Set();
    const read = (keys, ids = []) => {
      keys.forEach((key) => usedKnown.add(key));
      ids.forEach((id) => usedRaw.add(String(id)));
      for (const key of keys) if (known[key] != null) return known[key];
      for (const id of ids) if (raw[id] != null) return raw[id];
      return null;
    };
    const row = (label, value, note = '') => ({ label, value, note });
    const sections = [], sensors = [];
    let eyePresent = false, bluetoothPresent = false;
    for (let index = 0; index < 10; index++) {
      const rows = [];
      for (const [kind, ids] of Object.entries(SENSOR_IDS)) {
        const id = ids[index];
        usedRaw.add(String(id));
        if (!Object.hasOwn(raw, id)) continue;
        const value = raw[id];
        if (['roll', 'pitch', 'lowBattery'].includes(kind)) eyePresent = true;
        else bluetoothPresent = true;
        if (kind === 'roll') rows.push(row('Inclinación lateral (Roll)', angle(value, 16, 180)));
        if (kind === 'pitch') rows.push(row('Inclinación adelante / atrás (Pitch)', angle(value, 8, 90)));
        if (kind === 'lowBattery') rows.push(row('Aviso de batería baja del sensor', yesNo(value, 'Sí, batería baja', 'No hay aviso de batería baja')));
        if (kind === 'temperature') {
          const temperature = signed(value, 16);
          rows.push(row('Temperatura del sensor', temperature !== null && temperature >= -400 && temperature <= 1250
            ? unit(temperature, '°C', 0.1, 1) : `Sin temperatura válida (valor recibido: ${text(value)})`));
        }
        if (kind === 'humidity') rows.push(row('Humedad del sensor', unit(value, '%', 0.1, 1)));
        if (kind === 'voltage') rows.push(row('Batería del sensor Bluetooth', unit(value, 'V', 0.001)));
        if (kind === 'signal') rows.push(row('Señal Bluetooth', unit(signed(value, 8), 'dBm')));
      }
      if (rows.length) sensors.push({ title: `Sensor ${index + 1}`, rows });
    }
    // Additional EYE-only I/O may arrive without an angle.
    const eyeExtras = [
      [10808, 'Imán del EYE 1'], [10809, 'Imán del EYE 2'], [10810, 'Imán del EYE 3'], [10811, 'Imán del EYE 4'],
      [10836, 'Movimientos del EYE 1'], [10837, 'Movimientos del EYE 2'], [10838, 'Movimientos del EYE 3'], [10839, 'Movimientos del EYE 4'],
      [10840, 'Activaciones del imán del EYE 1'], [10841, 'Activaciones del imán del EYE 2'], [10842, 'Activaciones del imán del EYE 3'], [10843, 'Activaciones del imán del EYE 4']
    ];
    const extraEyeRows = eyeExtras.filter(([id]) => Object.hasOwn(raw, id)).map(([id, label]) => {
      usedRaw.add(String(id)); eyePresent = true;
      return row(label, id <= 10811 ? yesNo(raw[id], 'Detectado', 'No detectado') : text(raw[id]));
    });
    if (extraEyeRows.length) sensors.push({ title: 'Más datos del EYE', rows: extraEyeRows });
    const normalizedAngle = read(ANGLE_KEYS);
    if (normalizedAngle !== null) {
      const parsed = number(normalizedAngle);
      const explicitEye = ANGLE_KEYS.find((key) => known[key] != null) === 'eyeAngleDeg';
      if (explicitEye) eyePresent = true;
      sensors.push({ title: explicitEye ? 'Inclinación del EYE' : 'Inclinación recibida', rows: [row('Ángulo de inclinación',
        parsed !== null && Math.abs(parsed) <= 180 ? `${format(parsed)}°` : `Sin ángulo válido (valor recibido: ${text(normalizedAngle)})`,
        explicitEye ? '' : 'El envío no identifica qué sensor mide este ángulo.')] });
    }
    const raised = read(STATE_KEYS);
    if (raised !== null) sensors.push({ title: 'Basculación', rows: [row('Aviso recibido', yesNo(raised, 'Activo: cajón levantado', 'Inactivo: cajón bajado'))] });

    const satellites = number(gps.satellites);
    read(['gnssStatus'], [69]);
    const lat = number(gps.latitude), lon = number(gps.longitude);
    const validCoordinates = lat !== null && lon !== null && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 && !(lat === 0 && lon === 0);
    const fix = hasGpsPosition(record);
    const ignition = read(['ignition'], [239]);
    const movement = read(['movement'], [240]);
    const speed = number(gps.speedKph);
    const location = validCoordinates ? `Latitud ${format(lat, 7)} · Longitud ${format(lon, 7)}` : 'Sin coordenadas válidas';
    sections.push({ title: 'GPS y vehículo', rows: [
      row('Ubicación GPS', fix ? 'Posición disponible' : 'Sin posición GPS confirmada', satellites !== null ? `${format(satellites, 0)} satélites recibidos` : 'No se indica el número de satélites.'),
      row('Coordenadas', location, !fix && validCoordinates ? 'Se conservan los valores recibidos, pero no hay una posición GPS confirmada.' : ''),
      row('Velocidad', unit(gps.speedKph, 'km/h'), speed === 0 ? 'El GPS indica que está parado.' : ''),
      row('Movimiento', yesNo(movement, 'En movimiento', 'Sin movimiento detectado')),
      row('Contacto', yesNo(ignition, 'Activado', 'Desactivado'), 'Es el estado de contacto detectado por el tracker; no confirma por sí solo que el motor esté arrancado.'),
      row('Altitud', unit(gps.altitudeM, 'm'), 'Altura indicada por el GPS.'),
      row('Rumbo GPS', unit(gps.angleDeg, '°'), 'Dirección del vehículo. Este ángulo no mide la inclinación del EYE.'),
      row('Odómetro del tracker', unit(read(['totalOdometerM'], [16]), 'km', 0.001), 'Distancia acumulada que registra el localizador; puede diferir del cuentakilómetros del vehículo.')
    ] });
    const energyRows = [
      row('Alimentación externa', unit(read(['externalVoltageMv'], [800, 66]), 'V', 0.001), 'Tensión que recibe el tracker del vehículo.'),
      row('Batería interna del tracker', unit(read(['batteryVoltageMv'], [67]), 'V', 0.001), 'Esta batería pertenece al tracker, no al EYE.'),
      row('Corriente de batería', unit(read(['batteryCurrentMa'], [68]), 'mA'))
    ];
    const gsm = read(['gsmSignal'], [21]);
    energyRows.push(row('Cobertura móvil', gsm == null ? 'No enviada' : `${text(gsm)} de 5`, 'Intensidad de señal recibida.'));
    energyRows.push(row('Operador móvil', text(read(['gsmOperatorCode'], [241])), 'Código de la red móvil utilizada.'));
    const sleep = number(read(['sleepMode'], [200]));
    energyRows.push(row('Modo del tracker', sleep === null ? 'No enviado' : ({ 0: 'Normal, sin reposo', 3: 'Reposo con conexión', 4: 'Reposo profundo', 5: 'Reposo con apagado' }[sleep] || `Modo recibido: ${sleep}`)));
    const pdop = read(['gnssPdop'], [181]), hdop = read(['gnssHdop'], [182]);
    if (pdop !== null || hdop !== null) energyRows.push(row('Indicadores de calidad GPS', `PDOP: ${text(pdop)} · HDOP: ${text(hdop)}`, 'Valores tal como llegan en el envío. Son indicadores de calidad, no una distancia de error en metros.'));
    sections.push({ title: 'Alimentación y conexión', rows: energyRows });
    const otherRows = [
      ...Object.entries(raw).filter(([id]) => !usedRaw.has(id)).map(([id, value]) => row(`Dato adicional del tracker (ID ${id})`, text(value))),
      ...Object.entries(known).filter(([key]) => !usedKnown.has(key)).map(([key, value]) => row(`Otro dato recibido: ${key}`, text(value)))
    ];
    if (otherRows.length) sections.push({ title: 'Otros datos recibidos', rows: otherRows });
    return {
      timestamp: timestamp(record), eyePresent,
      eyeMessage: eyePresent ? 'Se reciben datos del EYE Sensor en esta lectura.'
        : bluetoothPresent ? 'Hay datos de sensores Bluetooth, pero esta lectura no identifica al EYE.' : 'No llegan lecturas del EYE Sensor en esta lectura.',
      eyeNote: eyePresent ? 'Los ángulos disponibles se muestran abajo. Si no aparece un ángulo, no se ha recibido una medida válida de ese eje.'
        : 'Esto no confirma que esté desconectado: el paquete no incluye sus lecturas.',
      sensors, sections
    };
  }

  function summarize(payload) {
    const data = object(payload);
    return Array.isArray(data.records) ? data.records.map(summarizeRecord) : [];
  }
  const api = { summarize, classify };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else window.trackerPacketSummary = api;
})();
