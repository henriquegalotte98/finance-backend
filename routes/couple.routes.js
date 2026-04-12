import express from "express"
import { pool } from "../db.js"
import { generateInviteCode } from "../utils/generateInviteCode.js"

const router = express.Router()

// criar casal
router.post("/create",  async (req, res) => {

  const userId = req.userId; // vem do token



  try {

    const code = generateInviteCode()

    const result = await pool.query(
      "INSERT INTO couples (invite_code) VALUES ($1) RETURNING id",
      [code]
    )

    const coupleId = result.rows[0].id

    await pool.query(
      "INSERT INTO couple_members (couple_id, user_id) VALUES ($1,$2)",
      [coupleId, userId]
    )

    res.json({ inviteCode: code })

  } catch (err) {
    console.error(err)
    res.status(500).json({ error: "Erro ao criar casal" })
  }

})

// entrar no casal
router.post("/join", async (req, res) => {

  const { userId, code } = req.body

  try {

    const couple = await pool.query(
      "SELECT id FROM couples WHERE invite_code = $1",
      [code]
    )

    if (couple.rows.length === 0) {
      return res.status(404).json({ error: "Código inválido" })
    }

    const coupleId = couple.rows[0].id

    await pool.query(
      "INSERT INTO couple_members (couple_id, user_id) VALUES ($1,$2)",
      [coupleId, userId]
    )

    res.json({ message: "Entrou no casal" })

  } catch (err) {
    console.error(err)
    res.status(500).json({ error: "Erro ao entrar no casal" })
  }

})

// ================= SAIR DO CASAL =================
router.delete('/leave', authMiddleware, async (req, res) => {
  try {
    // Verificar se o usuário está em um casal
    const memberCheck = await pool.query(
      "SELECT couple_id, role FROM couple_members WHERE user_id = $1",
      [req.userId]
    );
    
    if (memberCheck.rows.length === 0) {
      return res.status(400).json({ error: "Usuário não está em um casal" });
    }
    
    const coupleId = memberCheck.rows[0].couple_id;
    const role = memberCheck.rows[0].role;
    
    // Remover o membro
    await pool.query(
      "DELETE FROM couple_members WHERE user_id = $1",
      [req.userId]
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

export default router