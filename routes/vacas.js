
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

router.delete("/vacas/eliminar/:id", verificarToken, async (req, res) => {
  const { id } = req.params
  console.log("ID del vaca:", id)

  try {
    const { data, error } = await supabase
      .from("Vaca")
      .delete()
      .match({ id: id })
      .select()

    if (error) {
      console.error("❌ Error al eliminar la vaca:", error)
      return res.status(500).json({ message: "Error al eliminar la vaca" })
    }

    res.status(200).json({
      message: "✅ Vaca eliminada con éxito",
      vaca: data[0],
    })
  } catch (error) {
    console.error("Error en el servidor:", error)
    res.status(500).json({ message: "Error al eliminar la vaca" })
  }
})


router.get("/veterinario/vacas/:id", verificarToken, async (req, res) => {
  const { id } = req.params
  console.log(`📌 Obteniendo vacas de veterinario con ID: ${id}`)

  try {
    const { data, error } = await supabase.from("Vaca").select("*").eq("Veterinario", id)
    
    if (error) {
      console.error("❌ Error al obtener el perfil de la vaca:", error)
      return res.status(500).json({ message: "Error al obtener el perfil de la vaca" })
    }

    res.status(200).json({
      message: "✅ perfil de la vaca obtenido con éxito",
      vacas: data,
    })

    
  } catch (error) {
    console.error("Error en el servidor:", error)
    res.status(500).json({ message: "Error al obtener el perfil de la vaca" })
  }
})

// Obtener veterinarios
router.get("/get/veterinarios", verificarToken, async (req, res) => {
  console.log("Obteniendo veterinarios")

  try {
    const { data, error } = await supabase.from("Usuario").select("*").eq("Rol", "Veterinario")

    if (error) {
      console.error("❌ Error al obtener el perfil de la vaca:", error)
      return res.status(500).json({ message: "Error al obtener el perfil de la vaca" })
    }

    res.status(200).json({
      message: "✅ perfil de la vaca obtenido con éxito",
      veterinarios: data,
    })
  } catch (error) {
    console.error("Error en el servidor:", error)
    res.status(500).json({ message: "Error al obtener el perfil de la vaca" })
  }
})

router.put("/veterinario/asignar/:id", verificarToken, async (req, res) => {
  const { id } = req.params
  const { veterinario_id } = req.body
  console.log(`📌 Asignando veterinario con ID: ${veterinario_id} a vaca: ${id}`)

  try {
    const { data, error } = await supabase
      .from("Vaca")
      .update({ Veterinario: veterinario_id })
      .eq("id", id)
      .select()  // Para asegurar que se devuelvan datos

    if (error) {
      console.error("❌ Error al asignar veterinario:", error)
      return res.status(500).json({ message: "Error al asignar veterinario" })
    }

    if (!data || data.length === 0) {
      return res.status(404).json({ message: "Vaca no encontrada o no actualizada" })
    }

    res.status(200).json({
      message: "✅ Veterinario asignado correctamente",
      veterinario_id: data[0].Veterinario,
    })
  } catch (error) {
    console.error("Error en el servidor:", error)
    res.status(500).json({ message: "Error en el servidor al asignar veterinario" })
  }
})

//rutas para registrar embarazo y desparasitacion
router.put("/vacas/embarazo/:id", verificarToken, async (req, res) => {
  const { id } = req.params
  const { fechaEmbarazo } = req.body
  console.log(`📌 Registrando embarazo con ID: ${id}`)
  try {
    const { data, error } = await supabase
      .from("Vaca")
      .update({ Fecha_Embarazo: fechaEmbarazo })
      .eq("id", id)
      .select()  // Para asegurar que se devuelvan datos
    if (error) {
      console.error("❌ Error al registrar embarazo:", error)
      return res.status(500).json({ message: "Error al registrar embarazo" })
    }
    res.status(200).json({
      message: "✅ Embarazo registrado correctamente",
      vaca: data[0],
    })
  } catch (error) {
    console.error("Error en el servidor:", error)
    res.status(500).json({ message: "Error en el servidor al registrar embarazo" })
  }
})

router.put("/vacas/desparasitacion/:id", verificarToken, async (req, res) => {
  const { id } = req.params
  const { fechaDesparasitacion } = req.body
  console.log(`📌 Registrando desparasitación con ID: ${id}`)
  try {
    const { data, error } = await supabase
      .from("Vaca")
      .update({ Fecha_Desparacitada: fechaDesparasitacion })
      .eq("id", id)
      .select()  // Para asegurar que se devuelvan datos
    if (error) {
      console.error("❌ Error al registrar desparasitación:", error)
      return res.status(500).json({ message: "Error al registrar desparasitación" })
    }
    res.status(200).json({
      message: "✅ Desparasitación registrada correctamente",
      vaca: data[0],
    })
  } catch (error) {
    console.error("Error en el servidor:", error)
    res.status(500).json({ message: "Error en el servidor al registrar desparasitación" })
  }
})

export default router
