import { pool } from "../db.js"

export async function getUserCoupleId(userId) {

  const result = await pool.query(
    "SELECT couple_id FROM couple_members WHERE user_id = $1",
    [userId]
  )

  if (result.rows.length === 0) return null

  return result.rows[0].couple_id
}