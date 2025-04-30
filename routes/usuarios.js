import express from "express"
import bcrypt from "bcrypt"
import jwt from "jsonwebtoken"
import { body } from "express-validator"
import supabase from "../config/supabase.js"
import { validate } from "../middleware/validator.js"
import { asyncHandler } from "../middleware/errorHandler.js"
import nodemailer from "nodemailer"

const router = express.Router()
const SECRET_KEY = process.env.JWT_SECRET

// Almacén temporal para códigos de verificación (en producción, usar Redis o una base de datos)
const codigosVerificacion = new Map()

// Configuración del transportador de correo
const transporter = nodemailer.createTransport({
  service: "gmail", // O el servicio que uses
  auth: {
    user: process.env.EMAIL,
    pass: process.env.PASS,
  },
})

// Validaciones para registro de usuario
const registroValidations = [
  body("Nombre").notEmpty().withMessage("El nombre es obligatorio"),
  body("Correo").isEmail().withMessage("Correo electrónico inválido"),
  body("Contraseña").isLength({ min: 6 }).withMessage("La contraseña debe tener al menos 6 caracteres"),
  body("Telefono").optional().isMobilePhone().withMessage("Número de teléfono inválido"),
]

// Validaciones para login
const loginValidations = [
  body("Correo").isEmail().withMessage("Correo electrónico inválido"),
  body("Contraseña").notEmpty().withMessage("La contraseña es obligatoria"),
]

// Registro de usuario
router.post(
  "/registrar",
  validate(registroValidations),
  asyncHandler(async (req, res) => {
    const { Nombre, Correo, Contraseña, Telefono } = req.body

    // Verificar si el correo ya existe
    const { data: existingUser } = await supabase.from("Usuario").select("id").eq("Correo", Correo).single()

    if (existingUser) {
      return res.status(409).json({ message: "El correo ya está registrado" })
    }

    // Hashear la contraseña
    const hashedPassword = await bcrypt.hash(Contraseña, 10)

    // Insertar usuario en Supabase
    const { data, error } = await supabase
      .from("Usuario")
      .insert([{ Nombre, Correo, Contraseña: hashedPassword, Telefono }])
      .select()

    if (error) {
      throw new Error(`Error al registrar usuario: ${error.message}`)
    }

    res.status(201).json({
      message: "Usuario registrado con éxito",
      id: data[0].id,
    })
  }),
)

// Login de usuario
router.post(
  "/login",
  validate(loginValidations),
  asyncHandler(async (req, res) => {
    const { Correo, Contraseña } = req.body

    // Buscar usuario por correo
    const { data: usuario, error } = await supabase.from("Usuario").select("*").eq("Correo", Correo).single()

    if (error || !usuario) {
      return res.status(401).json({ message: "Credenciales incorrectas" })
    }

    // Verificar contraseña
    const esValida = await bcrypt.compare(Contraseña, usuario.Contraseña)

    if (!esValida) {
      return res.status(401).json({ message: "Credenciales incorrectas" })
    }

    // Generar token JWT
    const token = jwt.sign(
      {
        id: usuario.id,
        nombre: usuario.Nombre,
        correo: usuario.Correo,
      },
      SECRET_KEY,
      { expiresIn: "1d" },
    )

    res.status(200).json({
      message: "Inicio de sesión exitoso",
      userId: usuario.id,
      Nombre: usuario.Nombre,
      token,
    })
  }),
)

// Ruta para solicitar código de recuperación de contraseña
router.post("/recuperar-password", async (req, res) => {
  const { Correo } = req.body

  try {
    // Verificar si el usuario existe
    const { data: usuario, error } = await supabase.from("Usuario").select("id, Nombre").eq("Correo", Correo).single()

    if (error || !usuario) {
      return res.status(404).json({ message: "No existe una cuenta con este correo electrónico" })
    }

    // Generar código aleatorio de 6 dígitos
    const codigo = Math.floor(100000 + Math.random() * 900000).toString()

    // Guardar el código con timestamp (expira en 1 minuto)
    codigosVerificacion.set(Correo, {
      codigo,
      expira: Date.now() + 60000, // 60 segundos
    })

    // Enviar correo con el código
    const mailOptions = {
      from: `"Sistema de Control Bovino" <${process.env.EMAIL}>`,
      to: Correo,
      subject: "Código de recuperación de contraseña",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #007bff;">Recuperación de Contraseña</h2>
          <p>Hola ${usuario.Nombre},</p>
          <p>Has solicitado recuperar tu contraseña. Utiliza el siguiente código para continuar:</p>
          <div style="background-color: #f5f5f5; padding: 15px; text-align: center; font-size: 24px; font-weight: bold; letter-spacing: 5px; margin: 20px 0;">
            ${codigo}
          </div>
          <p>Este código expirará en 1 minuto.</p>
          <p>Si no solicitaste este cambio, puedes ignorar este correo.</p>
          <p>Saludos,<br>Equipo de Control Bovino</p>
        </div>
      `,
    }

    await transporter.sendMail(mailOptions)

    res.status(200).json({ message: "Código enviado correctamente" })
  } catch (error) {
    console.error("Error al enviar código de recuperación:", error)
    res.status(500).json({ message: "Error al procesar la solicitud" })
  }
})

// Ruta para verificar el código
router.post("/verificar-codigo", (req, res) => {
  const { Correo, Codigo } = req.body

  try {
    const verificacion = codigosVerificacion.get(Correo)

    if (!verificacion) {
      return res.status(400).json({ message: "No hay un código de verificación activo para este correo" })
    }

    if (Date.now() > verificacion.expira) {
      codigosVerificacion.delete(Correo)
      return res.status(400).json({ message: "El código ha expirado" })
    }

    if (verificacion.codigo !== Codigo) {
      return res.status(400).json({ message: "Código incorrecto" })
    }

    // El código es válido, pero no lo eliminamos aún porque lo necesitaremos para cambiar la contraseña
    res.status(200).json({ message: "Código verificado correctamente" })
  } catch (error) {
    console.error("Error al verificar código:", error)
    res.status(500).json({ message: "Error al procesar la solicitud" })
  }
})

// Ruta para cambiar la contraseña
router.post("/cambiar-password", async (req, res) => {
  const { Correo, Codigo, NuevaContraseña } = req.body

  try {
    const verificacion = codigosVerificacion.get(Correo)

    if (!verificacion) {
      return res.status(400).json({ message: "No hay un código de verificación activo para este correo" })
    }

    if (Date.now() > verificacion.expira) {
      codigosVerificacion.delete(Correo)
      return res.status(400).json({ message: "El código ha expirado" })
    }

    if (verificacion.codigo !== Codigo) {
      return res.status(400).json({ message: "Código incorrecto" })
    }

    // Hashear la nueva contraseña
    const hashedPassword = await bcrypt.hash(NuevaContraseña, 10)

    // Actualizar la contraseña en la base de datos
    const { error } = await supabase.from("Usuario").update({ Contraseña: hashedPassword }).eq("Correo", Correo)

    if (error) {
      throw new Error(`Error al actualizar contraseña: ${error.message}`)
    }

    // Eliminar el código de verificación
    codigosVerificacion.delete(Correo)

    res.status(200).json({ message: "Contraseña actualizada correctamente" })
  } catch (error) {
    console.error("Error al cambiar contraseña:", error)
    res.status(500).json({ message: "Error al procesar la solicitud" })
  }
})

export default router
