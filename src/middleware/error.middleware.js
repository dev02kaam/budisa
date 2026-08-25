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

  const status = err.statusCode || 400;
  res.status(status).json({
    ok: false,
    ...(err.code ? { code: err.code } : {}),
    error: err.message || 'Error inesperado'
  });
}

module.exports = { notFound, errorHandler };
