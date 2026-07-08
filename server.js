const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 8080;
const ROOT = __dirname;
const PUBLIC = path.join(ROOT, 'public');
const DATA_DIR = path.join(ROOT, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const SECRET = process.env.SESSION_SECRET || 'moneyflow-dev-secret-change-me';

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(DB_FILE)) {
  fs.writeFileSync(DB_FILE, JSON.stringify({ users: [], sessions: {}, plans: [], accounts: [], splits: [], budgets: [], goals: [], debts: [], recurring: [], assets: [] }, null, 2));
}

function readDb(){ try { return JSON.parse(fs.readFileSync(DB_FILE,'utf8')); } catch(e){ return { users: [], sessions: {}, plans: [], accounts: [], splits: [], budgets: [], goals: [], debts: [], recurring: [], assets: [] }; } }
function writeDb(db){ fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2)); }
function id(){ return crypto.randomBytes(12).toString('hex'); }
function hash(pwd, salt = crypto.randomBytes(16).toString('hex')){ const h = crypto.pbkdf2Sync(String(pwd), salt, 100000, 32, 'sha256').toString('hex'); return salt + ':' + h; }
function verify(pwd, stored){ const [salt, h] = String(stored||'').split(':'); if(!salt||!h) return false; const chk = crypto.pbkdf2Sync(String(pwd), salt, 100000, 32, 'sha256').toString('hex'); return crypto.timingSafeEqual(Buffer.from(h), Buffer.from(chk)); }
function sign(val){ return crypto.createHmac('sha256', SECRET).update(val).digest('hex'); }
function makeCookie(sessionId){ return `mf_session=${sessionId}.${sign(sessionId)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60*60*24*30}`; }
function parseCookies(req){ const out={}; (req.headers.cookie||'').split(';').forEach(p=>{ const i=p.indexOf('='); if(i>0) out[p.slice(0,i).trim()]=decodeURIComponent(p.slice(i+1)); }); return out; }
function getUser(req, db){ const raw=parseCookies(req).mf_session; if(!raw) return null; const [sid,sig]=raw.split('.'); if(!sid||sig!==sign(sid)) return null; const uid=db.sessions[sid]; return db.users.find(u=>u.id===uid)||null; }
function body(req){ return new Promise((resolve,reject)=>{ let data=''; req.on('data',c=>{ data+=c; if(data.length>2e6){ req.destroy(); reject(new Error('too large')); }}); req.on('end',()=>{ try{ resolve(data?JSON.parse(data):{}); }catch(e){ reject(e); } }); }); }
function send(res, code, obj, headers={}){ res.writeHead(code, { 'Content-Type':'application/json; charset=utf-8', ...headers }); res.end(JSON.stringify(obj)); }
function staticFile(req,res){ let p = decodeURIComponent(req.url.split('?')[0]); if(p==='/') p='/index.html'; const file = path.normalize(path.join(PUBLIC, p)); if(!file.startsWith(PUBLIC)) { res.writeHead(403); return res.end('Forbidden'); }
  fs.readFile(file, (err, data)=>{ if(err){ res.writeHead(404); return res.end('Not found'); } const ext=path.extname(file).toLowerCase(); const types={'.html':'text/html; charset=utf-8','.css':'text/css','.js':'application/javascript','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml'}; res.writeHead(200, {'Content-Type': types[ext] || 'application/octet-stream'}); res.end(data); });
}
function owned(db, table, userId){ return (db[table]||[]).filter(x=>x.userId===userId); }

const server = http.createServer(async (req,res)=>{
  const url = new URL(req.url, `http://${req.headers.host}`);
  if(url.pathname==='/health') return send(res,200,{ok:true,time:new Date().toISOString()});
  if(!url.pathname.startsWith('/api/')) return staticFile(req,res);
  try{
    const db = readDb();
    if(req.method==='POST' && url.pathname==='/api/register'){
      const b=await body(req); const name=String(b.name||'').trim(); const email=String(b.email||'').trim().toLowerCase(); const password=String(b.password||'');
      if(!name||!email||!password) return send(res,400,{error:'กรอกข้อมูลไม่ครบ'});
      if(password.length<4) return send(res,400,{error:'รหัสผ่านต้องอย่างน้อย 4 ตัว'});
      if(db.users.some(u=>u.email===email)) return send(res,400,{error:'อีเมลนี้มีผู้ใช้แล้ว'});
      const user={id:id(),name,email,passwordHash:hash(password),createdAt:new Date().toISOString()}; db.users.push(user);
      db.plans.push({id:id(),userId:user.id,name:'แผนหลัก 40/30/20/10',items:[{name:'ลงทุน',percent:40,accountId:''},{name:'หนี้สิน',percent:30,accountId:''},{name:'เงินเก็บ',percent:20,accountId:''},{name:'ฟุ่มเฟือย',percent:10,accountId:''}],createdAt:new Date().toISOString()});
      const sid=id(); db.sessions[sid]=user.id; writeDb(db); return send(res,200,{ok:true,user:{id:user.id,name:user.name,email:user.email}}, {'Set-Cookie':makeCookie(sid)});
    }
    if(req.method==='POST' && url.pathname==='/api/login'){
      const b=await body(req); const email=String(b.email||'').trim().toLowerCase(); const password=String(b.password||'');
      const user=db.users.find(u=>u.email===email); if(!user||!verify(password,user.passwordHash)) return send(res,401,{error:'อีเมลหรือรหัสผ่านผิด'});
      const sid=id(); db.sessions[sid]=user.id; writeDb(db); return send(res,200,{ok:true,user:{id:user.id,name:user.name,email:user.email}}, {'Set-Cookie':makeCookie(sid)});
    }
    if(req.method==='POST' && url.pathname==='/api/logout'){ const raw=parseCookies(req).mf_session; if(raw){ const sid=raw.split('.')[0]; delete db.sessions[sid]; writeDb(db);} return send(res,200,{ok:true},{'Set-Cookie':'mf_session=; Path=/; Max-Age=0'}); }
    const user=getUser(req,db); if(!user) return send(res,401,{error:'not authenticated'});
    if(req.method==='GET' && url.pathname==='/api/me') return send(res,200,{user:{id:user.id,name:user.name,email:user.email}});
    if(req.method==='GET' && url.pathname==='/api/state'){
      return send(res,200,{user:{id:user.id,name:user.name,email:user.email}, plans:owned(db,'plans',user.id), accounts:owned(db,'accounts',user.id), splits:owned(db,'splits',user.id), budgets:owned(db,'budgets',user.id), goals:owned(db,'goals',user.id), debts:owned(db,'debts',user.id), recurring:owned(db,'recurring',user.id), assets:owned(db,'assets',user.id)});
    }
    const map={plans:'plans',accounts:'accounts',splits:'splits',budgets:'budgets',goals:'goals',debts:'debts',recurring:'recurring',assets:'assets'};
    const table=url.pathname.split('/')[2];
    if(map[table]){
      if(req.method==='POST') { const b=await body(req); const item={...b,id:id(),userId:user.id,createdAt:new Date().toISOString()}; db[table].push(item); writeDb(db); return send(res,200,{ok:true,item}); }
      if(req.method==='PUT') { const b=await body(req); const item=(db[table]||[]).find(x=>x.id===b.id&&x.userId===user.id); if(!item) return send(res,404,{error:'not found'}); Object.assign(item,b,{userId:user.id}); writeDb(db); return send(res,200,{ok:true,item}); }
      if(req.method==='DELETE') { const b=await body(req); const before=db[table].length; db[table]=db[table].filter(x=>!(x.id===b.id&&x.userId===user.id)); writeDb(db); return send(res,200,{ok:true,deleted:before-db[table].length}); }
    }
    if(req.method==='GET' && url.pathname==='/api/backup') return send(res,200,{exportedAt:new Date().toISOString(), data:{plans:owned(db,'plans',user.id),accounts:owned(db,'accounts',user.id),splits:owned(db,'splits',user.id),budgets:owned(db,'budgets',user.id),goals:owned(db,'goals',user.id),debts:owned(db,'debts',user.id),recurring:owned(db,'recurring',user.id),assets:owned(db,'assets',user.id)}});
    send(res,404,{error:'not found'});
  }catch(e){ console.error(e); send(res,500,{error:e.message||'server error'}); }
});
server.listen(PORT, ()=>console.log(`MoneyFlow running on ${PORT}`));
