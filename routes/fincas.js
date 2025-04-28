import express from "express"
import fs from "fs"
import path from "path"
import supabase from "../config/supabase.js"
import upload from "../config/multer.js"
import { verificarToken } from "../middleware/auth.js"

const router = express.Router()

// Registrar una finca
router.post("/", upload.single("Imagen"), async (req, res) => {
  const { Nombre, Descripcion } = req.body
  const usuarioId = req.body.UsuarioId
  let imagenUrl = null

  try {
    // Si hay una imagen, subirla a Supabase Storage
    if (req.file) {
      const filePath = req.file.path
      const fileExt = path.extname(req.file.originalname)
      const fileName = `${Date.now()}${fileExt}`

      // Leer el archivo
      const fileBuffer = fs.readFileSync(filePath)

      // Subir a Supabase Storage
      const { data, error } = await supabase.storage.from("fincas").upload(`imagenes/${fileName}`, fileBuffer, {
        contentType: req.file.mimetype,
      })

      if (error) {
        console.error("Error al subir imagen:", error)
        return res.status(500).json({ message: "Error al subir la imagen" })
      }

      // Obtener URL pública
      const { data: urlData } = supabase.storage.from("fincas").getPublicUrl(`imagenes/${fileName}`)

      imagenUrl = urlData.publicUrl

      // Eliminar archivo temporal
      fs.unlinkSync(filePath)
    }

    // Insertar finca en la base de datos
    const { data, error } = await supabase
      .from("Finca")
      .insert([{ Nombre, Descripcion, Imagen: imagenUrl, UsuarioId: usuarioId }])
      .select()

    if (error) {
      console.error("Error al registrar finca:", error)
      return res.status(500).json({ message: "Error al registrar la finca" })
    }

    res.status(201).json({
      message: "Finca registrada con éxito",
      finca: data[0],
    })
  } catch (error) {
    console.error("Error en el servidor:", error)
    res.status(500).json({ message: "Error al registrar la finca" })
  }
})

// Obtener fincas de un usuario
router.get("/", verificarToken, async (req, res) => {
  const usuarioId = req.query.UsuarioId
  console.log("UsuarioId:", usuarioId)

  if (!usuarioId) {
    return res.status(400).json({ message: "UsuarioId no proporcionado" })
  }

  try {
    const { data, error } = await supabase.from("vista_fincas_con_potreros").select("*").eq("UsuarioId", usuarioId)

    if (error) {
      console.error("Error al obtener fincas:", error)
      return res.status(500).json({ message: "Error al obtener las fincas" })
    }

    res.status(200).json({
      message: "Fincas obtenidas con éxito",
      fincas: data,
    })
  } catch (error) {
    console.error("Error en el servidor:", error)
    res.status(500).json({ message: "Error al obtener las fincas" })
  }
})

// Editar finca
router.put("/:id", upload.single("Imagen"), async (req, res) => {
  const { id } = req.params
  const { Nombre, Descripcion } = req.body
  let imagenUrl = null

  try {
    // Obtener la finca actual para verificar si ya tiene imagen
    const { data: fincaActual, error: errorFinca } = await supabase.from("Finca").select("Imagen").eq("id", id).single()

    if (errorFinca) {
      console.error("Error al obtener finca:", errorFinca)
      return res.status(500).json({ message: "Error al actualizar la finca" })
    }

    // Si hay una nueva imagen, subirla a Supabase Storage
    if (req.file) {
      const filePath = req.file.path
      const fileExt = path.extname(req.file.originalname)
      const fileName = `${Date.now()}${fileExt}`

      // Leer el archivo
      const fileBuffer = fs.readFileSync(filePath)

      // Subir a Supabase Storage
      const { data, error } = await supabase.storage.from("fincas").upload(`imagenes/${fileName}`, fileBuffer, {
        contentType: req.file.mimetype,
      })

      if (error) {
        console.error("Error al subir imagen:", error)
        return res.status(500).json({ message: "Error al subir la imagen" })
      }

      // Obtener URL pública
      const { data: urlData } = supabase.storage.from("fincas").getPublicUrl(`imagenes/${fileName}`)

      imagenUrl = urlData.publicUrl

      // Eliminar archivo temporal
      fs.unlinkSync(filePath)
    }

    // Actualizar finca en la base de datos
    const updateData = {
      Nombre,
      Descripcion,
    }

    // Solo actualizar la imagen si hay una nueva
    if (imagenUrl) {
      updateData.Imagen = imagenUrl
    }

    const { data, error } = await supabase.from("Finca").update(updateData).eq("id", id).select()

    if (error) {
      console.error("Error al actualizar finca:", error)
      return res.status(500).json({ message: "Error al actualizar la finca" })
    }

    res.status(200).json({
      message: "Finca actualizada con éxito",
      finca: data[0],
    })
  } catch (error) {
    console.error("Error en el servidor:", error)
    res.status(500).json({ message: "Error al actualizar la finca" })
  }
})

// Eliminar finca
router.delete("/:id", async (req, res) => {
  const { id } = req.params
  console.log("ID recibido para eliminar:", id)

  try {
    // Obtener la finca para verificar si tiene imagen
    const { data: finca, error: errorFinca } = await supabase.from("Finca").select("Imagen").eq("id", id).single()

    if (errorFinca && errorFinca.code !== "PGRST116") {
      // No es error si no encuentra la finca
      console.error("Error al obtener finca:", errorFinca)
      return res.status(500).json({ message: "Error al eliminar la finca" })
    }

    // Si la finca tiene una imagen en Storage, eliminarla
    if (finca && finca.Imagen) {
      try {
        // Extraer el nombre del archivo de la URL
        const url = new URL(finca.Imagen)
        const pathParts = url.pathname.split("/")
        const fileName = pathParts[pathParts.length - 1]
        const filePath = `imagenes/${fileName}`

        // Eliminar archivo de Storage
        const { error: deleteError } = await supabase.storage.from("fincas").remove([filePath])

        if (deleteError) {
          console.error("Error al eliminar imagen:", deleteError)
          // Continuamos con la eliminación de la finca aunque falle la eliminación de la imagen
        }
      } catch (e) {
        console.error("Error al procesar la URL de la imagen:", e)
        // Continuamos con la eliminación de la finca
      }
    }

    // Eliminar la finca
    const { error } = await supabase.from("Finca").delete().eq("id", id)

    if (error) {
      console.error("Error al eliminar finca:", error)
      return res.status(500).json({ message: "Error al eliminar la finca" })
    }

    res.status(200).json({
      message: "Finca eliminada con éxito",
      finca: { id },
    })
  } catch (error) {
    console.error("Error en el servidor:", error)
    res.status(500).json({ message: "Error al eliminar la finca" })
  }
})

export default router
