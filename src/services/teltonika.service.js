const crypto = require('crypto');
const eventService = require('./event.service');
const { normalizePayload } = require('../utils/telemetry');

function isUsableGps(gps) {
  return Number.isFinite(gps.latitude)
    && Number.isFinite(gps.longitude)
    && gps.latitude >= -90
    && gps.latitude <= 90
    && gps.longitude >= -180
    && gps.longitude <= 180
    && !(gps.latitude === 0 && gps.longitude === 0);
}

function eventIdFor(imei, record) {
  const digest = crypto
    .createHash('sha256')
    .update(imei)
    .update(record.raw)
    .digest('hex')
    .slice(0, 32);

  return `teltonika-${imei}-${digest}`;
}

async function saveRecord(imei, codecId, record) {
  if (!isUsableGps(record.gps)) {
    return;
  }

  const payload = normalizePayload({
    eventId: eventIdFor(imei, record),
    truckId: imei,
    event: 'gps',
    lat: record.gps.latitude,
    lon: record.gps.longitude,
    altitude: record.gps.altitude,
    speed: record.gps.speed,
    heading: record.gps.angle,
    gpsTimestamp: record.timestamp.toISOString(),
    locationSource: 'gps',
    locationProvider: 'Teltonika FTC880',
    source: 'teltonika_ftc880',
    metadata: {
      imei,
      codecId,
      priority: record.priority,
      satellites: record.gps.satellites,
      eventIoId: record.eventIoId,
      io: record.io
    }
  });

  try {
    await eventService.createEvent(payload);
  } catch (error) {
    if (error?.code !== 11000) {
      throw error;
    }
  }
}

async function ingestPacket({ imei, codecId, records }) {
  for (const record of records) {
    await saveRecord(imei, codecId, record);
  }

  return records.length;
}

module.exports = { ingestPacket, isUsableGps };
