import express from "express"
import supabase from "../config/supabase.js"

const router = express.Router()

// Obtener procesos de medico de una vaca
router.get("/procesos/medicos/:id", async (req, res) => {
  const { id } = req.params
  console.log(`📌 Obteniendo procesos de medico de la vaca con ID: ${id}`)

  try {
    const { data, error } = await supabase
      .from("ProcedimientoMedico")
      .select("*")
      .order("created_at", { ascending: false })
      .eq("VacaId", id)

    if (error) {
      console.error("❌ Error al obtener los procesos de medico:", error)
      return res.status(500).json({ message: "Error al obtener los procesos de medico" })
    }

    res.status(200).json({
      message: "✅ Procesos de medico obtenidos con éxito",
      procesos: data,
    })
  } catch (error) {
    console.error("Error en el servidor:", error)
    res.status(500).json({ message: "Error al obtener las procesos de medico" })
  }
})

// Registrar procesos de medico de una vaca
router.post("/registrar/procesos/medicos/:id", async (req, res) => {
  const { id } = req.params
  const { Fecha, Tipo, Descripcion, Estado } = req.body

  console.log("📌 Datos recibidos para registrar los procesos de medico de la vaca:", req.body)

  try {
    const { data, error } = await supabase
      .from("ProcedimientoMedico")
      .insert([{ Fecha, Tipo, Descripcion, Estado, VacaId: id }])
      .select()

    if (error) {
      console.error("❌ Error al registrar los procesos de medico:", error)
      return res.status(500).json({ message: "Error al registrar los procesos de medico" })
    }

    res.status(201).json({
      message: "✅ Procesos de medico registrados con éxito",
      procesos: data[0],
    })
  } catch (error) {
    console.error("Error en el servidor:", error)
    res.status(500).json({ message: "Error al registrar los procesos de medico" })
  }
})

//eliminar procesos de medico de una vaca
router.delete("/procesos/medicos/eliminar/:id", async (req, res) => {
  const { id } = req.params
  console.log("ID del vaca:", id)

  try {
    const { data, error } = await supabase
      .from("ProcedimientoMedico")
      .delete()
      .match({ id: id })
      .select()

    if (error) {
      console.error("❌ Error al eliminar los procesos de medico:", error)
      return res.status(500).json({ message: "Error al eliminar los procesos de medico" })
    }

    res.status(200).json({
      message: "✅ Procesos de medico eliminados con éxito",
      procesos: data[0],
    })
  } catch (error) {
    console.error("Error en el servidor:", error)
    res.status(500).json({ message: "Error al eliminar los procesos de medico" })
  }
})

export default router
