import express from "express"
import { createTransport } from "nodemailer"
import supabase from "../config/supabase.js"
import { verificarToken } from "../middleware/auth.js"

import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc.js'
import timezone from 'dayjs/plugin/timezone.js'

dayjs.extend(utc)
dayjs.extend(timezone)

const router = express.Router()

// Obtener recordatorios de una vaca
router.get("/obtener/recordatorios/:id", async (req, res) => {
  const { id } = req.params
  console.log(`📌 Obteniendo recordatorios de la vaca con ID: ${id}`)

  try {
    const { data, error } = await supabase
      .from("Recordatorio")
      .select("*")
      .order("created_at", { ascending: false })
      .eq("VacaId", id)

    if (error) {
      console.error("❌ Error al obtener los recordatorios:", error)
      return res.status(500).json({ message: "Error al obtener los recordatorios" })
    }

    res.status(200).json({
      message: "✅ Recordatorios obtenidos con éxito",
      recordatorios: data,
    })
  } catch (error) {
    console.error("Error en el servidor:", error)
    res.status(500).json({ message: "Error al obtener los recordatorios" })
  }
})

// Registrar recordatorios
router.post("/registrar/recordatorios/:id", async (req, res) => {
  const { id } = req.params
  const { Fecha, Titulo, Descripcion, Tipo, UsuarioId } = req.body

  console.log("📌 Datos recibidos para registrar recordatorio:", req.body)

  try {
    // Convertir la fecha enviada (sin zona horaria) a hora de Colombia y luego a UTC
    const fechaUTC = dayjs.tz(Fecha, "America/Bogota").utc().toISOString()

    console.log("🕐 Fecha en Colombia interpretada:", dayjs.tz(Fecha, "America/Bogota").format())
    console.log("🌐 Fecha convertida a UTC:", fechaUTC)

    // Verificar que el usuario exista
    const { data: usuario, error: errorUsuario } = await supabase
      .from("Usuario")
      .select("Correo, Nombre")
      .eq("id", UsuarioId)
      .single()

    if (errorUsuario || !usuario) {
      console.error("❌ Usuario no encontrado:", errorUsuario)
      return res.status(404).json({ message: "Usuario no encontrado" })
    }

    // Insertar el recordatorio con la fecha en UTC
    const { data, error } = await supabase
      .from("Recordatorio")
      .insert([{
        Fecha: fechaUTC,
        Titulo,
        Descripcion,
        Tipo,
        UsuarioId,
        VacaId: id
      }])
      .select()

    if (error) {
      console.error("❌ Error al registrar el recordatorio:", error)
      return res.status(500).json({ message: "Error al registrar el recordatorio" })
    }

    res.status(201).json({
      message: "✅ Recordatorio registrado con éxito",
      recordatorios: data[0],
    })
  } catch (error) {
    console.error("❌ Error en el servidor:", error)
    res.status(500).json({ message: "Error al registrar el recordatorio" })
  }
})

//eliminar recordatorios de una vaca
router.delete("/recordatorios/eliminar/:id", verificarToken, async (req, res) => {
  const { id } = req.params
  console.log("ID del vaca:", id)

  try {
    const { data, error } = await supabase
      .from("Recordatorio")
      .delete()
      .match({ id: id })
      .select()

    if (error) {
      console.error("❌ Error al eliminar los recordatorios:", error)
      return res.status(500).json({ message: "Error al eliminar los recordatorios" })
    }

    res.status(200).json({
      message: "✅ Recordatorios eliminados con éxito",
      recordatorios: data[0],
    })
  } catch (error) {
    console.error("Error en el servidor:", error)
    res.status(500).json({ message: "Error al eliminar los recordatorios" })
  }
})

// Enviar correos automatizados
router.get("/recordatorio/enviar", async (req, res) => {
  console.log("⏰ Verificando recordatorios para enviar con 1 hora de anticipación...")

  try {
    const ahoraCol = dayjs().tz("America/Bogota")
    const margen = 2 * 60 * 1000 // 2 minutos en milisegundos

    const desde = ahoraCol.add(1, "hour").subtract(margen, "millisecond")
    const hasta = ahoraCol.add(1, "hour").add(margen, "millisecond")

    console.log("🕐 Hora Colombia: ", ahoraCol.format())
    console.log("🔍 Buscando entre:", desde.toISOString(), "y", hasta.toISOString())

    const { data: recordatorios, error } = await supabase
      .from("Recordatorio")
      .select("id, Fecha, Titulo, Descripcion, Tipo, UsuarioId, Enviado")
      .eq("Enviado", false)
      .gte("Fecha", desde.toISOString())
      .lte("Fecha", hasta.toISOString())

    if (error) {
      console.error("❌ Error al obtener recordatorios:", error)
      return res.status(500).json({ message: "Error al consultar recordatorios" })
    }

    if (!recordatorios.length) {
      console.log("📭 No hay recordatorios para enviar ahora.")
      return res.status(200).json({ message: "Sin recordatorios próximos." })
    }

    const transporter = createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL,
        pass: process.env.PASS,
      },
    })

    for (const r of recordatorios) {
      const { data: usuario, error: errorUsuario } = await supabase
        .from("Usuario")
        .select("Correo, Nombre")
        .eq("id", r.UsuarioId)
        .single()

      if (errorUsuario || !usuario) {
        console.error(`⚠️ No se encontró el usuario con ID ${r.UsuarioId}`)
        continue
      }

      const mailOptions = {
        from: `"Sistema de Recordatorios" <${process.env.EMAIL}>`,
        to: usuario.Correo,
        subject: `📌 Recordatorio: ${r.Titulo}`,
        html: `
          <!DOCTYPE html>
          <html lang="es">
          <head>
              <meta charset="UTF-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
              <title>Recordatorio Programado</title>
          </head>
          <body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f5f7fa;">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f5f7fa;">
                  <tr>
                      <td align="center" style="padding: 40px 20px;">
                          <!-- Main Container -->
                          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="max-width: 600px; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.1); overflow: hidden;">
                              
                              <!-- Header -->
                              <tr>
                                  <td style="background: linear-gradient(135deg, #2E7D32 0%, #4CAF50 100%); padding: 30px 40px; text-align: center;">
                                      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                                          <tr>
                                              <td align="center">
                                                  <div style="background-color: rgba(255,255,255,0.2); width: 60px; height: 60px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; margin-bottom: 15px;">
                                                      <span style="font-size: 28px;">🐄</span>
                                                  </div>
                                                  <h1 style="color: #ffffff; font-size: 24px; font-weight: 600; margin: 0; text-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                                                      Recordatorio Programado
                                                  </h1>
                                                  <p style="color: rgba(255,255,255,0.9); font-size: 14px; margin: 8px 0 0 0;">
                                                      Sistema de Gestión Ganadera
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
                                              Hola <strong style="color: #2E7D32;">${usuario.Nombre}</strong> 👋
                                          </p>
                                          <p style="font-size: 16px; color: #5a6c7d; margin: 10px 0 0 0; line-height: 1.5;">
                                              Este es tu recordatorio programado para las 
                                              <strong style="color: #2E7D32;">${dayjs(r.Fecha).tz("America/Bogota").format("h:mm A")}</strong>
                                          </p>
                                      </div>
                                      
                                      <!-- Reminder Details Card -->
                                      <div style="background-color: #f8fffe; border: 2px solid #e8f5e8; border-radius: 10px; padding: 25px; margin-bottom: 30px;">
                                          <!-- Title -->
                                          <div style="margin-bottom: 20px;">
                                              <div style="display: flex; align-items: center; margin-bottom: 8px;">
                                                  <span style="font-size: 18px; margin-right: 8px;">📋</span>
                                                  <h3 style="color: #2c3e50; font-size: 16px; font-weight: 600; margin: 0;">Título</h3>
                                              </div>
                                              <p style="color: #2E7D32; font-size: 18px; font-weight: 600; margin: 0; padding-left: 26px;">
                                                  ${r.Titulo}
                                              </p>
                                          </div>
                                          
                                          <!-- Description -->
                                          <div style="margin-bottom: 20px;">
                                              <div style="display: flex; align-items: center; margin-bottom: 8px;">
                                                  <span style="font-size: 18px; margin-right: 8px;">📝</span>
                                                  <h3 style="color: #2c3e50; font-size: 16px; font-weight: 600; margin: 0;">Descripción</h3>
                                              </div>
                                              <p style="color: #5a6c7d; font-size: 15px; margin: 0; padding-left: 26px; line-height: 1.6;">
                                                  ${r.Descripcion}
                                              </p>
                                          </div>
                                      </div>
                                      
                                      <!-- Tips Section -->
                                      <div style="background-color: #fff3cd; border-left: 4px solid #ffc107; padding: 15px 20px; border-radius: 0 8px 8px 0; margin-bottom: 20px;">
                                          <p style="color: #856404; font-size: 14px; margin: 0; font-weight: 500;">
                                              💡 <strong>Consejo:</strong> Mantén tus recordatorios actualizados para una mejor gestión de tu ganado.
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
                                          <h3 style="color: #2c3e50; font-size: 18px; font-weight: 600; margin: 8px 0 5px 0;">Sistema de Recordatorios Ganaderos</h3>
                                          <p style="color: #6c757d; font-size: 14px; margin: 0;">Gestión inteligente para tu ganado</p>
                                      </div>
                                      
                                      <!-- Automatic Message -->
                                      <p style="color: #6c757d; font-size: 13px; margin: 0 0 20px 0; line-height: 1.5;">
                                          Este es un mensaje automático del <strong>Sistema de Recordatorios Ganaderos</strong>
                                      </p>
                                      
                                      <!-- Contact Information -->
                                      <div style="background-color: #ffffff; border: 1px solid #e9ecef; border-radius: 8px; padding: 20px; margin-bottom: 20px;">
                                          <h4 style="color: #2E7D32; font-size: 16px; font-weight: 600; margin: 0 0 15px 0;">📞 Información de Contacto</h4>
                                          
                                          <!-- Contact Details -->
                                          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                                              <tr>
                                                  <td style="padding: 8px 0;">
                                                      <div style="display: flex; align-items: center; justify-content: center;">
                                                          <span style="font-size: 16px; margin-right: 8px;">📧</span>
                                                          <a href="mailto:soporte@ganaderia.com" style="color: #2E7D32; text-decoration: none; font-size: 14px; font-weight: 500;">
                                                              proyectocontrolbovino@gmail.com
                                                          </a>
                                                      </div>
                                                  </td>
                                              </tr>
                                              <tr>
                                                  <td style="padding: 8px 0;">
                                                      <div style="display: flex; align-items: center; justify-content: center;">
                                                          <span style="font-size: 16px; margin-right: 8px;">🌐</span>
                                                          <a href="https://www.sistemaganadero.com" style="color: #2E7D32; text-decoration: none; font-size: 14px; font-weight: 500;">
                                                              www.appcontrolbovino.com
                                                          </a>
                                                      </div>
                                                  </td>
                                              </tr>
                                              <tr>
                                                  <td style="padding: 8px 0;">
                                                      <div style="display: flex; align-items: center; justify-content: center;">
                                                          <span style="font-size: 16px; margin-right: 8px;">🕒</span>
                                                          <span style="color: #5a6c7d; font-size: 14px; font-weight: 500;">
                                                              Lun - Vie: 8:00 AM - 6:00 PM
                                                          </span>
                                                      </div>
                                                  </td>
                                              </tr>
                                          </table>
                                      </div>
                                      
                                      <!-- Support Message -->
                                      <p style="color: #adb5bd; font-size: 12px; margin: 0;">
                                          Si tienes alguna pregunta, no dudes en contactar a nuestro equipo de soporte.
                                      </p>
                                      
                                      <!-- Copyright -->
                                      <div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #e9ecef;">
                                          <p style="color: #adb5bd; font-size: 11px; margin: 0;">
                                              © 2024 Sistema de Recordatorios Ganaderos. Todos los derechos reservados.
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

      try {
        await transporter.sendMail(mailOptions)
        console.log(`✅ Correo enviado a ${usuario.Correo}`)

        // Marcar como enviado
        await supabase.from("Recordatorio").update({ Enviado: true }).eq("id", r.id)
      } catch (err) {
        console.error(`❌ Error al enviar el correo a ${usuario.Correo}:`, err.message)
      }
    }

    res.status(200).json({ message: "Correos enviados (si aplicaba)" })
  } catch (err) {
    console.error("❌ Error en el proceso:", err)
    res.status(500).json({ message: "Error en el servidor" })
  }
})

export default router
