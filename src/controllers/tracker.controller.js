const { config } = require('../config/env');
const {
  claimNonce,
  ingestGatewayPacket,
  releaseNonce
} = require('../services/tracker-gateway.service');
const { TrackerAuthError, verifyTrackerRequest } = require('../utils/tracker-auth');

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

function logTrackerAuthFailure(req, error) {
  const rawKeyId = req.headers['x-tracker-key-id'];
  const keyId = Array.isArray(rawKeyId) ? rawKeyId[0] : rawKeyId;
  console.warn('tracker_auth_failed', {
    code: error.diagnosticCode || error.code,
    keyId: typeof keyId === 'string' ? keyId.slice(0, 128) : null,
    hasRawBody: Buffer.isBuffer(req.rawBody),
    bodyLength: req.rawBody?.length
  });
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
    if (error instanceof TrackerAuthError) {
      logTrackerAuthFailure(req, error);
    }
    return sendTrackerError(res, error);
  }
}

module.exports = { ingestTracker, logTrackerAuthFailure, rawJsonOptions, sendTrackerError };
