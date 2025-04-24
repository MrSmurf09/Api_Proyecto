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
const SECRET_KEY = process.env.JWT_SECRET;

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

// funcion para verificar el token
const verificarToken = (req, res, next) => {
  const authHeader = req.headers.authorization;

  // Verifica si hay header de autorización con formato "Bearer <token>"
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Token no proporcionado" });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, SECRET_KEY);
    req.user = decoded; // puedes acceder luego a req.user.id, etc.
    next(); // continúa a la siguiente función
  } catch (err) {
    return res.status(403).json({ message: "Token inválido" });
  }
};


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
    const token = jwt.sign({ nombre: usuarios.Nombre }, SECRET_KEY, { expiresIn: '1d' });

    res.status(200).json({
      message: "Inicio de sesión exitoso",
      userId: usuarios.id,
      Nombre: usuarios.Nombre,
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
app.get("/api/fincas", verificarToken, async (req, res) => {
  const usuarioId = req.query.UsuarioId;
  console.log("UsuarioId:", usuarioId);

  if (!usuarioId) {
    return res.status(400).json({ message: "UsuarioId no proporcionado" });
  }

  try {
    const { data, error } = await supabase
      .from('vista_fincas_con_potreros')
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

app.get("/api/potreros/:id", async (req, res) => {
  const { id } = req.params;
  console.log("ID de la finca:", id);

  try {
    // Consulta SQL con el conteo de vacas y el promedio de producción de leche
    const { data, error } = await supabase
      .rpc('obtener_datos_potreros', { finca_id: id }); // Usamos la función almacenada `obtener_datos_potreros`

    if (error) {
      console.error("Error al obtener potreros:", error);
      return res.status(500).json({ message: "Error al obtener los potreros" });
    }

    res.status(200).json({
      message: "Potreros obtenidos con éxito",
      potreros: data, // Devuelve los datos de los potreros, vacas y promedio de leche
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
app.get("/api/vacas/:potreroId", async (req, res) => {
  const { potreroId } = req.params;

  const { data, error } = await supabase.rpc("obtener_vacas_con_promedio", {
    potrero_id: Number(potreroId)
  });

  if (error) {
    console.error("Error al obtener vacas:", error);
    return res.status(500).json({ message: "Error al obtener las vacas" });
  }

  res.status(200).json({ vacas: data });
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



// Ruta para registrar recordatorios y enviar email con EmailJS
app.post("/api/registrar/recordatorios/:id", async (req, res) => {
  const { id } = req.params;
  const { Fecha, Titulo, Descripcion, Tipo, UsuarioId } = req.body;

  console.log("📌 Datos recibidos para registrar recordatorio:", req.body);
  const fechaColombia = new Date(Fecha);
  const offsetColombia = 5 * 60; // Colombia está en UTC-5
  const fechaUTC = new Date(fechaColombia.getTime() + offsetColombia * 60000); // SUMAR para ir a UTC

  console.log("💡 Fecha Colombia interpretada:", fechaColombia.toString());
  console.log("📦 Fecha UTC para guardar:", fechaUTC.toISOString());
  try {
    // Verificar que el usuario exista
    const { data: usuario, error: errorUsuario } = await supabase
      .from('Usuario')
      .select('Correo, Nombre')
      .eq('id', UsuarioId)
      .single();

    if (errorUsuario || !usuario) {
      console.error("❌ Usuario no encontrado:", errorUsuario);
      return res.status(404).json({ message: "Usuario no encontrado" });
    }

    // Insertar el recordatorio
    const { data, error } = await supabase
      .from('Recordatorio')
      .insert([{ Fecha: fechaUTC.toISOString(), Titulo, Descripcion, Tipo, UsuarioId, VacaId: id }])
      .select();

    if (error) {
      console.error("❌ Error al registrar el recordatorio:", error);
      return res.status(500).json({ message: "Error al registrar el recordatorio" });
    }

    const recordatorio = data[0];

    res.status(201).json({
      message: "✅ Recordatorio registrado con éxito",
      recordatorios: recordatorio,
    });

  } catch (error) {
    console.error("❌ Error en el servidor:", error);
    res.status(500).json({ message: "Error al registrar el recordatorio" });
  }
});

import { createTransport } from 'nodemailer';

//enviar correos automatizados
app.get("/api/recordatorio/enviar", async (req, res) => {
  console.log("⏰ Verificando recordatorios para enviar con 1 hora de anticipación...");

  try {
    const ahora = new Date();
    const margen = 2 * 60 * 1000; // 2 minutos de margen (en milisegundos)

    const desde = new Date(ahora.getTime() + 60 * 60 * 1000 - margen);
    const hasta = new Date(ahora.getTime() + 60 * 60 * 1000 + margen);

    console.log("🕐 Ahora: ", ahora.toISOString());
    console.log("🔍 Buscando entre: ", desde.toISOString(), "y", hasta.toISOString());

    const { data: recordatorios, error } = await supabase
      .from("Recordatorio")
      .select("id, Fecha, Titulo, Descripcion, Tipo, UsuarioId, Enviado")
      .eq("Enviado", false)
      .gte("Fecha", desde.toISOString())
      .lte("Fecha", hasta.toISOString());

    if (error) {
      console.error("❌ Error al obtener recordatorios:", error);
      return res.status(500).json({ message: "Error al consultar recordatorios" });
    }

    if (!recordatorios.length) {
      console.log("📭 No hay recordatorios para enviar ahora.");
      return res.status(200).json({ message: "Sin recordatorios próximos." });
    }

    const transporter = createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL,
        pass: process.env.PASS
      }
    });

    for (const r of recordatorios) {
      const { data: usuario, error: errorUsuario } = await supabase
        .from("Usuario")
        .select("Correo, Nombre")
        .eq("id", r.UsuarioId)
        .single();

      if (errorUsuario || !usuario) {
        console.error(`⚠️ No se encontró el usuario con ID ${r.UsuarioId}`);
        continue;
      }

      const mailOptions = {
        from: `"Sistema de Recordatorios" <${process.env.EMAIL}>`,
        to: usuario.Correo,
        subject: `📌 Recordatorio: ${r.Titulo}`,
        text: `Hola ${usuario.Nombre},\n\nEste es tu recordatorio programado para las ${new Date(r.Fecha).toLocaleTimeString()}:\n\n${r.Descripcion}\n\nTipo: ${r.Tipo}`
      };

      try {
        await transporter.sendMail(mailOptions);
        console.log(`✅ Correo enviado a ${usuario.Correo}`);

        // Marcar como enviado
        await supabase
          .from("Recordatorio")
          .update({ Enviado: true })
          .eq("id", r.id);
      } catch (err) {
        console.error(`❌ Error al enviar el correo a ${usuario.Correo}:`, err.message);
      }
    }

    res.status(200).json({ message: "Correos enviados (si aplicaba)" });

  } catch (err) {
    console.error("❌ Error en el proceso:", err);
    res.status(500).json({ message: "Error en el servidor" });
  }
});

app.get('/api/ping', (req, res) => {
  try {
    console.log("Ping recibido");
    res.status(200).send('pong');
  } catch (error) {
    console.error("Error en el servidor:", error);
    res.status(500).json({ message: "Error en el servidor" });
  }
});


// Iniciar el servidor
app.listen(port, () => {
  console.log(`Servidor corriendo en http://localhost:${port}/`);
});

// Mostrar que el servidor está configurado correctamente
console.log("Servidor de Control Bovino configurado con Supabase");
