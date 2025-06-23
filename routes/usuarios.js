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
    const { Nombre, Correo, Rol, Contraseña, Telefono } = req.body

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
      .insert([{ Nombre, Correo, Contraseña: hashedPassword, Telefono, Rol }])
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
        rol: usuario.Rol,
      },
      SECRET_KEY,
      { expiresIn: "1d" },
    )

    res.status(200).json({
      message: "Inicio de sesión exitoso",
      userId: usuario.id,
      Nombre: usuario.Nombre,
      rol: usuario.Rol,
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
        <!DOCTYPE html>
        <html lang="es">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Recuperación de Contraseña</title>
        </head>
        <body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f5f7fa;">
            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f5f7fa;">
                <tr>
                    <td align="center" style="padding: 40px 20px;">
                        <!-- Main Container -->
                        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="max-width: 600px; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.1); overflow: hidden;">
                            
                            <!-- Header -->
                            <tr>
                                <td style="background: linear-gradient(135deg, #007bff 0%, #0056b3 100%); padding: 30px 40px; text-align: center;">
                                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                                        <tr>
                                            <td align="center">
                                                <div style="background-color: rgba(255,255,255,0.2); width: 70px; height: 70px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; margin-bottom: 15px;">
                                                    <span style="font-size: 32px;">🔐</span>
                                                </div>
                                                <h1 style="color: #ffffff; font-size: 26px; font-weight: 600; margin: 0; text-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                                                    Recuperación de Contraseña
                                                </h1>
                                                <p style="color: rgba(255,255,255,0.9); font-size: 16px; margin: 8px 0 0 0; font-weight: 500;">
                                                    ControlBovino - Acceso Seguro
                                                </p>
                                            </td>
                                        </tr>
                                    </table>
                                </td>
                            </tr>
                            
                            <!-- Content -->
                            <tr>
                                <td style="padding: 40px;">
                                    <!-- Greeting -->
                                    <div style="margin-bottom: 30px;">
                                        <p style="font-size: 18px; color: #2c3e50; margin: 0; font-weight: 500;">
                                            Hola <strong style="color: #007bff;">${usuario.Nombre}</strong> 👋
                                        </p>
                                        <p style="font-size: 16px; color: #5a6c7d; margin: 15px 0 0 0; line-height: 1.6;">
                                            Has solicitado recuperar tu contraseña de ControlBovino. Utiliza el siguiente código de verificación para continuar con el proceso.
                                        </p>
                                    </div>
                                    
                                    <!-- Security Notice -->
                                    <div style="background-color: #fff3cd; border: 2px solid #ffc107; border-radius: 10px; padding: 20px; margin-bottom: 30px;">
                                        <div style="display: flex; align-items: center; margin-bottom: 10px;">
                                            <span style="font-size: 20px; margin-right: 10px;">⚠️</span>
                                            <h3 style="color: #856404; font-size: 16px; font-weight: 600; margin: 0;">Código de Seguridad</h3>
                                        </div>
                                        <p style="color: #856404; font-size: 14px; margin: 0; line-height: 1.5;">
                                            Por tu seguridad, este código tiene una validez limitada. Úsalo inmediatamente para completar el proceso.
                                        </p>
                                    </div>
                                    
                                    <!-- Verification Code -->
                                    <div style="text-align: center; margin-bottom: 30px;">
                                        <p style="color: #2c3e50; font-size: 16px; font-weight: 500; margin: 0 0 20px 0;">
                                            Tu código de verificación es:
                                        </p>
                                        <div style="background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%); border: 3px solid #007bff; border-radius: 12px; padding: 25px; margin: 20px auto; max-width: 300px; box-shadow: 0 4px 15px rgba(0, 123, 255, 0.2);">
                                            <div style="font-size: 36px; font-weight: 700; color: #007bff; letter-spacing: 8px; font-family: 'Courier New', monospace; text-align: center;">
                                                ${codigo}
                                            </div>
                                        </div>
                                    </div>
                                    
                                    <!-- Timer Warning -->
                                    <div style="background-color: #ffe6e6; border: 2px solid #ff6b6b; border-radius: 10px; padding: 20px; margin-bottom: 30px; text-align: center;">
                                        <div style="display: flex; align-items: center; justify-content: center; margin-bottom: 10px;">
                                            <span style="font-size: 20px; margin-right: 10px;">⏰</span>
                                            <h3 style="color: #d63031; font-size: 16px; font-weight: 600; margin: 0;">¡Tiempo Limitado!</h3>
                                        </div>
                                        <p style="color: #d63031; font-size: 15px; margin: 0; font-weight: 500;">
                                            Este código expirará en <strong>1 minuto</strong>
                                        </p>
                                        <p style="color: #74b9ff; font-size: 13px; margin: 8px 0 0 0;">
                                            Si el código expira, deberás solicitar uno nuevo desde la aplicación.
                                        </p>
                                    </div>
                                    
                                    <!-- Instructions -->
                                    <div style="background-color: #e8f4fd; border-left: 4px solid #007bff; padding: 20px; border-radius: 0 8px 8px 0; margin-bottom: 30px;">
                                        <h4 style="color: #0056b3; font-size: 16px; font-weight: 600; margin: 0 0 15px 0;">📋 Instrucciones</h4>
                                        <ol style="color: #2c3e50; font-size: 14px; margin: 0; padding-left: 20px; line-height: 1.6;">
                                            <li style="margin-bottom: 8px;">Regresa a la aplicación ControlBovino</li>
                                            <li style="margin-bottom: 8px;">Ingresa el código de verificación mostrado arriba</li>
                                            <li style="margin-bottom: 8px;">Crea tu nueva contraseña segura</li>
                                            <li>¡Listo! Ya puedes acceder con tu nueva contraseña</li>
                                        </ol>
                                    </div>
                                    
                                    <!-- Security Notice -->
                                    <div style="background-color: #f8f9fa; border: 1px solid #dee2e6; border-radius: 8px; padding: 20px; margin-bottom: 20px;">
                                        <div style="display: flex; align-items: center; margin-bottom: 10px;">
                                            <span style="font-size: 18px; margin-right: 8px;">🛡️</span>
                                            <h4 style="color: #495057; font-size: 15px; font-weight: 600; margin: 0;">Nota de Seguridad</h4>
                                        </div>
                                        <p style="color: #6c757d; font-size: 14px; margin: 0; line-height: 1.5;">
                                            Si <strong>no solicitaste</strong> este cambio de contraseña, puedes ignorar este correo de forma segura. 
                                            Tu cuenta permanecerá protegida y no se realizarán cambios.
                                        </p>
                                    </div>
                                </td>
                            </tr>
                            
                            <!-- Footer -->
                            <tr>
                                <td style="background-color: #f8f9fa; padding: 30px 40px; text-align: center; border-top: 1px solid #e9ecef;">
                                    <!-- Brand Section -->
                                    <div style="margin-bottom: 25px;">
                                        <span style="font-size: 24px;">🐄</span>
                                        <h3 style="color: #2c3e50; font-size: 18px; font-weight: 600; margin: 8px 0 5px 0;">ControlBovino</h3>
                                        <p style="color: #6c757d; font-size: 14px; margin: 0;">Tu aliado para llevar el control de tu ganado</p>
                                    </div>
                                    
                                    <!-- Automatic Message -->
                                    <p style="color: #6c757d; font-size: 13px; margin: 0 0 20px 0; line-height: 1.5;">
                                        Este es un mensaje automático del sistema de seguridad de <strong>ControlBovino</strong>
                                    </p>
                                    
                                    <!-- Contact Information -->
                                    <div style="background-color: #ffffff; border: 1px solid #e9ecef; border-radius: 8px; padding: 20px; margin-bottom: 20px;">
                                        <h4 style="color: #007bff; font-size: 16px; font-weight: 600; margin: 0 0 15px 0;">📞 ¿Necesitas Ayuda?</h4>
                                        
                                        <!-- Contact Details -->
                                        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                                            <tr>
                                                <td style="padding: 8px 0;">
                                                    <div style="display: flex; align-items: center; justify-content: center;">
                                                        <span style="font-size: 16px; margin-right: 8px;">📧</span>
                                                        <a href="mailto:soporte@appcontrolbovino.com" style="color: #007bff; text-decoration: none; font-size: 14px; font-weight: 500;">
                                                            proyectocontrolbovino@gmail.com
                                                        </a>
                                                    </div>
                                                </td>
                                            </tr>
                                            <tr>
                                                <td style="padding: 8px 0;">
                                                    <div style="display: flex; align-items: center; justify-content: center;">
                                                        <span style="font-size: 16px; margin-right: 8px;">🌐</span>
                                                        <a href="https://www.appcontrolbovino.com/" style="color: #007bff; text-decoration: none; font-size: 14px; font-weight: 500;">
                                                            www.appcontrolbovino.com
                                                        </a>
                                                    </div>
                                                </td>
                                            </tr>
                                        </table>
                                    </div>
                                    
                                    <!-- Support Message -->
                                    <p style="color: #adb5bd; font-size: 12px; margin: 0;">
                                        Si tienes problemas con la recuperación, visita <a href="https://www.appcontrolbovino.com/" style="color: #007bff; text-decoration: none;">www.appcontrolbovino.com</a>
                                    </p>
                                    
                                    <!-- Copyright -->
                                    <div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #e9ecef;">
                                        <p style="color: #adb5bd; font-size: 11px; margin: 0;">
                                            © 2024 ControlBovino. Todos los derechos reservados. | Sistema de Seguridad Avanzada
                                        </p>
                                    </div>
                                </td>
                            </tr>
                        </table>
                    </td>
                </tr>
            </table>
        </body>
        </html>
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
