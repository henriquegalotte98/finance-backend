// backend/db.js
import pkg from "pg";
const { Pool } = pkg;

console.log("DB URL configurada:", !!process.env.DATABASE_URL);

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Testar conexão
pool.connect((err, client, release) => {
  if (err) {
    console.error("❌ Erro ao conectar no banco:", err.message);
  } else {
    console.log("✅ Conectado ao banco de dados!");
    release();
  }
});