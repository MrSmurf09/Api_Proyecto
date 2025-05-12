import express from "express"
import supabase from "../config/supabase.js"

const router = express.Router()

// Obtener producción de leche de una vaca
router.get("/produccion/leche/:id", async (req, res) => {
  const { id } = req.params
  console.log(`📌 Obteniendo produccion de leche de la vaca con ID: ${id}`)

  try {
    const { data, error } = await supabase
      .from("ProduccionLeche")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(6)
      .eq("VacaId", id)

    if (error) {
      console.error("❌ Error al obtener la produccion de leche:", error)
      return res.status(500).json({ message: "Error al obtener la produccion de leche" })
    }

    res.status(200).json({
      message: "✅ Produccion de leche obtenida con éxito",
      registros: data,
    })
  } catch (error) {
    console.error("Error en el servidor:", error)
    res.status(500).json({ message: "Error al obtener la produccion de leche" })
  }
})

// Obtener historial de producción de leche
router.get("/historial/produccion/:id", async (req, res) => {
  const { id } = req.params
  console.log(`Obteniendo el historial de produccion de la vaca con ID: ${id}`)

  try {
    const { data, error } = await supabase
      .from("ProduccionLeche")
      .select("*")
      .order("created_at", { ascending: false })
      .eq("VacaId", id)

    if (error) {
      console.error("❌ Error al obtener el historial de produccion:", error)
      return res.status(500).json({ message: "Error al obtener el historial de produccion" })
    }

    res.status(200).json({
      message: "✅ Historial de produccion obtenido con éxito",
      registros: data,
    })
  } catch (error) {
    console.error("Error en el servidor:", error)
    res.status(500).json({ message: "Error al obtener el historial de producción" })
  }
})

// Registrar producción de leche
router.post("/registrar/leche/:id", async (req, res) => {
  const { id } = req.params
  const { Fecha, Cantidad } = req.body

  try {
    const { data, error } = await supabase
      .from("ProduccionLeche")
      .insert([{ Fecha, Cantidad, VacaId: id }])
      .select()

    if (error) {
      console.error("❌ Error al registrar la produccion de leche:", error)
      return res.status(500).json({ message: "Error al registrar la produccion de leche" })
    }

    res.status(201).json({
      message: "✅ Produccion de leche registrada con éxito",
      registro: data[0],
    })
  } catch (error) {
    console.error("Error en el servidor:", error)
    res.status(500).json({ message: "Error al registrar la produccion de leche" })
  }
})

// Eliminar producción de leche
router.delete("/eliminar/produccion/:id", async (req, res) => {
  const { id } = req.params
  console.log("ID del vaca:", id)

  try {
    const { data, error } = await supabase
      .from("ProduccionLeche")
      .delete()
      .match({ id: id })
      .select()

    if (error) {
      console.error("❌ Error al eliminar la produccion de leche:", error)
      return res.status(500).json({ message: "Error al eliminar la produccion de leche" })
    }

    res.status(200).json({
      message: "✅ Produccion de leche eliminada con éxito",
      registro: data[0],
    })
  } catch (error) {
    console.error("Error en el servidor:", error)
    res.status(500).json({ message: "Error al eliminar la produccion de leche" })
  }
})

export default router
