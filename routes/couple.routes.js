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

export default router