import express from "express"
import bcrypt from "bcrypt"
import jwt from "jsonwebtoken"
import { pool } from "../db.js"
import { authMiddleware } from "../middleware/auth.js"

const router = express.Router()

// REGISTER
router.post("/register", async (req, res) => {
  const { name, email, password } = req.body;

  try {
    const hash = await bcrypt.hash(password, 10);

    const result = await pool.query(
      `INSERT INTO users (name, email, password_hash)
       VALUES ($1, $2, $3)
       RETURNING id, name, email`,
      [name, email, hash]
    );

    const user = result.rows[0];

    // Gerar token JWT
    const token = jwt.sign(
      { userId: user.id },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
      },
    });
  } catch (err) {
    console.log("ERRO REGISTER:", err);
    
    // Verificar se é erro de email duplicado
    if (err.code === "23505") {
      return res.status(400).json({ error: "Email já cadastrado" });
    }
    
    res.status(500).json({ error: "Erro no registro" });
  }
});

// LOGIN
router.post("/login", async (req, res) => {

  const { email, password } = req.body

  try {

    const result = await pool.query(
      "SELECT * FROM users WHERE email = $1",
      [email]
    )

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Usuário não encontrado" })
    }

    const user = result.rows[0]

    const valid = await bcrypt.compare(
      password,
      user.password_hash
    )

    if (!valid) {
      return res.status(401).json({ error: "Senha inválida" })
    }

    const token = jwt.sign(
      { userId: user.id },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    )

    res.json({
  token,
  user: {
    id: user.id,
    name: user.name,
    email: user.email
  }
});

  } catch (err) {
    console.log("ERRO LOGIN:", err)
    res.status(500).json({ error: "Erro no login" })
  }

})

// UPDATE PROFILE (NAME)
router.put("/profile", authMiddleware, async (req, res) => {
  const { name } = req.body;
  const userId = req.userId;

  if (!name) {
    return res.status(400).json({ error: "O nome é obrigatório" });
  }

  try {
    const result = await pool.query(
      "UPDATE users SET name = $1 WHERE id = $2 RETURNING id, name, email",
      [name, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Usuário não encontrado" });
    }

    res.json({
      message: "Perfil atualizado com sucesso",
      user: result.rows[0]
    });
  } catch (err) {
    console.error("ERRO UPDATE PROFILE:", err);
    res.status(500).json({ error: "Erro ao atualizar perfil" });
  }
});

export default router