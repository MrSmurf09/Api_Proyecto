import express from "express"
import bcrypt from "bcrypt"
import jwt from "jsonwebtoken"
import supabase from "../config/supabase.js"

const router = express.Router()
const SECRET_KEY = process.env.JWT_SECRET

// Registro de usuario
router.post("/registrar", async (req, res) => {
  const { Nombre, Correo, Contraseña, Telefono } = req.body
  console.log("Datos recibidos del form:", { Nombre, Correo, Contraseña, Telefono })

  try {
    // Hashear la contraseña
    const hashedPassword = await bcrypt.hash(Contraseña, 10)

    // Insertar usuario en Supabase
    const { data, error } = await supabase
      .from("Usuario")
      .insert([{ Nombre, Correo, Contraseña: hashedPassword, Telefono }])
      .select()

    if (error) {
      console.error("Error al registrar usuario:", error)
      return res.status(500).json({ error: error.message })
    }

    res.status(201).json({
      message: "Usuario registrado con éxito",
      id: data[0].id,
    })
  } catch (error) {
    console.error("Error en el servidor:", error)
    res.status(500).json({ error: "Error al registrar usuario" })
  }
})

// Login de usuario
router.post("/login", async (req, res) => {
  const { Correo, Contraseña } = req.body

  try {
    // Buscar usuario por correo
    const { data: usuarios, error } = await supabase.from("Usuario").select("*").eq("Correo", Correo).single()

    if (error || !usuarios) {
      return res.status(401).json({ message: "Correo o contraseña incorrectos" })
    }

    // Verificar contraseña
    const esValida = await bcrypt.compare(Contraseña, usuarios.Contraseña)

    if (!esValida) {
      return res.status(401).json({ message: "Correo o contraseña incorrectos" })
    }

    // Generar token JWT
    const token = jwt.sign({ nombre: usuarios.Nombre }, SECRET_KEY, { expiresIn: "1d" })

    res.status(200).json({
      message: "Inicio de sesión exitoso",
      userId: usuarios.id,
      Nombre: usuarios.Nombre,
      token,
    })
  } catch (error) {
    console.error("Error en el servidor:", error)
    res.status(500).json({ error: "Error del servidor" })
  }
})

export default router
