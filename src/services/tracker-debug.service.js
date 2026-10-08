const mongoose = require('mongoose');
const TrackerReception = require('../models/TrackerReception');
const { buildMadridDayRange } = require('./fleet.service');

function debugError(message, code, statusCode = 400) {
  return Object.assign(new Error(message), { code, statusCode });
}

async function recordTrackerReception({ payload, rawBody, rawFrameHex = '', receivedAt = new Date(),
  transport = 'https', statusCode, response, diagnosticCode = '' }) {
  try {
    const gatewayDate = payload?.packet?.receivedAt ? new Date(payload.packet.receivedAt) : new Date(NaN);
    await TrackerReception.create({
      receivedAt,
      transport,
      imei: typeof payload?.device?.imei === 'string' ? payload.device.imei.slice(0, 80) : '',
      packetId: typeof payload?.packet?.packetId === 'string' ? payload.packet.packetId.slice(0, 200) : '',
      gatewayReceivedAt: Number.isNaN(gatewayDate.getTime()) ? null : gatewayDate,
      recordCount: Array.isArray(payload?.records) ? payload.records.length : 0,
      accepted: response.accepted || 0,
      statusCode,
      code: response.code || '',
      diagnosticCode,
      response,
      rawBody: Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : (rawBody ?? JSON.stringify(payload) ?? ''),
      rawFrameHex
    });
  } catch (error) {
    // A debug storage failure must never change the ACK or reject valid telemetry.
    console.error('tracker_debug_save_failed', { code: error.code || error.name });
  }
}

async function listTrackerReceptions({ imei, date, before } = {}) {
  const filter = {};
  if (imei) {
    if (typeof imei !== 'string' || !/^\d{15}$/.test(imei)) {
      throw debugError('El IMEI debe contener 15 dígitos.', 'INVALID_IMEI');
    }
    filter.imei = imei;
  }
  if (date) {
    if (typeof date !== 'string') throw debugError('Indica una sola fecha de recepción.', 'INVALID_DATE_RANGE');
    filter.receivedAt = buildMadridDayRange({ from: date, to: date });
  }
  if (before) {
    if (typeof before !== 'string' || !/^[a-f0-9]{24}$/i.test(before)) {
      throw debugError('La página de envíos no es válida. Vuelve a los recientes.', 'INVALID_DEBUG_CURSOR');
    }
    const cursor = await TrackerReception.findById(before).select({ receivedAt: 1 }).lean();
    if (!cursor) throw debugError('El envío ya no está disponible. Vuelve a los recientes.', 'INVALID_DEBUG_CURSOR');
    filter.$or = [
      { receivedAt: { $lt: cursor.receivedAt } },
      { receivedAt: cursor.receivedAt, _id: { $lt: cursor._id } }
    ];
  }
  const rows = await TrackerReception.find(filter).select('-response -diagnosticCode')
    .sort({ receivedAt: -1, _id: -1 }).limit(51).lean();
  const items = rows.slice(0, 50);
  return { items, nextCursor: rows.length > 50 ? String(items[items.length - 1]._id) : null };
}

async function getTrackerReception(id) {
  if (typeof id !== 'string' || !/^[a-f0-9]{24}$/i.test(id)) {
    throw debugError('El identificador del envío no es válido.', 'INVALID_DEBUG_ID');
  }
  const reception = await TrackerReception.findById(new mongoose.Types.ObjectId(id))
    .select('+rawBody +rawFrameHex').lean();
  if (!reception) throw debugError('El envío no se ha encontrado.', 'DEBUG_PACKET_NOT_FOUND', 404);
  let payload = null;
  try { payload = JSON.parse(reception.rawBody); } catch { /* Malformed JSON remains available as raw text. */ }
  return { ...reception, payload };
}

module.exports = { recordTrackerReception, listTrackerReceptions, getTrackerReception };
