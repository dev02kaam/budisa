const Tracker = require('../models/Tracker');
const TrackerPoint = require('../models/TrackerPoint');

const ONLINE_WINDOW_MS = 15 * 60 * 1000;
const STALE_WINDOW_MS = 60 * 60 * 1000;
const MAX_MOVEMENT_INTERVAL_MS = 15 * 60 * 1000;
const TIPPER_ANGLE_THRESHOLD_DEG = 25;
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

function booleanState(value) {
  if (value === true || value === 1) return true;
  if (value === false || value === 0) return false;
  const normalized = String(value ?? '').trim().toLowerCase();
  if (['true', 'on', 'active', 'raised', 'open', 'yes'].includes(normalized)) return true;
  if (['false', 'off', 'inactive', 'lowered', 'closed', 'no'].includes(normalized)) return false;
  return null;
}

function tipperState(point) {
  const known = point?.metadata?.knownIo;
  if (!known || typeof known !== 'object') return null;

  const stateKeys = [
    'tipperRaised',
    'tipperActive',
    'bodyRaised',
    'bedRaised',
    'dumpBodyRaised',
    'basculating',
    'tiltAlert'
  ];
  for (const key of stateKeys) {
    if (!(key in known)) continue;
    const raised = booleanState(known[key]);
    if (raised !== null) return { raised };
  }

  const angleKeys = ['tipperAngleDeg', 'tiltAngleDeg', 'eyeAngleDeg', 'bedAngleDeg', 'bodyAngleDeg'];
  for (const key of angleKeys) {
    if (!(key in known)) continue;
    const angle = Number(known[key]);
    if (Number.isFinite(angle)) return { raised: Math.abs(angle) >= TIPPER_ANGLE_THRESHOLD_DEG };
  }

  return null;
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
      latestPosition: gpsFix
        ? {
            latitude: Number(latest.gps.latitude),
            longitude: Number(latest.gps.longitude),
            altitudeM: Number(latest.gps.altitude || 0),
            headingDeg: Number(latest.gps.heading || 0),
            satellites: Number(latest.metadata?.satellites || 0),
            ignition: latest.metadata?.ignition ?? null,
            movement: latest.metadata?.movement ?? null,
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
  const query = {
    'gps.latitude': { $ne: null },
    'gps.longitude': { $ne: null },
    'metadata.gpsValid': { $ne: false }
  };
  if (filters.imei) query.deviceId = filters.imei;
  if (filters.from || filters.to) query.positionAt = buildMadridDayRange(filters);

  const points = await TrackerPoint.find(query)
    .select({ deviceId: 1, positionAt: 1, receivedAt: 1, gps: 1, metadata: 1 })
    .sort({ positionAt: -1, receivedAt: -1 })
    .limit(100000)
    .lean();
  const groups = new Map();

  points.forEach((point) => {
    const timestamp = pointDate(point);
    const latitude = Number(point.gps?.latitude);
    const longitude = Number(point.gps?.longitude);
    if (!timestamp || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return;

    const imei = String(point.metadata?.imei || point.deviceId || '');
    if (!/^\d{15}$/.test(imei)) return;
    const date = dayKeyFor(timestamp);
    if (filters.from && date < filters.from) return;
    if (filters.to && date > filters.to) return;

    const key = `${imei}|${date}`;
    const item = {
      timestamp,
      latitude,
      longitude,
      movement: booleanState(point.metadata?.movement),
      tipper: tipperState(point)
    };
    const group = groups.get(key) || {
      date,
      imei,
      pointCount: 0,
      startAt: timestamp,
      endAt: timestamp,
      movementSeconds: 0,
      distanceMeters: 0,
      tipEvents: [],
      ordered: []
    };

    group.pointCount += 1;
    if (timestamp < group.startAt) group.startAt = timestamp;
    if (timestamp > group.endAt) group.endAt = timestamp;
    group.ordered.push(item);
    groups.set(key, group);
  });

  const grouped = [...groups.values()];
  const trackers = await Tracker.find({ imei: { $in: grouped.map((group) => group.imei) } })
    .select({ imei: 1, licensePlate: 1 })
    .lean();
  const trackersByImei = new Map(trackers.map((tracker) => [tracker.imei, tracker]));

  return grouped
    .map((group) => {
      group.ordered.sort((left, right) => left.timestamp - right.timestamp);
      let previousTipperRaised = null;
      for (let index = 1; index < group.ordered.length; index += 1) {
        const previous = group.ordered[index - 1];
        const current = group.ordered[index];
        group.distanceMeters += haversineDistanceMeters(previous, current);
        const intervalMs = current.timestamp - previous.timestamp;
        if (previous.movement === true && intervalMs > 0) {
          group.movementSeconds += Math.round(Math.min(intervalMs, MAX_MOVEMENT_INTERVAL_MS) / 1000);
        }
      }
      group.ordered.forEach((item) => {
        if (!item.tipper) return;
        if (item.tipper.raised && previousTipperRaised !== true) {
          group.tipEvents.push({
            timestamp: item.timestamp,
            latitude: item.latitude,
            longitude: item.longitude
          });
        }
        previousTipperRaised = item.tipper.raised;
      });
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

module.exports = {
  connectionStatus,
  getFleet,
  getTrackerDays,
  getTrackerPoints,
  haversineDistanceMeters
};
