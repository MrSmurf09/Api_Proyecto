import "dotenv/config"
import express from "express"
import cors from "cors"
import { createClient } from "@supabase/supabase-js"
import jwt from "jsonwebtoken"
import multer from "multer"
import path from "path"
import { fileURLToPath } from "url"
import { dirname } from "path"
import fs from "fs"

// Importar rutas
import userRoutes from "./routes/usuarios.js"
import fincaRoutes from "./routes/fincas.js"
import potreroRoutes from "./routes/potreros.js"
import vacaRoutes from "./routes/vacas.js"
import produccionLecheRoutes from "./routes/produccionLeche.js"
import procedimientoMedicoRoutes from "./routes/procedimientoMedico.js"
import recordatorioRoutes from "./routes/recordatorios.js"
import alertaAutomaticasRoutes from "./routes/alertasautomaticas.js"

// Configuración básica
const app = express()
const port = process.env.PORT
const SECRET_KEY = process.env.JWT_SECRET

// Middleware
app.use(cors())
app.use(express.json())

// Configuración de Supabase
const supabaseUrl = process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_KEY
const supabase = createClient(supabaseUrl, supabaseKey)

console.log("Supabase configurado con URL:", supabaseUrl)

// Configuración para manejo de archivos temporales
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const uploadsDir = path.join(__dirname, "uploads")

// Crear directorio de uploads si no existe
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true })
}

// Configuración de multer para subir archivos
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir)
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname))
  },
})

const upload = multer({ storage })

// Servir archivos estáticos
app.use("/uploads", express.static(uploadsDir))

// funcion para verificar el token
const verificarToken = (req, res, next) => {
  const authHeader = req.headers.authorization

  // Verifica si hay header de autorización con formato "Bearer <token>"
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Token no proporcionado" })
  }

  const token = authHeader.split(" ")[1]

  try {
    const decoded = jwt.verify(token, SECRET_KEY)
    req.user = decoded // puedes acceder luego a req.user.id, etc.
    next() // continúa a la siguiente función
  } catch (err) {
    return res.status(403).json({ message: "Token inválido" })
  }
}

// ======== RUTAS DE USUARIOS ========
app.use("/usuario", userRoutes)
app.use("/api/fincas", fincaRoutes)
app.use("/api/potreros", potreroRoutes)
app.use("/api", vacaRoutes)
app.use("/api", produccionLecheRoutes)
app.use("/api", procedimientoMedicoRoutes)
app.use("/api", recordatorioRoutes)
app.use("/api", alertaAutomaticasRoutes)

// Ruta de ping para verificar que el servidor está funcionando
app.get("/api/ping", (req, res) => {
  try {
    console.log("Ping recibido")
    res.status(200).send("pong")
  } catch (error) {
    console.error("Error en el servidor:", error)
    res.status(500).json({ message: "Error en el servidor" })
  }
})

// Iniciar el servidor
app.listen(port, () => {
  console.log(`Servidor corriendo en http://localhost:${port}/`)
})

// Mostrar que el servidor está configurado correctamente
console.log("Servidor de Control Bovino configurado con Supabase")
