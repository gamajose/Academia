const h=window.location.hostname||'localhost';
const API=localStorage.getItem('apiBaseUrl')||`http://${h}:3004`;
const TOKEN=localStorage.getItem('academiaToken')||'';
const $=id=>document.getElementById(id);
let rows=[];
async function req(path,opt={}){const r=await fetch(`${API}${path}`,{...opt,headers:{'Content-Type':'application/json',Authorization:`Bearer ${TOKEN}`,...(opt.headers||{})}});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'erro_requisicao');return d;}
function brl(c){return (Number(c||0)/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});}
function mini(t,fn){const b=document.createElement('button');b.className='mini-button';b.textContent=t;b.onclick=fn;return b;}
function draw(){const list=$('plans-page-list');list.innerHTML='';for(const x of rows){const li=document.createElement('li');li.append(`${x.name} | ${brl(x.price_cents)} | ${x.duration_days} dias | ${x.is_active?'ativo':'inativo'} | ${x.public_highlight||'sem destaque'} `);li.appendChild(mini('Editar',()=>openP(x)));li.appendChild(mini(x.is_active?'Desativar':'Ativar',()=>toggle(x)));list.appendChild(li);}if(!list.children.length){const li=document.createElement('li');li.textContent='Nenhum plano encontrado.';list.appendChild(li);}}
function openP(x={}){$('plan-modal').classList.remove('hidden');$('plan-id').value=x.id||'';$('plan-name-page').value=x.name||'';$('plan-price-page').value=x.price_cents||'';$('plan-days-page').value=x.duration_days||30;$('plan-highlight-page').value=x.public_highlight||'';$('plan-description-page').value=x.description||'';$('plan-benefits-page').value=x.benefits||'';$('plan-rules-page').value=x.rules||'';}
function closeP(){$('plan-modal').classList.add('hidden');}
async function load(){try{const r=await req('/api/plans/detail');rows=r.data||[];draw();$('plans-status').textContent='Planos carregados.';}catch(e){$('plans-status').textContent=`Erro: ${e.message}`;}}
async function save(){try{const id=$('plan-id').value;const body={name:$('plan-name-page').value.trim(),price_cents:Number($('plan-price-page').value||0),duration_days:Number($('plan-days-page').value||30),public_highlight:$('plan-highlight-page').value.trim(),description:$('plan-description-page').value.trim(),benefits:$('plan-benefits-page').value.trim(),rules:$('plan-rules-page').value.trim()};await req(id?'/api/plans/update':'/api/plans',{method:'POST',body:JSON.stringify(id?{plan_id:id,...body}:body)});closeP();await load();}catch(e){$('plans-status').textContent=`Erro: ${e.message}`;}}
async function toggle(x){await req(x.is_active?'/api/plans/deactivate':'/api/plans/activate',{method:'POST',body:JSON.stringify({plan_id:x.id})});await load();}
$('new-plan-button').onclick=()=>openP();$('close-plan-modal').onclick=closeP;$('save-plan-page-button').onclick=save;load();
