import express from "express"
import supabase from "../config/supabase.js"
import { verificarToken } from "../middleware/auth.js"

const router = express.Router()

// Obtener potreros de una finca
router.get("/:id", verificarToken, async (req, res) => {
  const { id } = req.params
  console.log("ID de la finca:", id)

  try {
    // Consulta SQL con el conteo de vacas y el promedio de producción de leche
    const { data, error } = await supabase.rpc("obtener_datos_potreros", { finca_id: id }) // Usamos la función almacenada `obtener_datos_potreros`

    if (error) {
      console.error("Error al obtener potreros:", error)
      return res.status(500).json({ message: "Error al obtener los potreros" })
    }

    res.status(200).json({
      message: "Potreros obtenidos con éxito",
      potreros: data, // Devuelve los datos de los potreros, vacas y promedio de leche
    })
  } catch (error) {
    console.error("Error en el servidor:", error)
    res.status(500).json({ message: "Error al obtener los potreros" })
  }
})

// Registrar un potrero
router.post("/:id", async (req, res) => {
  const { id } = req.params
  const { Nombre } = req.body

  try {
    const { data, error } = await supabase
      .from("Potrero")
      .insert([{ Nombre, FincaId: id }])
      .select()

    if (error) {
      console.error("Error al registrar potrero:", error)
      return res.status(500).json({ message: "Error al registrar el nuevo potrero" })
    }

    res.status(201).json({
      message: "Potrero registrado con exito",
      potrero: data[0],
    })
  } catch (error) {
    console.error("Error en el servidor:", error)
    res.status(500).json({ message: "Error al registrar el nuevo potrero" })
  }
})

export default router
