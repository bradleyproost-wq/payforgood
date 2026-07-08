const express = require('express');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const APP_NAME = process.env.APP_NAME || 'MoneyFlow';
const DATA_DIR = path.join(__dirname, 'data');
const UPLOAD_DIR = path.join(__dirname, 'uploads');
fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
const db = new Database(path.join(DATA_DIR, 'moneyflow.sqlite'));

db.exec(`
CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT,email TEXT UNIQUE,password_hash TEXT,pin_hash TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS plans(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER,name TEXT,items TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS accounts(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER,name TEXT,type TEXT,balance REAL DEFAULT 0,qr_path TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS splits(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER,plan_id INTEGER,amount REAL,results TEXT,status TEXT DEFAULT 'pending',created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS budgets(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER,month TEXT,category TEXT,limit_amount REAL,spent REAL DEFAULT 0);
CREATE TABLE IF NOT EXISTS goals(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER,name TEXT,target REAL,current REAL DEFAULT 0,deadline TEXT);
CREATE TABLE IF NOT EXISTS debts(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER,name TEXT,total REAL,paid REAL DEFAULT 0,due_date TEXT);
CREATE TABLE IF NOT EXISTS recurring(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER,title TEXT,type TEXT,amount REAL,day INTEGER,active INTEGER DEFAULT 1);
`);

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use('/uploads', express.static(UPLOAD_DIR));
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({ store: new SQLiteStore({ db: 'sessions.sqlite', dir: DATA_DIR }), secret: process.env.SESSION_SECRET || 'dev-secret-change-me', resave: false, saveUninitialized: false, cookie: { maxAge: 1000*60*60*24*30 } }));

const storage = multer.diskStorage({ destination: UPLOAD_DIR, filename: (req, file, cb) => cb(null, `${Date.now()}-${Math.round(Math.random()*1e9)}${path.extname(file.originalname)}`) });
const upload = multer({ storage, limits: { fileSize: 3*1024*1024 }, fileFilter: (req, file, cb) => cb(null, ['image/png','image/jpeg','image/webp'].includes(file.mimetype)) });

function requireAuth(req,res,next){ if(!req.session.userId) return res.redirect('/login'); next(); }
function money(n){ return Number(n||0).toLocaleString('th-TH',{minimumFractionDigits:2,maximumFractionDigits:2}); }
function layout(req, title, body){ const user=req.session.userName; return `<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#111827"><link rel="manifest" href="/manifest.json"><link rel="stylesheet" href="/style.css"><title>${title} | ${APP_NAME}</title></head><body><nav><b>${APP_NAME}</b>${user?`<span>${user}</span><a href="/">Dashboard</a><a href="/split">Split</a><a href="/accounts">Accounts</a><a href="/budgets">Budget</a><a href="/goals">Goals</a><a href="/debts">Debt</a><a href="/backup">Backup</a><a href="/logout">Logout</a>`:''}</nav><main>${body}</main><script>if('serviceWorker'in navigator)navigator.serviceWorker.register('/sw.js')</script></body></html>`; }

app.get('/register',(req,res)=>res.send(layout(req,'Register',`<section class="card"><h1>สมัครสมาชิก</h1><form method="post"><input name="name" placeholder="ชื่อ" required><input name="email" type="email" placeholder="อีเมล" required><input name="password" type="password" placeholder="รหัสผ่าน" required><button>สมัคร</button></form><p><a href="/login">มีบัญชีแล้ว Login</a></p></section>`)));
app.post('/register',(req,res)=>{ const {name,email,password}=req.body; try{ const hash=bcrypt.hashSync(password,10); const r=db.prepare('INSERT INTO users(name,email,password_hash) VALUES(?,?,?)').run(name,email,hash); req.session.userId=r.lastInsertRowid; req.session.userName=name; res.redirect('/'); }catch(e){res.send(layout(req,'Error',`<div class="card"><h2>อีเมลนี้ถูกใช้แล้ว</h2><a href="/register">กลับ</a></div>`));}});
app.get('/login',(req,res)=>res.send(layout(req,'Login',`<section class="card"><h1>Login</h1><form method="post"><input name="email" type="email" placeholder="อีเมล" required><input name="password" type="password" placeholder="รหัสผ่าน" required><button>เข้าสู่ระบบ</button></form><p><a href="/register">สมัครสมาชิก</a></p></section>`)));
app.post('/login',(req,res)=>{ const u=db.prepare('SELECT * FROM users WHERE email=?').get(req.body.email); if(!u||!bcrypt.compareSync(req.body.password,u.password_hash)) return res.send(layout(req,'Error',`<div class="card"><h2>Login ไม่สำเร็จ</h2><a href="/login">กลับ</a></div>`)); req.session.userId=u.id; req.session.userName=u.name; res.redirect('/'); });
app.get('/logout',(req,res)=>req.session.destroy(()=>res.redirect('/login')));

app.get('/', requireAuth, (req,res)=>{ const uid=req.session.userId; const accounts=db.prepare('SELECT * FROM accounts WHERE user_id=?').all(uid); const debts=db.prepare('SELECT * FROM debts WHERE user_id=?').all(uid); const goals=db.prepare('SELECT * FROM goals WHERE user_id=?').all(uid); const splits=db.prepare('SELECT * FROM splits WHERE user_id=? ORDER BY id DESC LIMIT 8').all(uid); const assets=accounts.reduce((s,a)=>s+Number(a.balance||0),0)+goals.reduce((s,g)=>s+Number(g.current||0),0); const debtLeft=debts.reduce((s,d)=>s+(Number(d.total||0)-Number(d.paid||0)),0); const net=assets-debtLeft; const score=Math.max(0,Math.min(100,Math.round(60+(assets?20:0)-(debtLeft>assets?25:0)+(goals.length?10:0)+(accounts.length?10:0)))); res.send(layout(req,'Dashboard',`<h1>Dashboard</h1><div class="grid"><div class="card"><small>Assets</small><h2>${money(assets)} ฿</h2></div><div class="card"><small>Debt Left</small><h2>${money(debtLeft)} ฿</h2></div><div class="card"><small>Net Worth</small><h2>${money(net)} ฿</h2></div><div class="card"><small>Financial Score</small><h2>${score}/100</h2></div></div><section class="card"><h2>History ล่าสุด</h2>${splits.map(s=>`<div class="item"><b>${money(s.amount)} ฿</b><span>${s.created_at}</span><a href="/split/${s.id}">ดูรายการ</a></div>`).join('')||'ยังไม่มีข้อมูล'}</section>`)); });

app.get('/split', requireAuth, (req,res)=>{ const uid=req.session.userId; const plans=db.prepare('SELECT * FROM plans WHERE user_id=?').all(uid); const accounts=db.prepare('SELECT * FROM accounts WHERE user_id=?').all(uid); res.send(layout(req,'Split',`<h1>แบ่งเงิน</h1><section class="card"><h2>สร้างแผน</h2><form method="post" action="/plans"><input name="name" placeholder="ชื่อแผน เช่น 40/30/20/10" required><textarea name="items" rows="5" placeholder='ลงทุน:40\nหนี้:30\nเงินเก็บ:20\nฟุ่มเฟือย:10' required></textarea><button>บันทึกแผน</button></form></section><section class="card"><h2>คำนวณ</h2><form method="post" action="/split"><input name="amount" type="number" step="0.01" placeholder="ยอดเงิน" required><select name="plan_id">${plans.map(p=>`<option value="${p.id}">${p.name}</option>`).join('')}</select><button>คำนวณและบันทึก</button></form></section><section class="card"><h2>แผนทั้งหมด</h2>${plans.map(p=>`<div class="item"><b>${p.name}</b><pre>${p.items}</pre></div>`).join('')||'ยังไม่มีแผน'}</section>`)); });
app.post('/plans',requireAuth,(req,res)=>{ db.prepare('INSERT INTO plans(user_id,name,items) VALUES(?,?,?)').run(req.session.userId,req.body.name,req.body.items); res.redirect('/split'); });
app.post('/split',requireAuth,(req,res)=>{ const plan=db.prepare('SELECT * FROM plans WHERE id=? AND user_id=?').get(req.body.plan_id,req.session.userId); if(!plan)return res.redirect('/split'); const amount=Number(req.body.amount); const results=plan.items.split(/\r?\n/).map(line=>{const [name,p]=line.split(':'); return {name:(name||'').trim(), percent:Number(p||0), amount:amount*Number(p||0)/100, done:false};}); db.prepare('INSERT INTO splits(user_id,plan_id,amount,results) VALUES(?,?,?,?)').run(req.session.userId,plan.id,amount,JSON.stringify(results)); res.redirect('/'); });
app.get('/split/:id',requireAuth,(req,res)=>{ const s=db.prepare('SELECT * FROM splits WHERE id=? AND user_id=?').get(req.params.id,req.session.userId); if(!s)return res.redirect('/'); const results=JSON.parse(s.results); res.send(layout(req,'Transfer',`<h1>Transfer Workflow</h1><section class="card"><h2>ยอด ${money(s.amount)} ฿</h2>${results.map((r,i)=>`<div class="transfer ${r.done?'done':''}"><b>${r.name} ${r.percent}%</b><span>${money(r.amount)} ฿</span><form method="post" action="/split/${s.id}/toggle"><input type="hidden" name="idx" value="${i}"><button>${r.done?'ทำแล้ว':'กดเมื่อโอนแล้ว'}</button></form></div>`).join('')}</section>`)); });
app.post('/split/:id/toggle',requireAuth,(req,res)=>{ const s=db.prepare('SELECT * FROM splits WHERE id=? AND user_id=?').get(req.params.id,req.session.userId); const results=JSON.parse(s.results); results[Number(req.body.idx)].done=!results[Number(req.body.idx)].done; db.prepare('UPDATE splits SET results=?,status=? WHERE id=?').run(JSON.stringify(results),results.every(x=>x.done)?'done':'pending',s.id); res.redirect('/split/'+s.id); });

app.get('/accounts',requireAuth,(req,res)=>{ const rows=db.prepare('SELECT * FROM accounts WHERE user_id=?').all(req.session.userId); res.send(layout(req,'Accounts',`<h1>Accounts + QR</h1><section class="card"><form method="post" enctype="multipart/form-data"><input name="name" placeholder="ชื่อบัญชี" required><input name="type" placeholder="ประเภท เช่น SCB, KBank, Cash"><input name="balance" type="number" step="0.01" placeholder="ยอดเงิน"><label>QR PNG/JPG/WebP</label><input name="qr" type="file" accept="image/*"><button>เพิ่มบัญชี</button></form></section><section class="grid">${rows.map(a=>`<div class="card"><h2>${a.name}</h2><p>${a.type||''}</p><b>${money(a.balance)} ฿</b>${a.qr_path?`<img class="qr" src="${a.qr_path}">`:''}</div>`).join('')}</section>`)); });
app.post('/accounts',requireAuth,upload.single('qr'),(req,res)=>{ db.prepare('INSERT INTO accounts(user_id,name,type,balance,qr_path) VALUES(?,?,?,?,?)').run(req.session.userId,req.body.name,req.body.type,Number(req.body.balance||0),req.file?'/uploads/'+req.file.filename:null); res.redirect('/accounts'); });

function crudPage(table,title,fields){ return [ (req,res)=>{ const rows=db.prepare(`SELECT * FROM ${table} WHERE user_id=?`).all(req.session.userId); const inputs=fields.map(f=>`<input name="${f}" placeholder="${f}" ${f.includes('amount')||['target','current','total','paid','day','limit_amount','spent'].includes(f)?'type="number" step="0.01"':''}>`).join(''); res.send(layout(req,title,`<h1>${title}</h1><section class="card"><form method="post">${inputs}<button>บันทึก</button></form></section><section class="card">${rows.map(r=>`<div class="item"><b>${r.name||r.title||r.category}</b><span>${Object.entries(r).filter(([k])=>!['id','user_id'].includes(k)).map(([k,v])=>`${k}: ${v}`).join(' | ')}</span></div>`).join('')||'ยังไม่มีข้อมูล'}</section>`)); }, (req,res)=>{ const cols=['user_id',...fields]; const vals=[req.session.userId,...fields.map(f=>req.body[f]||0)]; db.prepare(`INSERT INTO ${table}(${cols.join(',')}) VALUES(${cols.map(()=>'?').join(',')})`).run(...vals); res.redirect(req.path); } ]; }
const [budgetGet,budgetPost]=crudPage('budgets','Budget รายเดือน',['month','category','limit_amount','spent']); app.get('/budgets',requireAuth,budgetGet); app.post('/budgets',requireAuth,budgetPost);
const [goalGet,goalPost]=crudPage('goals','Goals',['name','target','current','deadline']); app.get('/goals',requireAuth,goalGet); app.post('/goals',requireAuth,goalPost);
const [debtGet,debtPost]=crudPage('debts','Debt Tracker',['name','total','paid','due_date']); app.get('/debts',requireAuth,debtGet); app.post('/debts',requireAuth,debtPost);
const [recGet,recPost]=crudPage('recurring','Recurring',['title','type','amount','day']); app.get('/recurring',requireAuth,recGet); app.post('/recurring',requireAuth,recPost);

app.get('/backup',requireAuth,(req,res)=>{ const uid=req.session.userId; const data={plans:db.prepare('SELECT * FROM plans WHERE user_id=?').all(uid),accounts:db.prepare('SELECT * FROM accounts WHERE user_id=?').all(uid),splits:db.prepare('SELECT * FROM splits WHERE user_id=?').all(uid),budgets:db.prepare('SELECT * FROM budgets WHERE user_id=?').all(uid),goals:db.prepare('SELECT * FROM goals WHERE user_id=?').all(uid),debts:db.prepare('SELECT * FROM debts WHERE user_id=?').all(uid),recurring:db.prepare('SELECT * FROM recurring WHERE user_id=?').all(uid)}; res.setHeader('Content-Disposition','attachment; filename="moneyflow-backup.json"'); res.json(data); });

app.listen(PORT,()=>console.log(`${APP_NAME} running on port ${PORT}`));
