// backend/src/routes/admin.routes.js
import express from 'express';
import bcrypt from 'bcrypt';
import { pool } from '../db.js';
import { authMiddleware } from '../middleware/auth.js';

const router = express.Router();

// Middleware para verificar se é admin
const isAdmin = async (req, res, next) => {
  try {
    const result = await pool.query(
      'SELECT email FROM users WHERE id = $1',
      [req.userId]
    );
    
    const adminEmails = ['admin@duofinance.com', 'joao@teste.com', 'admin@teste.com'];
    
    if (adminEmails.includes(result.rows[0]?.email)) {
      next();
    } else {
      res.status(403).json({ error: 'Acesso negado. Apenas administradores.' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ==================== SETUP INICIAL ====================
// Criar usuário admin (primeira execução)
router.post('/admin/setup', async (req, res) => {
  try {
    const adminEmail = 'admin@duofinance.com';
    const adminPassword = 'admin123';
    
    // Verificar se admin já existe
    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [adminEmail]);
    
    if (existing.rows.length === 0) {
      const hash = await bcrypt.hash(adminPassword, 10);
      await pool.query(
        'INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3)',
        ['Administrador', adminEmail, hash]
      );
      res.json({ 
        success: true, 
        message: 'Admin criado com sucesso!', 
        email: adminEmail, 
        password: adminPassword 
      });
    } else {
      res.json({ success: true, message: 'Admin já existe!', email: adminEmail });
    }
  } catch (error) {
    console.error('Erro ao criar admin:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==================== LIMPEZA DE DADOS ====================
// Limpar todos os usuários (exceto admins)
router.post('/admin/clear-users', authMiddleware, isAdmin, async (req, res) => {
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
    await pool.query(`DELETE FROM users WHERE email NOT IN ('admin@duofinance.com', 'joao@teste.com')`);
    
    res.json({ success: true, message: 'Todos os usuários não-admin foram removidos!' });
  } catch (error) {
    console.error('Erro ao limpar usuários:', error);
    res.status(500).json({ error: error.message });
  }
});

// Limpar apenas dados de teste (mantém usuários)
router.post('/admin/clear-test-data', authMiddleware, isAdmin, async (req, res) => {
  try {
    // Deletar apenas dados gerados por usuários de teste
    await pool.query(`
      DELETE FROM expense_attachments 
      WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@teste.com')
    `);
    await pool.query(`
      DELETE FROM savings_transactions 
      WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@teste.com')
    `);
    await pool.query(`
      DELETE FROM savings_wallets 
      WHERE owner_user_id IN (SELECT id FROM users WHERE email LIKE '%@teste.com')
    `);
    await pool.query(`
      DELETE FROM expenses 
      WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@teste.com')
    `);
    
    res.json({ success: true, message: 'Dados de teste removidos com sucesso!' });
  } catch (error) {
    console.error('Erro ao limpar dados de teste:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==================== CRIAÇÃO DE USUÁRIOS ====================
// Criar usuários de teste
router.post('/admin/create-test-users', authMiddleware, isAdmin, async (req, res) => {
  try {
    const testUsers = [
      { name: 'João Silva', email: 'joao@teste.com', password: '123456' },
      { name: 'Maria Santos', email: 'maria@teste.com', password: '123456' },
      { name: 'Carlos Oliveira', email: 'carlos@teste.com', password: '123456' },
      { name: 'Ana Paula', email: 'ana@teste.com', password: '123456' },
      { name: 'Pedro Costa', email: 'pedro@teste.com', password: '123456' },
      { name: 'Fernanda Lima', email: 'fernanda@teste.com', password: '123456' }
    ];

    const createdUsers = [];

    for (const user of testUsers) {
      const existing = await pool.query('SELECT id, name, email FROM users WHERE email = $1', [user.email]);
      
      if (existing.rows.length === 0) {
        const hash = await bcrypt.hash(user.password, 10);
        const result = await pool.query(
          'INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3) RETURNING id, name, email, created_at',
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

// Criar usuário individual pelo admin
router.post('/admin/users', authMiddleware, isAdmin, async (req, res) => {
  try {
    const { name, email, password, isAdmin: makeAdmin } = req.body;
    
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Nome, email e senha são obrigatórios' });
    }
    
    // Verificar se email já existe
    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'Email já cadastrado' });
    }
    
    const hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3) RETURNING id, name, email, created_at',
      [name, email, hash]
    );
    
    res.json({ success: true, user: result.rows[0] });
  } catch (error) {
    console.error('Erro ao criar usuário:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==================== LISTAGEM ====================
// Listar todos os usuários com estatísticas
router.get('/admin/users', authMiddleware, isAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        u.id, 
        u.name, 
        u.email, 
        u.created_at,
        COUNT(DISTINCT e.id) as total_expenses,
        COALESCE(SUM(e.price), 0) as total_amount,
        COUNT(DISTINCT sw.id) as total_wallets,
        COALESCE(SUM(sw.balance), 0) as total_savings,
        CASE WHEN cm.couple_id IS NOT NULL THEN true ELSE false END as has_couple,
        CASE WHEN cm.role = 'admin' THEN true ELSE false END as is_couple_admin
      FROM users u
      LEFT JOIN expenses e ON e.user_id = u.id
      LEFT JOIN savings_wallets sw ON sw.owner_user_id = u.id
      LEFT JOIN couple_members cm ON cm.user_id = u.id
      GROUP BY u.id, cm.couple_id, cm.role
      ORDER BY u.id
    `);
    
    res.json(result.rows);
  } catch (error) {
    console.error('Erro ao listar usuários:', error);
    res.status(500).json({ error: error.message });
  }
});

// Buscar usuário por ID
router.get('/admin/users/:id', authMiddleware, isAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(`
      SELECT u.id, u.name, u.email, u.created_at,
             (SELECT COUNT(*) FROM expenses WHERE user_id = u.id) as total_expenses,
             (SELECT COALESCE(SUM(price), 0) FROM expenses WHERE user_id = u.id) as total_amount
      FROM users u
      WHERE u.id = $1
    `, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Erro ao buscar usuário:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==================== EDIÇÃO E REMOÇÃO ====================
// Atualizar usuário
router.put('/admin/users/:id', authMiddleware, isAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, password } = req.body;
    
    // Verificar se usuário existe
    const userCheck = await pool.query('SELECT email FROM users WHERE id = $1', [id]);
    if (userCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }
    
    // Não permitir alterar admin principal
    if (userCheck.rows[0].email === 'admin@duofinance.com') {
      return res.status(403).json({ error: 'Não é possível modificar o usuário admin principal' });
    }
    
    let query = 'UPDATE users SET ';
    const params = [];
    let paramCount = 1;
    
    if (name) {
      query += `name = $${paramCount}, `;
      params.push(name);
      paramCount++;
    }
    
    if (email) {
      query += `email = $${paramCount}, `;
      params.push(email);
      paramCount++;
    }
    
    if (password) {
      const hash = await bcrypt.hash(password, 10);
      query += `password_hash = $${paramCount}, `;
      params.push(hash);
      paramCount++;
    }
    
    query = query.slice(0, -2);
    query += ` WHERE id = $${paramCount} RETURNING id, name, email`;
    params.push(id);
    
    const result = await pool.query(query, params);
    res.json({ success: true, user: result.rows[0] });
  } catch (error) {
    console.error('Erro ao atualizar usuário:', error);
    res.status(500).json({ error: error.message });
  }
});

// Deletar usuário
router.delete('/admin/users/:id', authMiddleware, isAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Verificar se usuário existe
    const userCheck = await pool.query('SELECT email FROM users WHERE id = $1', [id]);
    if (userCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }
    
    // Não permitir deletar admin principal
    if (userCheck.rows[0].email === 'admin@duofinance.com') {
      return res.status(403).json({ error: 'Não é possível deletar o usuário admin principal' });
    }
    
    // Deletar dependências
    await pool.query('DELETE FROM expense_attachments WHERE user_id = $1', [id]);
    await pool.query('DELETE FROM savings_transactions WHERE user_id = $1', [id]);
    await pool.query('DELETE FROM savings_wallets WHERE owner_user_id = $1', [id]);
    await pool.query('DELETE FROM couple_todos WHERE user_id = $1', [id]);
    await pool.query('DELETE FROM couple_members WHERE user_id = $1', [id]);
    await pool.query('DELETE FROM expenses WHERE user_id = $1', [id]);
    await pool.query('DELETE FROM users WHERE id = $1', [id]);
    
    res.json({ success: true, message: 'Usuário deletado com sucesso' });
  } catch (error) {
    console.error('Erro ao deletar usuário:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==================== ESTATÍSTICAS ====================
// Estatísticas do sistema
router.get('/admin/stats', authMiddleware, isAdmin, async (req, res) => {
  try {
    const totalUsers = await pool.query('SELECT COUNT(*) FROM users');
    const totalExpenses = await pool.query('SELECT COUNT(*) FROM expenses');
    const totalCouples = await pool.query('SELECT COUNT(*) FROM couples');
    const totalSavings = await pool.query('SELECT COALESCE(SUM(balance), 0) FROM savings_wallets');
    const totalTravels = await pool.query('SELECT COUNT(*) FROM travel_plans');
    
    // Despesas por mês (últimos 12 meses)
    const expensesByMonth = await pool.query(`
      SELECT 
        EXTRACT(MONTH FROM due_date) as month,
        EXTRACT(YEAR FROM due_date) as year,
        COUNT(*) as count,
        COALESCE(SUM(price), 0) as total
      FROM expenses
      WHERE due_date >= NOW() - INTERVAL '12 months'
      GROUP BY EXTRACT(YEAR FROM due_date), EXTRACT(MONTH FROM due_date)
      ORDER BY year DESC, month DESC
    `);
    
    res.json({
      totalUsers: parseInt(totalUsers.rows[0].count),
      totalExpenses: parseInt(totalExpenses.rows[0].count),
      totalCouples: parseInt(totalCouples.rows[0].count),
      totalSavings: parseFloat(totalSavings.rows[0].coalesce),
      totalTravels: parseInt(totalTravels.rows[0].count),
      expensesByMonth: expensesByMonth.rows
    });
  } catch (error) {
    console.error('Erro ao buscar estatísticas:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==================== CASAL ====================
// Criar casal de exemplo
router.post('/admin/create-test-couple', authMiddleware, isAdmin, async (req, res) => {
  try {
    const { user1Email, user2Email } = req.body;
    
    // Buscar os usuários
    const user1 = await pool.query('SELECT id, name FROM users WHERE email = $1', [user1Email]);
    const user2 = await pool.query('SELECT id, name FROM users WHERE email = $1', [user2Email]);
    
    if (user1.rows.length === 0 || user2.rows.length === 0) {
      return res.status(404).json({ error: 'Usuários não encontrados' });
    }
    
    // Verificar se já estão em um casal
    const checkCouple1 = await pool.query('SELECT couple_id FROM couple_members WHERE user_id = $1', [user1.rows[0].id]);
    if (checkCouple1.rows.length > 0) {
      return res.status(400).json({ error: `${user1.rows[0].name} já está em um casal` });
    }
    
    const checkCouple2 = await pool.query('SELECT couple_id FROM couple_members WHERE user_id = $1', [user2.rows[0].id]);
    if (checkCouple2.rows.length > 0) {
      return res.status(400).json({ error: `${user2.rows[0].name} já está em um casal` });
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
      message: `Casal criado com sucesso entre ${user1.rows[0].name} e ${user2.rows[0].name}!`,
      coupleId: coupleId,
      inviteCode: inviteCode
    });
  } catch (error) {
    console.error('Erro ao criar casal:', error);
    res.status(500).json({ error: error.message });
  }
});

// Listar todos os casais
router.get('/admin/couples', authMiddleware, isAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        c.id,
        c.invite_code,
        c.living_together,
        c.created_at,
        json_agg(json_build_object('id', u.id, 'name', u.name, 'email', u.email, 'role', cm.role)) as members
      FROM couples c
      JOIN couple_members cm ON cm.couple_id = c.id
      JOIN users u ON u.id = cm.user_id
      GROUP BY c.id
      ORDER BY c.created_at DESC
    `);
    
    res.json(result.rows);
  } catch (error) {
    console.error('Erro ao listar casais:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;