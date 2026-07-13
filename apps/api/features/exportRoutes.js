const { buildSimplePdf } = require('../lib/simplePdf');

function csvEscape(value) {
  if (value === null || value === undefined) return '';
  const text = String(value).replace(/"/g, '""');
  return `"${text}"`;
}

function toCsv(headers, rows) {
  const lines = [headers.join(',')];
  for (const row of rows) {
    lines.push(headers.map((key) => csvEscape(row[key])).join(','));
  }
  return lines.join('\n') + '\n';
}

function sendCsv(res, filename, csv) {
  res.writeHead(200, {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="${filename}"`,
    'Access-Control-Allow-Origin': '*'
  });
  res.end(csv);
  return true;
}

function dateOnly(value) {
  if (!value) return '-';
  const match = String(value).match(/^\d{4}-\d{2}-\d{2}/);
  return match ? match[0].split('-').reverse().join('/') : String(value);
}

function dateTime(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(date);
}

function paymentStatusLabel(row) {
  if (row.status === 'paid') return 'Recebido';
  if (row.status === 'cancelled') return 'Cancelado';
  if (row.due_date && new Date(`${String(row.due_date).slice(0, 10)}T23:59:59`) < new Date()) return 'Vencido';
  return 'Pendente';
}

function paymentMethodLabel(value) {
  const labels = { pix: 'Pix', paypal: 'PayPal', card: 'Cartão', cash: 'Dinheiro', transfer: 'Transferência', manual: 'Manual', demo: 'Demonstração', other: 'Outro' };
  return labels[String(value || '').toLowerCase()] || value || 'Não informado';
}

function financialQuery(url, gymId) {
  const params = [gymId];
  const where = ['p.gym_id = $1'];
  const member = String(url.searchParams.get('member') || '').trim();
  if (member) {
    params.push(`%${member}%`);
    where.push(`(m.name ILIKE $${params.length} OR COALESCE(m.email, '') ILIKE $${params.length} OR COALESCE(m.phone, '') ILIKE $${params.length})`);
  }

  const status = String(url.searchParams.get('status') || '').toLowerCase();
  if (status === 'paid' || status === 'cancelled') {
    params.push(status);
    where.push(`p.status = $${params.length}`);
  } else if (status === 'pending') {
    where.push("p.status = 'pending' AND p.due_date >= current_date");
  } else if (status === 'overdue') {
    where.push("p.status IN ('pending', 'overdue') AND p.due_date < current_date");
  }

  const method = String(url.searchParams.get('method') || '').toLowerCase();
  if (method) {
    params.push(method);
    where.push(`LOWER(COALESCE(p.method, '')) = $${params.length}`);
  }

  const minRaw = url.searchParams.get('min_amount_cents');
  const maxRaw = url.searchParams.get('max_amount_cents');
  const minAmount = minRaw === null || minRaw === '' ? Number.NaN : Number(minRaw);
  const maxAmount = maxRaw === null || maxRaw === '' ? Number.NaN : Number(maxRaw);
  if (Number.isFinite(minAmount)) {
    params.push(Math.max(0, Math.round(minAmount)));
    where.push(`p.amount_cents >= $${params.length}`);
  }
  if (Number.isFinite(maxAmount)) {
    params.push(Math.max(0, Math.round(maxAmount)));
    where.push(`p.amount_cents <= $${params.length}`);
  }

  const from = url.searchParams.get('due_from');
  const to = url.searchParams.get('due_to');
  if (/^\d{4}-\d{2}-\d{2}$/.test(from || '')) {
    params.push(from);
    where.push(`p.due_date >= $${params.length}::date`);
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(to || '')) {
    params.push(to);
    where.push(`p.due_date <= $${params.length}::date`);
  }

  return {
    sql: `SELECT m.name AS member_name, m.email AS member_email, m.phone AS member_phone,
                 p.amount_cents, p.status, p.method, p.notes, p.due_date, p.paid_at, p.created_at
          FROM payments p INNER JOIN members m ON m.id = p.member_id
          WHERE ${where.join(' AND ')}
          ORDER BY p.due_date DESC, p.created_at DESC LIMIT 2000`,
    params
  };
}

function financialExportRows(rows) {
  return rows.map((row) => ({
    aluno: row.member_name,
    email: row.member_email || '',
    telefone: row.member_phone || '',
    valor: (Number(row.amount_cents || 0) / 100).toFixed(2).replace('.', ','),
    status: paymentStatusLabel(row),
    forma_pagamento: paymentMethodLabel(row.method),
    vencimento: dateOnly(row.due_date),
    recebido_em: row.paid_at ? dateTime(row.paid_at) : '',
    observacoes: row.notes || ''
  }));
}

async function handleExportRoutes(req, res, user, url, helpers) {
  const { query } = helpers;

  if (req.method === 'GET' && url.pathname === '/api/exports/members.csv') {
    const result = await query(
      'SELECT name, email, phone, status, created_at FROM members WHERE gym_id = $1 ORDER BY created_at DESC',
      [user.gym_id]
    );
    return sendCsv(res, 'alunos.csv', toCsv(['name', 'email', 'phone', 'status', 'created_at'], result.rows));
  }

  if (req.method === 'GET' && url.pathname === '/api/exports/payments.csv') {
    const filters = financialQuery(url, user.gym_id);
    const result = await query(filters.sql, filters.params);
    const rows = financialExportRows(result.rows);
    return sendCsv(res, 'pagamentos.csv', `\uFEFF${toCsv(['aluno', 'email', 'telefone', 'valor', 'status', 'forma_pagamento', 'vencimento', 'recebido_em', 'observacoes'], rows)}`);
  }

  if (req.method === 'GET' && url.pathname === '/api/exports/payments.pdf') {
    const filters = financialQuery(url, user.gym_id);
    const result = await query(filters.sql, filters.params);
    const rows = financialExportRows(result.rows);
    const lines = [`Gerado em: ${dateTime(new Date())}`, `Lançamentos encontrados: ${rows.length}`, '', ...rows.map((row) => `${row.aluno} | R$ ${row.valor} | ${row.status} | ${row.forma_pagamento} | Vencimento: ${row.vencimento}${row.recebido_em ? ` | Recebido: ${row.recebido_em}` : ''}`)];
    const pdf = buildSimplePdf('Relatório financeiro', lines);
    res.writeHead(200, { 'Content-Type': 'application/pdf', 'Content-Disposition': 'attachment; filename="pagamentos.pdf"', 'Content-Length': pdf.length });
    res.end(pdf);
    return true;
  }

  if (req.method === 'GET' && url.pathname === '/api/exports/checkins.csv') {
    const result = await query(
      'SELECT m.name AS member_name, c.checked_at, c.source FROM checkins c INNER JOIN members m ON m.id = c.member_id WHERE c.gym_id = $1 ORDER BY c.checked_at DESC',
      [user.gym_id]
    );
    return sendCsv(res, 'checkins.csv', toCsv(['member_name', 'checked_at', 'source'], result.rows));
  }

  if (req.method === 'GET' && (url.pathname === '/api/exports/assessments.csv' || url.pathname === '/api/exports/assessments.pdf')) {
    const params = [user.gym_id];
    const where = ['a.gym_id = $1'];
    const memberId = url.searchParams.get('member_id');
    const from = url.searchParams.get('from');
    const to = url.searchParams.get('to');
    if (memberId) { params.push(memberId); where.push(`a.member_id = $${params.length}`); }
    if (/^\d{4}-\d{2}-\d{2}$/.test(from || '')) { params.push(from); where.push(`a.assessment_date >= $${params.length}::date`); }
    if (/^\d{4}-\d{2}-\d{2}$/.test(to || '')) { params.push(to); where.push(`a.assessment_date <= $${params.length}::date`); }
    const assessments = await query(
      `SELECT a.assessment_date,m.name AS member_name,a.weight_kg,a.body_fat_percent,a.muscle_mass_kg,a.waist_cm,a.notes
       FROM member_assessments a INNER JOIN members m ON m.id=a.member_id
       WHERE ${where.join(' AND ')} ORDER BY a.assessment_date DESC,a.created_at DESC LIMIT 1000`,
      params
    );
    if (url.pathname.endsWith('.csv')) {
      const rows = assessments.rows.map((row) => ({
        tipo: 'Avaliação', aluno: row.member_name, data: dateOnly(row.assessment_date), peso_kg: row.weight_kg || '', gordura_percentual: row.body_fat_percent || '', massa_muscular_kg: row.muscle_mass_kg || '', cintura_cm: row.waist_cm || '', observacoes: row.notes || ''
      }));
      return sendCsv(res, 'avaliacoes-evolucao.csv', `\uFEFF${toCsv(['tipo', 'aluno', 'data', 'peso_kg', 'gordura_percentual', 'massa_muscular_kg', 'cintura_cm', 'observacoes'], rows)}`);
    }
    const goalParams = [user.gym_id];
    const goalWhere = ['g.gym_id = $1'];
    if (memberId) { goalParams.push(memberId); goalWhere.push(`g.member_id = $${goalParams.length}`); }
    const goals = await query(`SELECT g.goal_type,g.target_value,g.target_date,g.status,m.name AS member_name FROM member_goals g INNER JOIN members m ON m.id=g.member_id WHERE ${goalWhere.join(' AND ')} ORDER BY g.target_date NULLS LAST`, goalParams);
    const lines = ['Histórico de avaliações', ...assessments.rows.map((row) => `${row.member_name} | ${dateOnly(row.assessment_date)} | peso ${row.weight_kg || '-'} kg | gordura ${row.body_fat_percent || '-'}% | cintura ${row.waist_cm || '-'} cm`), '', 'Metas vinculadas', ...goals.rows.map((row) => `${row.member_name} | ${row.goal_type} | alvo ${row.target_value || '-'} | prazo ${dateOnly(row.target_date)} | ${row.status}`)];
    const pdf = buildSimplePdf('Avaliações e metas', lines);
    res.writeHead(200, { 'Content-Type': 'application/pdf', 'Content-Disposition': 'attachment; filename="avaliacoes-e-metas.pdf"', 'Content-Length': pdf.length });
    res.end(pdf);
    return true;
  }

  return false;
}

module.exports = { handleExportRoutes };
