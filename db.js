// backend/db.js
import pkg from "pg";
const { Pool } = pkg;

console.log("DB URL configurada:", !!process.env.DATABASE_URL);

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  // Adicionar configurações de timeout
  connectionTimeoutMillis: 30000,
  idleTimeoutMillis: 30000,
  max: 20, // Número máximo de clientes no pool
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