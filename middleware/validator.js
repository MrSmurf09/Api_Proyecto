import { validationResult } from "express-validator"

// Middleware para validar los datos de entrada
export const validate = (validations) => {
  return async (req, res, next) => {
    // Ejecutar todas las validaciones
    await Promise.all(validations.map((validation) => validation.run(req)))

    // Verificar si hay errores
    const errors = validationResult(req)
    if (errors.isEmpty()) {
      return next()
    }

    // Si hay errores, devolver respuesta con errores
    return res.status(400).json({
      message: "Error de validación",
      errors: errors.array(),
    })
  }
}
