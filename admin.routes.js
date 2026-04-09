// backend/src/routes/admin.routes.js
import express from 'express';
import bcrypt from 'bcrypt';
import { pool } from '../db.js';

const router = express.Router();

// Limpar todos os usuários (exceto admins se houver)
router.post('/admin/clear-users', async (req, res) => {
  try {
    // Deletar todas as dependências primeiro
    await pool.query('DELETE FROM expense_attachments');
    await pool.query('DELETE FROM savings_transactions');
    await pool.query('DELETE FROM savings_wallets');
    await pool.query('DELETE FROM couple_todos');
    await pool.query('DELETE FROM travel_plan_items');
    await pool.query('DELETE FROM travel_plans');
    await pool.query('DELETE FROM shared_list_items');
    await pool.query('DELETE FROM shared_lists');
    await pool.query('DELETE FROM couple_members');
    await pool.query('DELETE FROM couples');
    await pool.query('DELETE FROM installments');
    await pool.query('DELETE FROM expenses');
    await pool.query('DELETE FROM users WHERE email NOT LIKE \'%admin%\'');
    
    res.json({ success: true, message: 'Todos os usuários foram removidos!' });
  } catch (error) {
    console.error('Erro ao limpar usuários:', error);
    res.status(500).json({ error: error.message });
  }
});

// Criar usuários de teste
router.post('/admin/create-test-users', async (req, res) => {
  try {
    const testUsers = [
      { 
        name: 'João Silva', 
        email: 'joao@teste.com', 
        password: '123456',
        profile_image: null
      },
      { 
        name: 'Maria Santos', 
        email: 'maria@teste.com', 
        password: '123456',
        profile_image: null
      },
      { 
        name: 'Carlos Oliveira', 
        email: 'carlos@teste.com', 
        password: '123456',
        profile_image: null
      },
      { 
        name: 'Ana Paula', 
        email: 'ana@teste.com', 
        password: '123456',
        profile_image: null
      }
    ];

    const createdUsers = [];

    for (const user of testUsers) {
      // Verificar se já existe
      const existing = await pool.query('SELECT id FROM users WHERE email = $1', [user.email]);
      
      if (existing.rows.length === 0) {
        const hash = await bcrypt.hash(user.password, 10);
        const result = await pool.query(
          'INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3) RETURNING id, name, email',
          [user.name, user.email, hash]
        );
        createdUsers.push(result.rows[0]);
      } else {
        createdUsers.push(existing.rows[0]);
      }
    }

    res.json({ 
      success: true, 
      message: `${createdUsers.length} usuários criados/atualizados!`,
      users: createdUsers
    });
  } catch (error) {
    console.error('Erro ao criar usuários:', error);
    res.status(500).json({ error: error.message });
  }
});

// Criar um casal de exemplo
router.post('/admin/create-test-couple', async (req, res) => {
  try {
    const { user1Email, user2Email } = req.body;
    
    // Buscar os usuários
    const user1 = await pool.query('SELECT id FROM users WHERE email = $1', [user1Email]);
    const user2 = await pool.query('SELECT id FROM users WHERE email = $1', [user2Email]);
    
    if (user1.rows.length === 0 || user2.rows.length === 0) {
      return res.status(404).json({ error: 'Usuários não encontrados' });
    }
    
    // Criar código de convite único
    const inviteCode = Math.random().toString(36).substring(2, 10).toUpperCase();
    
    // Criar casal
    const couple = await pool.query(
      'INSERT INTO couples (invite_code, living_together) VALUES ($1, $2) RETURNING id',
      [inviteCode, true]
    );
    
    const coupleId = couple.rows[0].id;
    
    // Adicionar membros
    await pool.query(
      'INSERT INTO couple_members (couple_id, user_id, role) VALUES ($1, $2, $3)',
      [coupleId, user1.rows[0].id, 'admin']
    );
    await pool.query(
      'INSERT INTO couple_members (couple_id, user_id, role) VALUES ($1, $2, $3)',
      [coupleId, user2.rows[0].id, 'member']
    );
    
    res.json({ 
      success: true, 
      message: 'Casal criado com sucesso!',
      coupleId: coupleId,
      inviteCode: inviteCode
    });
  } catch (error) {
    console.error('Erro ao criar casal:', error);
    res.status(500).json({ error: error.message });
  }
});

// Listar todos os usuários
router.get('/admin/users', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, name, email, created_at FROM users ORDER BY id'
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Erro ao listar usuários:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;