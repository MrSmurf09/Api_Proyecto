import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import fs from 'fs';

// Configuración básica
const app = express();
const port = process.env.PORT;
const SECRET_KEY = "ControlBovino";

// Middleware
app.use(cors());
app.use(express.json());

// Configuración de Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

console.log("Supabase configurado con URL:", supabaseUrl);

// Configuración para manejo de archivos temporales
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const uploadsDir = path.join(__dirname, 'uploads');

// Crear directorio de uploads si no existe
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configuración de multer para subir archivos
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  },
});

const upload = multer({ storage });

// Servir archivos estáticos
app.use('/uploads', express.static(uploadsDir));

// ======== RUTAS DE USUARIOS ========

// Registro de usuario
app.post("/usuario/registrar", async (req, res) => {
  const { Nombre, Correo, Contraseña, Telefono } = req.body;
  console.log("Datos recibidos del form:", { Nombre, Correo, Contraseña, Telefono });

  try {
    // Hashear la contraseña
    const hashedPassword = await bcrypt.hash(Contraseña, 10);

    // Insertar usuario en Supabase
    const { data, error } = await supabase
      .from('Usuario')
      .insert([
        { Nombre, Correo, Contraseña: hashedPassword, Telefono }
      ])
      .select();

    if (error) {
      console.error("Error al registrar usuario:", error);
      return res.status(500).json({ error: error.message });
    }

    res.status(201).json({
      message: "Usuario registrado con éxito",
      id: data[0].id
    });
  } catch (error) {
    console.error("Error en el servidor:", error);
    res.status(500).json({ error: "Error al registrar usuario" });
  }
});

// Login de usuario
app.post("/usuario/login", async (req, res) => {
  const { Correo, Contraseña } = req.body;

  try {
    // Buscar usuario por correo
    const { data: usuarios, error } = await supabase
      .from('Usuario')
      .select('*')
      .eq('Correo', Correo)
      .single();

    if (error || !usuarios) {
      return res.status(401).json({ message: "Correo o contraseña incorrectos" });
    }

    // Verificar contraseña
    const esValida = await bcrypt.compare(Contraseña, usuarios.Contraseña);

    if (!esValida) {
      return res.status(401).json({ message: "Correo o contraseña incorrectos" });
    }

    // Generar token JWT
    const token = jwt.sign({ id: usuarios.id }, SECRET_KEY);

    res.status(200).json({
      message: "Inicio de sesión exitoso",
      userId: usuarios.id,
      token
    });
  } catch (error) {
    console.error("Error en el servidor:", error);
    res.status(500).json({ error: "Error del servidor" });
  }
});

// ======== RUTAS DE FINCAS ========

// Registrar una finca
app.post("/api/fincas", upload.single("Imagen"), async (req, res) => {
  const { Nombre, Descripcion } = req.body;
  const usuarioId = req.body.UsuarioId;
  let imagenUrl = null;

  try {
    // Si hay una imagen, subirla a Supabase Storage
    if (req.file) {
      const filePath = req.file.path;
      const fileExt = path.extname(req.file.originalname);
      const fileName = `${Date.now()}${fileExt}`;
      
      // Leer el archivo
      const fileBuffer = fs.readFileSync(filePath);
      
      // Subir a Supabase Storage
      const { data, error } = await supabase
        .storage
        .from('fincas')
        .upload(`imagenes/${fileName}`, fileBuffer, {
          contentType: req.file.mimetype,
        });
      
      if (error) {
        console.error("Error al subir imagen:", error);
        return res.status(500).json({ message: "Error al subir la imagen" });
      }
      
      // Obtener URL pública
      const { data: urlData } = supabase
        .storage
        .from('fincas')
        .getPublicUrl(`imagenes/${fileName}`);
      
      imagenUrl = urlData.publicUrl;
      
      // Eliminar archivo temporal
      fs.unlinkSync(filePath);
    }

    // Insertar finca en la base de datos
    const { data, error } = await supabase
      .from('Finca')
      .insert([
        { Nombre, Descripcion, Imagen: imagenUrl, UsuarioId: usuarioId }
      ])
      .select();

    if (error) {
      console.error("Error al registrar finca:", error);
      return res.status(500).json({ message: "Error al registrar la finca" });
    }

    res.status(201).json({
      message: "Finca registrada con éxito",
      finca: data[0]
    });
  } catch (error) {
    console.error("Error en el servidor:", error);
    res.status(500).json({ message: "Error al registrar la finca" });
  }
});

// Obtener fincas de un usuario
app.get("/api/fincas", async (req, res) => {
  const usuarioId = req.query.UsuarioId;
  console.log("UsuarioId:", usuarioId);

  if (!usuarioId) {
    return res.status(400).json({ message: "UsuarioId no proporcionado" });
  }

  try {
    const { data, error } = await supabase
      .from('Finca')
      .select('*')
      .eq('UsuarioId', usuarioId);

    if (error) {
      console.error("Error al obtener fincas:", error);
      return res.status(500).json({ message: "Error al obtener las fincas" });
    }

    res.status(200).json({
      message: "Fincas obtenidas con éxito",
      fincas: data
    });
  } catch (error) {
    console.error("Error en el servidor:", error);
    res.status(500).json({ message: "Error al obtener las fincas" });
  }
});

// Editar finca
app.put("/api/fincas/:id", upload.single("Imagen"), async (req, res) => {
  const { id } = req.params;
  const { Nombre, Descripcion } = req.body;
  let imagenUrl = null;

  try {
    // Obtener la finca actual para verificar si ya tiene imagen
    const { data: fincaActual, error: errorFinca } = await supabase
      .from('Finca')
      .select('Imagen')
      .eq('id', id)
      .single();

    if (errorFinca) {
      console.error("Error al obtener finca:", errorFinca);
      return res.status(500).json({ message: "Error al actualizar la finca" });
    }

    // Si hay una nueva imagen, subirla a Supabase Storage
    if (req.file) {
      const filePath = req.file.path;
      const fileExt = path.extname(req.file.originalname);
      const fileName = `${Date.now()}${fileExt}`;
      
      // Leer el archivo
      const fileBuffer = fs.readFileSync(filePath);
      
      // Subir a Supabase Storage
      const { data, error } = await supabase
        .storage
        .from('fincas')
        .upload(`imagenes/${fileName}`, fileBuffer, {
          contentType: req.file.mimetype,
        });
      
      if (error) {
        console.error("Error al subir imagen:", error);
        return res.status(500).json({ message: "Error al subir la imagen" });
      }
      
      // Obtener URL pública
      const { data: urlData } = supabase
        .storage
        .from('fincas')
        .getPublicUrl(`imagenes/${fileName}`);
      
      imagenUrl = urlData.publicUrl;
      
      // Eliminar archivo temporal
      fs.unlinkSync(filePath);
    }

    // Actualizar finca en la base de datos
    const updateData = {
      Nombre,
      Descripcion
    };

    // Solo actualizar la imagen si hay una nueva
    if (imagenUrl) {
      updateData.Imagen = imagenUrl;
    }

    const { data, error } = await supabase
      .from('Finca')
      .update(updateData)
      .eq('id', id)
      .select();

    if (error) {
      console.error("Error al actualizar finca:", error);
      return res.status(500).json({ message: "Error al actualizar la finca" });
    }

    res.status(200).json({
      message: "Finca actualizada con éxito",
      finca: data[0]
    });
  } catch (error) {
    console.error("Error en el servidor:", error);
    res.status(500).json({ message: "Error al actualizar la finca" });
  }
});

// Eliminar finca
app.delete("/api/fincas/:id", async (req, res) => {
  const { id } = req.params;
  console.log("ID recibido para eliminar:", id);

  try {
    // Obtener la finca para verificar si tiene imagen
    const { data: finca, error: errorFinca } = await supabase
      .from('Finca')
      .select('Imagen')
      .eq('id', id)
      .single();

    if (errorFinca && errorFinca.code !== 'PGRST116') { // No es error si no encuentra la finca
      console.error("Error al obtener finca:", errorFinca);
      return res.status(500).json({ message: "Error al eliminar la finca" });
    }

    // Si la finca tiene una imagen en Storage, eliminarla
    if (finca && finca.Imagen) {
      try {
        // Extraer el nombre del archivo de la URL
        const url = new URL(finca.Imagen);
        const pathParts = url.pathname.split('/');
        const fileName = pathParts[pathParts.length - 1];
        const filePath = `imagenes/${fileName}`;

        // Eliminar archivo de Storage
        const { error: deleteError } = await supabase
          .storage
          .from('fincas')
          .remove([filePath]);

        if (deleteError) {
          console.error("Error al eliminar imagen:", deleteError);
          // Continuamos con la eliminación de la finca aunque falle la eliminación de la imagen
        }
      } catch (e) {
        console.error("Error al procesar la URL de la imagen:", e);
        // Continuamos con la eliminación de la finca
      }
    }

    // Eliminar la finca
    const { error } = await supabase
      .from('Finca')
      .delete()
      .eq('id', id);

    if (error) {
      console.error("Error al eliminar finca:", error);
      return res.status(500).json({ message: "Error al eliminar la finca" });
    }

    res.status(200).json({
      message: "Finca eliminada con éxito",
      finca: { id }
    });
  } catch (error) {
    console.error("Error en el servidor:", error);
    res.status(500).json({ message: "Error al eliminar la finca" });
  }
});

// ======== RUTAS DE POTREROS ========

// Obtener potreros de una finca
app.get("/api/potreros/:id", async (req, res) => {
  const { id } = req.params;
  console.log("ID de la finca:", id);

  try {
    const { data, error } = await supabase
      .from('Potrero')
      .select('*')
      .eq('FincaId', id);

    if (error) {
      console.error("Error al obtener potreros:", error);
      return res.status(500).json({ message: "Error al obtener los potreros" });
    }

    res.status(200).json({
      message: "Potreros obtenidos con exito",
      potreros: data
    });
  } catch (error) {
    console.error("Error en el servidor:", error);
    res.status(500).json({ message: "Error al obtener los potreros" });
  }
});

// Registrar un potrero
app.post("/api/potreros/:id", async (req, res) => {
  const { id } = req.params;
  const { Nombre } = req.body;

  try {
    const { data, error } = await supabase
      .from('Potrero')
      .insert([
        { Nombre, FincaId: id }
      ])
      .select();

    if (error) {
      console.error("Error al registrar potrero:", error);
      return res.status(500).json({ message: "Error al registrar el nuevo potrero" });
    }

    res.status(201).json({
      message: "Potrero registrado con exito",
      potrero: data[0]
    });
  } catch (error) {
    console.error("Error en el servidor:", error);
    res.status(500).json({ message: "Error al registrar el nuevo potrero" });
  }
});

// ======== RUTAS DE VACAS ========

// Obtener vacas de un potrero
app.get("/api/vacas/:id", async (req, res) => {
  const { id } = req.params;
  console.log(`📌 Obteniendo vacas del potrero con ID: ${id}`);

  try {
    const { data, error } = await supabase
      .from('Vaca')
      .select('*')
      .eq('PotreroId', id);

    if (error) {
      console.error("❌ Error al obtener las vacas:", error);
      return res.status(500).json({ message: "Error al obtener las vacas" });
    }

    res.status(200).json({
      message: "✅ Vacas obtenidas con éxito",
      vacas: data
    });
  } catch (error) {
    console.error("Error en el servidor:", error);
    res.status(500).json({ message: "Error al obtener las vacas" });
  }
});

// Registrar una vaca
app.post("/vacas/nueva/:id", async (req, res) => {
  const { id } = req.params;
  const {
    codigo,
    edad,
    raza,
    novedadesSanitarias,
    vacunas,
    // desparasitacion,
    fechaDesparasitacion,
    // embarazo,
    fechaEmbarazo,
  } = req.body;

  console.log("📌 Datos recibidos para registrar una vaca:", req.body);

  try {
    const { data, error } = await supabase
      .from('Vaca')
      .insert([
        {
          Codigo: codigo,
          Edad: edad,
          Raza: raza,
          Novedad_Sanitaria: novedadesSanitarias,
          Vacunas: vacunas,
          // Desparacitada: desparasitacion,
          Fecha_Desparacitada: fechaDesparasitacion,
          // Embarazada: embarazo,
          Fecha_Embarazo: fechaEmbarazo,
          PotreroId: id
        }
      ])
      .select();

    if (error) {
      console.error("❌ Error al registrar la vaca:", error);
      return res.status(500).json({ message: "Error al registrar la vaca" });
    }

    res.status(201).json({
      message: "✅ Vaca registrada con éxito",
      vaca: data[0]
    });
  } catch (error) {
    console.error("Error en el servidor:", error);
    res.status(500).json({ message: "Error al registrar la vaca" });
  }
});

// Obtener perfil de una vaca
app.get("/api/vacas/perfil/:id", async (req, res) => {
  const { id } = req.params;
  console.log(`📌 Obteniendo perfil de la vaca con ID: ${id}`);

  try {
    const { data, error } = await supabase
      .from('Vaca')
      .select('*')
      .eq('id', id);

    if (error) {
      console.error("❌ Error al obtener el perfil de la vaca:", error);
      return res.status(500).json({ message: "Error al obtener el perfil de la vaca" });
    }

    res.status(200).json({
      message: "✅ perfil de la vaca obtenido con éxito",
      vaca: data
    });
  } catch (error) {
    console.error("Error en el servidor:", error);
    res.status(500).json({ message: "Error al obtener el perfil de la vaca" });
  }
});

// ======== RUTAS DE PRODUCCIÓN DE LECHE ========

// Obtener producción de leche de una vaca
app.get("/api/produccion/leche/:id", async (req, res) => {
  const { id } = req.params;
  console.log(`📌 Obteniendo produccion de leche de la vaca con ID: ${id}`);

  try {
    const { data, error } = await supabase
      .from('ProduccionLeche')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(6)
      .eq('VacaId', id);

    if (error) {
      console.error("❌ Error al obtener la produccion de leche:", error);
      return res.status(500).json({ message: "Error al obtener la produccion de leche" });
    }

    res.status(200).json({
      message: "✅ Produccion de leche obtenida con éxito",
      registros: data
    });
  } catch (error) {
    console.error("Error en el servidor:", error);
    res.status(500).json({ message: "Error al obtener la produccion de leche" });
  }
});

// Obtener historial de producción de leche
app.get("/api/historial/produccion/:id", async (req, res) => {
  const { id } = req.params;
  console.log(`Obteniendo el historial de produccion de la vaca con ID: ${id}`);

  try {
    const { data, error } = await supabase
      .from('ProduccionLeche')
      .select('*')
      .order('created_at', { ascending: false })
      .eq('VacaId', id);

      if (error) {
        console.error("❌ Error al obtener el historial de produccion:", error);
        return res.status(500).json({ message: "Error al obtener el historial de produccion" });
      }

      res.status(200).json({
        message: "✅ Historial de produccion obtenido con éxito",
        registros: data
      });
  } catch (error) {
    console.error("Error en el servidor:", error);
  }
})

// Registrar producción de leche
app.post("/api/registrar/leche/:id", async (req, res) => {
  const { id } = req.params;
  const { Fecha, Cantidad } = req.body;

  try {
    const { data, error } = await supabase
      .from('ProduccionLeche')
      .insert([
        { Fecha, Cantidad, VacaId: id }
      ])
      .select();

    if (error) {
      console.error("❌ Error al registrar la produccion de leche:", error);
      return res.status(500).json({ message: "Error al registrar la produccion de leche" });
    }

    res.status(201).json({
      message: "✅ Produccion de leche registrada con éxito",
      registro: data[0]
    });
  } catch (error) {
    console.error("Error en el servidor:", error);
    res.status(500).json({ message: "Error al registrar la produccion de leche" });
  }
});


// ======== RUTAS DE PROCEDIMIENTO MEDICO ========

// Obtener procesos de medico de una vaca
app.get("/api/procesos/medicos/:id", async (req, res) => {
  const { id } = req.params;
  console.log(`📌 Obteniendo procesos de medico de la vaca con ID: ${id}`);

  try {
    const { data, error } = await supabase
      .from('ProcedimientoMedico')
      .select('*')
      .order('created_at', { ascending: false })
      .eq('VacaId', id);

    if (error) {
      console.error("❌ Error al obtener los procesos de medico:", error);
      return res.status(500).json({ message: "Error al obtener los procesos de medico" });
    }

    res.status(200).json({
      message: "✅ Procesos de medico obtenidos con éxito",
      procesos: data
    });
  } catch (error) {
    console.error("Error en el servidor:", error);
    res.status(500).json({ message: "Error al obtener las procesos de medico" });
  }
});

// Registrar procesos de medico de una vaca
app.post("/api/registrar/procesos/medicos/:id", async (req, res) => {
  const { id } = req.params;
  const { Fecha, Tipo, Descripcion, Estado } = req.body;

  console.log("📌 Datos recibidos para registrar los procesos de medico de la vaca:", req.body);

  try {
    const { data, error } = await supabase
      .from('ProcedimientoMedico')
      .insert([
        { Fecha, Tipo, Descripcion, Estado, VacaId: id }
      ])
      .select();

    if (error) {
      console.error("❌ Error al registrar los procesos de medico:", error);
      return res.status(500).json({ message: "Error al registrar los procesos de medico" });
    }

    res.status(201).json({
      message: "✅ Procesos de medico registrados con éxito",
      procesos: data[0]
    });
  } catch (error) {
    console.error("Error en el servidor:", error);
    res.status(500).json({ message: "Error al registrar los procesos de medico" });
  }
});

// ======== RUTAS DE Recordatorios ========

// Obtener recordatorios de una vaca
app.get("/api/obtener/recordatorios/:id", async (req, res) => {
  const { id } = req.params;
  console.log(`📌 Obteniendo recordatorios de la vaca con ID: ${id}`);

  try {
    const { data, error } = await supabase
      .from('Recordatorio')
      .select('*')
      .order('created_at', { ascending: false })
      .eq('VacaId', id);

    if (error) {
      console.error("❌ Error al obtener los recordatorios:", error);
      return res.status(500).json({ message: "Error al obtener los recordatorios" });
    }

    res.status(200).json({
      message: "✅ Recordatorios obtenidos con éxito",
      recordatorios: data
    });
  } catch (error) {
    console.error("Error en el servidor:", error);
    res.status(500).json({ message: "Error al obtener los recordatorios" });
  }
});

// Registrar recordatorios de una vaca
app.post("/api/registrar/recordatorios/:id", async (req, res) => {
  const { id } = req.params;
  const { Fecha, Titulo, Descripcion, Tipo, UsuarioId } = req.body;

  console.log("📌 Datos recibidos para registrar los recordatorios de la vaca:", req.body);

  try {
    const { data, error } = await supabase
      .from('Recordatorio')
      .insert([
        { Fecha, Titulo, Descripcion, Tipo, UsuarioId, VacaId: id }
      ])
      .select();

    if (error) {
      console.error("❌ Error al registrar los recordatorios:", error);
      return res.status(500).json({ message: "Error al registrar los recordatorios" });
    }

    res.status(201).json({
      message: "✅ Recordatorios registrados con éxito",
      recordatorios: data[0]
    });
  } catch (error) {
    console.error("Error en el servidor:", error);
    res.status(500).json({ message: "Error al registrar los recordatorios" });
  }
});

// Iniciar el servidor
app.listen(port, () => {
  console.log(`Servidor corriendo en http://localhost:${port}/`);
});

// Mostrar que el servidor está configurado correctamente
console.log("Servidor de Control Bovino configurado con Supabase");

