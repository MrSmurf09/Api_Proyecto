import express from "express"
import supabase from "../config/supabase.js"
import nodemailer from "nodemailer"
import dayjs from "dayjs"
import utc from "dayjs/plugin/utc.js"
import timezone from "dayjs/plugin/timezone.js"

dayjs.extend(utc)
dayjs.extend(timezone)

const router = express.Router()

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL,
    pass: process.env.PASS,
  },
})

// Ruta: /api/revisar-vacas
router.get("/revisar-vacas", async (req, res) => {
  try {
    const hoy = dayjs().tz("America/Bogota")
    const { data: vacas, error } = await supabase.from("Vaca").select(`
        id, Codigo, Fecha_Embarazo, Fecha_Desparacitada, PotreroId,
        Potrero:PotreroId (
          id,
          Nombre,
          Finca:FincaId (
            id,
            Nombre,
            UsuarioId,
            Usuario:UsuarioId (
              id,
              Correo,
              Nombre
            )
          )
        )
      `)

    if (error) {
      console.error("Error al consultar vacas:", error)
      return res.status(500).json({ error: "Error al consultar vacas" })
    }

    const yaNotificados = new Set()
    const resultados = []

    for (const vaca of vacas) {
      const { id, Codigo, Fecha_Embarazo, Fecha_Desparacitada, PotreroId, Potrero } = vaca
      const correoUsuario = Potrero.Finca.Usuario.Correo
      const nombreUsuario = Potrero.Finca.Usuario.Nombre
      const nombrePotrero = Potrero?.Nombre || PotreroId
      const nombreFinca = Potrero?.Finca?.Nombre || ""

      if (!correoUsuario) continue

      console.log(`🐄 Vaca ${Codigo} asignada a correo: ${correoUsuario}`)

      // --- EMBARAZO ---
      if (Fecha_Embarazo) {
        const fechaParto = dayjs(Fecha_Embarazo).add(280, "day")
        const diasFaltantes = fechaParto.diff(hoy, "day")

        if (diasFaltantes <= 3 && diasFaltantes >= 0) {
          const alertaData = {
            tipo: "embarazo",
            icono: "🐄",
            titulo: `Vaca ${Codigo} próxima a parir`,
            descripcion: `La vaca <strong>${Codigo}</strong> se encuentra próxima a parir.`,
            fecha: fechaParto.format("dddd DD [de] MMMM [de] YYYY"),
            detalles: {
              vaca: Codigo,
              potrero: nombrePotrero,
              finca: nombreFinca,
              diasRestantes: diasFaltantes,
            },
          }

          await enviarCorreo(correoUsuario, `🐄 Vaca ${Codigo} próxima a parir`, alertaData, nombreUsuario)

          await supabase.from("Vaca").update({ Fecha_Embarazo: null }).eq("id", id)

          resultados.push(`Embarazo - Vaca ${Codigo}: Alerta enviada y fecha eliminada.`)
        }
      }

      // --- DESPARASITACIÓN ---
      if (Fecha_Desparacitada) {
        const siguiente = dayjs(Fecha_Desparacitada).add(3, "month")
        const diasFaltantes = siguiente.diff(hoy, "day")

        if (diasFaltantes <= 3 && diasFaltantes >= 0 && !yaNotificados.has(PotreroId)) {
          const alertaData = {
            tipo: "desparasitacion",
            icono: "💉",
            titulo: "Desparasitación pendiente",
            descripcion: `Hay vacas del potrero <strong>${nombrePotrero}</strong> de la finca <strong>${nombreFinca}</strong> que deben ser desparasitadas.`,
            fecha: siguiente.format("dddd DD [de] MMMM [de] YYYY"),
            detalles: {
              potrero: nombrePotrero,
              finca: nombreFinca,
              diasRestantes: diasFaltantes,
            },
          }

          await enviarCorreo(correoUsuario, `💉 Desparasitación pendiente`, alertaData, nombreUsuario)

          yaNotificados.add(PotreroId)

          await supabase
            .from("Vaca")
            .update({ Fecha_Desparacitada: siguiente.toISOString() })
            .eq("PotreroId", PotreroId)

          resultados.push(`Desparasitación - Potrero ${PotreroId}: Alerta enviada y fecha actualizada.`)
        }
      }
    }

    res.json({ success: true, detalles: resultados })
  } catch (err) {
    console.error("Error en /revisar-vacas:", err)
    res.status(500).json({ error: "Error en la ejecución del recordatorio automático" })
  }
})

// ✉️ Función para enviar correos HTML estilizados mejorada
async function enviarCorreo(destinatario, asunto, alertaData, nombreUsuario = "ganadero") {
  const { tipo, icono, titulo, descripcion, fecha, detalles } = alertaData

  // Determinar colores según el tipo de alerta
  const colores =
    tipo === "embarazo"
      ? { primario: "#E91E63", secundario: "#FCE4EC", acento: "#AD1457" }
      : { primario: "#FF9800", secundario: "#FFF3E0", acento: "#F57C00" }

  const detallesHTML =
    tipo === "embarazo"
      ? `
      <div style="margin-bottom: 10px;">
          <span style="color: #5a6c7d; font-size: 14px; font-weight: 500;">🐄 Vaca:</span>
          <span style="color: #2c3e50; font-size: 14px; font-weight: 600; margin-left: 8px;">${detalles.vaca}</span>
      </div>
      <div style="margin-bottom: 10px;">
          <span style="color: #5a6c7d; font-size: 14px; font-weight: 500;">🌾 Potrero:</span>
          <span style="color: #2c3e50; font-size: 14px; font-weight: 600; margin-left: 8px;">${detalles.potrero}</span>
      </div>
      <div style="margin-bottom: 10px;">
          <span style="color: #5a6c7d; font-size: 14px; font-weight: 500;">🏡 Finca:</span>
          <span style="color: #2c3e50; font-size: 14px; font-weight: 600; margin-left: 8px;">${detalles.finca}</span>
      </div>
      <div>
          <span style="color: #5a6c7d; font-size: 14px; font-weight: 500;">⏰ Días restantes:</span>
          <span style="background-color: ${colores.primario}; color: white; padding: 4px 8px; border-radius: 12px; font-size: 12px; font-weight: 600; margin-left: 8px;">1 - 7 días</span>
      </div>
    `
      : `
      <div style="margin-bottom: 10px;">
          <span style="color: #5a6c7d; font-size: 14px; font-weight: 500;">🌾 Potrero:</span>
          <span style="color: #2c3e50; font-size: 14px; font-weight: 600; margin-left: 8px;">${detalles.potrero}</span>
      </div>
      <div style="margin-bottom: 10px;">
          <span style="color: #5a6c7d; font-size: 14px; font-weight: 500;">🏡 Finca:</span>
          <span style="color: #2c3e50; font-size: 14px; font-weight: 600; margin-left: 8px;">${detalles.finca}</span>
      </div>
      <div>
          <span style="color: #5a6c7d; font-size: 14px; font-weight: 500;">⏰ Días restantes:</span>
          <span style="background-color: ${colores.primario}; color: white; padding: 4px 8px; border-radius: 12px; font-size: 12px; font-weight: 600; margin-left: 8px;">1 - 3 días</span>
      </div>
    `

  const htmlContent = `
    <!DOCTYPE html>
    <html lang="es">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${asunto}</title>
    </head>
    <body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f5f7fa;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f5f7fa;">
            <tr>
                <td align="center" style="padding: 40px 20px;">
                    <!-- Main Container -->
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="max-width: 600px; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.1); overflow: hidden;">
                        
                        <!-- Header -->
                        <tr>
                            <td style="background: linear-gradient(135deg, ${colores.primario} 0%, ${colores.acento} 100%); padding: 30px 40px; text-align: center;">
                                <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                                    <tr>
                                        <td align="center">
                                            <div style="background-color: rgba(255,255,255,0.2); width: 70px; height: 70px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; margin-bottom: 15px;">
                                                <span style="font-size: 32px;">${icono}</span>
                                            </div>
                                            <h1 style="color: #ffffff; font-size: 26px; font-weight: 600; margin: 0; text-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                                                ⚠️ Alerta del Sistema
                                            </h1>
                                            <p style="color: rgba(255,255,255,0.9); font-size: 16px; margin: 8px 0 0 0; font-weight: 500;">
                                                ${titulo}
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
                                        Hola <strong style="color: ${colores.acento};">${nombreUsuario}</strong> 👋
                                    </p>
                                    <p style="font-size: 16px; color: #5a6c7d; margin: 10px 0 0 0; line-height: 1.5;">
                                        Te informamos sobre una actividad importante en tu sistema ganadero.
                                    </p>
                                </div>
                                
                                <!-- Alert Details Card -->
                                <div style="background-color: ${colores.secundario}; border: 2px solid ${colores.primario}40; border-radius: 12px; padding: 25px; margin-bottom: 30px;">
                                    <!-- Main Description -->
                                    <div style="margin-bottom: 25px;">
                                        <div style="display: flex; align-items: center; margin-bottom: 12px;">
                                            <span style="font-size: 20px; margin-right: 10px;">📋</span>
                                            <h3 style="color: #2c3e50; font-size: 18px; font-weight: 600; margin: 0;">Detalles de la Alerta</h3>
                                        </div>
                                        <p style="color: #2c3e50; font-size: 16px; margin: 0; padding-left: 30px; line-height: 1.6;">
                                            ${descripcion}
                                        </p>
                                    </div>
                                    
                                    <!-- Date -->
                                    <div style="margin-bottom: 25px;">
                                        <div style="display: flex; align-items: center; margin-bottom: 8px;">
                                            <span style="font-size: 18px; margin-right: 8px;">📅</span>
                                            <h4 style="color: #2c3e50; font-size: 16px; font-weight: 600; margin: 0;">Fecha Programada</h4>
                                        </div>
                                        <p style="color: ${colores.acento}; font-size: 17px; font-weight: 600; margin: 0; padding-left: 26px;">
                                            ${fecha}
                                        </p>
                                    </div>
                                    
                                    <!-- Additional Details -->
                                    <div style="background-color: rgba(255,255,255,0.7); border-radius: 8px; padding: 20px;">
                                        <h4 style="color: #2c3e50; font-size: 16px; font-weight: 600; margin: 0 0 15px 0;">📊 Información Adicional</h4>
                                        ${detallesHTML}
                                    </div>
                                </div>
                                
                                <!-- Tips Section -->
                                <div style="background-color: #e8f5e9; border-left: 4px solid #4caf50; padding: 18px 20px; border-radius: 0 8px 8px 0; margin-bottom: 20px;">
                                    <p style="color: #2e7d32; font-size: 14px; margin: 0; font-weight: 500;">
                                        💡 <strong>Recomendación:</strong> ${tipo === "embarazo"
      ? "Prepara un área limpia y segura para el parto. Mantén contacto con el veterinario."
      : "Programa la desparasitación con anticipación para mantener la salud del ganado."
    }
                                    </p>
                                </div>
                            </td>
                        </tr>
                        
                        <!-- Footer -->
                        <tr>
                            <td style="background-color: #f8f9fa; padding: 30px 40px; text-align: center; border-top: 1px solid #e9ecef;">
                                <div style="margin-bottom: 20px;">
                                    <span style="font-size: 24px;">🐄</span>
                                    <h3 style="color: #2c3e50; font-size: 18px; font-weight: 600; margin: 8px 0 5px 0;">ControlBovino</h3>
                                    <p style="color: #6c757d; font-size: 14px; margin: 0;">Tu aliado para llevar el control de tu ganado</p>
                                </div>
                                
                                <p style="color: #6c757d; font-size: 13px; margin: 0 0 15px 0; line-height: 1.5;">
                                    Este es un mensaje automático del sistema. No respondas a este correo.
                                </p>
                                
                                <p style="color: #adb5bd; font-size: 12px; margin: 0;">
                                    Si tienes alguna pregunta, visita <a href="https://www.appcontrolbovino.com/" style="color: #2E7D32; text-decoration: none;">www.appcontrolbovino.com</a>
                                </p>
                                
                                <!-- Contact Info -->
                                <div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #e9ecef;">
                                    <p style="color: #6c757d; font-size: 12px; margin: 0;">
                                        📧 proyectocontrolbovino@gmail.com | 🌐 <a href="https://www.appcontrolbovino.com/" style="color: #2E7D32; text-decoration: none;">www.appcontrolbovino.com</a>
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
  `

  try {
    await transporter.sendMail({
      from: `"Sistema de Control Bovino" <${process.env.EMAIL}>`,
      to: destinatario,
      subject: asunto,
      html: htmlContent,
    })
    console.log(`📧 Correo enviado a ${destinatario}: ${asunto}`)
  } catch (err) {
    console.error("Error enviando correo:", err)
  }
}

export default router
