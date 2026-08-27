const mongoose = require('mongoose');

const AppSessionSchema = new mongoose.Schema(
  {
    tokenHash: {
      type: String,
      required: true,
      unique: true,
      index: true
    },
    username: {
      type: String,
      required: true,
      maxlength: 80
    },
    csrfToken: {
      type: String,
      required: true
    },
    expiresAt: {
      type: Date,
      required: true,
      index: { expireAfterSeconds: 0 }
    }
  },
  {
    timestamps: true,
    versionKey: false
  }
);

module.exports = mongoose.model('AppSession', AppSessionSchema, 'app_sessions');
