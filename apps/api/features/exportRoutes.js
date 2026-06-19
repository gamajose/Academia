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
    const result = await query(
      'SELECT m.name AS member_name, p.amount_cents, p.status, p.due_date, p.paid_at, p.created_at FROM payments p INNER JOIN members m ON m.id = p.member_id WHERE p.gym_id = $1 ORDER BY p.due_date DESC',
      [user.gym_id]
    );
    return sendCsv(res, 'pagamentos.csv', toCsv(['member_name', 'amount_cents', 'status', 'due_date', 'paid_at', 'created_at'], result.rows));
  }

  if (req.method === 'GET' && url.pathname === '/api/exports/checkins.csv') {
    const result = await query(
      'SELECT m.name AS member_name, c.checked_at, c.source FROM checkins c INNER JOIN members m ON m.id = c.member_id WHERE c.gym_id = $1 ORDER BY c.checked_at DESC',
      [user.gym_id]
    );
    return sendCsv(res, 'checkins.csv', toCsv(['member_name', 'checked_at', 'source'], result.rows));
  }

  return false;
}

module.exports = { handleExportRoutes };
