function receiptNumber() {
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const random = Math.floor(1000 + Math.random() * 9000);
  return `REC-${stamp}-${random}`;
}

async function settleInvoicePayment({
  pool,
  paymentId,
  gymId = null,
  memberId = null,
  method = 'pix',
  notes = 'Pagamento Pix validado automaticamente',
  issuedBy = null
}) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const params = [paymentId];
    let queryText = `
      SELECT p.id, p.gym_id, p.member_id, p.amount_cents, p.status, p.due_date, p.paid_at, p.method,
             m.name AS member_name, m.status AS member_status
      FROM payments p
      INNER JOIN members m ON m.id = p.member_id
      WHERE p.id = $1
    `;

    if (gymId) {
      params.push(gymId);
      queryText += ` AND p.gym_id = $${params.length}`;
    }
    if (memberId) {
      params.push(memberId);
      queryText += ` AND p.member_id = $${params.length}`;
    }
    queryText += ' FOR UPDATE';

    const found = await client.query(queryText, params);
    if (!found.rowCount) {
      const error = new Error('fatura_nao_encontrada');
      error.statusCode = 404;
      throw error;
    }

    const current = found.rows[0];
    if (current.status === 'paid') {
      const receipt = await client.query(
        'SELECT receipt_number, amount_cents, issued_at FROM payment_receipts WHERE payment_id = $1 LIMIT 1',
        [paymentId]
      );
      await client.query('COMMIT');
      return {
        alreadyPaid: true,
        payment: current,
        receipt: receipt.rows[0] || null
      };
    }

    const updated = await client.query(
      `UPDATE payments
       SET status = 'paid',
           paid_at = now(),
           method = $2,
           notes = CASE WHEN notes IS NOT NULL AND notes <> '' THEN notes || ' | ' || $3 ELSE $3 END,
           updated_at = now()
       WHERE id = $1
       RETURNING *`,
      [paymentId, method, notes]
    );

    const payment = updated.rows[0];
    const number = receiptNumber();

    const receipt = await client.query(
      `INSERT INTO payment_receipts (gym_id, payment_id, member_id, receipt_number, amount_cents, issued_by, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
       RETURNING *`,
      [
        payment.gym_id,
        payment.id,
        payment.member_id,
        number,
        payment.amount_cents,
        issuedBy,
        JSON.stringify({
          member_name: current.member_name,
          method,
          validated_auto: true
        })
      ]
    );

    // Registra no caixa se houver sessão aberta
    try {
      const cash = await client.query(
        "SELECT id FROM cash_sessions WHERE gym_id = $1 AND status = 'open' ORDER BY opened_at DESC LIMIT 1",
        [payment.gym_id]
      );
      if (cash.rowCount) {
        await client.query(
          `INSERT INTO cash_movements (gym_id, cash_session_id, payment_id, movement_type, amount_cents, description, created_by)
           VALUES ($1, $2, $3, 'income', $4, $5, $6)`,
          [
            payment.gym_id,
            cash.rows[0].id,
            payment.id,
            payment.amount_cents,
            `Recebimento Pix fatura ${number} - ${current.member_name}`,
            issuedBy
          ]
        );
      }
    } catch (_) {}

    // Desbloqueia aluno caso estivesse inativo
    try {
      if (current.member_status === 'inactive') {
        await client.query(
          "UPDATE members SET status = 'active', updated_at = now() WHERE id = $1 AND gym_id = $2",
          [payment.member_id, payment.gym_id]
        );
      }
    } catch (_) {}

    await client.query('COMMIT');

    return {
      alreadyPaid: false,
      payment,
      receipt: receipt.rows[0]
    };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  receiptNumber,
  settleInvoicePayment
};
