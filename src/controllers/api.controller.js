const fleetService = require('../services/fleet.service');
const {
  getGatewayStatus,
  listTrackers,
  registerTracker,
  updateTracker
} = require('../services/tracker-gateway.service');

function boundedLimit(value, fallback, maximum) {
  const number = Number(value || fallback);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(Math.max(Math.trunc(number), 1), maximum);
}

async function fleet(req, res, next) {
  try {
    res.json({ ok: true, data: await fleetService.getFleet() });
  } catch (error) {
    next(error);
  }
}

async function tracker(req, res, next) {
  try {
    const points = await fleetService.getTrackerPoints(
      {
        imei: req.query.imei,
        from: req.query.from,
        to: req.query.to
      },
      boundedLimit(req.query.limit, 10000, 20000)
    );
    res.json({ ok: true, data: points });
  } catch (error) {
    next(error);
  }
}

async function trackerDays(req, res, next) {
  try {
    const days = await fleetService.getTrackerDays(
      {
        imei: req.query.imei,
        from: req.query.from,
        to: req.query.to
      },
      boundedLimit(req.query.limit, 500, 1000)
    );
    res.json({ ok: true, data: days });
  } catch (error) {
    next(error);
  }
}

async function trackerStatus(req, res, next) {
  try {
    res.json({ ok: true, data: await getGatewayStatus() });
  } catch (error) {
    next(error);
  }
}

async function trackers(req, res, next) {
  try {
    res.json({ ok: true, data: await listTrackers() });
  } catch (error) {
    next(error);
  }
}

async function registerTrackerDevice(req, res, next) {
  try {
    const trackerDevice = await registerTracker({
      imei: String(req.body?.imei || '').trim(),
      name: req.body?.name
    });
    res.status(201).json({
      ok: true,
      data: {
        imei: trackerDevice.imei,
        name: trackerDevice.name,
        status: trackerDevice.approvalStatus,
        enabled: trackerDevice.enabled
      }
    });
  } catch (error) {
    next(error);
  }
}

async function updateTrackerDevice(req, res, next) {
  try {
    const hasEnabled = typeof req.body?.enabled === 'boolean';
    const hasName = typeof req.body?.name === 'string';
    if (!hasEnabled && !hasName) {
      const error = new Error('Indica un nombre o un estado para guardar');
      error.code = 'EMPTY_TRACKER_UPDATE';
      error.statusCode = 400;
      throw error;
    }

    const trackerDevice = await updateTracker({
      imei: req.params.imei,
      ...(hasEnabled ? { enabled: req.body.enabled } : {}),
      ...(hasName ? { name: req.body.name } : {})
    });
    res.json({
      ok: true,
      data: {
        imei: trackerDevice.imei,
        name: trackerDevice.name,
        status: trackerDevice.approvalStatus,
        enabled: trackerDevice.enabled
      }
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  fleet,
  registerTrackerDevice,
  tracker,
  trackerDays,
  trackerStatus,
  trackers,
  updateTrackerDevice
};
