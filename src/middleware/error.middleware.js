function notFound(req, res, next) {
  res.status(404).json({
    ok: false,
    error: 'Ruta no encontrada'
  });
}

function errorHandler(err, req, res, next) {
  if (req.originalUrl === '/tracker') {
    const status = err.statusCode || 400;
    return res.status(status).json({
      ok: false,
      code: err.code || 'INVALID_PAYLOAD'
    });
  }

  const status = err.statusCode || err.status || 500;
  if (status >= 500) {
    console.error('Error interno en Budisa:', err);
  }
  res.status(status).json({
    ok: false,
    ...(err.code ? { code: err.code } : {}),
    error: status >= 500 ? 'Error interno del servidor.' : (err.message || 'No se ha podido completar la operación.')
  });
}

module.exports = { notFound, errorHandler };
