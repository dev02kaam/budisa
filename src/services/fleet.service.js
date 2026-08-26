const Tracker = require('../models/Tracker');
const TrackerPoint = require('../models/TrackerPoint');

const ONLINE_WINDOW_MS = 15 * 60 * 1000;
const STALE_WINDOW_MS = 60 * 60 * 1000;

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
    timeZone: 'Europe/Madrid',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date).reduce((result, part) => {
    result[part.type] = part.value;
    return result;
  }, {});
  return `${parts.year}-${parts.month}-${parts.day}`;
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

async function getLatestPoints(imeis) {
  if (!imeis.length) return new Map();
  const rows = await TrackerPoint.aggregate([
    { $match: { deviceId: { $in: imeis } } },
    { $addFields: { _fleetSortAt: { $ifNull: ['$positionAt', '$receivedAt'] } } },
    { $sort: { _fleetSortAt: -1, receivedAt: -1 } },
    { $group: { _id: '$deviceId', point: { $first: '$$ROOT' } } }
  ]);
  return new Map(rows.map((row) => [row._id, row.point]));
}

async function getFleet() {
  const trackers = await Tracker.find().sort({ name: 1, imei: 1 }).lean();
  const latestByImei = await getLatestPoints(trackers.map((tracker) => tracker.imei));

  return trackers.map((tracker) => {
    const latest = latestByImei.get(tracker.imei) || null;
    const gpsFix = Boolean(latest && latest.metadata?.gpsValid !== false && validCoordinates(latest));
    return {
      imei: tracker.imei,
      name: tracker.name || '',
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
            speedKph: Number(latest.gps.speed || 0),
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
    return TrackerPoint.find(query).sort({ positionAt: 1, receivedAt: 1 }).limit(limit).lean();
  }

  const latest = await TrackerPoint.find(query).sort({ positionAt: -1, receivedAt: -1 }).limit(limit).lean();
  return latest.reverse();
}

async function getTrackerDays(filters = {}, limit = 500) {
  const query = {
    'gps.latitude': { $ne: null },
    'gps.longitude': { $ne: null },
    'metadata.gpsValid': { $ne: false }
  };
  if (filters.imei) query.deviceId = filters.imei;

  const points = await TrackerPoint.find(query)
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
      speed: Number(point.gps?.speed || 0)
    };
    const group = groups.get(key) || {
      date,
      imei,
      pointCount: 0,
      startAt: timestamp,
      endAt: timestamp,
      maxSpeedKph: 0,
      distanceMeters: 0,
      ordered: []
    };

    group.pointCount += 1;
    if (timestamp < group.startAt) group.startAt = timestamp;
    if (timestamp > group.endAt) group.endAt = timestamp;
    group.maxSpeedKph = Math.max(group.maxSpeedKph, Number.isFinite(item.speed) ? item.speed : 0);
    group.ordered.push(item);
    groups.set(key, group);
  });

  const grouped = [...groups.values()];
  const trackers = await Tracker.find({ imei: { $in: grouped.map((group) => group.imei) } })
    .select({ imei: 1, name: 1, licensePlate: 1 })
    .lean();
  const trackersByImei = new Map(trackers.map((tracker) => [tracker.imei, tracker]));

  return grouped
    .map((group) => {
      group.ordered.sort((left, right) => left.timestamp - right.timestamp);
      for (let index = 1; index < group.ordered.length; index += 1) {
        group.distanceMeters += haversineDistanceMeters(group.ordered[index - 1], group.ordered[index]);
      }
      const { ordered, ...summary } = group;
      const tracker = trackersByImei.get(group.imei);
      return {
        ...summary,
        name: tracker?.name || '',
        licensePlate: tracker?.licensePlate || '',
        durationSeconds: Math.max(0, Math.round((group.endAt - group.startAt) / 1000))
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
