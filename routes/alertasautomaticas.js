import express from "express"
import supabase from "../config/supabase.js"
import nodemailer from 'nodemailer'
import dayjs from 'dayjs'

const router = express.Router()

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL,
    pass: process.env.PASS
  }
})

// Ruta: /api/revisar-vacas
router.get('/revisar-vacas', async (req, res) => {
  try {
    const hoy = dayjs()
    const { data: vacas, error } = await supabase
      .from('Vaca')
      .select(`
        id, Codigo, Fecha_Embarazo, Fecha_Desparacitada, PotreroId,
        Potrero:PotreroId (
          id,
          Finca:FincaId (
            id,
            UsuarioId,
            Usuario:UsuarioId (
              id,
              Correo
            )
          )
        )
      `)

    if (error) {
      console.error('Error al consultar vacas:', error)
      return res.status(500).json({ error: 'Error al consultar vacas' })
    }

    const yaNotificados = new Set()
    const resultados = []

    for (const vaca of vacas) {
      const { id, Codigo, Fecha_Embarazo, Fecha_Desparacitada, PotreroId, Potrero } = vaca
      const correoUsuario = Potrero.Finca.Usuario.Correo

      if (!correoUsuario) continue

      // --- EMBARAZO ---
      if (Fecha_Embarazo) {
        const fechaParto = dayjs(Fecha_Embarazo).add(280, 'day')
        const diasFaltantes = fechaParto.diff(hoy, 'day')

        if (diasFaltantes <= 3 && diasFaltantes >= 0) {
          await enviarCorreo(correoUsuario, `Vaca ${Codigo} está próxima a parir`, `El parto se estima para el ${fechaParto.format('YYYY-MM-DD')}`)

          await supabase.from('Vaca').update({ Fecha_Embarazo: null }).eq('id', id)

          resultados.push(`Embarazo - Vaca ${Codigo}: Alerta enviada y fecha eliminada.`)
        }
      }

      // --- DESPARASITACIÓN ---
      if (Fecha_Desparacitada) {
        const siguiente = dayjs(Fecha_Desparacitada).add(3, 'month')
        const diasFaltantes = siguiente.diff(hoy, 'day')

        if (diasFaltantes <= 3 && diasFaltantes >= 0 && !yaNotificados.has(PotreroId)) {
          await enviarCorreo(correoUsuario, `Desparasitación pendiente`, `Hay vacas del potrero ${PotreroId} que deben ser desparasitadas para el ${siguiente.format('YYYY-MM-DD')}`)

          yaNotificados.add(PotreroId)

          await supabase.from('Vaca').update({ Fecha_Desparacitada: siguiente.toISOString() }).eq('PotreroId', PotreroId)

          resultados.push(`Desparasitación - Potrero ${PotreroId}: Alerta enviada y fecha actualizada.`)
        }
      }
    }

    res.json({ success: true, detalles: resultados })
  } catch (err) {
    console.error('Error en /revisar-vacas:', err)
    res.status(500).json({ error: 'Error en la ejecución del recordatorio automático' })
  }
})

async function enviarCorreo(destinatario, asunto, contenido) {
  try {
    await transporter.sendMail({
      from: `"Control Bovino" <${process.env.EMAIL}>`,
      to: destinatario,
      subject: asunto,
      text: contenido
    })
    console.log(`📧 Correo enviado a ${destinatario}: ${asunto}`)
  } catch (err) {
    console.error('Error enviando correo:', err)
  }
}

export default router