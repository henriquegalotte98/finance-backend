import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
  connectionString: "postgresql://neondb_owner:npg_mfM4ozVsk2nw@ep-crimson-mouse-aculfqi4-pooler.sa-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require",
});

async function migrate() {
  try {
    console.log("Checking and creating tables...");
    
    // 1. Create shopping_lists table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS shopping_lists (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        name VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log("✅ shopping_lists table created/verified.");

    // 2. Add list_id to shopping_list_items if it doesn't exist
    await pool.query(`
      ALTER TABLE shopping_list_items 
      ADD COLUMN IF NOT EXISTS list_id INTEGER REFERENCES shopping_lists(id) ON DELETE CASCADE;
    `);
    console.log("✅ list_id column added to shopping_list_items.");

    console.log("Migration finished successfully!");
  } catch (err) {
    console.error("❌ Error during migration:", err);
  } finally {
    await pool.end();
  }
}

migrate();
