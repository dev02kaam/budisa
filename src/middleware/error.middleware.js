function notFound(req, res, next) {
  res.status(404).json({
    ok: false,
    error: 'Ruta no encontrada'
  });
}

function errorHandler(err, req, res, next) {
  const status = err.statusCode || 400;
  res.status(status).json({
    ok: false,
    error: err.message || 'Error inesperado'
  });
}

module.exports = { notFound, errorHandler };
