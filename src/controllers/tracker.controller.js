const { config } = require('../config/env');
const {
  claimNonce,
  ingestGatewayPacket,
  releaseNonce
} = require('../services/tracker-gateway.service');
const { verifyTrackerRequest } = require('../utils/tracker-auth');

const rawJsonOptions = {
  limit: '2mb',
  type: 'application/json',
  verify(req, res, buffer) {
    req.rawBody = Buffer.from(buffer);
  }
};

function sendTrackerError(res, error) {
  const status = error.statusCode || 400;
  const code = error.code || 'INVALID_PAYLOAD';
  return res.status(status).json({ ok: false, code });
}

async function ingestTracker(req, res) {
  let auth = null;

  try {
    auth = verifyTrackerRequest({
      headers: req.headers,
      rawBody: req.rawBody,
      secret: config.trackerSharedSecret,
      expectedKeyId: config.trackerKeyId,
      toleranceSeconds: config.trackerSignatureToleranceSeconds
    });
    await claimNonce({
      ...auth,
      toleranceSeconds: config.trackerSignatureToleranceSeconds
    });

    try {
      const accepted = await ingestGatewayPacket(req.body);
      return res.status(200).json({ ok: true, accepted });
    } catch (error) {
      await releaseNonce(auth);
      throw error;
    }
  } catch (error) {
    return sendTrackerError(res, error);
  }
}

module.exports = { ingestTracker, rawJsonOptions, sendTrackerError };
