const { config } = require('../config/env');
const STATE_KEYS = ['tipperRaised', 'tipperActive', 'bodyRaised', 'bedRaised', 'dumpBodyRaised', 'basculating', 'tiltAlert'];
const ANGLE_KEYS = ['tipperAngleDeg', 'tiltAngleDeg', 'eyeAngleDeg', 'bedAngleDeg', 'bodyAngleDeg'];
// FTC887: EYE Sensor 1, Roll, signed 16-bit degrees (AVL ID 10832).
const EYE_ROLL_ID = '10832';
const TIPPER_SIGNAL_QUERY = {
  $or: [...STATE_KEYS, ...ANGLE_KEYS].map((key) => ({ [`metadata.knownIo.${key}`]: { $exists: true } }))
    .concat({ [`metadata.rawIo.${EYE_ROLL_ID}`]: { $exists: true } })
};

function booleanState(value) {
  if (value === true || value === 1) return true;
  if (value === false || value === 0) return false;
  const normalized = String(value ?? '').trim().toLowerCase();
  if (['true', 'on', 'active', 'raised', 'open', 'yes'].includes(normalized)) return true;
  if (['false', 'off', 'inactive', 'lowered', 'closed', 'no'].includes(normalized)) return false;
  return null;
}

function numericAngle(value) {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (typeof value === 'string' && !value.trim()) return null;
  const angle = Number(value);
  return Number.isFinite(angle) ? angle : null;
}

function angleState(angle) {
  if (angle === null || Math.abs(angle) > 180) return null;
  const magnitude = Math.abs(angle);
  const raised = magnitude >= config.tipperRaiseAngleDeg ? true
    : magnitude <= config.tipperLowerAngleDeg ? false : null;
  return { raised, angleDeg: angle };
}

function tipperState(point) {
  const known = point?.metadata?.knownIo || {};
  for (const key of STATE_KEYS) {
    const raised = booleanState(known[key]);
    if (raised !== null) return { raised, angleDeg: null };
  }
  for (const key of ANGLE_KEYS) {
    const state = angleState(numericAngle(known[key]));
    if (state) return state;
  }
  let angle = numericAngle(point?.metadata?.rawIo?.[EYE_ROLL_ID]);
  if (angle === null || !Number.isInteger(angle)) return null;
  // The gateway can preserve the unsigned Codec 8E representation of a negative angle.
  if (angle >= 32768 && angle <= 65535) angle -= 65536;
  // Out-of-range values (including EYE error codes 250/251) are not state changes.
  return angleState(angle);
}

module.exports = { booleanState, tipperState, TIPPER_SIGNAL_QUERY };
