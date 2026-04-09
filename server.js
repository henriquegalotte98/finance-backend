import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import multer from "multer";
import { v2 as cloudinary } from "cloudinary";
import bodyParser from "body-parser";
import jwt from "jsonwebtoken";

import "./db.js";
import { pool } from "./db.js";

import coupleRoutes from "./routes/couple.routes.js";
import authRoutes from "./routes/auth.routes.js";
import featureRoutes, { ensureFeatureSchema } from "./routes/feature.routes.js";
import { authMiddleware } from "./middleware/auth.js";

const app = express();

console.log("ENV CHECK:", {
  cloud: process.env.CLOUDINARY_CLOUD_NAME,
  key: process.env.CLOUDINARY_API_KEY,
  secret: process.env.CLOUDINARY_API_SECRET ? "OK" : "MISSING"
});

// ================= CORS =================
app.use((req, res, next) => {
  const allowedOrigins = [
    "http://localhost:5173",
    "https://finance-manager-chi-ashen.vercel.app",
    "https://finance-manager-tpzb.vercel.app"
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

// ================= HEALTH =================
app.get("/", (_req, res) => res.send("ok"));
app.get("/healthz", (_req, res) => res.json({ status: "ok" }));

// ================= CLOUDINARY =================
if (
  !process.env.CLOUDINARY_CLOUD_NAME ||
  !process.env.CLOUDINARY_API_KEY ||
  !process.env.CLOUDINARY_API_SECRET
) {
  console.error("❌ Cloudinary não configurado!");
}

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// ================= MULTER =================
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }
});

// ================= USER =================
app.get("/users/me", authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT u.id, u.name, u.email, a.caminho
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

// ================= TEST =================
app.get("/ping", (req, res) => {
  res.send("pong");
});

// ================= UPLOAD =================
app.post("/upload", upload.single("file"), async (req, res) => {
  try {
    console.log("REQ.FILE:", req.file);
    console.log("REQ.BODY:", req.body);

    if (!req.file) {
      return res.status(400).json({ error: "Nenhum arquivo enviado" });
    }

    const userId = req.body.userId;
    if (!userId) {
      return res.status(400).json({ error: "userId não informado" });
    }

    if (!process.env.CLOUDINARY_CLOUD_NAME) {
      throw new Error("Cloudinary não configurado");
    }

    const uploadResult = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: "finance-manager/profile",
          resource_type: "image"
        },
        (error, result) => {
          if (error) {
            console.error("Cloudinary error:", error);
            return reject(error);
          }
          resolve(result);
        }
      );

      stream.end(req.file.buffer);
    });

    console.log("CLOUDINARY RESULT:", uploadResult);

    const result = await pool.query(
      "INSERT INTO arquivos (nome, caminho) VALUES ($1, $2) RETURNING id",
      [req.file.originalname, uploadResult.secure_url]
    );

    const novoArquivoId = result.rows[0].id;

    await pool.query(
      "UPDATE users SET profile_image_id=$1 WHERE id=$2",
      [novoArquivoId, userId]
    );

    res.json({ success: true, novoArquivoId });

  } catch (err) {
    console.error("ERRO REAL UPLOAD:", err);
    res.status(500).json({
      error: err.message,
      stack: err.stack
    });
  }
});

// ================= FUNÇÕES AUXILIARES =================
function generateDate(baseDate, recurrence, index) {
  let d = new Date(baseDate);
  d.setHours(12, 0, 0, 0);

  const originalDay = d.getDate();
  const originalMonth = d.getMonth();
  const originalYear = d.getFullYear();

  if (recurrence === "monthly") {
    // Adiciona o número de meses
    d.setMonth(originalMonth + index);

    // Se o dia não existe no novo mês (ex: 31 de março + 1 mês), ajusta para o último dia do mês
    if (d.getDate() !== originalDay) {
      d.setDate(0); // Vai para o último dia do mês anterior
      d.setDate(d.getDate()); // Ajusta para o último dia do mês
    }
  }
  else if (recurrence === "weekly") {
    d.setDate(originalDay + (7 * index));
  }
  else if (recurrence === "yearly") {
    d.setFullYear(originalYear + index);
  }

  return d;
}

function totalInstallments(numTimes, recurrence) {
  // RECORRÊNCIA: sempre cria 12 ocorrências (1 ano)
  if (recurrence === "monthly") return 12;
  if (recurrence === "weekly") return 52;
  if (recurrence === "yearly") return 5;

  // PARCELAMENTO ou DESPESA ÚNICA
  return numTimes || 1;
}


// ================= EXPENSES - POST =================
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
    const isRecurring = recurrence !== "none";

    await client.query("BEGIN");

    // VERIFICAR SE JÁ EXISTE DESPESA SIMILAR NOS ÚLTIMOS 30 SEGUNDOS
    const recentCheck = await client.query(
      `SELECT id FROM expenses 
       WHERE user_id = $1 
       AND service = $2 
       AND recurrence = $3
       AND created_at > NOW() - INTERVAL '30 seconds'`,
      [userId, service, recurrence]
    );

    if (recentCheck.rows.length > 0) {
      console.log("⚠️ Despesa duplicada detectada! Cancelando criação.");
      await client.query("ROLLBACK");
      return res.status(400).json({ 
        error: "Despesa duplicada detectada. Aguarde alguns segundos antes de criar novamente.",
        duplicateId: recentCheck.rows[0].id
      });
    }

    // Criar a despesa principal
    const expense = await client.query(
      `INSERT INTO expenses 
       (user_id, service, price, paymentmethod, numbertimes, recurrence)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [userId, service, originalPrice, paymentMethod, 1, recurrence || 'none']
    );

    const expenseId = expense.rows[0].id;
    
    let installmentsToCreate = [];
    const startDate = new Date(dueDate);
    startDate.setHours(12, 0, 0, 0);
    
    if (isRecurring) {
      // RECORRÊNCIA: 12 ocorrências
      const numberOfOccurrences = 12;
      console.log(`🔄 Criando ${numberOfOccurrences} ocorrências mensais de R$ ${originalPrice.toFixed(2)}`);
      
      for (let i = 0; i < numberOfOccurrences; i++) {
        let currentDate = new Date(startDate);
        currentDate.setMonth(startDate.getMonth() + i);
        
        // Ajustar para o último dia do mês se necessário
        if (currentDate.getDate() !== startDate.getDate()) {
          currentDate.setDate(0);
          currentDate.setDate(currentDate.getDate());
        }
        
        installmentsToCreate.push({
          number: i + 1,
          amount: originalPrice,
          dueDate: currentDate
        });
        
        console.log(`  📅 ${i+1}: ${currentDate.toISOString().split('T')[0]} - R$ ${originalPrice.toFixed(2)}`);
      }
    } else {
      // DESPESA ÚNICA
      installmentsToCreate.push({
        number: 1,
        amount: originalPrice,
        dueDate: startDate
      });
    }
    
    // Inserir as parcelas
    for (const inst of installmentsToCreate) {
      await client.query(
        `INSERT INTO installments 
         (expense_id, installment_number, amount, duedate, total_installments)
         VALUES ($1, $2, $3, $4, $5)`,
        [expenseId, inst.number, inst.amount, inst.dueDate, installmentsToCreate.length]
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

// ================= EXPENSES - GET MONTH =================
app.get("/expenses/month/:year/:month", authMiddleware, async (req, res) => {
  try {
    const { year, month } = req.params;
    const userId = req.userId;

    const result = await pool.query(
      `SELECT 
        i.id,
        i.installment_number,
        i.amount,
        i.duedate,
        e.service,
        e.price,
        e.paymentmethod,
        e.numbertimes,
        e.recurrence,
        e.id as expense_id
       FROM installments i
       JOIN expenses e ON e.id = i.expense_id
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
    res.status(500).send("Erro ao buscar parcelas");
  }
});

// ================= EXPENSES - PUT =================
app.put("/expenses/:id", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { service, price, paymentMethod, dueDate, recurrence } = req.body;
    const userId = req.userId;

    console.log(`📝 Atualizando despesa ID: ${id}`);

    // Verificar se a parcela pertence ao usuário
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

    // Atualizar a despesa principal
    await pool.query(
      `UPDATE expenses
       SET service = $1, price = $2, paymentmethod = $3, recurrence = $4
       WHERE id = $5`,
      [service, price, paymentMethod, recurrence, expenseId]
    );

    // Atualizar a parcela específica
    const result = await pool.query(
      `UPDATE installments
       SET amount = $1, duedate = $2
       WHERE id = $3 RETURNING *`,
      [price, dueDate, id]
    );

    console.log(`✅ Despesa ${id} atualizada com sucesso`);
    res.json(result.rows[0]);

  } catch (err) {
    console.error("🔥 ERRO PUT:", err);
    res.status(500).json({ error: "Erro ao atualizar despesa" });
  }
});

// ================= EXPENSES - DELETE =================
app.delete("/expenses/:id", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.userId;

    console.log(`🗑️ Deletando despesa ID: ${id}`);

    // Verificar se a parcela pertence ao usuário
    const checkResult = await pool.query(
      `SELECT i.id FROM installments i
       JOIN expenses e ON e.id = i.expense_id
       WHERE i.id = $1 AND e.user_id = $2`,
      [id, userId]
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: "Despesa não encontrada" });
    }

    // Deletar a parcela específica
    await pool.query("DELETE FROM installments WHERE id = $1", [id]);

    console.log(`✅ Despesa ${id} deletada com sucesso`);
    res.json({ message: "Despesa deletada com sucesso" });

  } catch (err) {
    console.error("🔥 ERRO AO DELETAR:", err);
    res.status(500).json({ error: "Erro ao deletar despesa" });
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

// ================= INIT =================
ensureFeatureSchema().catch(console.error);

// ================= EXPORT =================
export default app;

// ================= LOCAL =================
if (process.env.NODE_ENV !== "production") {
  app.listen(3000, () => {
    console.log("Servidor rodando na porta 3000");
  });
}