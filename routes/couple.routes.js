// backend/src/routes/couple.routes.js
import express from "express";
import { pool } from "../db.js";
import { authMiddleware } from "../middleware/auth.js"; // ← ADICIONAR ESTA LINHA

const router = express.Router();

// ================= CRIAR CASAL =================
router.post("/create", authMiddleware, async (req, res) => {
  try {
    const userId = req.userId;
    
    // Verificar se usuário já está em um casal
    const existing = await pool.query(
      "SELECT couple_id FROM couple_members WHERE user_id = $1",
      [userId]
    );
    
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: "Usuário já está em um casal" });
    }
    
    // Gerar código de convite único
    const inviteCode = Math.random().toString(36).substring(2, 10).toUpperCase();
    
    // Criar casal
    const couple = await pool.query(
      "INSERT INTO couples (invite_code, living_together) VALUES ($1, $2) RETURNING id",
      [inviteCode, false]
    );
    
    const coupleId = couple.rows[0].id;
    
    // Adicionar usuário como admin
    await pool.query(
      "INSERT INTO couple_members (couple_id, user_id, role) VALUES ($1, $2, $3)",
      [coupleId, userId, 'admin']
    );
    
    res.json({ success: true, inviteCode, coupleId });
  } catch (error) {
    console.error("Erro ao criar casal:", error);
    res.status(500).json({ error: error.message });
  }
});

// ================= ENTRAR NO CASAL =================
router.post("/join", authMiddleware, async (req, res) => {
  try {
    const { code } = req.body;
    const userId = req.userId;
    
    // Verificar se usuário já está em um casal
    const existing = await pool.query(
      "SELECT couple_id FROM couple_members WHERE user_id = $1",
      [userId]
    );
    
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: "Usuário já está em um casal" });
    }
    
    // Buscar casal pelo código
    const couple = await pool.query(
      "SELECT id FROM couples WHERE invite_code = $1",
      [code]
    );
    
    if (couple.rows.length === 0) {
      return res.status(404).json({ error: "Código de convite inválido" });
    }
    
    const coupleId = couple.rows[0].id;
    
    // Adicionar usuário como member
    await pool.query(
      "INSERT INTO couple_members (couple_id, user_id, role) VALUES ($1, $2, $3)",
      [coupleId, userId, 'member']
    );
    
    res.json({ success: true, coupleId });
  } catch (error) {
    console.error("Erro ao entrar no casal:", error);
    res.status(500).json({ error: error.message });
  }
});

// ================= SAIR DO CASAL =================
router.delete("/leave", authMiddleware, async (req, res) => {
  try {
    const userId = req.userId;
    
    // Verificar se o usuário está em um casal
    const memberCheck = await pool.query(
      "SELECT couple_id, role FROM couple_members WHERE user_id = $1",
      [userId]
    );
    
    if (memberCheck.rows.length === 0) {
      return res.status(400).json({ error: "Usuário não está em um casal" });
    }
    
    const coupleId = memberCheck.rows[0].couple_id;
    
    // Remover o membro
    await pool.query(
      "DELETE FROM couple_members WHERE user_id = $1",
      [userId]
    );
    
    // Verificar se ainda há membros no casal
    const remainingMembers = await pool.query(
      "SELECT COUNT(*) FROM couple_members WHERE couple_id = $1",
      [coupleId]
    );
    
    // Se não houver mais membros, deletar o casal
    if (parseInt(remainingMembers.rows[0].count) === 0) {
      await pool.query("DELETE FROM couples WHERE id = $1", [coupleId]);
    }
    
    res.json({ success: true, message: "Você saiu do casal" });
  } catch (error) {
    console.error("Erro ao sair do casal:", error);
    res.status(500).json({ error: error.message });
  }
});

// ================= INFORMAÇÕES DO CASAL =================
router.get("/me", authMiddleware, async (req, res) => {
  try {
    const userId = req.userId;
    
    const memberInfo = await pool.query(
      "SELECT couple_id, role FROM couple_members WHERE user_id = $1",
      [userId]
    );
    
    if (memberInfo.rows.length === 0) {
      return res.json({ couple: null, members: [] });
    }
    
    const coupleId = memberInfo.rows[0].couple_id;
    
    const couple = await pool.query(
      "SELECT * FROM couples WHERE id = $1",
      [coupleId]
    );
    
    const members = await pool.query(
      `SELECT u.id, u.name, u.email, cm.role
       FROM couple_members cm
       JOIN users u ON u.id = cm.user_id
       WHERE cm.couple_id = $1
       ORDER BY cm.role DESC, u.name`,
      [coupleId]
    );
    
    res.json({ couple: couple.rows[0], members: members.rows });
  } catch (error) {
    console.error("Erro ao buscar informações do casal:", error);
    res.status(500).json({ error: error.message });
  }
});

// ================= ATUALIZAR MORAR JUNTO =================
router.post("/living-together", authMiddleware, async (req, res) => {
  try {
    const { livingTogether } = req.body;
    const userId = req.userId;
    
    const memberInfo = await pool.query(
      "SELECT couple_id FROM couple_members WHERE user_id = $1",
      [userId]
    );
    
    if (memberInfo.rows.length === 0) {
      return res.status(400).json({ error: "Usuário não está em um casal" });
    }
    
    const coupleId = memberInfo.rows[0].couple_id;
    
    await pool.query(
      "UPDATE couples SET living_together = $1 WHERE id = $2",
      [livingTogether, coupleId]
    );
    
    res.json({ success: true });
  } catch (error) {
    console.error("Erro ao atualizar morar junto:", error);
    res.status(500).json({ error: error.message });
  }
});

// ================= BUSCAR NOME DO CÔNJUGE =================
router.get("/spouse-name", authMiddleware, async (req, res) => {
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

export default router;