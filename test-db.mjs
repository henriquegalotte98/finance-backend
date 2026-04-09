import pkg from 'pg';
const { Pool } = pkg;

// Substitua pela sua string do Neon
const DATABASE_URL = 'postgresql://neondb_owner:npg_mfM4ozVsk2nw@ep-crimson-mouse-aculfqi4-pooler.sa-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require';

const pool = new Pool({
  connectionString: DATABASE_URL
});

try {
  // Testa conexão
  const result = await pool.query('SELECT NOW()');
  console.log('✅ Conectado ao Neon!');
  console.log('📅 Data/hora:', result.rows[0].now);
  
  // Lista tabelas
  const tables = await pool.query(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public'
  `);
  
  console.log('📊 Tabelas encontradas:', tables.rows.map(t => t.table_name).join(', ') || 'nenhuma');
  
} catch (err) {
  console.error('❌ Erro:', err.message);
} finally {
  await pool.end();
}