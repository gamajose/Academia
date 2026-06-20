const FH=window.location.hostname||'localhost';
const FAPI=localStorage.getItem('apiBaseUrl')||`http://${FH}:3004`;
const FT=localStorage.getItem('academiaToken')||'';
const f=id=>document.getElementById(id);
let rows=[];
async function rq(p,o={}){const r=await fetch(`${FAPI}${p}`,{...o,headers:{'Content-Type':'application/json',Authorization:`Bearer ${FT}`,...(o.headers||{})}});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'erro');return d;}
function brl(v){return(Number(v||0)/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});}
function bt(t,fn,dis=false){const b=document.createElement('button');b.className='mini-button';b.textContent=t;b.disabled=dis;b.onclick=fn;return b;}
function draw(){const list=f('financial-list');list.innerHTML='';let paid=0,pend=0;for(const x of rows){if(x.status==='paid')paid+=Number(x.amount_cents||0);if(x.status==='pending')pend+=Number(x.amount_cents||0);}f('pending-amount').textContent=brl(pend);f('paid-amount').textContent=brl(paid);for(const x of rows){const li=document.createElement('li');li.append(`${x.member_name} | ${brl(x.amount_cents)} | ${x.status} | ${x.due_date} `);li.appendChild(bt('Ajustar',()=>openM(x)));li.appendChild(bt('Baixar',()=>pay(x),x.status==='paid'));list.appendChild(li);}}
async function load(){try{const r=await rq('/api/reports/finance-advanced');rows=r.data||[];const s=r.summary||{};if(f('total-members'))f('total-members').textContent=s.total_members||0;if(f('active-members-report'))f('active-members-report').textContent=s.active_members||0;if(f('active-memberships-report'))f('active-memberships-report').textContent=s.active_memberships||0;draw();f('reports-status').textContent='Financeiro carregado.';}catch(e){f('reports-status').textContent=`Erro: ${e.message}`;}}
function openM(x){f('finance-modal').classList.remove('hidden');f('finance-payment-id').value=x.id;f('finance-title').textContent=`Ajuste: ${x.member_name}`;f('finance-discount').value=x.discount_cents||0;f('finance-fee').value=x.fee_cents||0;f('finance-method').value=x.method||'';f('finance-notes').value=x.notes||'';}
function closeM(){f('finance-modal').classList.add('hidden');}
async function adjust(){await rq('/api/reports/finance-adjust',{method:'POST',body:JSON.stringify({payment_id:f('finance-payment-id').value,discount_cents:Number(f('finance-discount').value||0),fee_cents:Number(f('finance-fee').value||0),method:f('finance-method').value,notes:f('finance-notes').value})});closeM();await load();}
async function pay(x){await rq('/api/payments/mark-paid',{method:'POST',body:JSON.stringify({payment_id:x.id})});await load();}
f('load-button').onclick=load;f('close-finance-modal').onclick=closeM;f('finance-adjust-button').onclick=adjust;load();
