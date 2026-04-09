import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import multer from "multer";
import { v2 as cloudinary } from "cloudinary";
import bodyParser from "body-parser";

import "./db.js";
import { pool } from "./db.js";

import coupleRoutes from "./routes/couple.routes.js";
import authRoutes from "./routes/auth.routes.js";
import featureRoutes, { ensureFeatureSchema } from "./routes/feature.routes.js";
import { authMiddleware } from "./middleware/auth.js";
import adminRoutes from './routes/admin.routes.js';

const app = express();

console.log("🚀 Iniciando servidor...");

//logs
// Adicione isso no início do server.js para debug
console.log("DATABASE_URL existe?", !!process.env.DATABASE_URL);
console.log("JWT_SECRET existe?", !!process.env.JWT_SECRET);

// ================= CORS =================
app.use((req, res, next) => {
  const allowedOrigins = [
    "http://localhost:5173",
    "http://localhost:8081",
    "https://finance-manager-chi-ashen.vercel.app",
    "https://finance-manager-tpzb.vercel.app",
    "https://duofinance-mobile.com"
  ];

  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }

  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }
  next();
});

// ================= MIDDLEWARE =================
app.use(express.json());
app.use(bodyParser.json());

// ================= ROUTES =================
app.use("/couple", coupleRoutes);
app.use("/auth", authRoutes);
app.use("/features", featureRoutes);
app.use("/admin", adminRoutes);

// ================= HEALTH CHECKS =================
app.get("/", (_req, res) => res.status(200).json({ status: "ok", message: "API funcionando!" }));
app.get("/healthz", (_req, res) => res.status(200).json({ status: "ok", timestamp: new Date().toISOString() }));
app.get("/ping", (_req, res) => res.status(200).send("pong"));

// ================= CLOUDINARY =================
if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
  console.error("❌ Cloudinary não configurado!");
} else {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
  });
  console.log("✅ Cloudinary configurado");
}

// ================= MULTER =================
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }
});

// ================= USER =================
app.get("/users/me", authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT u.id, u.name, u.email, a.caminho as profile_image
       FROM users u
       LEFT JOIN arquivos a ON u.profile_image_id = a.id
       WHERE u.id=$1`,
      [req.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Usuário não encontrado" });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ================= UPLOAD =================
app.post("/upload", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "Nenhum arquivo enviado" });
    }

    const userId = req.body.userId;
    if (!userId) {
      return res.status(400).json({ error: "userId não informado" });
    }

    const uploadResult = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { folder: "finance-manager/profile", resource_type: "image" },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        }
      );
      stream.end(req.file.buffer);
    });

    const result = await pool.query(
      "INSERT INTO arquivos (nome, caminho) VALUES ($1, $2) RETURNING id",
      [req.file.originalname, uploadResult.secure_url]
    );

    await pool.query("UPDATE users SET profile_image_id=$1 WHERE id=$2", [result.rows[0].id, userId]);
    res.json({ success: true, imageUrl: uploadResult.secure_url });
  } catch (err) {
    console.error("Erro no upload:", err);
    res.status(500).json({ error: err.message });
  }
});

// ================= EXPENSES =================
app.post("/expenses", authMiddleware, async (req, res) => {
  const client = await pool.connect();
  try {
    const { service, price, paymentMethod, numberTimes, dueDate, recurrence } = req.body;
    const userId = req.userId;

    if (!service || !price || !dueDate) {
      return res.status(400).json({ error: "Dados incompletos" });
    }

    await client.query("BEGIN");

    const expense = await client.query(
      `INSERT INTO expenses (user_id, service, price, paymentmethod, numbertimes, recurrence)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [userId, service, price, paymentMethod, 1, recurrence || 'none']
    );

    const expenseId = expense.rows[0].id;
    const startDate = new Date(dueDate);
    startDate.setHours(12, 0, 0, 0);

    const installmentsToCreate = [{ number: 1, amount: price, dueDate: startDate }];
    
    for (const inst of installmentsToCreate) {
      await client.query(
        `INSERT INTO installments (expense_id, installment_number, amount, duedate, total_installments)
         VALUES ($1, $2, $3, $4, $5)`,
        [expenseId, inst.number, inst.amount, inst.dueDate, installmentsToCreate.length]
      );
    }
    
    await client.query("COMMIT");
    res.json({ message: "Despesa criada com sucesso", expenseId });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Erro ao criar despesa:", err);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

app.get("/expenses/month/:year/:month", authMiddleware, async (req, res) => {
  try {
    const { year, month } = req.params;
    const userId = req.userId;

    const result = await pool.query(
      `SELECT i.id, i.installment_number, i.amount, i.duedate,
              e.service, e.price, e.paymentmethod, e.recurrence, e.id as expense_id
       FROM installments i
       JOIN expenses e ON e.id = i.expense_id
       WHERE e.user_id = $1
       AND i.duedate >= DATE_TRUNC('month', TO_DATE($2 || '-' || $3 || '-01', 'YYYY-MM-DD'))
       AND i.duedate < DATE_TRUNC('month', TO_DATE($2 || '-' || $3 || '-01', 'YYYY-MM-DD')) + INTERVAL '1 month'
       ORDER BY i.duedate`,
      [userId, year, month]
    );

    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.put("/expenses/:id", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { service, price, paymentMethod, dueDate, recurrence } = req.body;
    const userId = req.userId;

    const checkResult = await pool.query(
      `SELECT i.expense_id FROM installments i
       JOIN expenses e ON e.id = i.expense_id
       WHERE i.id = $1 AND e.user_id = $2`,
      [id, userId]
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: "Despesa não encontrada" });
    }

    const expenseId = checkResult.rows[0].expense_id;

    await pool.query(
      `UPDATE expenses SET service = $1, price = $2, paymentmethod = $3, recurrence = $4
       WHERE id = $5`,
      [service, price, paymentMethod, recurrence, expenseId]
    );

    await pool.query(
      `UPDATE installments SET amount = $1, duedate = $2 WHERE id = $3`,
      [price, dueDate, id]
    );

    res.json({ message: "Despesa atualizada com sucesso" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.delete("/expenses/:id", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.userId;

    const checkResult = await pool.query(
      `SELECT i.id FROM installments i
       JOIN expenses e ON e.id = i.expense_id
       WHERE i.id = $1 AND e.user_id = $2`,
      [id, userId]
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: "Despesa não encontrada" });
    }

    await pool.query("DELETE FROM installments WHERE id = $1", [id]);
    res.json({ message: "Despesa deletada com sucesso" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ================= INICIALIZAÇÃO =================
ensureFeatureSchema().catch(console.error);

// ================= EXPORT PARA VERCEL =================
export default app;