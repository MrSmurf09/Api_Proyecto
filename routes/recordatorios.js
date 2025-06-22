import express from "express"
import { createTransport } from "nodemailer"
import supabase from "../config/supabase.js"
import { verificarToken } from "../middleware/auth.js"

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
  const fechaColombia = new Date(Fecha)
  const offsetColombia = 5 * 60 // Colombia está en UTC-5
  const fechaUTC = new Date(fechaColombia.getTime() + offsetColombia * 60000) // SUMAR para ir a UTC

  console.log("💡 Fecha Colombia interpretada:", fechaColombia.toString())
  console.log("📦 Fecha UTC para guardar:", fechaUTC.toISOString())
  try {
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

    // Insertar el recordatorio
    const { data, error } = await supabase
      .from("Recordatorio")
      .insert([{ Fecha: fechaColombia.toISOString(), Titulo, Descripcion, Tipo, UsuarioId, VacaId: id }])
      .select()

    if (error) {
      console.error("❌ Error al registrar el recordatorio:", error)
      return res.status(500).json({ message: "Error al registrar el recordatorio" })
    }

    const recordatorio = data[0]

    res.status(201).json({
      message: "✅ Recordatorio registrado con éxito",
      recordatorios: recordatorio,
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
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc.js'
import timezone from 'dayjs/plugin/timezone.js'

dayjs.extend(utc)
dayjs.extend(timezone)

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
        text: `Hola ${usuario.Nombre},\n\nEste es tu recordatorio programado para las ${dayjs(r.Fecha).tz("America/Bogota").format("HH:mm")}:\n\n${r.Descripcion}\n\nTipo: ${r.Tipo}`,
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
