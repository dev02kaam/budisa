const fleetService = require('../services/fleet.service');
const {
  getGatewayStatus,
  listTrackers,
  registerTracker,
  registerTrackers,
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
      licensePlate: req.body?.licensePlate
    });
    res.status(201).json({
      ok: true,
      data: {
        imei: trackerDevice.imei,
        licensePlate: trackerDevice.licensePlate,
        status: trackerDevice.approvalStatus,
        enabled: trackerDevice.enabled
      }
    });
  } catch (error) {
    next(error);
  }
}

async function importTrackerDevices(req, res, next) {
  try {
    const result = await registerTrackers(req.body?.vehicles);
    res.json({ ok: true, data: result });
  } catch (error) {
    next(error);
  }
}

async function updateTrackerDevice(req, res, next) {
  try {
    const hasEnabled = typeof req.body?.enabled === 'boolean';
    const hasLicensePlate = typeof req.body?.licensePlate === 'string';
    if (!hasEnabled && !hasLicensePlate) {
      const error = new Error('Indica una matricula o un estado para guardar');
      error.code = 'EMPTY_TRACKER_UPDATE';
      error.statusCode = 400;
      throw error;
    }

    const trackerDevice = await updateTracker({
      imei: req.params.imei,
      ...(hasEnabled ? { enabled: req.body.enabled } : {}),
      ...(hasLicensePlate ? { licensePlate: req.body.licensePlate } : {})
    });
    res.json({
      ok: true,
      data: {
        imei: trackerDevice.imei,
        licensePlate: trackerDevice.licensePlate,
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
  importTrackerDevices,
  registerTrackerDevice,
  tracker,
  trackerDays,
  trackerStatus,
  trackers,
  updateTrackerDevice
};
