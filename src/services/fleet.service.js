const Tracker = require('../models/Tracker');
const TrackerPoint = require('../models/TrackerPoint');
const { booleanState, tipperState, TIPPER_SIGNAL_QUERY } = require('../utils/tipper');

const ONLINE_WINDOW_MS = 15 * 60 * 1000;
const STALE_WINDOW_MS = 60 * 60 * 1000;
const MAX_MOVEMENT_INTERVAL_MS = 15 * 60 * 1000;
const MADRID_TIME_ZONE = 'Europe/Madrid';
const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const madridOffsetFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: MADRID_TIME_ZONE,
  timeZoneName: 'longOffset'
});

function toValidDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function pointDate(point) {
  return toValidDate(point.positionAt) || toValidDate(point.receivedAt);
}

function dayKeyFor(date) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: MADRID_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date).reduce((result, part) => {
    result[part.type] = part.value;
    return result;
  }, {});
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function badDateRange(message) {
  const error = new Error(message);
  error.code = 'INVALID_DATE_RANGE';
  error.statusCode = 400;
  return error;
}

function validDateKey(value) {
  if (!DATE_KEY_PATTERN.test(String(value || ''))) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
}

function nextDateKey(value) {
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

function madridOffsetMinutes(date) {
  const zone = madridOffsetFormatter.formatToParts(date).find((part) => part.type === 'timeZoneName')?.value || 'GMT+00:00';
  const match = zone.match(/^GMT([+-])(\d{2}):(\d{2})$/);
  if (!match) return 0;
  const minutes = Number(match[2]) * 60 + Number(match[3]);
  return match[1] === '-' ? -minutes : minutes;
}

function madridDayStart(value) {
  const [year, month, day] = value.split('-').map(Number);
  const localMidnightAsUtc = Date.UTC(year, month - 1, day);
  let instant = new Date(localMidnightAsUtc);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    instant = new Date(localMidnightAsUtc - madridOffsetMinutes(instant) * 60_000);
  }
  return instant;
}

function buildMadridDayRange(filters = {}) {
  if (filters.from && !validDateKey(filters.from)) {
    throw badDateRange('La fecha inicial debe tener formato AAAA-MM-DD.');
  }
  if (filters.to && !validDateKey(filters.to)) {
    throw badDateRange('La fecha final debe tener formato AAAA-MM-DD.');
  }
  if (filters.from && filters.to && filters.from > filters.to) {
    throw badDateRange('La fecha inicial no puede ser posterior a la fecha final.');
  }

  const range = {};
  if (filters.from) range.$gte = madridDayStart(filters.from);
  if (filters.to) range.$lt = madridDayStart(nextDateKey(filters.to));
  return range;
}

function haversineDistanceMeters(left, right) {
  const toRadians = (degrees) => (degrees * Math.PI) / 180;
  const earthRadius = 6371000;
  const deltaLatitude = toRadians(right.latitude - left.latitude);
  const deltaLongitude = toRadians(right.longitude - left.longitude);
  const latitude1 = toRadians(left.latitude);
  const latitude2 = toRadians(right.latitude);
  const a = Math.sin(deltaLatitude / 2) ** 2
    + Math.cos(latitude1) * Math.cos(latitude2) * Math.sin(deltaLongitude / 2) ** 2;
  return 2 * earthRadius * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function authorizationStatus(tracker) {
  if (tracker.approvalStatus) return tracker.approvalStatus;
  return tracker.enabled ? 'approved' : tracker.lastAttemptAt ? 'pending' : 'disabled';
}

function connectionStatus(tracker, now = Date.now()) {
  const approval = authorizationStatus(tracker);
  if (approval === 'pending') return 'pending';
  if (!tracker.enabled) return 'disabled';
  if (!tracker.lastSeenAt) return 'waiting';
  const ageMs = Math.max(0, now - new Date(tracker.lastSeenAt).getTime());
  if (ageMs <= ONLINE_WINDOW_MS) return 'online';
  if (ageMs <= STALE_WINDOW_MS) return 'stale';
  return 'offline';
}

function validCoordinates(point) {
  if (point?.gps?.latitude == null || point?.gps?.longitude == null) return false;
  const latitude = Number(point?.gps?.latitude);
  const longitude = Number(point?.gps?.longitude);
  return Number.isFinite(latitude)
    && Number.isFinite(longitude)
    && latitude >= -90
    && latitude <= 90
    && longitude >= -180
    && longitude <= 180
    && !(latitude === 0 && longitude === 0);
}

async function findTipperReading(imei, range, direction = -1, raised) {
  const cursor = TrackerPoint.find({
    deviceId: imei,
    ...TIPPER_SIGNAL_QUERY,
    ...(range ? { positionAt: range } : {})
  }).select({ positionAt: 1, receivedAt: 1, metadata: 1 })
    .sort({ positionAt: direction, receivedAt: direction, _id: direction }).lean().cursor();
  try {
    for await (const point of cursor) {
      const state = tipperState(point);
      if (state?.raised != null && (raised === undefined || state.raised === raised)) {
        return { ...state, timestamp: pointDate(point) };
      }
    }
    return null;
  } finally {
    await cursor.close();
  }
}

async function getLatestPoints(imeis) {
  if (!imeis.length) return new Map();
  const rows = await TrackerPoint.aggregate([
    { $match: { deviceId: { $in: imeis } } },
    { $sort: { deviceId: 1, positionAt: -1 } },
    { $group: { _id: '$deviceId', point: { $first: '$$ROOT' } } }
  ]);
  return new Map(rows.map((row) => [row._id, row.point]));
}

async function getFleet() {
  const trackers = await Tracker.find().sort({ licensePlate: 1, imei: 1 }).lean();
  const latestByImei = await getLatestPoints(trackers.map((tracker) => tracker.imei));
  const tipperByImei = new Map(await Promise.all(trackers.map(async (tracker) =>
    [tracker.imei, await findTipperReading(tracker.imei)])));

  return trackers.map((tracker) => {
    const latest = latestByImei.get(tracker.imei) || null;
    const gpsFix = Boolean(latest && latest.metadata?.gpsValid !== false && validCoordinates(latest));
    return {
      imei: tracker.imei,
      licensePlate: tracker.licensePlate || '',
      manufacturer: tracker.manufacturer,
      model: tracker.model,
      enabled: Boolean(tracker.enabled),
      authorizationStatus: authorizationStatus(tracker),
      connectionStatus: connectionStatus(tracker),
      gpsFix,
      firstSeenAt: tracker.firstSeenAt || tracker.createdAt || null,
      lastAttemptAt: tracker.lastAttemptAt || null,
      lastSeenAt: tracker.lastSeenAt || null,
      tipper: tipperByImei.get(tracker.imei) || null,
      latestPosition: gpsFix
        ? {
            latitude: Number(latest.gps.latitude),
            longitude: Number(latest.gps.longitude),
            altitudeM: Number(latest.gps.altitude || 0),
            headingDeg: Number(latest.gps.heading || 0),
            satellites: Number(latest.metadata?.satellites || 0),
            ignition: latest.metadata?.ignition ?? null,
            movement: latest.metadata?.movement ?? null,
            tipperRaised: tipperByImei.get(tracker.imei)?.raised ?? null,
            positionAt: latest.positionAt || latest.receivedAt
          }
        : null
    };
  });
}

async function getTrackerPoints(filters = {}, limit = 10000) {
  const query = {
    'gps.latitude': { $ne: null },
    'gps.longitude': { $ne: null },
    'metadata.gpsValid': { $ne: false }
  };

  if (filters.imei) query.deviceId = filters.imei;
  if (filters.from || filters.to) {
    const range = {};
    if (filters.from) range.$gte = new Date(filters.from);
    if (filters.to) range.$lt = new Date(filters.to);
    query.positionAt = range;
  }

  if (filters.from || filters.to) {
    return TrackerPoint.find(query)
      .select({ 'gps.speed': 0 })
      .sort({ positionAt: 1, receivedAt: 1 })
      .limit(limit)
      .lean();
  }

  const latest = await TrackerPoint.find(query)
    .select({ 'gps.speed': 0 })
    .sort({ positionAt: -1, receivedAt: -1 })
    .limit(limit)
    .lean();
  return latest.reverse();
}

async function getTrackerDays(filters = {}, limit = 500) {
  // Sensor readings remain useful even when the tracker has no GPS fix.
  const query = {};
  if (filters.imei) query.deviceId = filters.imei;
  if (filters.from || filters.to) query.positionAt = buildMadridDayRange(filters);

  const points = await TrackerPoint.find(query)
    .select({ deviceId: 1, positionAt: 1, receivedAt: 1, gps: 1, metadata: 1 })
    .sort({ positionAt: -1, receivedAt: -1, _id: -1 })
    .limit(100000)
    .lean();
  const groups = new Map();
  const byVehicle = new Map();

  points.reverse().forEach((point) => {
    const timestamp = pointDate(point);
    if (!timestamp) return;
    const gpsValid = point.metadata?.gpsValid !== false && validCoordinates(point);

    const imei = String(point.metadata?.imei || point.deviceId || '');
    if (!/^\d{15}$/.test(imei)) return;
    const date = dayKeyFor(timestamp);
    if (filters.from && date < filters.from) return;
    if (filters.to && date > filters.to) return;

    const key = `${imei}|${date}`;
    const item = {
      timestamp,
      latitude: gpsValid ? Number(point.gps.latitude) : null,
      longitude: gpsValid ? Number(point.gps.longitude) : null,
      gpsValid,
      movement: booleanState(point.metadata?.movement),
      tipper: tipperState(point)
    };
    const group = groups.get(key) || {
      date,
      imei,
      pointCount: 0,
      gpsPointCount: 0,
      startAt: timestamp,
      endAt: timestamp,
      movementSeconds: 0,
      distanceMeters: 0,
      tipEvents: [],
      ordered: []
    };

    group.pointCount += 1;
    if (gpsValid) group.gpsPointCount += 1;
    if (timestamp < group.startAt) group.startAt = timestamp;
    if (timestamp > group.endAt) group.endAt = timestamp;
    group.ordered.push(item);
    groups.set(key, group);
    const vehicle = byVehicle.get(imei) || [];
    vehicle.push({ ...item, group });
    byVehicle.set(imei, vehicle);
  });

  function closeTip(event, timestamp) {
    event.endAt = timestamp;
    event.durationSeconds = Math.max(0, Math.round((timestamp - event.timestamp) / 1000));
    event.status = 'completed';
  }

  // Pair readings by their device timestamps, across packets and civil-day boundaries.
  await Promise.all([...byVehicle].map(async ([imei, items]) => {
    const previous = await findTipperReading(imei, { $lt: items[0].timestamp });
    let raised = previous?.raised ?? null;
    let activeEvent = null;
    for (const item of items) {
      if (item.tipper?.raised == null) continue;
      if (item.tipper.raised && raised !== true) {
        activeEvent = {
          timestamp: item.timestamp,
          endAt: null,
          durationSeconds: null,
          status: 'active',
          latitude: item.latitude,
          longitude: item.longitude
        };
        item.group.tipEvents.push(activeEvent);
      } else if (!item.tipper.raised && activeEvent) {
        closeTip(activeEvent, item.timestamp);
        activeEvent = null;
      }
      raised = item.tipper.raised;
    }
    // Filtering to the start day must not hide a closing reading on the following day.
    if (activeEvent) {
      const closing = await findTipperReading(imei, { $gt: items[items.length - 1].timestamp }, 1, false);
      if (closing) closeTip(activeEvent, closing.timestamp);
    }
  }));

  const grouped = [...groups.values()];
  const trackers = await Tracker.find({ imei: { $in: grouped.map((group) => group.imei) } })
    .select({ imei: 1, licensePlate: 1 })
    .lean();
  const trackersByImei = new Map(trackers.map((tracker) => [tracker.imei, tracker]));

  return grouped
    .map((group) => {
      group.ordered.sort((left, right) => left.timestamp - right.timestamp);
      for (let index = 1; index < group.ordered.length; index += 1) {
        const previous = group.ordered[index - 1];
        const current = group.ordered[index];
        if (previous.gpsValid && current.gpsValid) group.distanceMeters += haversineDistanceMeters(previous, current);
        const intervalMs = current.timestamp - previous.timestamp;
        if (previous.movement === true && intervalMs > 0) {
          group.movementSeconds += Math.round(Math.min(intervalMs, MAX_MOVEMENT_INTERVAL_MS) / 1000);
        }
      }
      const { ordered, ...summary } = group;
      const tracker = trackersByImei.get(group.imei);
      return {
        ...summary,
        licensePlate: tracker?.licensePlate || ''
      };
    })
    .sort((left, right) => right.endAt - left.endAt)
    .slice(0, limit);
}

async function getTrackerDayRoute({ imei, date } = {}) {
  if (typeof imei !== 'string' || !/^\d{15}$/.test(imei)) {
    const error = new Error('Indica un IMEI válido para consultar el recorrido.');
    error.code = 'INVALID_IMEI';
    error.statusCode = 400;
    throw error;
  }
  if (typeof date !== 'string' || !validDateKey(date)) {
    throw badDateRange('Indica una jornada válida con formato AAAA-MM-DD.');
  }

  const maximumPoints = 100000;
  const points = await TrackerPoint.find({
    deviceId: imei,
    positionAt: buildMadridDayRange({ from: date, to: date }),
    'gps.latitude': { $ne: null },
    'gps.longitude': { $ne: null },
    'metadata.gpsValid': { $ne: false }
  })
    .select({ _id: 0, positionAt: 1, gps: 1 })
    .sort({ positionAt: 1, receivedAt: 1 })
    .limit(maximumPoints + 1)
    .lean();

  return {
    imei,
    date,
    truncated: points.length > maximumPoints,
    points: points.slice(0, maximumPoints).filter(validCoordinates).map((point) => ({
      timestamp: point.positionAt,
      latitude: point.gps.latitude,
      longitude: point.gps.longitude
    }))
  };
}

module.exports = {
  connectionStatus,
  getFleet,
  getTrackerDays,
  getTrackerDayRoute,
  getTrackerPoints,
  haversineDistanceMeters
};
