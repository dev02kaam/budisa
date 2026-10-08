const crypto = require('crypto');
const { ingestGatewayPacket } = require('./tracker-gateway.service');
const { recordTrackerReception } = require('./tracker-debug.service');

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
      model: ''
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
  const receivedAt = new Date();
  const payload = buildDirectPayload(packet);
  try {
    const accepted = await ingestGatewayPacket(payload);
    await recordTrackerReception({ payload, receivedAt, transport: 'tcp',
      rawFrameHex: packet.rawFrame?.toString('hex') || '',
      statusCode: 200, response: { ok: true, accepted } });
    return accepted;
  } catch (error) {
    await recordTrackerReception({ payload, receivedAt, transport: 'tcp',
      rawFrameHex: packet.rawFrame?.toString('hex') || '',
      statusCode: error.statusCode || 500, response: { ok: false, code: error.code || 'INGEST_ERROR' } });
    if (error?.code === 'UNKNOWN_DEVICE') return 0;
    throw error;
  }
}

module.exports = { buildDirectPayload, ingestPacket, isUsableGps };
