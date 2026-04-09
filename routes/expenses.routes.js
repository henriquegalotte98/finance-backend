import express from "express";
import { pool } from "../db.js";
import { authMiddleware } from "../middleware/auth.js";

const router = express.Router();


// Rota de debug - listar todas as despesas do usuário
router.get("/expenses/debug/all", authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, service, price, payment_method, due_date, recurrence, installment_number FROM expenses WHERE user_id = $1 ORDER BY id DESC LIMIT 20",
      [req.userId]
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET - Listar despesas do mês
router.get("/expenses/month/:year/:month", authMiddleware, async (req, res) => {
  try {
    const { year, month } = req.params;
    const userId = req.userId;

    const result = await pool.query(
      `SELECT * FROM expenses 
       WHERE user_id = $1 
       AND EXTRACT(YEAR FROM due_date) = $2 
       AND EXTRACT(MONTH FROM due_date) = $3
       ORDER BY due_date ASC`,
      [userId, year, month]
    );

    res.json(result.rows);
  } catch (error) {
    console.error("Erro ao carregar despesas:", error);
    res.status(500).json({ error: "Erro ao carregar despesas" });
  }
});

// GET - Listar todas as despesas
router.get("/expenses", authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM expenses WHERE user_id = $1 ORDER BY due_date DESC",
      [req.userId]
    );
    res.json(result.rows);
  } catch (error) {
    console.error("Erro ao listar despesas:", error);
    res.status(500).json({ error: "Erro ao listar despesas" });
  }
});

// GET - Buscar uma despesa específica
router.get("/expenses/:id", authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM expenses WHERE id = $1 AND user_id = $2",
      [req.params.id, req.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Despesa não encontrada" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error("Erro ao buscar despesa:", error);
    res.status(500).json({ error: "Erro ao buscar despesa" });
  }
});

// POST - Criar nova despesa
router.post("/expenses", authMiddleware, async (req, res) => {
  const client = await pool.connect();
  try {
    const { service, price, paymentMethod, dueDate, recurrence, numberTimes } = req.body;
    const userId = req.userId;

    console.log("🔥 INICIOU POST /expenses");
    console.log("📦 BODY:", req.body);
    console.log("💰 parsedPrice:", price);
    console.log("🔢 numTimes:", numberTimes);
    console.log("🔁 recurrence:", recurrence);

    await client.query("BEGIN");

    // Se for recorrência mensal e tiver número de vezes
    if (recurrence === 'monthly' && numberTimes && numberTimes > 1) {
      const totalInstallmentsCount = numberTimes;
      console.log(`TOTAL PARCELAS: ${totalInstallmentsCount}`);
      console.log("➡️ Entrou no loop de parcelas");

      const startDate = new Date(dueDate);
      const installmentValue = price / numberTimes;

      for (let i = 0; i < totalInstallmentsCount; i++) {
        const currentDate = new Date(startDate);
        currentDate.setMonth(startDate.getMonth() + i);

        console.log(`🧾 Criando parcela: ${i + 1}`);
        console.log(`PARCELA: ${i + 1} DATA: ${currentDate}`);

        await client.query(
          `INSERT INTO expenses 
           (user_id, service, price, payment_method, due_date, recurrence, installment_number, total_installments)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            userId,
            service,
            installmentValue,
            paymentMethod,
            currentDate,
            'none',
            i + 1,
            totalInstallmentsCount
          ]
        );
      }

      await client.query("COMMIT");

      const result = await client.query(
        "SELECT * FROM expenses WHERE user_id = $1 ORDER BY due_date DESC LIMIT $2",
        [userId, totalInstallmentsCount]
      );

      console.log("RESULT:", result.rows);
      res.json(result.rows);

    } else {
      // Despesa única
      const result = await client.query(
        `INSERT INTO expenses 
         (user_id, service, price, payment_method, due_date, recurrence)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [userId, service, price, paymentMethod, dueDate, recurrence || 'none']
      );

      await client.query("COMMIT");
      res.json(result.rows[0]);
    }

  } catch (error) {
    await client.query("ROLLBACK");
    console.error("❌ Erro ao criar despesa:", error);
    res.status(500).json({ error: "Erro ao criar despesa: " + error.message });
  } finally {
    client.release();
  }
});

// PUT - Atualizar despesa
router.put("/expenses/:id", authMiddleware, async (req, res) => {
  try {
    const { service, price, paymentMethod, dueDate, recurrence } = req.body;
    const expenseId = req.params.id;
    const userId = req.userId;

    console.log(`📝 Atualizando despesa ID: ${expenseId}`);
    console.log(`Dados recebidos:`, { service, price, paymentMethod, dueDate, recurrence });

    // Verificar se a despesa existe
    const checkResult = await pool.query(
      "SELECT id FROM expenses WHERE id = $1 AND user_id = $2",
      [expenseId, userId]
    );

    if (checkResult.rows.length === 0) {
      console.log(`❌ Despesa ${expenseId} não encontrada para o usuário ${userId}`);
      return res.status(404).json({ error: "Despesa não encontrada" });
    }

    // Atualizar a despesa
    const result = await pool.query(
      `UPDATE expenses 
       SET service = $1, 
           price = $2, 
           payment_method = $3, 
           due_date = $4, 
           recurrence = $5
       WHERE id = $6 AND user_id = $7
       RETURNING *`,
      [service, price, paymentMethod, dueDate, recurrence || 'none', expenseId, userId]
    );

    console.log(`✅ Despesa ${expenseId} atualizada com sucesso`);
    res.json(result.rows[0]);

  } catch (error) {
    console.error("❌ Erro ao atualizar despesa:", error);
    res.status(500).json({ error: "Erro ao atualizar despesa: " + error.message });
  }
});

// DELETE - Remover despesa
router.delete("/expenses/:id", authMiddleware, async (req, res) => {
  try {
    const expenseId = req.params.id;
    const userId = req.userId;

    console.log(`🗑️ Deletando despesa ID: ${expenseId} - Usuário: ${userId}`);

    // Verificar se a despesa existe
    const checkResult = await pool.query(
      "SELECT id FROM expenses WHERE id = $1 AND user_id = $2",
      [expenseId, userId]
    );

    if (checkResult.rows.length === 0) {
      console.log(`❌ Despesa ${expenseId} não encontrada para o usuário ${userId}`);
      return res.status(404).json({ error: "Despesa não encontrada" });
    }

    // Deletar a despesa
    await pool.query("DELETE FROM expenses WHERE id = $1", [expenseId]);

    console.log(`✅ Despesa ${expenseId} deletada com sucesso`);
    res.json({ success: true, message: "Despesa deletada com sucesso" });

  } catch (error) {
    console.error("❌ Erro ao deletar despesa:", error);
    res.status(500).json({ error: "Erro ao deletar despesa: " + error.message });
  }

  // ================= TRANSPORTE DA VIAGEM =================
  // Salvar dados de transporte
  router.post("/travel/:planId/transport", authMiddleware, async (req, res) => {
    try {
      const { planId } = req.params;
      const transportData = req.body;

      await pool.query(
        `INSERT INTO travel_transport (travel_plan_id, user_id, transport_data)
       VALUES ($1, $2, $3)
       ON CONFLICT (travel_plan_id) DO UPDATE SET transport_data = EXCLUDED.transport_data`,
        [planId, req.userId, JSON.stringify(transportData)]
      );

      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Buscar dados de transporte
  router.get("/travel/:planId/transport", authMiddleware, async (req, res) => {
    try {
      const { planId } = req.params;
      const result = await pool.query(
        "SELECT transport_data FROM travel_transport WHERE travel_plan_id = $1",
        [planId]
      );
      res.json(result.rows[0]?.transport_data || {});
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // ================= SERVIÇOS DA VIAGEM =================
  // Salvar serviço
  router.post("/travel/:planId/services", authMiddleware, async (req, res) => {
    try {
      const { planId } = req.params;
      const { title, description, value, bookingDate, usageDate, category, status } = req.body;

      const result = await pool.query(
        `INSERT INTO travel_services 
       (travel_plan_id, user_id, title, description, value, booking_date, usage_date, category, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
        [planId, req.userId, title, description, value, bookingDate, usageDate, category, status]
      );

      res.json(result.rows[0]);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Listar serviços da viagem
  router.get("/travel/:planId/services", authMiddleware, async (req, res) => {
    try {
      const { planId } = req.params;
      const result = await pool.query(
        "SELECT * FROM travel_services WHERE travel_plan_id = $1 ORDER BY created_at DESC",
        [planId]
      );
      res.json(result.rows);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Atualizar serviço
  router.put("/travel/services/:serviceId", authMiddleware, async (req, res) => {
    try {
      const { serviceId } = req.params;
      const { title, description, value, bookingDate, usageDate, category, status } = req.body;

      const result = await pool.query(
        `UPDATE travel_services 
       SET title = $1, description = $2, value = $3, booking_date = $4, usage_date = $5, 
           category = $6, status = $7, updated_at = NOW()
       WHERE id = $8 AND user_id = $9
       RETURNING *`,
        [title, description, value, bookingDate, usageDate, category, status, serviceId, req.userId]
      );

      res.json(result.rows[0]);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Deletar serviço
  router.delete("/travel/services/:serviceId", authMiddleware, async (req, res) => {
    try {
      await pool.query("DELETE FROM travel_services WHERE id = $1 AND user_id = $2",
        [req.params.serviceId, req.userId]);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

});
//teste
export default router;