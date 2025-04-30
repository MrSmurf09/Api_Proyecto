// Middleware para manejo centralizado de errores
export const errorHandler = (err, req, res, next) => {
  console.error("Error en el servidor:", err)

  // Si el error tiene un código de estado, usarlo; de lo contrario, usar 500
  const statusCode = err.statusCode || 500

  // En producción, no enviar detalles del error al cliente
  const errorMessage =
    process.env.NODE_ENV === "production" ? "Error en el servidor" : err.message || "Error en el servidor"

  res.status(statusCode).json({
    message: errorMessage,
    // Solo incluir stack trace en desarrollo
    ...(process.env.NODE_ENV !== "production" && { stack: err.stack }),
  })
}

// Función auxiliar para envolver controladores de rutas y capturar errores
export const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next)
}
