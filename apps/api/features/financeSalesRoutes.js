const { pool } = require('../lib/db');
const { recordAudit } = require('../lib/audit');

function isManager(user) {
  return user && ['owner', 'admin'].includes(user.role);
}

function canOperate(user) {
  return user && ['owner', 'admin', 'staff', 'operator'].includes(user.role);
}

function boundedInteger(value, fallback = 0, min = 0, max = 100000000) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) return fallback;
  return parsed;
}

function addMonths(dateText, months) {
  const date = new Date(`${dateText}T12:00:00.000Z`);
  date.setUTCMonth(date.getUTCMonth() + months);
  return date.toISOString().slice(0, 10);
}

function receiptNumber() {
  const stamp = new Date().toISOString().replace(/\D/g, '').slice(0, 14);
  const random = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `REC-${stamp}-${random}`;
}

async function financeOverview(res, user, helpers) {
  if (!isManager(user)) return helpers.send(res, 403, { error: 'sem_permissao' });
  const result = await helpers.query(
    `SELECT
       (SELECT COALESCE(sum(amount_cents),0) FROM payments WHERE gym_id=$1 AND status='paid' AND paid_at>=current_date)::bigint AS received_today_cents,
       (SELECT COALESCE(sum(amount_cents),0) FROM payments WHERE gym_id=$1 AND status='paid' AND paid_at>=date_trunc('month',now()))::bigint AS received_month_cents,
       (SELECT COALESCE(sum(amount_cents),0) FROM payments WHERE gym_id=$1 AND status IN ('pending','overdue'))::bigint AS receivable_cents,
       (SELECT count(*) FROM payments WHERE gym_id=$1 AND status IN ('pending','overdue') AND due_date<current_date)::integer AS overdue_count,
       (SELECT count(DISTINCT member_id) FROM payments WHERE gym_id=$1 AND status IN ('pending','overdue') AND due_date<current_date)::integer AS overdue_members,
       (SELECT count(*) FROM payment_agreements WHERE gym_id=$1 AND status='active')::integer AS active_agreements,
       (SELECT count(*) FROM public_sales_leads WHERE gym_id=$1 AND status='new')::integer AS new_leads,
       (SELECT id FROM cash_sessions WHERE gym_id=$1 AND status='open' ORDER BY opened_at DESC LIMIT 1) AS open_cash_session_id`,
    [user.gym_id]
  );
  return helpers.send(res, 200, result.rows[0]);
}

async function receivables(res, user, url, helpers) {
  if (!isManager(user)) return helpers.send(res, 403, { error: 'sem_permissao' });
  const status = url.searchParams.get('status') || 'open';
  const memberId = url.searchParams.get('member_id');
  const result = await helpers.query(
    `SELECT p.id,p.member_id,m.name AS member_name,m.phone,m.email,
            p.original_amount_cents,p.amount_cents,p.discount_cents,p.fee_cents,
            p.status,p.due_date,p.paid_at,p.method,p.notes,p.created_at,
            GREATEST(0,current_date-p.due_date)::integer AS overdue_days
     FROM payments p INNER JOIN members m ON m.id=p.member_id
     WHERE p.gym_id=$1
       AND ($2::uuid IS NULL OR p.member_id=$2::uuid)
       AND ($3='all' OR ($3='open' AND p.status IN ('pending','overdue')) OR p.status=$3)
     ORDER BY CASE WHEN p.status IN ('pending','overdue') THEN 0 ELSE 1 END,p.due_date DESC
     LIMIT 500`,
    [user.gym_id, memberId || null, status]
  );
  return helpers.send(res, 200, { data: result.rows });
}

async function settlePayment(req, res, user, helpers) {
  if (!isManager(user)) return helpers.send(res, 403, { error: 'sem_permissao' });
  const input = await helpers.body(req);
  if (!input.payment_id) return helpers.send(res, 400, { error: 'payment_id_obrigatorio' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const payment = await client.query(
      `SELECT p.*,m.name AS member_name FROM payments p INNER JOIN members m ON m.id=p.member_id
       WHERE p.id=$1 AND p.gym_id=$2 FOR UPDATE`,
      [input.payment_id, user.gym_id]
    );
    if (!payment.rowCount) {
      await client.query('ROLLBACK');
      return helpers.send(res, 404, { error: 'pagamento_nao_encontrado' });
    }
    if (payment.rows[0].status === 'paid') {
      await client.query('ROLLBACK');
      return helpers.send(res, 409, { error: 'pagamento_ja_baixado' });
    }
    const original = boundedInteger(payment.rows[0].original_amount_cents ?? payment.rows[0].amount_cents);
    const discount = boundedInteger(input.discount_cents);
    const fee = boundedInteger(input.fee_cents);
    const finalAmount = boundedInteger(input.amount_cents, Math.max(0, original - discount + fee));
    const updated = await client.query(
      `UPDATE payments SET original_amount_cents=$3,amount_cents=$4,discount_cents=$5,
       fee_cents=$6,status='paid',paid_at=COALESCE($7::timestamptz,now()),method=$8,
       notes=$9,updated_at=now() WHERE id=$1 AND gym_id=$2 RETURNING *`,
      [input.payment_id,user.gym_id,original,finalAmount,discount,fee,input.paid_at||null,input.method||'other',input.notes||null]
    );
    const number = receiptNumber();
    const receipt = await client.query(
      `INSERT INTO payment_receipts(gym_id,payment_id,member_id,receipt_number,amount_cents,issued_by,metadata)
       VALUES($1,$2,$3,$4,$5,$6,$7::jsonb) RETURNING *`,
      [user.gym_id,input.payment_id,payment.rows[0].member_id,number,finalAmount,user.sub,JSON.stringify({member_name:payment.rows[0].member_name,method:input.method||'other'})]
    );
    const cash = await client.query("SELECT id FROM cash_sessions WHERE gym_id=$1 AND status='open' ORDER BY opened_at DESC LIMIT 1",[user.gym_id]);
    if (cash.rowCount) {
      await client.query(
        `INSERT INTO cash_movements(gym_id,cash_session_id,payment_id,movement_type,amount_cents,description,created_by)
         VALUES($1,$2,$3,'income',$4,$5,$6)`,
        [user.gym_id,cash.rows[0].id,input.payment_id,finalAmount,`Recebimento ${number}`,user.sub]
      );
    }
    await client.query('COMMIT');
    await recordAudit(user,'settle','payment',input.payment_id,{receipt_number:number,amount_cents:finalAmount});
    return helpers.send(res,200,{payment:updated.rows[0],receipt:receipt.rows[0]});
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function createAgreement(req, res, user, helpers) {
  if (!isManager(user)) return helpers.send(res, 403, { error: 'sem_permissao' });
  const input = await helpers.body(req);
  if (!input.member_id || !input.first_due_date) return helpers.send(res,400,{error:'dados_invalidos'});
  const installments=boundedInteger(input.installment_count,1,1,60);
  const negotiated=boundedInteger(input.negotiated_total_cents);
  if(negotiated<=0) return helpers.send(res,400,{error:'valor_invalido'});
  const client=await pool.connect();
  try{
    await client.query('BEGIN');
    const member=await client.query('SELECT id FROM members WHERE id=$1 AND gym_id=$2',[input.member_id,user.gym_id]);
    if(!member.rowCount){await client.query('ROLLBACK');return helpers.send(res,404,{error:'aluno_nao_encontrado'});}
    const open=await client.query(
      `SELECT id,amount_cents FROM payments WHERE gym_id=$1 AND member_id=$2 AND status IN ('pending','overdue') FOR UPDATE`,
      [user.gym_id,input.member_id]
    );
    const original=open.rows.reduce((total,row)=>total+Number(row.amount_cents||0),0);
    const agreement=await client.query(
      `INSERT INTO payment_agreements(gym_id,member_id,original_total_cents,negotiated_total_cents,installment_count,first_due_date,notes,created_by)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [user.gym_id,input.member_id,original,negotiated,installments,input.first_due_date,input.notes||null,user.sub]
    );
    if(open.rowCount) await client.query("UPDATE payments SET status='cancelled',notes=concat_ws(' | ',notes,$3),updated_at=now() WHERE gym_id=$1 AND member_id=$2 AND status IN ('pending','overdue')",[user.gym_id,input.member_id,`Renegociado no acordo ${agreement.rows[0].id}`]);
    const base=Math.floor(negotiated/installments);
    let remainder=negotiated-(base*installments);
    const created=[];
    for(let index=0;index<installments;index+=1){
      const amount=base+(remainder>0?1:0);
      if(remainder>0) remainder-=1;
      const dueDate=addMonths(input.first_due_date,index);
      const row=await client.query(
        `INSERT INTO payments(gym_id,member_id,amount_cents,original_amount_cents,status,due_date,notes)
         VALUES($1,$2,$3,$3,'pending',$4,$5) RETURNING *`,
        [user.gym_id,input.member_id,amount,dueDate,`Parcela ${index+1}/${installments} do acordo ${agreement.rows[0].id}`]
      );
      created.push(row.rows[0]);
    }
    await client.query('COMMIT');
    await recordAudit(user,'create','payment_agreement',agreement.rows[0].id,{member_id:input.member_id,installments});
    return helpers.send(res,201,{agreement:agreement.rows[0],payments:created});
  }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}

async function receipts(res,user,url,helpers){
  if(!user) return false;
  const memberId=user.role==='student'?user.member_id:url.searchParams.get('member_id');
  if(!memberId) return helpers.send(res,400,{error:'member_id_obrigatorio'});
  if(user.role!=='student'&&!isManager(user)) return helpers.send(res,403,{error:'sem_permissao'});
  const result=await helpers.query(
    `SELECT r.id,r.receipt_number,r.amount_cents,r.issued_at,r.metadata,p.method,p.paid_at,m.name AS member_name
     FROM payment_receipts r INNER JOIN payments p ON p.id=r.payment_id INNER JOIN members m ON m.id=r.member_id
     WHERE r.gym_id=$1 AND r.member_id=$2 ORDER BY r.issued_at DESC LIMIT 100`,
    [user.gym_id,memberId]
  );
  return helpers.send(res,200,{data:result.rows});
}

async function cashStatus(res,user,helpers){
  if(!isManager(user)) return helpers.send(res,403,{error:'sem_permissao'});
  const result=await helpers.query(
    `SELECT cs.*,
      COALESCE((SELECT sum(CASE WHEN movement_type IN ('income','deposit') THEN amount_cents ELSE -amount_cents END) FROM cash_movements WHERE cash_session_id=cs.id),0)::bigint AS movements_cents
     FROM cash_sessions cs WHERE gym_id=$1 ORDER BY opened_at DESC LIMIT 20`,[user.gym_id]);
  return helpers.send(res,200,{data:result.rows});
}

async function openCash(req,res,user,helpers){
  if(!isManager(user)) return helpers.send(res,403,{error:'sem_permissao'});
  const input=await helpers.body(req);
  const existing=await helpers.query("SELECT id FROM cash_sessions WHERE gym_id=$1 AND status='open' LIMIT 1",[user.gym_id]);
  if(existing.rowCount) return helpers.send(res,409,{error:'caixa_ja_aberto'});
  const result=await helpers.query(
    `INSERT INTO cash_sessions(gym_id,opened_by,opening_balance_cents,notes)
     VALUES($1,$2,$3,$4) RETURNING *`,
    [user.gym_id,user.sub,boundedInteger(input.opening_balance_cents),input.notes||null]
  );
  return helpers.send(res,201,result.rows[0]);
}

async function cashMovement(req,res,user,helpers){
  if(!isManager(user)) return helpers.send(res,403,{error:'sem_permissao'});
  const input=await helpers.body(req);
  if(!['expense','withdrawal','deposit'].includes(input.movement_type)) return helpers.send(res,400,{error:'tipo_invalido'});
  const cash=await helpers.query("SELECT id FROM cash_sessions WHERE gym_id=$1 AND status='open' ORDER BY opened_at DESC LIMIT 1",[user.gym_id]);
  if(!cash.rowCount) return helpers.send(res,409,{error:'caixa_fechado'});
  const result=await helpers.query(
    `INSERT INTO cash_movements(gym_id,cash_session_id,movement_type,amount_cents,description,created_by)
     VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,
    [user.gym_id,cash.rows[0].id,input.movement_type,boundedInteger(input.amount_cents),input.description||null,user.sub]
  );
  return helpers.send(res,201,result.rows[0]);
}

async function closeCash(req,res,user,helpers){
  if(!isManager(user)) return helpers.send(res,403,{error:'sem_permissao'});
  const input=await helpers.body(req);
  const cash=await helpers.query(
    `SELECT cs.*,
      COALESCE((SELECT sum(CASE WHEN movement_type IN ('income','deposit') THEN amount_cents ELSE -amount_cents END) FROM cash_movements WHERE cash_session_id=cs.id),0)::bigint AS movements_cents
     FROM cash_sessions cs WHERE cs.gym_id=$1 AND cs.status='open' ORDER BY opened_at DESC LIMIT 1`,[user.gym_id]);
  if(!cash.rowCount) return helpers.send(res,409,{error:'caixa_fechado'});
  const expected=Number(cash.rows[0].opening_balance_cents)+Number(cash.rows[0].movements_cents);
  const result=await helpers.query(
    `UPDATE cash_sessions SET status='closed',closed_by=$3,closed_at=now(),closing_balance_cents=$4,
     expected_balance_cents=$5,notes=concat_ws(' | ',notes,$6)
     WHERE id=$1 AND gym_id=$2 RETURNING *`,
    [cash.rows[0].id,user.gym_id,user.sub,boundedInteger(input.closing_balance_cents),expected,input.notes||null]
  );
  return helpers.send(res,200,{session:result.rows[0],difference_cents:Number(result.rows[0].closing_balance_cents)-expected});
}

async function publicCatalog(res,url,helpers){
  const slug=url.searchParams.get('gym_slug');
  const gym=await helpers.query("SELECT id,name,slug FROM gyms WHERE ($1::text IS NULL OR slug=$1) AND status='active' ORDER BY created_at LIMIT 1",[slug||null]);
  if(!gym.rowCount) return helpers.send(res,404,{error:'academia_nao_encontrada'});
  const [plans,classes]=await Promise.all([
    helpers.query(
      `SELECT id,name,description,benefits,rules,price_cents,duration_days,enrollment_fee_cents,billing_period,
       access_rules,services_included,auto_renew,cancellation_fee_cents,trial_days,is_featured
       FROM plans WHERE gym_id=$1 AND is_active=true AND price_cents>0
       ORDER BY is_featured DESC,price_cents,name`,[gym.rows[0].id]),
    helpers.query('SELECT id,name,description,room,capacity,duration_minutes,level FROM gym_classes WHERE gym_id=$1 AND is_active=true ORDER BY name',[gym.rows[0].id])
  ]);
  return helpers.send(res,200,{gym:gym.rows[0],plans:plans.rows,classes:classes.rows});
}

async function createLead(req,res,helpers){
  const input=await helpers.body(req);
  if(!input.name||(!input.email&&!input.phone)) return helpers.send(res,400,{error:'dados_invalidos'});
  const gym=await helpers.query("SELECT id FROM gyms WHERE ($1::text IS NULL OR slug=$1) AND status='active' ORDER BY created_at LIMIT 1",[input.gym_slug||null]);
  if(!gym.rowCount) return helpers.send(res,404,{error:'academia_nao_encontrada'});
  if(input.plan_id){const plan=await helpers.query('SELECT id FROM plans WHERE id=$1 AND gym_id=$2 AND is_active=true',[input.plan_id,gym.rows[0].id]);if(!plan.rowCount)return helpers.send(res,404,{error:'plano_nao_encontrado'});}
  const result=await helpers.query(
    `INSERT INTO public_sales_leads(gym_id,plan_id,name,email,phone,objective,preferred_contact,source,notes)
     VALUES($1,$2,$3,$4,$5,$6,$7,'website',$8) RETURNING id,status,created_at`,
    [gym.rows[0].id,input.plan_id||null,String(input.name).trim(),input.email||null,input.phone||null,input.objective||null,input.preferred_contact||null,input.notes||null]
  );
  return helpers.send(res,201,result.rows[0]);
}

async function salesLeads(res,user,url,helpers){
  if(!isManager(user)) return helpers.send(res,403,{error:'sem_permissao'});
  const status=url.searchParams.get('status')||'all';
  const result=await helpers.query(
    `SELECT l.*,p.name AS plan_name FROM public_sales_leads l LEFT JOIN plans p ON p.id=l.plan_id
     WHERE l.gym_id=$1 AND ($2='all' OR l.status=$2) ORDER BY l.created_at DESC LIMIT 500`,[user.gym_id,status]);
  return helpers.send(res,200,{data:result.rows});
}

async function updateLead(req,res,user,helpers){
  if(!isManager(user)) return helpers.send(res,403,{error:'sem_permissao'});
  const input=await helpers.body(req);
  if(!input.lead_id||!['new','contacted','converted','lost'].includes(input.status))return helpers.send(res,400,{error:'dados_invalidos'});
  const result=await helpers.query(
    `UPDATE public_sales_leads SET status=$3,notes=COALESCE($4,notes),updated_at=now()
     WHERE id=$1 AND gym_id=$2 RETURNING *`,[input.lead_id,user.gym_id,input.status,input.notes||null]);
  if(!result.rowCount)return helpers.send(res,404,{error:'lead_nao_encontrado'});
  return helpers.send(res,200,result.rows[0]);
}

async function operationsLive(res,user,helpers){
  if(!canOperate(user)) return helpers.send(res,403,{error:'sem_permissao'});
  const [decisions,devices]=await Promise.all([
    helpers.query(
      `SELECT d.id,d.allowed,d.status,d.reason,d.message,d.decided_at,d.source,m.id AS member_id,m.name AS member_name,m.photo_url,ad.id AS device_id,ad.name AS device_name
       FROM access_decisions d INNER JOIN members m ON m.id=d.member_id LEFT JOIN access_devices ad ON ad.id=d.device_id
       WHERE d.gym_id=$1 ORDER BY d.decided_at DESC LIMIT 100`,[user.gym_id]),
    helpers.query(
      `SELECT id,name,code,is_active,last_seen_at,(last_seen_at>now()-interval '2 minutes') AS online
       FROM access_devices WHERE gym_id=$1 ORDER BY name`,[user.gym_id])
  ]);
  return helpers.send(res,200,{decisions:decisions.rows,devices:devices.rows,server_time:new Date().toISOString()});
}

async function operationsSearch(res,user,url,helpers){
  if(!canOperate(user)) return helpers.send(res,403,{error:'sem_permissao'});
  const q=String(url.searchParams.get('q')||'').trim();
  if(q.length<2)return helpers.send(res,200,{data:[]});
  const result=await helpers.query(
    `SELECT m.id,m.name,m.email,m.phone,m.status,m.photo_url,ms.ends_at,
      EXISTS(SELECT 1 FROM payments p WHERE p.member_id=m.id AND p.gym_id=m.gym_id AND p.status IN ('pending','overdue') AND p.due_date<current_date-10) AS financially_blocked
     FROM members m LEFT JOIN LATERAL(SELECT ends_at FROM memberships WHERE member_id=m.id AND gym_id=m.gym_id ORDER BY ends_at DESC LIMIT 1)ms ON true
     WHERE m.gym_id=$1 AND (lower(m.name) LIKE lower($2) OR lower(COALESCE(m.email,'')) LIKE lower($2) OR COALESCE(m.phone,'') LIKE $3)
     ORDER BY m.name LIMIT 30`,[user.gym_id,`%${q}%`,`%${q.replace(/\D/g,'')}%`]);
  return helpers.send(res,200,{data:result.rows});
}

async function manualUnlock(req,res,user,helpers){
  if(!canOperate(user)) return helpers.send(res,403,{error:'sem_permissao'});
  const input=await helpers.body(req);
  if(!input.device_id||!input.member_id||!input.reason)return helpers.send(res,400,{error:'dados_invalidos'});
  const device=await helpers.query('SELECT id FROM access_devices WHERE id=$1 AND gym_id=$2 AND is_active=true',[input.device_id,user.gym_id]);
  const member=await helpers.query('SELECT id,name FROM members WHERE id=$1 AND gym_id=$2',[input.member_id,user.gym_id]);
  if(!device.rowCount||!member.rowCount)return helpers.send(res,404,{error:'dispositivo_ou_aluno_nao_encontrado'});
  const command=await helpers.query(
    `INSERT INTO access_device_commands(gym_id,device_id,command,payload,expires_at,created_by)
     VALUES($1,$2,'unlock',$3::jsonb,now()+interval '30 seconds',$4) RETURNING id,command,expires_at`,
    [user.gym_id,input.device_id,JSON.stringify({member_id:input.member_id,member_name:member.rows[0].name,reason:input.reason,manual:true}),user.sub]);
  await recordAudit(user,'manual_unlock','access_device',input.device_id,{member_id:input.member_id,reason:input.reason,command_id:command.rows[0].id});
  return helpers.send(res,201,command.rows[0]);
}

async function handleFinanceSalesRoutes(req,res,user,url,helpers){
  if(req.method==='GET'&&url.pathname==='/api/public/catalog') return publicCatalog(res,url,helpers);
  if(req.method==='POST'&&url.pathname==='/api/public/leads') return createLead(req,res,helpers);
  if(!user) return false;
  if(req.method==='GET'&&url.pathname==='/api/finance/operations/overview') return financeOverview(res,user,helpers);
  if(req.method==='GET'&&url.pathname==='/api/finance/receivables') return receivables(res,user,url,helpers);
  if(req.method==='POST'&&url.pathname==='/api/finance/payments/settle') return settlePayment(req,res,user,helpers);
  if(req.method==='POST'&&url.pathname==='/api/finance/agreements') return createAgreement(req,res,user,helpers);
  if(req.method==='GET'&&url.pathname==='/api/finance/receipts') return receipts(res,user,url,helpers);
  if(req.method==='GET'&&url.pathname==='/api/finance/cash') return cashStatus(res,user,helpers);
  if(req.method==='POST'&&url.pathname==='/api/finance/cash/open') return openCash(req,res,user,helpers);
  if(req.method==='POST'&&url.pathname==='/api/finance/cash/movement') return cashMovement(req,res,user,helpers);
  if(req.method==='POST'&&url.pathname==='/api/finance/cash/close') return closeCash(req,res,user,helpers);
  if(req.method==='GET'&&url.pathname==='/api/sales/leads') return salesLeads(res,user,url,helpers);
  if(req.method==='POST'&&url.pathname==='/api/sales/leads/update') return updateLead(req,res,user,helpers);
  if(req.method==='GET'&&url.pathname==='/api/operations/live') return operationsLive(res,user,helpers);
  if(req.method==='GET'&&url.pathname==='/api/operations/members') return operationsSearch(res,user,url,helpers);
  if(req.method==='POST'&&url.pathname==='/api/operations/manual-unlock') return manualUnlock(req,res,user,helpers);
  return false;
}

module.exports={handleFinanceSalesRoutes,boundedInteger,addMonths};
