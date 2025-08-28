import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import multer from 'multer';
import { v4 as uuid } from 'uuid';
import dayjs from 'dayjs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// ====== Setup ======
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 4000;
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';

const app = express();
app.set('trust proxy', 1); // útil en Render para rate limit y logs

// === CORS: orígenes desde ENV + wildcard *.vercel.app ===
const ENV_ORIGINS = (process.env.CORS_ORIGIN || '')
  .split(',')
  .map(s => s.trim().replace(/\/$/, ''))
  .filter(Boolean);

// Agregar logging detallado de todas las requests
app.use((req, res, next) => {
  console.log('=== NUEVA REQUEST ===');
  console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
  console.log('Headers:', req.headers);
  console.log('Body:', req.body);
  console.log('Files:', req.files);
  console.log('=====================');
  next();
});


const corsOptions = {
  origin(origin, cb) {
    if (!origin) return cb(null, true); // curl/Postman
    try {
      const normalized = origin.replace(/\/$/, '');
      const host = new URL(origin).host;
      const ok =
        ENV_ORIGINS.includes(normalized) ||
        ENV_ORIGINS.includes(`https://${host}`) ||
        /\.vercel\.app$/.test(host);
      cb(null, ok);
    } catch {
      cb(null, false);
    }
  },
  credentials: true,
  methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization'],
  optionsSuccessStatus: 204,
};

app.use(cors(corsOptions));
// para caches/proxies que varían por Origin
app.use((_, res, next) => { res.setHeader('Vary', 'Origin'); next(); });

// === Helmet DESPUÉS de CORS; permitir estáticos cross-origin ===
app.use(helmet({ crossOriginResourcePolicy: false }));

// Resto de middlewares
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));

const limiter = rateLimit({ windowMs: 60_000, max: 200 });
app.use(limiter);

// === Static uploads (efímero en Render Free) ===
const UPLOADS_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
app.use('/uploads', express.static(UPLOADS_DIR));

// === Multer (archivos) ===
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${uuid()}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (_req, file, cb) => {
    const allowed = ['application/pdf', 'image/jpeg', 'image/png'];
    cb(null, allowed.includes(file.mimetype));
    
  },
  preservePath: true // Esto ayuda a que multer populé req.body
  
  
});


// // ====== “DB” en memoria (demo) ======
// const users = [
//   // credenciales de prueba (demo)
//   { email: 'maria@cliente.com',  password: '123456', role: 'cliente', name: 'María López' },
//   { email: 'juan@cliente.com',   password: '123456', role: 'cliente', name: 'Juan Pérez'  },
//   { email: 'abogada@estudio.com',password: 'secreto', role: 'abogado',name: 'Dra. Urribarri' }
// ];

// const consultas = []; // { id, nombre, email, mensaje, consentimiento, createdAt }

// const reclamos = [];  // shape ver seed abajo

// // Seed de ejemplo (coincide con el front)
// (function seed() {
//   const id = uuid();
//   reclamos.push({
//     id,
//     codigo: 'PL-2025-0017',
//     cliente: { email: 'maria@cliente.com', nombre: 'María López' },
//     entidad: 'Banco Río del Sur',
//     monto: 1750000,
//     estado: 'En trámite',
//     tipo: 'Ordinario',
//     createdAt: dayjs('2025-07-29').toISOString(),
//     updatedAt: dayjs('2025-08-11').toISOString(),
//     slaDue: dayjs().add(3, 'day').toISOString(),
//     timeline: [
//       { fecha: '2025-07-29', hito: 'Ingreso de reclamo', tipo: 'ok' },
//       { fecha: '2025-08-02', hito: 'Intimación a la entidad', tipo: 'warn' },
//       { fecha: '2025-08-11', hito: 'Respuesta parcial del banco', tipo: 'info' }
//     ],
//     mensajes: [
//       { de: 'Estudio', texto: 'Recibimos la respuesta del banco, la estamos analizando.', fecha: '2025-08-11 16:20' },
//       { de: 'Cliente', texto: '¿Necesitan algún comprobante adicional?', fecha: '2025-08-11 16:34' }
//     ],
//     archivos: []
//   });

  // // algunos más para el panel del abogado
  // for (let i = 12; i >= 9; i--) {
  //   reclamos.push({
  //     id: uuid(),
  //     codigo: `PL-2025-00${i}`,
  //     cliente: { email: i % 2 ? 'juan@cliente.com' : 'maria@cliente.com', nombre: i % 2 ? 'Juan Pérez' : 'María López' },
  //     entidad: i % 2 ? 'Banco Atlántico' : 'Banco Federal',
  //     monto: 900000 + i * 10000,
  //     estado: i % 3 ? 'Esperando entidad' : 'Para firmar demanda',
  //     tipo: i % 2 ? 'Cautelar' : 'Ordinario',
  //     createdAt: dayjs().subtract(i, 'day').toISOString(),
  //     updatedAt: dayjs().subtract(i - 1, 'day').toISOString(),
  //     slaDue: dayjs().add(i % 4, 'day').toISOString(),
  //     timeline: [],
  //     mensajes: [],
  //     archivos: []
  //   });
  // }
// })();

// ====== Helpers ======
function sign(user) {
  return jwt.sign(
    { sub: user.email, role: user.role, name: user.name, email: user.email },
    JWT_SECRET,
    { expiresIn: '2h' }
  );
}

function auth(req, res, next) {
  const hdr = req.headers.authorization || '';
  const token = hdr.startsWith('Bearer ') ? hdr.slice(7) : null;
  if (!token) return res.status(401).json({ message: 'No autenticado' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload; // { sub, role, name, email }
    next();
  } catch {
    return res.status(401).json({ message: 'Token inválido o expirado' });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ message: 'Sin permisos' });
    }
    next();
  };
}

// ====== Rutas ======

// Health
app.get('/health', (_req, res) => res.json({ ok: true }));

// Login
app.post('/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ message: 'Email y contraseña requeridos' });
  // const user = users.find(u => u.email.toLowerCase() === String(email).toLowerCase());
  // if (!user || user.password !== password) return res.status(401).json({ message: 'Credenciales inválidas' });
  const user = await prisma.appUser.findUnique({ where: { email: String(email).toLowerCase() } });
  if (!user) return res.status(401).json({ message: 'Credenciales inválidas' });
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return res.status(401).json({ message: 'Credenciales inválidas' });

  // const accessToken = sign(user);
  const accessToken = sign({ email: user.email, name: user.name, role: user.role });

  return res.json({
    accessToken,
    // user: { name: user.name, email: user.email, role: user.role }
    user: { name: user.name, email: user.email, role: user.role }
  });
});

// Consultas (público)
app.post('/consultas', async (req, res) => {
  const { nombre, email, mensaje, consentimiento } = req.body || {};
  if (!nombre || !email || !mensaje || !consentimiento) {
    return res.status(400).json({ message: 'Datos incompletos' });
  }
 const nueva = await prisma.consulta.create({
    data: { id: uuid(), nombre, email, mensaje, consentimiento: !!consentimiento }
  });
  return res.status(201).json({ id: nueva.id });
});

// Reclamos (público: permite iniciar sin login; si hay token, se asocia al usuario)
app.post('/reclamos', upload.array('archivos'), async (req, res) => {
  try {
    console.log('🎯 RECLAMO - req.body:', req.body);
    console.log('🎯 RECLAMO - req.files:', req.files);
    console.log('🎯 RECLAMO - Campos manuales:', {
      nombre: req.body.nombre,
      dni: req.body.dni,
      telefono: req.body.telefono,
      email: req.body.email,
      entidad: req.body.entidad,
      fechaIncidente: req.body.fechaIncidente,
      descripcion: req.body.descripcion
    });

    // Restaurar el código original PERO con validación
    const { nombre, dni, telefono, email, entidad, fechaIncidente, descripcion } = req.body || {};
    
    if (!nombre || !dni || !telefono || !email || !entidad || !descripcion) {
      console.log('❌ Faltan campos obligatorios en req.body');
      return res.status(400).json({ message: 'Faltan campos obligatorios' });
    }

    // ✅ TODO EL CÓDIGO ORIGINAL AQUÍ (crear usuario, reclamo, etc.)
    let user = await prisma.appUser.findUnique({
      where: { email: email.toLowerCase() }
    });

    if (!user) {
      const tempPassword = Math.random().toString(36).slice(-8);
      const passwordHash = await bcrypt.hash(tempPassword, 10);
      
      user = await prisma.appUser.create({
        data: {
          email: email.toLowerCase(),
          name: nombre,
          passwordHash,
          telefono: telefono,
          dni: dni,
          role: 'cliente'
        }
      });
      console.log(`✅ Usuario creado: ${email} con password temporal: ${tempPassword}`);
    }

  return res.status(201).json({ id });    
    // ... resto del código original para crear reclamo

  } catch (error) {
    console.error('💥 ERROR EN RECLAMO:', error);
    return res.status(500).json({ message: 'Error interno: ' + error.message });
  }
});



// Listar reclamos (cliente/abogado)
app.get('/reclamos', auth, async (req, res) => {
  const { mine, limit } = req.query;
  const where = (mine === 'true' || req.user.role !== 'abogado')
    ? { ownerEmail: req.user.email }
    : {};

  const rows = await prisma.reclamo.findMany({
    where,
    orderBy: { updatedAt: 'desc' },
    take: Number(limit) || undefined
  });

  // Para KPIs/panel abogado solo necesitamos cabecera; el detalle lo pedimos en /reclamos/:id
  const data = rows.map(r => ({
    id: r.id,
    codigo: r.codigo,
    cliente: { email: r.ownerEmail, nombre: '' }, // lo llenamos en detalle
    entidad: r.entidad,
    monto: r.monto,
    estado: r.estado,
    tipo: r.tipo,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    slaDue: r.slaDue
  }));
  return res.json(data);
});


// Detalle reclamo
app.get('/reclamos/:id', auth, async (req, res) => {
  const id = req.params.id;
  const r = await prisma.reclamo.findUnique({ where: { id } });
  if (!r) return res.status(404).json({ message: 'No encontrado' });

  const soyDueño = r.ownerEmail.toLowerCase() === req.user.email.toLowerCase();
  if (!soyDueño && req.user.role !== 'abogado') return res.status(403).json({ message: 'Sin permisos' });

  const [timeline, mensajes, archivos, userDueño] = await Promise.all([
    prisma.reclamoTimeline.findMany({ where: { reclamoId: id }, orderBy: { fecha: 'asc' } }),
    prisma.reclamoMensaje.findMany({ where: { reclamoId: id }, orderBy: { creadoEn: 'asc' } }),
    prisma.reclamoArchivo.findMany({ where: { reclamoId: id } }),
    prisma.appUser.findUnique({ where: { email: r.ownerEmail } }).catch(() => null),
  ]);

  const detalle = {
    id: r.id,
    codigo: r.codigo,
    cliente: { email: r.ownerEmail, nombre: userDueño?.name || '' },
    entidad: r.entidad,
    monto: r.monto,
    estado: r.estado,
    tipo: r.tipo,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    slaDue: r.slaDue,
    timeline: timeline.map(t => ({ fecha: dayjs(t.fecha).format('YYYY-MM-DD'), hito: t.hito, tipo: t.tipo || 'info' })),
    mensajes: mensajes.map(m => ({ de: m.autor, texto: m.texto, fecha: dayjs(m.creadoEn).format('YYYY-MM-DD HH:mm') })),
    archivos: archivos.map(a => ({
      id: a.id, filename: a.filename, originalname: a.originalname, mimetype: a.mimetype, url: a.url, size: a.size
    }))
  };
  return res.json(detalle);
});

// Actualizar reclamo (abogado)
app.patch('/reclamos/:id', auth, requireRole('abogado'), async (req, res) => {
  const id = req.params.id;
  const allowed = ['estado', 'monto', 'entidad', 'tipo', 'slaDue'];
  const data = {};
  for (const k of allowed) if (k in req.body) data[k] = k === 'slaDue' ? new Date(req.body[k]) : req.body[k];

  const r = await prisma.reclamo.update({
    where: { id },
    data: { ...data, updatedAt: new Date() }
  });

  // timeline/mensajes opcionales en el mismo PATCH
  if (req.body.timelineItem && req.body.timelineItem.hito) {
    await prisma.reclamoTimeline.create({
      data: {
        id: uuid(), reclamoId: id,
        fecha: req.body.timelineItem.fecha ? dayjs(req.body.timelineItem.fecha).toDate() : new Date(),
        hito: req.body.timelineItem.hito,
        tipo: req.body.timelineItem.tipo || 'info'
      }
    });
  }
  if (req.body.mensaje && req.body.mensaje.texto) {
    await prisma.reclamoMensaje.create({
      data: { id: uuid(), reclamoId: id, autor: 'Estudio', texto: req.body.mensaje.texto }
    });
  }
  return res.json({ ok: true });
});

// Subir archivos a un reclamo existente

app.post('/reclamos/:id/archivos', auth, upload.array('archivos'), async (req, res) => {
  const id = req.params.id;
  const r = await prisma.reclamo.findUnique({ where: { id } });
  if (!r) return res.status(404).json({ message: 'No encontrado' });

  const soyDueño = r.ownerEmail.toLowerCase() === req.user.email.toLowerCase();
  if (!soyDueño && req.user.role !== 'abogado') return res.status(403).json({ message: 'Sin permisos' });

  const archivos = (req.files || []).map(f => ({
    id: uuid(),
    reclamoId: id,
    filename: f.filename,
    originalname: f.originalname,
    mimetype: f.mimetype,
    url: `/uploads/${f.filename}`,
    size: f.size
  }));
  if (archivos.length) await prisma.reclamoArchivo.createMany({ data: archivos });
  res.status(201).json({ count: archivos.length });
});


// Mensajes en un reclamo (cliente o abogado)
app.post('/reclamos/:id/mensajes', auth, async (req, res) => {
  const id = req.params.id;

  // 1) Traigo el reclamo
  const r = await prisma.reclamo.findUnique({ where: { id } });
  if (!r) return res.status(404).json({ message: 'No encontrado' });

  // 2) Permisos: dueño o abogado
  const soyDueño = r.ownerEmail.toLowerCase() === req.user.email.toLowerCase();
  if (!soyDueño && req.user.role !== 'abogado') {
    return res.status(403).json({ message: 'Sin permisos' });
  }

  // 3) Crear mensaje
  const { texto } = req.body || {};
  if (!texto) return res.status(400).json({ message: 'Texto requerido' });

  const autor = req.user.role === 'abogado' ? 'Estudio' : 'Cliente';
  await prisma.reclamoMensaje.create({
    data: { id: uuid(), reclamoId: id, autor, texto, /* si tu modelo no setea por defecto: */ creadoEn: new Date() }
  });

  // 4) Tocar updatedAt del reclamo
  await prisma.reclamo.update({ where: { id }, data: { updatedAt: new Date() } });

  return res.status(201).json({ ok: true });
});

// Fallback 404
app.use((_req, res) => res.status(404).json({ message: 'Ruta no encontrada' }));

// Error handler
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ message: 'Error interno' });
});

// Start
app.listen(PORT, () => {
  console.log(`API corriendo en http://localhost:${PORT}`);
});
