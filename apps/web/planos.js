const h=window.location.hostname||'localhost';
const API=localStorage.getItem('apiBaseUrl')||`http://${h}:3004`;
const TOKEN=localStorage.getItem('academiaToken')||'';
const $=id=>document.getElementById(id);
let rows=[];
async function req(path,opt={}){
  const r=await fetch(`${API}${path}`,{...opt,headers:{'Content-Type':'application/json',Authorization:`Bearer ${TOKEN}`,...(opt.headers||{})}});
  const d=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error(d.error||'erro_requisicao');
  return d;
}
function brl(c){return (Number(c||0)/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});}
function mini(t,fn){const b=document.createElement('button');b.className='mini-button';b.textContent=t;b.onclick=fn;return b;}
function draw(){const list=$('plans-page-list');list.innerHTML='';for(const x of rows){const li=document.createElement('li');li.append(`${x.name} | ${brl(x.price_cents)} | ${x.duration_days} dias | ${x.is_active?'ativo':'inativo'} `);li.appendChild(mini('Editar',()=>{ $('plan-id').value=x.id;$('plan-name-page').value=x.name;$('plan-price-page').value=x.price_cents;$('plan-days-page').value=x.duration_days;}));li.appendChild(mini(x.is_active?'Desativar':'Ativar',()=>toggle(x)));list.appendChild(li);}}
async function load(){try{const r=await req('/api/plans');rows=r.data||[];draw();$('plans-status').textContent='Planos carregados.';}catch(e){$('plans-status').textContent=`Erro: ${e.message}`;}}
async function save(){try{const id=$('plan-id').value;const body={name:$('plan-name-page').value.trim(),price_cents:Number($('plan-price-page').value||0),duration_days:Number($('plan-days-page').value||30)};await req(id?'/api/plans/update':'/api/plans',{method:'POST',body:JSON.stringify(id?{plan_id:id,...body}:body)});$('plan-id').value='';$('plan-name-page').value='';$('plan-price-page').value='';$('plan-days-page').value='';await load();}catch(e){$('plans-status').textContent=`Erro: ${e.message}`;}}
async function toggle(x){await req(x.is_active?'/api/plans/deactivate':'/api/plans/activate',{method:'POST',body:JSON.stringify({plan_id:x.id})});await load();}
$('save-plan-page-button').onclick=save;
load();
