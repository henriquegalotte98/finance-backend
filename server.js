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


// Tratamento de erros de conexão
pool.on('error', (err) => {
  console.error('❌ Erro inesperado no pool do banco:', err);
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

// ================= DEBUG - Informações do Banco =================
app.get("/debug/db-info", async (req, res) => {
  try {
    const dbName = await pool.query("SELECT current_database() as name");
    const tables = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);
    res.json({
      database: dbName.rows[0],
      tables: tables.rows.map(t => t.table_name)
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ================= ADMIN - Criar tabelas diretamente =================
app.post("/admin/create-tables", async (req, res) => {
  try {
    // Criar tabela shopping_list_items
    await pool.query(`
      CREATE TABLE IF NOT EXISTS shopping_list_items (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        couple_id INTEGER,
        name VARCHAR(255) NOT NULL,
        quantity INTEGER DEFAULT 1,
        price DECIMAL(10,2),
        category VARCHAR(50) DEFAULT 'food',
        priority VARCHAR(20) DEFAULT 'medium',
        status VARCHAR(20) DEFAULT 'pending',
        notes TEXT,
        link TEXT,
        image TEXT,
        is_shared BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Criar tabela wishlist_items
    await pool.query(`
      CREATE TABLE IF NOT EXISTS wishlist_items (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        couple_id INTEGER,
        title VARCHAR(255) NOT NULL,
        price DECIMAL(10,2),
        category VARCHAR(50) DEFAULT 'other',
        priority VARCHAR(20) DEFAULT 'medium',
        link TEXT,
        image TEXT,
        notes TEXT,
        is_shared BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Criar tabela wishlist_share_settings
    await pool.query(`
      CREATE TABLE IF NOT EXISTS wishlist_share_settings (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL UNIQUE,
        is_shared BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    res.json({ success: true, message: "Tabelas criadas com sucesso!" });
  } catch (error) {
    console.error("Erro ao criar tabelas:", error);
    res.status(500).json({ error: error.message });
  }
});

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

    console.log("🔥 INICIOU POST /expenses");
    console.log("📦 BODY:", req.body);

    if (!service || !price || !dueDate) {
      return res.status(400).json({ error: "Dados incompletos" });
    }

    const originalPrice = Number(price);
    const isRecurring = (numberTimes && numberTimes > 1) || recurrence === 'monthly';

    await client.query("BEGIN");

    const expense = await client.query(
      `INSERT INTO expenses 
       (user_id, service, price, paymentmethod, numbertimes, recurrence, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [userId, service, originalPrice, paymentMethod, numberTimes || 1, recurrence || 'none', userId]
    );

    const expenseId = expense.rows[0].id;
    const startDate = new Date(dueDate);
    startDate.setHours(12, 0, 0, 0);

    let installmentsToCreate = [];

    if (isRecurring) {
      const numberOfOccurrences = numberTimes || 12;
      console.log(`🔄 Criando ${numberOfOccurrences} parcelas de R$ ${originalPrice.toFixed(2)}`);

      for (let i = 0; i < numberOfOccurrences; i++) {
        let currentDate = new Date(startDate);
        currentDate.setMonth(startDate.getMonth() + i);

        if (currentDate.getDate() !== startDate.getDate()) {
          currentDate.setDate(0);
          currentDate.setDate(currentDate.getDate());
        }

        installmentsToCreate.push({
          number: i + 1,
          amount: originalPrice,
          dueDate: currentDate
        });

        console.log(`  📅 Parcela ${i + 1}: ${currentDate.toISOString().split('T')[0]} - R$ ${originalPrice.toFixed(2)}`);
      }
    } else {
      installmentsToCreate.push({
        number: 1,
        amount: originalPrice,
        dueDate: startDate
      });
    }

    for (const inst of installmentsToCreate) {
      await client.query(
        `INSERT INTO installments 
         (expense_id, installment_number, amount, duedate, total_installments, updated_by)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [expenseId, inst.number, inst.amount, inst.dueDate, installmentsToCreate.length, userId]
      );
    }

    await client.query("COMMIT");
    console.log(`✅ ${installmentsToCreate.length} parcelas criadas com sucesso!`);
    res.json({
      message: "Despesa criada com sucesso",
      expenseId,
      installments: installmentsToCreate.length
    });

  } catch (err) {
    await client.query("ROLLBACK");
    console.error("🔥 ERRO AO CRIAR DESPESA:", err);
    res.status(500).json({ error: "Erro ao adicionar despesa: " + err.message });
  } finally {
    client.release();
  }
});

// GET - Buscar nome do parceiro
app.get("/couple/spouse-name", authMiddleware, async (req, res) => {
  try {
    const userId = req.userId;
    const result = await pool.query(
      `SELECT u.name FROM users u
       JOIN couple_members cm ON u.id = cm.user_id
       WHERE cm.couple_id = (SELECT couple_id FROM couple_members WHERE user_id = $1)
       AND cm.user_id != $1 LIMIT 1`,
      [userId]
    );
    res.json({ name: result.rows[0]?.name || null });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/expenses/month/:year/:month", authMiddleware, async (req, res) => {
  try {
    const { year, month } = req.params;
    const userId = req.userId;

    const result = await pool.query(
      `SELECT i.id, i.installment_number, i.amount, i.duedate, i.updated_at,
              e.service, e.price, e.paymentmethod, e.recurrence, e.id as expense_id,
              u.name as updated_by_name
       FROM installments i
       JOIN expenses e ON e.id = i.expense_id
       LEFT JOIN users u ON u.id = i.updated_by
       WHERE e.user_id = $1
       AND i.duedate >= DATE_TRUNC('month', TO_DATE($2 || '-' || $3 || '-01', 'YYYY-MM-DD'))
       AND i.duedate < DATE_TRUNC('month', TO_DATE($2 || '-' || $3 || '-01', 'YYYY-MM-DD')) + INTERVAL '1 month'
       ORDER BY i.duedate`,
      [userId, year, month]
    );

    console.log(`📊 Carregadas ${result.rows.length} despesas para ${month}/${year}`);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.get("/expenses/partner/month/:year/:month", authMiddleware, async (req, res) => {
  try {
    const { year, month } = req.params;
    const userId = req.userId;

    // Buscar o ID do cônjuge
    const spouseResult = await pool.query(
      `SELECT user_id FROM couple_members 
       WHERE couple_id = (SELECT couple_id FROM couple_members WHERE user_id = $1)
       AND user_id != $1 LIMIT 1`,
      [userId]
    );

    if (spouseResult.rows.length === 0) {
      return res.json([]);
    }

    const spouseId = spouseResult.rows[0].user_id;

    const result = await pool.query(
      `SELECT i.id, i.installment_number, i.amount, i.duedate, i.updated_at,
              e.service, e.price, e.paymentmethod, e.recurrence, e.id as expense_id,
              u.name as updated_by_name
       FROM installments i
       JOIN expenses e ON e.id = i.expense_id
       LEFT JOIN users u ON u.id = i.updated_by
       WHERE e.user_id = $1
       AND i.duedate >= DATE_TRUNC('month', TO_DATE($2 || '-' || $3 || '-01', 'YYYY-MM-DD'))
       AND i.duedate < DATE_TRUNC('month', TO_DATE($2 || '-' || $3 || '-01', 'YYYY-MM-DD')) + INTERVAL '1 month'
       ORDER BY i.duedate`,
      [spouseId, year, month]
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
       WHERE i.id = $1 
       AND (e.user_id = $2 OR e.user_id IN (
         SELECT user_id FROM couple_members 
         WHERE couple_id = (SELECT couple_id FROM couple_members WHERE user_id = $2)
       ))`,
      [id, userId]
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: "Despesa não encontrada" });
    }

    const expenseId = checkResult.rows[0].expense_id;

    await pool.query(
      `UPDATE expenses SET service = $1, price = $2, paymentmethod = $3, recurrence = $4, updated_by = $5, updated_at = NOW()
       WHERE id = $6`,
      [service, price, paymentMethod, recurrence, userId, expenseId]
    );

    await pool.query(
      `UPDATE installments SET amount = $1, duedate = $2, updated_by = $3, updated_at = NOW() WHERE id = $4`,
      [price, dueDate, userId, id]
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
       WHERE i.id = $1 
       AND (e.user_id = $2 OR e.user_id IN (
         SELECT user_id FROM couple_members 
         WHERE couple_id = (SELECT couple_id FROM couple_members WHERE user_id = $2)
       ))`,
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

// ================= DASHBOARD =================
app.get("/dashboard/month-total/:year/:month", async (req, res) => {
  const { year, month } = req.params;

  const result = await pool.query(
    `SELECT SUM(amount) as total
     FROM installments
     WHERE EXTRACT(YEAR FROM duedate)=$1
     AND EXTRACT(MONTH FROM duedate)=$2`,
    [parseInt(year), parseInt(month)]
  );

  res.json(result.rows[0]);
});

app.get("/dashboard/alerts", async (_req, res) => {
  try {
    const result = await pool.query(`
      SELECT e.service, i.duedate, i.amount
      FROM installments i
      JOIN expenses e ON e.id = i.expense_id
      WHERE i.duedate BETWEEN NOW() AND NOW() + interval '7 days'
      ORDER BY i.duedate
    `);

    res.json(result.rows);
  } catch {
    res.json([]);
  }
});

app.get("/debug/db-check", async (req, res) => {
  try {
    const tables = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);
    res.json({
      database: process.env.DATABASE_URL?.substring(0, 50),
      tables: tables.rows.map(t => t.table_name)
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/debug/check-table", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'shopping_list_share_settings'
      );
    `);
    res.json({ exists: result.rows[0].exists });
  } catch (error) {
    res.json({ error: error.message });
  }
});

app.get("/debug/user", authMiddleware, async (req, res) => {
  res.json({ userId: req.userId });
});

app.get("/dashboard/monthly", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        TO_CHAR(i.duedate,'Mon') as month,
        SUM(i.amount) as total
      FROM installments i
      GROUP BY TO_CHAR(i.duedate,'Mon')
      ORDER BY MIN(i.duedate)
    `);

    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.json([]);
  }
});

// ================= INICIALIZAÇÃO =================
ensureFeatureSchema().catch(console.error);

// ================= EXPORT PARA VERCEL =================
export default app;