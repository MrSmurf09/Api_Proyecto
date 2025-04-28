
import express from "express"
import supabase from "../config/supabase.js"
import { verificarToken } from "../middleware/auth.js"

const router = express.Router()

// Obtener vacas de un potrero
router.get("/vacas/:potreroId", verificarToken, async (req, res) => {
  const { potreroId } = req.params

  const { data, error } = await supabase.rpc("obtener_vacas_con_promedio", {
    potrero_id: Number(potreroId),
  })

  if (error) {
    console.error("Error al obtener vacas:", error)
    return res.status(500).json({ message: "Error al obtener las vacas" })
  }

  res.status(200).json({ vacas: data })
})

// Registrar una vaca
router.post("/vacas/nueva/:id", verificarToken, async (req, res) => {
  const { id } = req.params
  const { codigo, edad, raza, novedadesSanitarias, vacunas, fechaDesparasitacion, fechaEmbarazo } = req.body

  console.log("📌 Datos recibidos para registrar una vaca:", req.body)

  try {
    const { data, error } = await supabase
      .from("Vaca")
      .insert([
        {
          Codigo: codigo,
          Edad: edad,
          Raza: raza,
          Novedad_Sanitaria: novedadesSanitarias,
          Vacunas: vacunas,
          Fecha_Desparacitada: fechaDesparasitacion,
          Fecha_Embarazo: fechaEmbarazo,
          PotreroId: id,
        },
      ])
      .select()

    if (error) {
      console.error("❌ Error al registrar la vaca:", error)
      return res.status(500).json({ message: "Error al registrar la vaca" })
    }

    res.status(201).json({
      message: "✅ Vaca registrada con éxito",
      vaca: data[0],
    })
  } catch (error) {
    console.error("Error en el servidor:", error)
    res.status(500).json({ message: "Error al registrar la vaca" })
  }
})

// Obtener perfil de una vaca
router.get("/vacas/perfil/:id", verificarToken, async (req, res) => {
  const { id } = req.params
  console.log(`📌 Obteniendo perfil de la vaca con ID: ${id}`)

  try {
    const { data, error } = await supabase.from("Vaca").select("*").eq("id", id)

    if (error) {
      console.error("❌ Error al obtener el perfil de la vaca:", error)
      return res.status(500).json({ message: "Error al obtener el perfil de la vaca" })
    }

    res.status(200).json({
      message: "✅ perfil de la vaca obtenido con éxito",
      vaca: data,
    })
  } catch (error) {
    console.error("Error en el servidor:", error)
    res.status(500).json({ message: "Error al obtener el perfil de la vaca" })
  }
})

export default router
