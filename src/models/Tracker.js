const mongoose = require('mongoose');

const TrackerSchema = new mongoose.Schema(
  {
    imei: {
      type: String,
      required: true,
      unique: true,
      index: true,
      match: /^\d{15}$/
    },
    name: {
      type: String,
      trim: true,
      maxlength: 80,
      default: ''
    },
    enabled: {
      type: Boolean,
      default: false,
      index: true
    },
    approvalStatus: {
      type: String,
      enum: ['pending', 'approved', 'disabled'],
      default: 'pending',
      index: true
    },
    manufacturer: {
      type: String,
      default: 'Teltonika'
    },
    model: {
      type: String,
      default: 'FTC880'
    },
    iccid: {
      type: String,
      default: null
    },
    lastSeenAt: {
      type: Date,
      default: null
    },
    firstSeenAt: {
      type: Date,
      default: null
    },
    lastAttemptAt: {
      type: Date,
      default: null
    }
  },
  {
    timestamps: true,
    versionKey: false
  }
);

module.exports = mongoose.model('Tracker', TrackerSchema);
