const mongoose = require('mongoose');

const TrackerReceptionSchema = new mongoose.Schema({
  receivedAt: { type: Date, required: true },
  transport: { type: String, enum: ['https', 'tcp'], required: true },
  imei: { type: String, default: '' },
  packetId: { type: String, default: '' },
  gatewayReceivedAt: { type: Date, default: null },
  recordCount: { type: Number, default: 0 },
  accepted: { type: Number, default: 0 },
  statusCode: { type: Number, required: true },
  code: { type: String, default: '' },
  diagnosticCode: { type: String, default: '' },
  // Undefined distinguishes receptions captured before content filtering was added.
  contentTypes: { type: [{ type: String, enum: ['gps', 'tipper'] }], default: undefined },
  response: { type: mongoose.Schema.Types.Mixed, required: true },
  // Preserve every original field, including fields omitted by operational normalization.
  rawBody: { type: String, default: '', select: false },
  rawFrameHex: { type: String, default: '', select: false }
}, { versionKey: false });

TrackerReceptionSchema.index({ receivedAt: -1, _id: -1 });
TrackerReceptionSchema.index({ imei: 1, receivedAt: -1, _id: -1 });
TrackerReceptionSchema.index({ contentTypes: 1, receivedAt: -1, _id: -1 });

module.exports = mongoose.model('TrackerReception', TrackerReceptionSchema, 'tracker_receptions');
