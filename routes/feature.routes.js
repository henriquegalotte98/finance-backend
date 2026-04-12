import express from "express";
import bcrypt from "bcrypt";
import { pool } from "../db.js";
import { authMiddleware } from "../middleware/auth.js";
import { getDestinationTheme } from "../utils/destinationTheme.js";

const router = express.Router();

async function tryFetchTravelPrices({ originIata, destinationIata, month, mode }) {
  const rapidApiKey = process.env.RAPIDAPI_KEY;
  if (!rapidApiKey || mode !== "air" || !originIata || !destinationIata || !month) {
    return null;
  }
  try {
    const date = `${month}-15`;
    const url = `https://sky-scrapper.p.rapidapi.com/api/v1/flights/searchFlights?originSkyId=${originIata}&destinationSkyId=${destinationIata}&originEntityId=${originIata}&destinationEntityId=${destinationIata}&date=${date}&adults=1&currency=BRL&market=BR&locale=pt-BR`;
    const response = await fetch(url, {
      headers: {
        "x-rapidapi-key": rapidApiKey,
        "x-rapidapi-host": "sky-scrapper.p.rapidapi.com"
      }
    });
    if (!response.ok) return null;
    const json = await response.json();
    const candidate = json?.data?.itineraries?.[0]?.price?.raw || null;
    if (!candidate) return null;
    return Number(candidate);
  } catch (_err) {
    return null;
  }
}

async function tryFetchHotelPrices({ destination }) {
  const rapidApiKey = process.env.RAPIDAPI_KEY;
  if (!rapidApiKey || !destination) return null;
  try {
    const url = `https://booking-com15.p.rapidapi.com/api/v1/hotels/searchDestination?query=${encodeURIComponent(destination)}`;
    const response = await fetch(url, {
      headers: {
        "x-rapidapi-key": rapidApiKey,
        "x-rapidapi-host": "booking-com15.p.rapidapi.com"
      }
    });
    if (!response.ok) return null;
    const json = await response.json();
    if (!json?.data?.[0]) return null;
    return 320;
  } catch (_err) {
    return null;
  }
}

export async function ensureFeatureSchema() {

  // Dentro da função ensureFeatureSchema(), adicione:

  await pool.query(`
  CREATE TABLE IF NOT EXISTS shopping_list_items (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    couple_id INTEGER REFERENCES couples(id) ON DELETE SET NULL,
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
  );
`);

  await pool.query(`
  CREATE TABLE IF NOT EXISTS wishlist_items (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    couple_id INTEGER REFERENCES couples(id) ON DELETE SET NULL,
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
  );
`);

  await pool.query(`
  CREATE TABLE IF NOT EXISTS wishlist_share_settings (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    is_shared BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
`);


  await pool.query(`
    CREATE TABLE IF NOT EXISTS couples (
      id SERIAL PRIMARY KEY,
      invite_code VARCHAR(20) UNIQUE,
      living_together BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS couple_members (
      id SERIAL PRIMARY KEY,
      couple_id INT REFERENCES couples(id) ON DELETE CASCADE,
      user_id INT REFERENCES users(id) ON DELETE CASCADE,
      role VARCHAR(30) DEFAULT 'member',
      created_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(couple_id, user_id),
      UNIQUE(user_id)
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS shared_lists (
      id SERIAL PRIMARY KEY,
      couple_id INT REFERENCES couples(id) ON DELETE CASCADE,
      owner_user_id INT REFERENCES users(id) ON DELETE CASCADE,
      type VARCHAR(30) NOT NULL,
      title VARCHAR(120) NOT NULL,
      status VARCHAR(20) DEFAULT 'active',
      created_by INT REFERENCES users(id),
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS shared_list_items (
      id SERIAL PRIMARY KEY,
      list_id INT REFERENCES shared_lists(id) ON DELETE CASCADE,
      title VARCHAR(180) NOT NULL,
      notes TEXT,
      external_link TEXT,
      image_url TEXT,
      target_price NUMERIC(12,2),
      priority VARCHAR(20) DEFAULT 'normal',
      quantity INT DEFAULT 1,
      status VARCHAR(20) DEFAULT 'pending',
      created_by INT REFERENCES users(id),
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS couple_todos (
      id SERIAL PRIMARY KEY,
      user_id INT REFERENCES users(id) ON DELETE CASCADE,
      title VARCHAR(160) NOT NULL,
      details TEXT,
      due_date DATE,
      status VARCHAR(20) DEFAULT 'todo',
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS travel_plans (
      id SERIAL PRIMARY KEY,
      owner_user_id INT REFERENCES users(id) ON DELETE CASCADE,
      couple_id INT REFERENCES couples(id) ON DELETE SET NULL,
      title VARCHAR(120) NOT NULL,
      destination VARCHAR(120) NOT NULL,
      start_date DATE,
      end_date DATE,
      is_shared BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);
  await pool.query(`ALTER TABLE travel_plans ADD COLUMN IF NOT EXISTS definitive_transport JSONB;`);
  await pool.query(`ALTER TABLE travel_plans ADD COLUMN IF NOT EXISTS definitive_accommodation JSONB;`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS travel_plan_items (
      id SERIAL PRIMARY KEY,
      travel_plan_id INT REFERENCES travel_plans(id) ON DELETE CASCADE,
      category VARCHAR(40) NOT NULL,
      title VARCHAR(160) NOT NULL,
      estimated_cost NUMERIC(12,2) DEFAULT 0,
      actual_cost NUMERIC(12,2) DEFAULT 0,
      notes TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS savings_wallets (
      id SERIAL PRIMARY KEY,
      owner_user_id INT REFERENCES users(id) ON DELETE CASCADE,
      couple_id INT REFERENCES couples(id) ON DELETE SET NULL,
      name VARCHAR(120) NOT NULL,
      balance NUMERIC(12,2) DEFAULT 0,
      is_shared BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);

  await pool.query(`ALTER TABLE shared_lists ADD COLUMN IF NOT EXISTS owner_user_id INT REFERENCES users(id) ON DELETE CASCADE;`);
  await pool.query(`ALTER TABLE shared_lists ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'active';`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS savings_transactions (
      id SERIAL PRIMARY KEY,
      wallet_id INT REFERENCES savings_wallets(id) ON DELETE CASCADE,
      user_id INT REFERENCES users(id) ON DELETE SET NULL,
      amount NUMERIC(12,2) NOT NULL,
      tx_type VARCHAR(20) NOT NULL,
      notes TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS expense_attachments (
      id SERIAL PRIMARY KEY,
      expense_id INT REFERENCES expenses(id) ON DELETE CASCADE,
      installment_id INT REFERENCES installments(id) ON DELETE SET NULL,
      user_id INT REFERENCES users(id) ON DELETE SET NULL,
      file_url TEXT NOT NULL,
      file_name VARCHAR(180),
      file_kind VARCHAR(40) DEFAULT 'receipt',
      notes TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);
  // Dentro da função ensureFeatureSchema(), antes do último `});`

  await pool.query(`
    CREATE TABLE IF NOT EXISTS shopping_list_items (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      couple_id INTEGER REFERENCES couples(id) ON DELETE SET NULL,
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
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS wishlist_items (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      couple_id INTEGER REFERENCES couples(id) ON DELETE SET NULL,
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
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS wishlist_share_settings (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      is_shared BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Índices
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_shopping_list_user ON shopping_list_items(user_id);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_shopping_list_couple ON shopping_list_items(couple_id);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_wishlist_items_user ON wishlist_items(user_id);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_wishlist_items_couple ON wishlist_items(couple_id);`);
}

async function getCoupleId(userId) {
  const result = await pool.query("SELECT couple_id FROM couple_members WHERE user_id=$1", [userId]);
  return result.rows[0]?.couple_id || null;
}

async function getSpouseId(userId) {
  const coupleId = await getCoupleId(userId);
  if (!coupleId) return null;
  const result = await pool.query(
    "SELECT user_id FROM couple_members WHERE couple_id=$1 AND user_id != $2 LIMIT 1",
    [coupleId, userId]
  );
  return result.rows[0]?.user_id || null;
}

// ================= CASAL =================
// ================= SHOPPING LIST SHARE STATUS =================
router.get('/shopping-list/share-status', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT is_shared, share_code FROM shopping_list_share_settings 
       WHERE user_id = $1`,
      [req.userId]
    );

    const isShared = result.rows[0]?.is_shared || false;
    const shareCode = result.rows[0]?.share_code || null;

    res.json({ isShared, shareCode });
  } catch (error) {
    console.error('Erro ao buscar status de compartilhamento:', error);
    res.json({ isShared: false, shareCode: null });
  }
});

router.post('/shopping-list/toggle-share', authMiddleware, async (req, res) => {
  try {
    const { isShared } = req.body;
    const shareCode = isShared ? `SHOP-${req.userId}-${Date.now()}` : null;

    await pool.query(
      `INSERT INTO shopping_list_share_settings (user_id, is_shared, share_code)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id) DO UPDATE 
       SET is_shared = EXCLUDED.is_shared, share_code = EXCLUDED.share_code`,
      [req.userId, isShared, shareCode]
    );

    res.json({ success: true, isShared, shareCode });
  } catch (error) {
    console.error('Erro ao alternar compartilhamento:', error);
    res.status(500).json({ error: error.message });
  }
});

router.get("/couple/me", authMiddleware, async (req, res) => {
  try {
    const coupleId = await getCoupleId(req.userId);
    if (!coupleId) return res.json({ couple: null, members: [] });
    const couple = await pool.query("SELECT * FROM couples WHERE id=$1", [coupleId]);
    const members = await pool.query(
      `SELECT u.id, u.name, u.email
       FROM couple_members cm
       JOIN users u ON u.id = cm.user_id
       WHERE cm.couple_id=$1
       ORDER BY u.id`,
      [coupleId]
    );
    res.json({ couple: couple.rows[0], members: members.rows });
  } catch (err) {
    res.status(500).json({ error: "Erro ao carregar casal" });
  }
});

// ================= SHOPPING LIST SHARE STATUS =================
router.get('/shopping-list/share-status', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT is_shared, share_code FROM shopping_list_share_settings 
       WHERE user_id = $1`,
      [req.userId]
    );

    const isShared = result.rows[0]?.is_shared || false;
    const shareCode = result.rows[0]?.share_code || null;

    res.json({ isShared, shareCode });
  } catch (error) {
    console.error('Erro ao buscar status de compartilhamento:', error);
    res.json({ isShared: false, shareCode: null });
  }
});

router.post('/shopping-list/toggle-share', authMiddleware, async (req, res) => {
  try {
    const { isShared } = req.body;
    const shareCode = isShared ? `SHOP-${req.userId}-${Date.now()}` : null;

    await pool.query(
      `INSERT INTO shopping_list_share_settings (user_id, is_shared, share_code)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id) DO UPDATE 
       SET is_shared = EXCLUDED.is_shared, share_code = EXCLUDED.share_code`,
      [req.userId, isShared, shareCode]
    );

    res.json({ success: true, isShared, shareCode });
  } catch (error) {
    console.error('Erro ao alternar compartilhamento:', error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/shopping-list', authMiddleware, async (req, res) => {
  try {
    const coupleId = await getCoupleId(req.userId);

    // Buscar itens do usuário E itens compartilhados com ele
    const result = await pool.query(
      `SELECT s.*, 
        CASE 
          WHEN s.user_id = $1 THEN 'owner'
          ELSE 'shared'
        END as ownership,
        u.name as owner_name
       FROM shopping_list_items s
       LEFT JOIN users u ON u.id = s.user_id
       WHERE s.user_id = $1 
          OR s.id IN (
            SELECT sls.owner_user_id FROM shopping_list_shares sls 
            WHERE sls.shared_with_user_id = $1
          )
          OR (s.is_shared = true AND s.couple_id = $2)
       ORDER BY s.status ASC, s.created_at DESC`,
      [req.userId, coupleId]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Erro ao buscar shopping list:', error);
    res.status(500).json({ error: error.message });
  }
});

router.post("/couple/living-together", authMiddleware, async (req, res) => {
  try {
    const { livingTogether } = req.body;
    const coupleId = await getCoupleId(req.userId);
    if (!coupleId) return res.status(400).json({ error: "Usuário não está em casal" });
    await pool.query("UPDATE couples SET living_together=$1 WHERE id=$2", [!!livingTogether, coupleId]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Erro ao atualizar opção morar junto" });
  }
});

// ================= LISTAS COMPARTILHADAS =================
router.get("/lists", authMiddleware, async (req, res) => {
  try {
    const coupleId = await getCoupleId(req.userId);
    const result = await pool.query(
      `SELECT * FROM shared_lists
       WHERE (couple_id IS NOT NULL AND couple_id=$1)
          OR owner_user_id=$2
       ORDER BY created_at DESC`,
      [coupleId, req.userId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: "Erro ao buscar listas" });
  }
});

router.post("/lists", authMiddleware, async (req, res) => {
  try {
    const coupleId = await getCoupleId(req.userId);
    const { type, title } = req.body;
    const result = await pool.query(
      "INSERT INTO shared_lists (couple_id, owner_user_id, type, title, created_by) VALUES ($1,$2,$3,$4,$5) RETURNING *",
      [coupleId || null, req.userId, type, title, req.userId]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: "Erro ao criar lista" });
  }
});

router.patch("/lists/:listId", authMiddleware, async (req, res) => {
  try {
    const { listId } = req.params;
    const { title, status } = req.body;
    await pool.query(
      "UPDATE shared_lists SET title = COALESCE($1, title), status = COALESCE($2, status) WHERE id=$3",
      [title || null, status || null, listId]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Erro ao atualizar lista" });
  }
});

router.get("/lists/:listId/items", authMiddleware, async (req, res) => {
  try {
    const { listId } = req.params;
    const result = await pool.query("SELECT * FROM shared_list_items WHERE list_id=$1 ORDER BY created_at DESC", [listId]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: "Erro ao buscar itens" });
  }
});

router.post("/lists/:listId/items", authMiddleware, async (req, res) => {
  try {
    const { listId } = req.params;
    const { title, notes, external_link, image_url, target_price, priority, quantity } = req.body;
    const result = await pool.query(
      `INSERT INTO shared_list_items
      (list_id, title, notes, external_link, image_url, target_price, priority, quantity, created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      RETURNING *`,
      [listId, title, notes || null, external_link || null, image_url || null, target_price || null, priority || "normal", quantity || 1, req.userId]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: "Erro ao criar item" });
  }
});

router.patch("/lists/items/:itemId/status", authMiddleware, async (req, res) => {
  try {
    const { itemId } = req.params;
    const { status } = req.body;
    await pool.query("UPDATE shared_list_items SET status=$1 WHERE id=$2", [status, itemId]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Erro ao atualizar item" });
  }
});

router.put("/lists/items/:itemId", authMiddleware, async (req, res) => {
  try {
    const { itemId } = req.params;
    const { title, notes, external_link, image_url, target_price, priority, quantity } = req.body;
    await pool.query(
      `UPDATE shared_list_items
       SET title=COALESCE($1, title),
           notes=COALESCE($2, notes),
           external_link=COALESCE($3, external_link),
           image_url=COALESCE($4, image_url),
           target_price=COALESCE($5, target_price),
           priority=COALESCE($6, priority),
           quantity=COALESCE($7, quantity)
       WHERE id=$8`,
      [title || null, notes || null, external_link || null, image_url || null, target_price || null, priority || null, quantity || null, itemId]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Erro ao editar item" });
  }
});

router.delete("/lists/items/:itemId", authMiddleware, async (req, res) => {
  try {
    await pool.query("DELETE FROM shared_list_items WHERE id=$1", [req.params.itemId]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Erro ao excluir item" });
  }
});

// ================= TODOS =================
router.get("/todos/me", authMiddleware, async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM couple_todos WHERE user_id=$1 ORDER BY created_at DESC", [req.userId]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: "Erro ao buscar to-dos" });
  }
});

router.get("/todos/spouse", authMiddleware, async (req, res) => {
  try {
    const coupleId = await getCoupleId(req.userId);
    if (!coupleId) return res.json([]);
    const spouse = await pool.query(
      "SELECT user_id FROM couple_members WHERE couple_id=$1 AND user_id <> $2 LIMIT 1",
      [coupleId, req.userId]
    );
    if (!spouse.rows[0]) return res.json([]);
    const result = await pool.query("SELECT * FROM couple_todos WHERE user_id=$1 ORDER BY created_at DESC", [spouse.rows[0].user_id]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: "Erro ao buscar to-dos da cônjuge" });
  }
});

router.post("/todos", authMiddleware, async (req, res) => {
  try {
    const { title, details, due_date } = req.body;
    const result = await pool.query(
      "INSERT INTO couple_todos (user_id, title, details, due_date) VALUES ($1,$2,$3,$4) RETURNING *",
      [req.userId, title, details || null, due_date || null]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: "Erro ao criar to-do" });
  }
});

router.patch("/todos/:id", authMiddleware, async (req, res) => {
  try {
    const { title, details, due_date, status } = req.body;
    await pool.query(
      `UPDATE couple_todos
       SET title = COALESCE($1, title),
           details = COALESCE($2, details),
           due_date = COALESCE($3, due_date),
           status = COALESCE($4, status)
       WHERE id=$5 AND user_id=$6`,
      [title || null, details || null, due_date || null, status || null, req.params.id, req.userId]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Erro ao atualizar to-do" });
  }
});

router.delete("/todos/:id", authMiddleware, async (req, res) => {
  try {
    await pool.query("DELETE FROM couple_todos WHERE id=$1 AND user_id=$2", [req.params.id, req.userId]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Erro ao excluir to-do" });
  }
});

// ================= VIAGENS =================
router.get("/travel", authMiddleware, async (req, res) => {
  try {
    const coupleId = await getCoupleId(req.userId);
    const result = await pool.query(
      `SELECT * FROM travel_plans
       WHERE owner_user_id=$1
       OR (is_shared=TRUE AND couple_id=$2)
       ORDER BY created_at DESC`,
      [req.userId, coupleId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: "Erro ao listar viagens" });
  }
});

router.post("/travel", authMiddleware, async (req, res) => {
  try {
    const { title, destination, start_date, end_date, is_shared } = req.body;
    const coupleId = await getCoupleId(req.userId);
    const result = await pool.query(
      `INSERT INTO travel_plans
       (owner_user_id, couple_id, title, destination, start_date, end_date, is_shared)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING *`,
      [req.userId, is_shared ? coupleId : null, title, destination, start_date || null, end_date || null, !!is_shared]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: "Erro ao criar viagem" });
  }
});

router.delete("/travel/:id", authMiddleware, async (req, res) => {
  try {
    await pool.query("DELETE FROM travel_plans WHERE id=$1 AND owner_user_id=$2", [req.params.id, req.userId]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Erro ao excluir viagem" });
  }
});

router.get("/travel/:planId/items", authMiddleware, async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM travel_plan_items WHERE travel_plan_id=$1 ORDER BY created_at DESC", [req.params.planId]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: "Erro ao listar itens da viagem" });
  }
});

router.post("/travel/:planId/items", authMiddleware, async (req, res) => {
  try {
    const { category, title, estimated_cost, actual_cost, notes } = req.body;
    const result = await pool.query(
      `INSERT INTO travel_plan_items
      (travel_plan_id, category, title, estimated_cost, actual_cost, notes)
      VALUES ($1,$2,$3,$4,$5,$6)
      RETURNING *`,
      [req.params.planId, category, title, estimated_cost || 0, actual_cost || 0, notes || null]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: "Erro ao criar item da viagem" });
  }
});

router.put("/travel/items/:itemId", authMiddleware, async (req, res) => {
  try {
    const { category, title, estimated_cost, actual_cost, notes } = req.body;
    await pool.query(
      `UPDATE travel_plan_items
       SET category = COALESCE($1, category),
           title = COALESCE($2, title),
           estimated_cost = COALESCE($3, estimated_cost),
           actual_cost = COALESCE($4, actual_cost),
           notes = COALESCE($5, notes)
       WHERE id=$6`,
      [category || null, title || null, estimated_cost ?? null, actual_cost ?? null, notes ?? null, req.params.itemId]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Erro ao editar item da viagem" });
  }
});

router.delete("/travel/items/:itemId", authMiddleware, async (req, res) => {
  try {
    await pool.query("DELETE FROM travel_plan_items WHERE id=$1", [req.params.itemId]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Erro ao excluir item da viagem" });
  }
});

router.put("/travel/:planId/final-data", authMiddleware, async (req, res) => {
  try {
    const { definitiveTransport, definitiveAccommodation } = req.body;
    const result = await pool.query(
      `UPDATE travel_plans
       SET definitive_transport = COALESCE($1, definitive_transport),
           definitive_accommodation = COALESCE($2, definitive_accommodation)
       WHERE id=$3 AND owner_user_id=$4
       RETURNING *`,
      [definitiveTransport || null, definitiveAccommodation || null, req.params.planId, req.userId]
    );
    res.json(result.rows[0] || null);
  } catch (err) {
    res.status(500).json({ error: "Erro ao salvar dados finais da viagem" });
  }
});

router.get("/travel/:planId/final-data", authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT definitive_transport, definitive_accommodation FROM travel_plans WHERE id=$1 LIMIT 1",
      [req.params.planId]
    );
    res.json(result.rows[0] || { definitive_transport: null, definitive_accommodation: null });
  } catch (err) {
    res.status(500).json({ error: "Erro ao carregar dados finais da viagem" });
  }
});

router.get("/travel/:planId/insights", authMiddleware, async (req, res) => {
  // ... manter o código existente (é muito longo)
  try {
    const planResult = await pool.query("SELECT * FROM travel_plans WHERE id=$1 LIMIT 1", [req.params.planId]);
    if (!planResult.rows[0]) return res.status(404).json({ error: "Viagem não encontrada" });
    const plan = planResult.rows[0];
    const destination = plan.destination;
    const destinationEncoded = encodeURIComponent(destination);
    const origin = req.query.origin || "Sao Paulo";
    const mode = req.query.mode || "air";
    const tripMonth = req.query.tripMonth || null;
    const flexibleMonths = Number(req.query.flexibleMonths || 0);
    const checkIn = req.query.checkIn || null;
    const checkOut = req.query.checkOut || null;
    const originEncoded = encodeURIComponent(origin);

    const searchQueries = {
      tours: `o que fazer em ${destination}`,
      food: `comida tipica em ${destination}`,
      restaurants: `melhores restaurantes em ${destination}`,
      mapActivities: `atrações turísticas em ${destination}`
    };

    const googleSearch = (q) => `https://www.google.com/search?q=${encodeURIComponent(q)}`;
    const mapsRoute = `https://www.google.com/maps/dir/${originEncoded}/${destinationEncoded}`;
    const mapsRegion = `https://www.google.com/maps/search/${destinationEncoded}`;

    const iataMap = {
      "sao paulo": "GRU",
      "rio de janeiro": "GIG",
      "miami": "MIA",
      "orlando": "MCO",
      "lisboa": "LIS",
      "londres": "LHR",
      "paris": "CDG",
      "toronto": "YYZ",
      "buenos aires": "EZE",
      "santiago": "SCL",
      "tokyo": "HND"
    };
    const originIata = iataMap[String(origin).toLowerCase()] || null;
    const destinationIata = iataMap[String(destination).toLowerCase()] || null;

    const baseTransport = { air: 1200, bus: 420, car: 650 };
    const seasonalFactor = tripMonth ? 1 : 0.92;
    const fallbackEstimate = Math.round((baseTransport[mode] || 1000) * seasonalFactor * (1 + (Math.random() * 0.18)));
    const apiEstimate = await tryFetchTravelPrices({ originIata, destinationIata, month: tripMonth, mode });
    const estimate = apiEstimate || fallbackEstimate;

    const oneDay = 24 * 60 * 60 * 1000;
    const parsedIn = checkIn ? new Date(checkIn) : null;
    const parsedOut = checkOut ? new Date(checkOut) : null;
    const nights = parsedIn && parsedOut ? Math.max(1, Math.round((parsedOut - parsedIn) / oneDay)) : 5;
    const hotelFallbackNight = 280 + Math.round(Math.random() * 180);
    const hotelApiNight = await tryFetchHotelPrices({ destination });
    const hotelNight = hotelApiNight || hotelFallbackNight;
    const hotelTotal = hotelNight * nights;

    const theme = getDestinationTheme(destination);

    res.json({
      destination,
      theme: { label: theme.label, accent: theme.accent },
      transportPreview: { mode, tripMonth, flexibleMonths, estimatedPricePerPerson: estimate, estimatedPriceCouple: estimate * 2 },
      media: theme.media,
      accommodationPreview: { checkIn, checkOut, nights, estimatedNightly: hotelNight, estimatedTotal: hotelTotal },
      cards: {
        transport: { title: "Transporte", hints: ["Compare ponte aérea com escalas para reduzir custo.", "Inclua bagagem no cálculo de custo total."] },
        accommodation: { title: "Hospedagem", hints: ["Prefira regiões com fácil acesso ao transporte.", "Cheque taxa de limpeza e impostos antes de fechar."], suggestions: ["Filtre por nota 8+ e cancelamento grátis.", "Compare hotel com apartamento para estadias longas.", "Verifique custo com café da manhã incluso."], links: [`https://www.google.com/travel/hotels/${destinationEncoded}`, `https://www.booking.com/searchresults.pt-br.html?ss=${destinationEncoded}`] },
        activities: { title: "Passeios e atividades", links: [googleSearch(searchQueries.tours), googleSearch(searchQueries.mapActivities)], suggestions: [...theme.activityHighlights, "Dica extra: reserve com antecedência em alta temporada."] },
        food: { title: "Alimentação", links: [googleSearch(searchQueries.food), googleSearch(searchQueries.restaurants)], suggestions: [...theme.foodHighlights, "Combine refeições leves com dias de muito passeio."] },
        maps: { title: "Mapas", links: [mapsRoute, mapsRegion] }
      }
    });
  } catch (err) {
    res.status(500).json({ error: "Erro ao montar insights da viagem" });
  }
});

// ================= ECONOMIAS =================
router.get("/savings", authMiddleware, async (req, res) => {
  try {
    const coupleId = await getCoupleId(req.userId);
    const result = await pool.query(
      `SELECT * FROM savings_wallets
       WHERE owner_user_id=$1 OR (is_shared=TRUE AND couple_id=$2)
       ORDER BY created_at DESC`,
      [req.userId, coupleId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: "Erro ao listar carteiras de economia" });
  }
});

router.post("/savings", authMiddleware, async (req, res) => {
  try {
    const { name, is_shared, initial_balance } = req.body;
    const coupleId = await getCoupleId(req.userId);
    const initial = Number(initial_balance || 0);
    const result = await pool.query(
      `INSERT INTO savings_wallets
      (owner_user_id, couple_id, name, balance, is_shared)
      VALUES ($1,$2,$3,$4,$5)
      RETURNING *`,
      [req.userId, is_shared ? coupleId : null, name, initial, !!is_shared]
    );
    if (initial > 0) {
      await pool.query(
        "INSERT INTO savings_transactions (wallet_id, user_id, amount, tx_type, notes) VALUES ($1,$2,$3,$4,$5)",
        [result.rows[0].id, req.userId, initial, "deposit", "Saldo inicial"]
      );
    }
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: "Erro ao criar carteira" });
  }
});

router.post("/savings/:walletId/tx", authMiddleware, async (req, res) => {
  try {
    const { amount, tx_type, notes } = req.body;
    await pool.query("BEGIN");
    await pool.query(
      "INSERT INTO savings_transactions (wallet_id, user_id, amount, tx_type, notes) VALUES ($1,$2,$3,$4,$5)",
      [req.params.walletId, req.userId, amount, tx_type, notes || null]
    );
    const signedAmount = tx_type === "deposit" ? amount : -Math.abs(amount);
    await pool.query("UPDATE savings_wallets SET balance = balance + $1 WHERE id=$2", [signedAmount, req.params.walletId]);
    await pool.query("COMMIT");
    res.json({ success: true });
  } catch (err) {
    await pool.query("ROLLBACK");
    res.status(500).json({ error: "Erro ao lançar transação de economia" });
  }
});

router.get("/savings/:walletId/tx", authMiddleware, async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM savings_transactions WHERE wallet_id=$1 ORDER BY created_at DESC", [req.params.walletId]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: "Erro ao listar transações" });
  }
});

router.patch("/savings/:walletId", authMiddleware, async (req, res) => {
  try {
    const { name, is_shared } = req.body;
    const coupleId = await getCoupleId(req.userId);
    const result = await pool.query(
      `UPDATE savings_wallets
       SET name = COALESCE($1, name),
           is_shared = COALESCE($2, is_shared),
           couple_id = CASE WHEN COALESCE($2, is_shared) = TRUE THEN $3 ELSE NULL END
       WHERE id=$4 AND owner_user_id=$5
       RETURNING *`,
      [name || null, typeof is_shared === "boolean" ? is_shared : null, coupleId, req.params.walletId, req.userId]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Carteira não encontrada ou você não é o dono" });
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Erro ao editar carteira: " + err.message });
  }
});

router.delete("/savings/:walletId", authMiddleware, async (req, res) => {
  try {
    await pool.query("DELETE FROM savings_wallets WHERE id=$1 AND owner_user_id=$2", [req.params.walletId, req.userId]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Erro ao excluir carteira" });
  }
});

// ================= CÂMBIO =================
router.get("/fx/dashboard", authMiddleware, async (_req, res) => {
  try {
    const response = await fetch("https://open.er-api.com/v6/latest/USD");
    const json = await response.json();
    const rates = json.rates || {};
    const currencies = ["USD", "CAD", "EUR", "GBP", "JPY", "ARS", "CLP", "UYU", "PYG", "PEN", "BRL"];
    const selected = currencies.map((code) => ({ code, perUsd: rates[code] || null }));
    res.json({ base: "USD", updatedAt: json.time_last_update_utc, rates: selected });
  } catch (err) {
    res.status(500).json({ error: "Erro ao buscar cotações" });
  }
});

// ================= DESPESAS =================
router.delete("/expenses/:id", authMiddleware, async (req, res) => {
  const client = await pool.connect();
  try {
    const expenseId = req.params.id;
    const expenseCheck = await client.query("SELECT id, user_id FROM expenses WHERE id = $1", [expenseId]);
    if (expenseCheck.rows.length === 0) {
      return res.status(404).json({ error: "Despesa não encontrada" });
    }
    if (expenseCheck.rows[0].user_id !== req.userId) {
      return res.status(403).json({ error: "Sem permissão para deletar esta despesa" });
    }
    await client.query("DELETE FROM expenses WHERE id = $1", [expenseId]);
    res.json({ success: true, message: "Despesa deletada com sucesso" });
  } catch (error) {
    await client.query("ROLLBACK");
    res.status(500).json({ error: "Erro ao deletar despesa: " + error.message });
  } finally {
    client.release();
  }
});

router.get("/expenses/:expenseId/attachments", authMiddleware, async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM expense_attachments WHERE expense_id=$1 ORDER BY created_at DESC", [req.params.expenseId]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: "Erro ao buscar comprovantes" });
  }
});

router.post("/expenses/:expenseId/attachments", authMiddleware, async (req, res) => {
  try {
    const { file_url, file_name, file_kind, notes, installment_id } = req.body;
    const result = await pool.query(
      `INSERT INTO expense_attachments
      (expense_id, installment_id, user_id, file_url, file_name, file_kind, notes)
      VALUES ($1,$2,$3,$4,$5,$6,$7)
      RETURNING *`,
      [req.params.expenseId, installment_id || null, req.userId, file_url, file_name || null, file_kind || "receipt", notes || null]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: "Erro ao anexar comprovante" });
  }
});

// ================= LISTA DE DESEJOS =================
router.get('/wishlist', authMiddleware, async (req, res) => {
  try {
    const coupleId = await getCoupleId(req.userId);
    const result = await pool.query(
      `SELECT * FROM wishlist_items 
       WHERE user_id = $1 OR (is_shared = true AND couple_id = $2)
       ORDER BY created_at DESC`,
      [req.userId, coupleId]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Erro ao buscar wishlist:', error);
    res.status(500).json({ error: error.message });
  }
});

router.post('/wishlist', authMiddleware, async (req, res) => {
  try {
    const { title, price, link, image, notes } = req.body;
    const coupleId = await getCoupleId(req.userId);
    const result = await pool.query(
      `INSERT INTO wishlist_items (user_id, couple_id, title, price, link, image, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [req.userId, coupleId, title, price, link, image, notes]
    );
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Erro ao criar item na wishlist:', error);
    res.status(500).json({ error: error.message });
  }
});

router.put('/wishlist/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { title, price, link, image, notes } = req.body;
    const result = await pool.query(
      `UPDATE wishlist_items 
       SET title = $1, price = $2, link = $3, image = $4, notes = $5, updated_at = NOW()
       WHERE id = $6 AND user_id = $7
       RETURNING *`,
      [title, price, link, image, notes, id, req.userId]
    );
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Erro ao atualizar item da wishlist:', error);
    res.status(500).json({ error: error.message });
  }
});

router.delete('/wishlist/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query(
      `DELETE FROM wishlist_items WHERE id = $1 AND user_id = $2`,
      [id, req.userId]
    );
    res.json({ success: true });
  } catch (error) {
    console.error('Erro ao deletar item da wishlist:', error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/wishlist/share-status', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT is_shared FROM wishlist_share_settings 
       WHERE user_id = $1`,
      [req.userId]
    );
    const isShared = result.rows[0]?.is_shared || false;
    const shareCode = isShared ? `WISH-${req.userId}-${Date.now()}` : null;
    res.json({ isShared, shareCode });
  } catch (error) {
    console.error('Erro ao buscar status de compartilhamento:', error);
    res.json({ isShared: false, shareCode: null });
  }
});

router.post('/wishlist/toggle-share', authMiddleware, async (req, res) => {
  try {
    const { isShared } = req.body;
    await pool.query(
      `INSERT INTO wishlist_share_settings (user_id, is_shared)
       VALUES ($1, $2)
       ON CONFLICT (user_id) DO UPDATE SET is_shared = EXCLUDED.is_shared`,
      [req.userId, isShared]
    );
    res.json({ success: true, isShared });
  } catch (error) {
    console.error('Erro ao alternar compartilhamento:', error);
    res.status(500).json({ error: error.message });
  }
});

// ================= LISTA DE COMPRAS =================
router.get('/shopping-list', authMiddleware, async (req, res) => {
  try {
    const coupleId = await getCoupleId(req.userId);
    const result = await pool.query(
      `SELECT * FROM shopping_list_items 
       WHERE user_id = $1 OR (is_shared = true AND couple_id = $2)
       ORDER BY status ASC, created_at DESC`,
      [req.userId, coupleId]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Erro ao buscar shopping list:', error);
    res.status(500).json({ error: error.message });
  }
});

router.post('/shopping-list', authMiddleware, async (req, res) => {
  try {
    const { name, quantity, price, link, image, status } = req.body;
    const coupleId = await getCoupleId(req.userId);
    const result = await pool.query(
      `INSERT INTO shopping_list_items (user_id, couple_id, name, quantity, price, link, image, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [req.userId, coupleId, name, quantity || 1, price, link, image, status || 'pending']
    );
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Erro ao criar item na shopping list:', error);
    res.status(500).json({ error: error.message });
  }
});

router.patch('/shopping-list/:id/status', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { status, actualPrice } = req.body;
    const result = await pool.query(
      `UPDATE shopping_list_items 
       SET status = $1, price = COALESCE($2, price), updated_at = NOW()
       WHERE id = $3 AND user_id = $4
       RETURNING *`,
      [status, actualPrice, id, req.userId]
    );
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Erro ao atualizar status da shopping list:', error);
    res.status(500).json({ error: error.message });
  }
});

router.put('/shopping-list/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, quantity, price, link, image, status } = req.body;
    const result = await pool.query(
      `UPDATE shopping_list_items 
       SET name = $1, quantity = $2, price = $3, link = $4, image = $5, status = $6, updated_at = NOW()
       WHERE id = $7 AND user_id = $8
       RETURNING *`,
      [name, quantity, price, link, image, status, id, req.userId]
    );
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Erro ao atualizar item da shopping list:', error);
    res.status(500).json({ error: error.message });
  }
});

router.delete('/shopping-list/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query(
      `DELETE FROM shopping_list_items WHERE id = $1 AND user_id = $2`,
      [id, req.userId]
    );
    res.json({ success: true });
  } catch (error) {
    console.error('Erro ao deletar item da shopping list:', error);
    res.status(500).json({ error: error.message });
  }
});

router.post('/shopping-list/checkout', authMiddleware, async (req, res) => {
  try {
    const { items, total, receiptImage, paymentMethod, responsible } = req.body;
    const userId = responsible === 'me' ? req.userId : await getSpouseId(req.userId);

    const expense = await pool.query(
      `INSERT INTO expenses (user_id, service, price, paymentmethod, due_date)
       VALUES ($1, $2, $3, $4, NOW()) RETURNING id`,
      [userId, 'Compra de Mercado', total, paymentMethod]
    );

    await pool.query(
      `INSERT INTO installments (expense_id, installment_number, amount, duedate, total_installments)
       VALUES ($1, 1, $2, NOW(), 1)`,
      [expense.rows[0].id, total]
    );

    res.json({ success: true, expenseId: expense.rows[0].id });
  } catch (error) {
    console.error('Erro ao finalizar checkout:', error);
    res.status(500).json({ error: error.message });
  }
});

// ================= TRANSPORTE DA VIAGEM =================
router.post("/travel/:planId/transport", authMiddleware, async (req, res) => {
  try {
    const { planId } = req.params;
    const transportData = req.body;
    const planCheck = await pool.query(
      `SELECT id FROM travel_plans 
       WHERE id = $1 AND (owner_user_id = $2 OR is_shared = true)`,
      [planId, req.userId]
    );
    if (planCheck.rows.length === 0) {
      return res.status(403).json({ error: "Acesso negado a esta viagem" });
    }
    await pool.query(
      `INSERT INTO travel_transport (travel_plan_id, user_id, transport_data, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (travel_plan_id) DO UPDATE 
       SET transport_data = EXCLUDED.transport_data, updated_at = NOW()`,
      [planId, req.userId, JSON.stringify(transportData)]
    );
    res.json({ success: true, message: "Transporte salvo com sucesso" });
  } catch (error) {
    console.error("Erro ao salvar transporte:", error);
    res.status(500).json({ error: error.message });
  }
});

router.get("/travel/:planId/transport", authMiddleware, async (req, res) => {
  try {
    const { planId } = req.params;
    const result = await pool.query(
      `SELECT transport_data FROM travel_transport WHERE travel_plan_id = $1`,
      [planId]
    );
    res.json(result.rows[0]?.transport_data || {});
  } catch (error) {
    console.error("Erro ao buscar transporte:", error);
    res.status(500).json({ error: error.message });
  }
});

// ================= SERVIÇOS DA VIAGEM =================
router.post("/travel/:planId/services", authMiddleware, async (req, res) => {
  try {
    const { planId } = req.params;
    const { title, description, value, bookingDate, usageDate, category, status } = req.body;
    const planCheck = await pool.query(
      `SELECT id FROM travel_plans 
       WHERE id = $1 AND (owner_user_id = $2 OR is_shared = true)`,
      [planId, req.userId]
    );
    if (planCheck.rows.length === 0) {
      return res.status(403).json({ error: "Acesso negado a esta viagem" });
    }
    const result = await pool.query(
      `INSERT INTO travel_services 
       (travel_plan_id, user_id, title, description, value, booking_date, usage_date, category, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [planId, req.userId, title, description, value, bookingDate, usageDate, category, status || 'planejado']
    );
    res.json(result.rows[0]);
  } catch (error) {
    console.error("Erro ao criar serviço:", error);
    res.status(500).json({ error: error.message });
  }
});

router.get("/travel/:planId/services", authMiddleware, async (req, res) => {
  try {
    const { planId } = req.params;
    const result = await pool.query(
      `SELECT * FROM travel_services 
       WHERE travel_plan_id = $1 
       ORDER BY created_at DESC`,
      [planId]
    );
    res.json(result.rows);
  } catch (error) {
    console.error("Erro ao listar serviços:", error);
    res.status(500).json({ error: error.message });
  }
});

router.put("/travel/services/:serviceId", authMiddleware, async (req, res) => {
  try {
    const { serviceId } = req.params;
    const { title, description, value, bookingDate, usageDate, category, status } = req.body;
    const result = await pool.query(
      `UPDATE travel_services 
       SET title = $1, description = $2, value = $3, 
           booking_date = $4, usage_date = $5, 
           category = $6, status = $7, updated_at = NOW()
       WHERE id = $8 AND user_id = $9
       RETURNING *`,
      [title, description, value, bookingDate, usageDate, category, status, serviceId, req.userId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Serviço não encontrado" });
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.error("Erro ao atualizar serviço:", error);
    res.status(500).json({ error: error.message });
  }
});

router.delete("/travel/services/:serviceId", authMiddleware, async (req, res) => {
  try {
    const { serviceId } = req.params;
    const result = await pool.query(
      `DELETE FROM travel_services 
       WHERE id = $1 AND user_id = $2`,
      [serviceId, req.userId]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Serviço não encontrado" });
    }
    res.json({ success: true, message: "Serviço removido" });
  } catch (error) {
    console.error("Erro ao deletar serviço:", error);
    res.status(500).json({ error: error.message });
  }
});

// ================= DEV =================
router.post("/dev/seed-demo", async (req, res) => {
  try {
    if (process.env.ALLOW_DEMO_SEED !== "true") {
      return res.status(403).json({ error: "Seed demo desabilitado. Defina ALLOW_DEMO_SEED=true" });
    }
    const demoUsers = [
      { name: "Ana Demo", email: "ana.demo@finance.local", password: "123456" },
      { name: "Bruno Demo", email: "bruno.demo@finance.local", password: "123456" },
      { name: "Carla Demo", email: "carla.demo@finance.local", password: "123456" },
      { name: "Diego Demo", email: "diego.demo@finance.local", password: "123456" }
    ];
    const created = [];
    for (const user of demoUsers) {
      const exists = await pool.query("SELECT id FROM users WHERE email=$1", [user.email]);
      if (exists.rows[0]) {
        created.push({ ...user, id: exists.rows[0].id });
        continue;
      }
      const hash = await bcrypt.hash(user.password, 10);
      const result = await pool.query(
        "INSERT INTO users (name, email, password_hash) VALUES ($1,$2,$3) RETURNING id",
        [user.name, user.email, hash]
      );
      created.push({ ...user, id: result.rows[0].id });
    }
    res.json({ success: true, accounts: created.map((u) => ({ name: u.name, email: u.email, password: u.password })) });
  } catch (err) {
    res.status(500).json({ error: "Erro ao criar contas demo" });
  }
});

export default router;