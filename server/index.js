const crypto = require("crypto");
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const { rateLimit } = require("express-rate-limit");
const sql = require("mssql/msnodesqlv8");

const app = express();
const PORT = Number(process.env.PORT) || 3001;
const API_PREFIX = "/api";

if (process.env.TRUST_PROXY === "1") app.set("trust proxy", 1);

const defaultConnectionString =
  "Driver={ODBC Driver 18 for SQL Server};" +
  "Server=localhost;" +
  "Database=dylan_studio_db;" +
  "Trusted_Connection=Yes;" +
  "TrustServerCertificate=Yes;";

// En producción, usa dos identidades SQL distintas. La pública solo debe poder
// ejecutar los procedimientos de creación/contenido; la administrativa, los CRUD.
const publicDbConfig = {
  connectionString: process.env.DB_PUBLIC_CONNECTION_STRING || defaultConnectionString,
  driver: "msnodesqlv8"
};
const adminDbConfig = {
  connectionString: process.env.DB_ADMIN_CONNECTION_STRING || defaultConnectionString,
  driver: "msnodesqlv8"
};

let publicPool;
let adminPool;

async function getPublicPool() {
  if (!publicPool) publicPool = await new sql.ConnectionPool(publicDbConfig).connect();
  return publicPool;
}

async function getAdminPool() {
  if (!adminPool) adminPool = await new sql.ConnectionPool(adminDbConfig).connect();
  return adminPool;
}

const allowedOrigins = new Set(
  (process.env.ALLOWED_ORIGINS ||
    "http://localhost:3000,http://127.0.0.1:3000,http://localhost:5500,http://127.0.0.1:5500")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)
);

app.disable("x-powered-by");
app.use(
  helmet({
    // El sitio todavía contiene scripts inline y jQuery desde CDN en el panel.
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" }
  })
);
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.has(origin)) return callback(null, true);
      return callback(new Error("Origen no permitido"));
    },
    methods: ["GET", "POST", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"]
  })
);
app.use(express.json({ limit: "10kb", strict: true }));

const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 200,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Demasiadas solicitudes. Intenta nuevamente más tarde." }
});
const formLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Has enviado demasiadas solicitudes. Intenta nuevamente en 15 minutos." }
});
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Demasiados intentos de acceso. Intenta nuevamente en 15 minutos." }
});

app.use(API_PREFIX, generalLimiter);

function requireJson(req, res, next) {
  if (!req.is("application/json")) {
    return res.status(415).json({ error: "El contenido debe enviarse como application/json." });
  }
  next();
}

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function inLength(value, min, max) {
  return value.length >= min && value.length <= max;
}

function isEmail(value) {
  return value.length <= 150 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function positiveInteger(value) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function safeEqual(left, right) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

const ADMIN_USER = process.env.ADMIN_USER;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const adminSessions = new Map();

if (!ADMIN_USER || !ADMIN_PASSWORD || ADMIN_PASSWORD.length < 12) {
  throw new Error(
    "Configura ADMIN_USER y ADMIN_PASSWORD (mínimo 12 caracteres) antes de iniciar la API."
  );
}

function createAdminSession() {
  const token = crypto.randomBytes(32).toString("hex");
  adminSessions.set(token, Date.now() + SESSION_TTL_MS);
  return token;
}

function requireAdmin(req, res, next) {
  const authorization = req.get("authorization") || "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  const expiresAt = adminSessions.get(token);

  if (!token || !expiresAt || expiresAt <= Date.now()) {
    if (token) adminSessions.delete(token);
    return res.status(401).json({ error: "Debes iniciar sesión como administrador." });
  }

  req.adminToken = token;
  next();
}

setInterval(() => {
  const now = Date.now();
  for (const [token, expiresAt] of adminSessions) {
    if (expiresAt <= now) adminSessions.delete(token);
  }
}, 30 * 60 * 1000).unref();

app.get(`${API_PREFIX}/health`, (_req, res) => {
  res.json({ ok: true });
});

app.post(`${API_PREFIX}/admin/login`, loginLimiter, requireJson, (req, res) => {
  const user = text(req.body?.user);
  const password = text(req.body?.password);

  if (!safeEqual(user, ADMIN_USER) || !safeEqual(password, ADMIN_PASSWORD)) {
    return res.status(401).json({ error: "Usuario o contraseña incorrectos." });
  }

  res.json({ token: createAdminSession(), expiresIn: SESSION_TTL_MS / 1000 });
});

app.post(`${API_PREFIX}/admin/logout`, requireAdmin, (req, res) => {
  adminSessions.delete(req.adminToken);
  res.json({ ok: true });
});

app.get(`${API_PREFIX}/solicitudes`, requireAdmin, async (req, res, next) => {
  try {
    const estado = text(req.query.estado);
    const q = text(req.query.q);

    if (estado && !["nuevo", "en proceso", "cerrado"].includes(estado)) {
      return res.status(400).json({ error: "Estado no válido." });
    }
    if (q.length > 100) {
      return res.status(400).json({ error: "La búsqueda no puede superar 100 caracteres." });
    }

    const pool = await getAdminPool();
    const result = await pool
      .request()
      .input("estado", sql.VarChar(30), estado)
      .input("q", sql.VarChar(100), q)
      .execute("dbo.usp_ListarSolicitudes");

    res.json(result.recordset);
  } catch (error) {
    next(error);
  }
});

app.post(`${API_PREFIX}/solicitudes`, formLimiter, requireJson, async (req, res, next) => {
  try {
    const nombre = text(req.body?.nombre);
    const apellido = text(req.body?.apellido);
    const empresa = text(req.body?.empresa);
    const email = text(req.body?.email).toLowerCase();
    const asunto = text(req.body?.asunto);
    const mensaje = text(req.body?.mensaje);
    const idServicio = positiveInteger(req.body?.id_servicio);

    const errors = {};
    if (!inLength(nombre, 2, 100)) errors.nombre = "Debe tener entre 2 y 100 caracteres.";
    if (!inLength(apellido, 2, 100)) errors.apellido = "Debe tener entre 2 y 100 caracteres.";
    if (empresa.length > 150) errors.empresa = "No puede superar 150 caracteres.";
    if (!isEmail(email)) errors.email = "El correo no es válido.";
    if (!inLength(asunto, 5, 150)) errors.asunto = "Debe tener entre 5 y 150 caracteres.";
    if (!inLength(mensaje, 10, 2000)) errors.mensaje = "Debe tener entre 10 y 2000 caracteres.";
    if (!idServicio || idServicio > 1000) errors.servicio = "El servicio no es válido.";

    if (Object.keys(errors).length) {
      return res.status(400).json({ error: "Revisa los campos enviados.", fields: errors });
    }

    const pool = await getPublicPool();
    const result = await pool
      .request()
      .input("nombre", sql.VarChar(100), nombre)
      .input("apellido", sql.VarChar(100), apellido)
      .input("empresa", sql.VarChar(150), empresa || null)
      .input("email", sql.VarChar(150), email)
      .input("asunto", sql.VarChar(150), asunto)
      .input("mensaje", sql.VarChar(2000), mensaje)
      .input("id_servicio", sql.Int, idServicio)
      .execute("dbo.usp_CrearSolicitud");

    res.status(201).json({ ok: true, id_solicitud: result.recordset[0].id_solicitud });
  } catch (error) {
    next(error);
  }
});

app.put(`${API_PREFIX}/solicitudes/:id/estado`, requireAdmin, requireJson, async (req, res, next) => {
  try {
    const id = positiveInteger(req.params.id);
    const estado = text(req.body?.estado);

    if (!id || !["nuevo", "en proceso", "cerrado"].includes(estado)) {
      return res.status(400).json({ error: "Identificador o estado no válido." });
    }

    const pool = await getAdminPool();
    await pool
      .request()
      .input("id", sql.Int, id)
      .input("estado", sql.VarChar(30), estado)
      .execute("dbo.usp_ActualizarEstadoSolicitud");

    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.delete(`${API_PREFIX}/solicitudes/:id`, requireAdmin, async (req, res, next) => {
  try {
    const id = positiveInteger(req.params.id);
    if (!id) return res.status(400).json({ error: "Identificador no válido." });

    const pool = await getAdminPool();
    await pool
      .request()
      .input("id", sql.Int, id)
      .execute("dbo.usp_EliminarSolicitud");

    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.get(`${API_PREFIX}/ofertas`, async (_req, res, next) => {
  try {
    const pool = await getPublicPool();
    const result = await pool.request().execute("dbo.usp_ListarOfertas");
    res.json(result.recordset);
  } catch (error) {
    next(error);
  }
});

app.use((_req, res) => {
  res.status(404).json({ error: "Ruta no encontrada." });
});

app.use((error, _req, res, _next) => {
  console.error("API error:", error);
  if (error?.type === "entity.too.large") {
    return res.status(413).json({ error: "La solicitud supera el tamaño permitido." });
  }
  if (error instanceof SyntaxError && error?.status === 400 && "body" in error) {
    return res.status(400).json({ error: "El contenido JSON no es válido." });
  }
  if (error?.message === "Origen no permitido") {
    return res.status(403).json({ error: "Origen no permitido." });
  }
  res.status(500).json({ error: "Ocurrió un error interno. Intenta nuevamente más tarde." });
});

app.listen(PORT, () => {
  console.log(`API running on http://localhost:${PORT}`);
});
