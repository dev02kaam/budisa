const mongoose = require('mongoose');

const TrackerRequestNonceSchema = new mongoose.Schema(
  {
    keyId: {
      type: String,
      required: true
    },
    nonce: {
      type: String,
      required: true
    },
    expiresAt: {
      type: Date,
      required: true,
      expires: 0
    }
  },
  {
    timestamps: true,
    versionKey: false
  }
);

TrackerRequestNonceSchema.index({ keyId: 1, nonce: 1 }, { unique: true });

module.exports = mongoose.model('TrackerRequestNonce', TrackerRequestNonceSchema);
