import jwt from "jsonwebtoken"

const SECRET_KEY = process.env.JWT_SECRET

export const verificarToken = (req, res, next) => {
  const authHeader = req.headers.authorization

  // Verifica si hay header de autorización con formato "Bearer <token>"
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Token no proporcionado" })
  }

  const token = authHeader.split(" ")[1]

  try {
    const decoded = jwt.verify(token, SECRET_KEY)
    req.nombre = decoded // puedes acceder luego a req.user.id, etc.
    next() // continúa a la siguiente función
  } catch (err) {
    return res.status(403).json({ message: "Token inválido" })
  }
}

