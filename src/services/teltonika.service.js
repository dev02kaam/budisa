const crypto = require('crypto');
const { ingestGatewayPacket } = require('./tracker-gateway.service');

function isUsableGps(gps) {
  return Number.isFinite(gps.latitude)
    && Number.isFinite(gps.longitude)
    && gps.latitude >= -90
    && gps.latitude <= 90
    && gps.longitude >= -180
    && gps.longitude <= 180
    && !(gps.latitude === 0 && gps.longitude === 0);
}

function digestFor(...values) {
  const hash = crypto.createHash('sha256');
  values.forEach((value) => hash.update(Buffer.isBuffer(value) ? value : String(value)));
  return hash.digest('hex');
}

function buildDirectPayload({ imei, codecId, records }) {
  const receivedAt = new Date();
  return {
    schemaVersion: 1,
    source: 'teltonika-gateway',
    device: {
      imei,
      manufacturer: 'Teltonika',
      model: 'FTC880'
    },
    packet: {
      packetId: digestFor(imei, codecId, ...records.map((record) => record.raw)),
      codec: codecId === 0x8e ? '8E' : String(codecId),
      recordCount: records.length,
      receivedAt: receivedAt.toISOString()
    },
    records: records.map((record, index) => ({
      eventId: digestFor(imei, record.raw),
      index,
      timestampMs: record.timestamp.getTime(),
      priority: record.priority,
      gps: {
        latitude: record.gps.latitude,
        longitude: record.gps.longitude,
        altitudeM: record.gps.altitude,
        angleDeg: record.gps.angle,
        satellites: record.gps.satellites,
        valid: isUsableGps(record.gps)
      },
      io: {
        eventId: record.eventIoId,
        raw: record.io,
        known: {}
      }
    }))
  };
}

async function ingestPacket(packet) {
  try {
    return await ingestGatewayPacket(buildDirectPayload(packet));
  } catch (error) {
    if (error?.code === 'UNKNOWN_DEVICE') return 0;
    throw error;
  }
}

module.exports = { buildDirectPayload, ingestPacket, isUsableGps };
