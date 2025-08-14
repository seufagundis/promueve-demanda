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

// ====== Setup ======
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 4000;
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';
const origins = (process.env.CORS_ORIGIN || '').split(',').map(s => s.trim()).filter(Boolean);

const app = express();

// Middlewares
app.use(helmet());

const corsOptions = {
  origin: origins.length ? origins : ['http://127.0.0.1:5500'],
  credentials: true,
  methods: ['GET','POST','PATCH','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization']
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions)); // <- MUY importante para el preflight
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));

const limiter = rateLimit({
  windowMs: 60_000,
  max: 200,
});
app.use(limiter);

// Static uploads
const UPLOADS_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR);
app.use('/uploads', express.static(UPLOADS_DIR));

// Multer (archivos)
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuid()}${ext}`);
  }
});
const upload = multer({ storage });

// ====== “DB” en memoria (demo) ======
const users = [
  // credenciales de prueba (demo)
  { email: 'maria@cliente.com',  password: '123456', role: 'cliente', name: 'María López' },
  { email: 'juan@cliente.com',   password: '123456', role: 'cliente', name: 'Juan Pérez'  },
  { email: 'abogada@estudio.com',password: 'secreto', role: 'abogado',name: 'Dra. Urribarri' }
];

const consultas = []; // { id, nombre, email, mensaje, consentimiento, createdAt }

const reclamos = [];  // shape ver seed abajo

// Seed de ejemplo (coincide con el front)
(function seed() {
  const id = uuid();
  reclamos.push({
    id,
    codigo: 'PL-2025-0017',
    cliente: { email: 'maria@cliente.com', nombre: 'María López' },
    entidad: 'Banco Río del Sur',
    monto: 1750000,
    estado: 'En trámite',
    tipo: 'Ordinario',
    createdAt: dayjs('2025-07-29').toISOString(),
    updatedAt: dayjs('2025-08-11').toISOString(),
    slaDue: dayjs().add(3, 'day').toISOString(),
    timeline: [
      { fecha: '2025-07-29', hito: 'Ingreso de reclamo', tipo: 'ok' },
      { fecha: '2025-08-02', hito: 'Intimación a la entidad', tipo: 'warn' },
      { fecha: '2025-08-11', hito: 'Respuesta parcial del banco', tipo: 'info' }
    ],
    mensajes: [
      { de: 'Estudio', texto: 'Recibimos la respuesta del banco, la estamos analizando.', fecha: '2025-08-11 16:20' },
      { de: 'Cliente', texto: '¿Necesitan algún comprobante adicional?', fecha: '2025-08-11 16:34' }
    ],
    archivos: []
  });

  // algunos más para el panel del abogado
  for (let i = 12; i >= 9; i--) {
    reclamos.push({
      id: uuid(),
      codigo: `PL-2025-00${i}`,
      cliente: { email: i % 2 ? 'juan@cliente.com' : 'maria@cliente.com', nombre: i % 2 ? 'Juan Pérez' : 'María López' },
      entidad: i % 2 ? 'Banco Atlántico' : 'Banco Federal',
      monto: 900000 + i * 10000,
      estado: i % 3 ? 'Esperando entidad' : 'Para firmar demanda',
      tipo: i % 2 ? 'Cautelar' : 'Ordinario',
      createdAt: dayjs().subtract(i, 'day').toISOString(),
      updatedAt: dayjs().subtract(i - 1, 'day').toISOString(),
      slaDue: dayjs().add(i % 4, 'day').toISOString(),
      timeline: [],
      mensajes: [],
      archivos: []
    });
  }
})();

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
app.post('/login', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ message: 'Email y contraseña requeridos' });
  const user = users.find(u => u.email.toLowerCase() === String(email).toLowerCase());
  if (!user || user.password !== password) return res.status(401).json({ message: 'Credenciales inválidas' });

  const accessToken = sign(user);
  return res.json({
    accessToken,
    user: { name: user.name, email: user.email, role: user.role }
  });
});

// Consultas (público)
app.post('/consultas', (req, res) => {
  const { nombre, email, mensaje, consentimiento } = req.body || {};
  if (!nombre || !email || !mensaje || !consentimiento) {
    return res.status(400).json({ message: 'Datos incompletos' });
  }
  const id = uuid();
  consultas.push({ id, nombre, email, mensaje, consentimiento: !!consentimiento, createdAt: new Date().toISOString() });
  return res.status(201).json({ id });
});

// Reclamos (público: permite iniciar sin login; si hay token, se asocia al usuario)
app.post('/reclamos', upload.array('archivos'), (req, res) => {
  const { nombre, dni, telefono, email, entidad, fechaIncidente, descripcion } = req.body || {};
  if (!nombre || !dni || !telefono || !email || !entidad || !descripcion) {
    return res.status(400).json({ message: 'Faltan campos obligatorios' });
  }
  const id = uuid();
  const codigo = `PL-${dayjs().year()}-${String(Math.floor(Math.random() * 9000) + 1000).padStart(4, '0')}`;

  const archivos = (req.files || []).map(f => ({
    id: uuid(),
    filename: f.filename,
    originalname: f.originalname,
    mimetype: f.mimetype,
    url: `/uploads/${f.filename}`,
    size: f.size
  }));

  // Si hay auth en el header, lo tomamos; si no, dueño = email del formulario
  let ownerEmail = email;
  const hdr = req.headers.authorization || '';
  const token = hdr.startsWith('Bearer ') ? hdr.slice(7) : null;
  try {
    if (token) {
      const payload = jwt.verify(token, JWT_SECRET);
      ownerEmail = payload.email || ownerEmail;
    }
  } catch { /* token inválido -> ignorar y seguir como público */ }

  const nuevo = {
    id,
    codigo,
    cliente: { email: ownerEmail, nombre },
    entidad,
    monto: null,
    estado: 'Recibido',
    tipo: 'Ordinario',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    slaDue: dayjs().add(7, 'day').toISOString(),
    timeline: [
      { fecha: dayjs().format('YYYY-MM-DD'), hito: 'Reclamo iniciado por el cliente', tipo: 'ok' }
    ],
    mensajes: [
      { de: 'Cliente', texto: descripcion, fecha: dayjs().format('YYYY-MM-DD HH:mm') }
    ],
    archivos,
    meta: { dni, telefono, fechaIncidente }
  };

  reclamos.push(nuevo);
  return res.status(201).json({ id: nuevo.id });
});

// Listar reclamos (cliente/abogado)
app.get('/reclamos', auth, (req, res) => {
  const { mine, limit } = req.query;
  let data = reclamos;

  if (mine === 'true') {
    // Cliente ve solo los suyos
    data = data.filter(r => r.cliente?.email?.toLowerCase() === req.user.email.toLowerCase());
  } else if (req.user.role !== 'abogado') {
    // Si no es abogado y no pide "mine", restringimos
    data = data.filter(r => r.cliente?.email?.toLowerCase() === req.user.email.toLowerCase());
  }

  const n = Number(limit) || data.length;
  return res.json(data.slice(0, n));
});

// Detalle reclamo
app.get('/reclamos/:id', auth, (req, res) => {
  const r = reclamos.find(x => x.id === req.params.id);
  if (!r) return res.status(404).json({ message: 'No encontrado' });

  const soyDueño = r.cliente?.email?.toLowerCase() === req.user.email.toLowerCase();
  if (!soyDueño && req.user.role !== 'abogado') return res.status(403).json({ message: 'Sin permisos' });

  return res.json(r);
});

// Actualizar reclamo (abogado)
app.patch('/reclamos/:id', auth, requireRole('abogado'), (req, res) => {
  const r = reclamos.find(x => x.id === req.params.id);
  if (!r) return res.status(404).json({ message: 'No encontrado' });

  const allowed = ['estado', 'monto', 'entidad', 'tipo', 'slaDue'];
  for (const k of allowed) {
    if (k in req.body) r[k] = req.body[k];
  }
  if (req.body.timelineItem && req.body.timelineItem.hito) {
    const it = req.body.timelineItem;
    r.timeline.push({
      fecha: it.fecha || dayjs().format('YYYY-MM-DD'),
      hito: it.hito,
      tipo: it.tipo || 'info'
    });
  }
  r.updatedAt = new Date().toISOString();
  return res.json(r);
});

// Mensajes en un reclamo (cliente o abogado)
app.post('/reclamos/:id/mensajes', auth, (req, res) => {
  const r = reclamos.find(x => x.id === req.params.id);
  if (!r) return res.status(404).json({ message: 'No encontrado' });

  const soyDueño = r.cliente?.email?.toLowerCase() === req.user.email.toLowerCase();
  if (!soyDueño && req.user.role !== 'abogado') return res.status(403).json({ message: 'Sin permisos' });

  const { texto } = req.body || {};
  if (!texto) return res.status(400).json({ message: 'Texto requerido' });

  const de = req.user.role === 'abogado' ? 'Estudio' : 'Cliente';
  r.mensajes.push({ de, texto, fecha: dayjs().format('YYYY-MM-DD HH:mm') });
  r.updatedAt = new Date().toISOString();
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
