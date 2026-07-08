require('dotenv').config();
const path = require('path');
const fs = require('fs');
const express = require('express');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const helmet = require('helmet');
const multer = require('multer');

const app = express();
const PORT = process.env.PORT || 3000;
const APP_NAME = process.env.APP_NAME || 'MoneyFlow';
const dataDir = path.join(__dirname, 'data');
const uploadDir = path.join(__dirname, 'uploads');
fs.mkdirSync(dataDir, { recursive: true });
fs.mkdirSync(uploadDir, { recursive: true });

const db = new Database(path.join(dataDir, 'moneyflow.sqlite'));
db.pragma('journal_mode = WAL');
db.exec(`
CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, pin_hash TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS plans (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, name TEXT NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS plan_items (id INTEGER PRIMARY KEY AUTOINCREMENT, plan_id INTEGER NOT NULL, label TEXT NOT NULL, percent REAL NOT NULL, account_id INTEGER);
CREATE TABLE IF NOT EXISTS accounts (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, name TEXT NOT NULL, type TEXT DEFAULT 'bank', balance REAL DEFAULT 0, qr_path TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS splits (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, plan_id INTEGER, amount REAL NOT NULL, note TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS split_items (id INTEGER PRIMARY KEY AUTOINCREMENT, split_id INTEGER NOT NULL, label TEXT NOT NULL, percent REAL NOT NULL, amount REAL NOT NULL, account_id INTEGER, transferred INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS budgets (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, month TEXT NOT NULL, category TEXT NOT NULL, limit_amount REAL NOT NULL, spent REAL DEFAULT 0);
CREATE TABLE IF NOT EXISTS goals (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, name TEXT NOT NULL, target REAL NOT NULL, current REAL DEFAULT 0);
CREATE TABLE IF NOT EXISTS debts (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, name TEXT NOT NULL, total REAL NOT NULL, paid REAL DEFAULT 0);
CREATE TABLE IF NOT EXISTS recurring (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, title TEXT NOT NULL, amount REAL NOT NULL, kind TEXT NOT NULL, day INTEGER NOT NULL);
`);

app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(session({
  store: new SQLiteStore({ db: 'sessions.sqlite', dir: dataDir }),
  secret: process.env.SESSION_SECRET || 'dev-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production' }
}));
app.use('/uploads', express.static(uploadDir));
app.use(express.static(path.join(__dirname, 'public')));

const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => cb(null, `${req.session.userId}-${Date.now()}${path.extname(file.originalname).toLowerCase()}`)
});
const upload = multer({ storage, limits: { fileSize: 2 * 1024 * 1024 }, fileFilter: (_, file, cb) => cb(null, /image\/(png|jpeg|webp)/.test(file.mimetype)) });

function needLogin(req, res, next){ if(!req.session.userId) return res.redirect('/login'); next(); }
function user(req){ return db.prepare('SELECT id,name,email,pin_hash FROM users WHERE id=?').get(req.session.userId); }
function money(n){ return Number(n || 0); }

app.get('/', (req,res)=> req.session.userId ? res.redirect('/dashboard') : res.redirect('/login'));
app.get('/manifest.json', (req,res)=> res.json({ name: APP_NAME, short_name: APP_NAME, start_url:'/dashboard', display:'standalone', background_color:'#0f172a', theme_color:'#0f172a', icons:[{src:'/icon.svg',sizes:'any',type:'image/svg+xml'}] }));
app.get('/register', (_,res)=> res.send(page('สมัครสมาชิก', authForm('register'))));
app.get('/login', (_,res)=> res.send(page('เข้าสู่ระบบ', authForm('login'))));
app.post('/register', (req,res)=>{
  const { name,email,password } = req.body;
  if(!name || !email || !password) return res.send(page('สมัครสมาชิก', `<p class=err>กรอกข้อมูลให้ครบ</p>${authForm('register')}`));
  try { const hash=bcrypt.hashSync(password,10); const info=db.prepare('INSERT INTO users(name,email,password_hash) VALUES(?,?,?)').run(name,email.toLowerCase(),hash); req.session.userId=info.lastInsertRowid; seed(info.lastInsertRowid); res.redirect('/dashboard'); }
  catch(e){ res.send(page('สมัครสมาชิก', `<p class=err>Email นี้มีคนใช้แล้ว</p>${authForm('register')}`)); }
});
app.post('/login', (req,res)=>{ const u=db.prepare('SELECT * FROM users WHERE email=?').get((req.body.email||'').toLowerCase()); if(!u || !bcrypt.compareSync(req.body.password||'',u.password_hash)) return res.send(page('เข้าสู่ระบบ', `<p class=err>อีเมลหรือรหัสผ่านไม่ถูกต้อง</p>${authForm('login')}`)); req.session.userId=u.id; res.redirect('/dashboard'); });
app.post('/logout', (req,res)=> req.session.destroy(()=>res.redirect('/login')));

function seed(uid){
  const p=db.prepare('INSERT INTO plans(user_id,name) VALUES(?,?)').run(uid,'แผนหลัก 40/30/20/10').lastInsertRowid;
  [['ลงทุน',40],['ภาระหนี้สิน',30],['เงินเก็บ',20],['ฟุ่มเฟือย',10]].forEach(x=>db.prepare('INSERT INTO plan_items(plan_id,label,percent) VALUES(?,?,?)').run(p,x[0],x[1]));
  ['ลงทุน','หนี้','เงินเก็บ','ใช้จ่าย'].forEach(n=>db.prepare('INSERT INTO accounts(user_id,name,type,balance) VALUES(?,?,?,0)').run(uid,n,'bank'));
}

app.get('/dashboard', needLogin, (req,res)=>{
  const uid=req.session.userId, u=user(req);
  const accounts=db.prepare('SELECT * FROM accounts WHERE user_id=? ORDER BY id DESC').all(uid);
  const assets=accounts.reduce((s,a)=>s+money(a.balance),0);
  const debts=db.prepare('SELECT * FROM debts WHERE user_id=?').all(uid);
  const debtLeft=debts.reduce((s,d)=>s+Math.max(0,money(d.total)-money(d.paid)),0);
  const goals=db.prepare('SELECT * FROM goals WHERE user_id=?').all(uid);
  const splits=db.prepare('SELECT * FROM splits WHERE user_id=? ORDER BY id DESC LIMIT 8').all(uid);
  const budgets=db.prepare('SELECT * FROM budgets WHERE user_id=? ORDER BY month DESC LIMIT 8').all(uid);
  const net=assets-debtLeft;
  const score=Math.max(0, Math.min(100, Math.round(60 + (assets>debtLeft?20:-10) + (goals.length?10:0) + (budgets.length?10:0))));
  res.send(page('Dashboard', `
  <div class=top><h1>สวัสดี ${esc(u.name)}</h1><form method=post action=/logout><button>Logout</button></form></div>
  <div class=grid><div class=card><b>ทรัพย์สิน</b><h2>${fmt(assets)}</h2></div><div class=card><b>หนี้คงเหลือ</b><h2>${fmt(debtLeft)}</h2></div><div class=card><b>Net Worth</b><h2>${fmt(net)}</h2></div><div class=card><b>Financial Score</b><h2>${score}/100</h2></div></div>
  ${nav()}
  <div class=cols><section class=card><h2>แบ่งเงิน</h2>${splitForm(uid)}</section><section class=card><h2>บัญชี</h2>${accountList(accounts)}</section></div>
  <section class=card><h2>History ล่าสุด</h2>${historyList(splits)}</section>
  <div class=cols><section class=card><h2>Goals</h2>${goalList(goals)}</section><section class=card><h2>Budget</h2>${budgetList(budgets)}</section></div>
  `));
});

app.post('/split', needLogin, (req,res)=>{
  const uid=req.session.userId; const amount=money(req.body.amount); const planId=Number(req.body.plan_id); if(amount<=0) return res.redirect('/dashboard');
  const items=db.prepare('SELECT * FROM plan_items WHERE plan_id=?').all(planId); const total=items.reduce((s,i)=>s+money(i.percent),0); if(Math.round(total)!==100) return res.redirect('/dashboard');
  const splitId=db.prepare('INSERT INTO splits(user_id,plan_id,amount,note) VALUES(?,?,?,?)').run(uid,planId,amount,req.body.note||'').lastInsertRowid;
  items.forEach(i=>db.prepare('INSERT INTO split_items(split_id,label,percent,amount,account_id) VALUES(?,?,?,?,?)').run(splitId,i.label,i.percent,amount*i.percent/100,i.account_id));
  res.redirect('/history/'+splitId);
});
app.get('/history/:id', needLogin, (req,res)=>{ const s=db.prepare('SELECT * FROM splits WHERE id=? AND user_id=?').get(req.params.id,req.session.userId); if(!s) return res.redirect('/dashboard'); const items=db.prepare('SELECT si.*, a.name account_name, a.qr_path FROM split_items si LEFT JOIN accounts a ON a.id=si.account_id WHERE split_id=?').all(s.id); res.send(page('Split History', `${nav()}<section class=card><h1>ผลแบ่งเงิน ${fmt(s.amount)}</h1>${items.map(i=>`<div class=row><div><b>${esc(i.label)}</b><br>${i.percent}% → ${fmt(i.amount)} ${i.account_name?`<small>เข้า ${esc(i.account_name)}</small>`:''}</div><form method=post action=/transfer/${i.id}><button>${i.transferred?'โอนแล้ว':'กดว่าโอนแล้ว'}</button></form>${i.qr_path?`<a class=btn href="${i.qr_path}" target=_blank>เปิด QR</a>`:''}</div>`).join('')}</section>`)); });
app.post('/transfer/:id', needLogin, (req,res)=>{ db.prepare('UPDATE split_items SET transferred=1 WHERE id=?').run(req.params.id); res.redirect('back'); });

app.get('/accounts', needLogin, (req,res)=>{ const acc=db.prepare('SELECT * FROM accounts WHERE user_id=?').all(req.session.userId); res.send(page('Accounts', `${nav()}<section class=card><h1>Accounts + QR</h1><form method=post action=/accounts enctype="multipart/form-data" class=form><input name=name placeholder="ชื่อบัญชี"><input name=type placeholder="ประเภท เช่น bank/cash/crypto"><input name=balance type=number step=0.01 placeholder="ยอดเริ่มต้น"><input type=file name=qr><button>เพิ่มบัญชี</button></form>${accountList(acc)}</section>`)); });
app.post('/accounts', needLogin, upload.single('qr'), (req,res)=>{ db.prepare('INSERT INTO accounts(user_id,name,type,balance,qr_path) VALUES(?,?,?,?,?)').run(req.session.userId, req.body.name||'บัญชี', req.body.type||'bank', money(req.body.balance), req.file?'/uploads/'+req.file.filename:null); res.redirect('/accounts'); });

app.get('/plans', needLogin, (req,res)=>{ const uid=req.session.userId; const plans=db.prepare('SELECT * FROM plans WHERE user_id=?').all(uid); const acc=db.prepare('SELECT * FROM accounts WHERE user_id=?').all(uid); res.send(page('Plans', `${nav()}<section class=card><h1>Plans</h1><form method=post action=/plans><input name=name placeholder="ชื่อแผน"><textarea name=items placeholder="ลงทุน,40\nหนี้,30\nเงินเก็บ,20\nใช้จ่าย,10"></textarea><button>สร้างแผน</button></form>${plans.map(p=>`<div class=box><h3>${esc(p.name)}</h3>${db.prepare('SELECT * FROM plan_items WHERE plan_id=?').all(p.id).map(i=>`<div>${esc(i.label)} ${i.percent}%</div>`).join('')}</div>`).join('')}</section>`)); });
app.post('/plans', needLogin, (req,res)=>{ const id=db.prepare('INSERT INTO plans(user_id,name) VALUES(?,?)').run(req.session.userId,req.body.name||'แผนใหม่').lastInsertRowid; String(req.body.items||'').split('\n').forEach(line=>{ const [label,p]=line.split(','); if(label&&p) db.prepare('INSERT INTO plan_items(plan_id,label,percent) VALUES(?,?,?)').run(id,label.trim(),money(p)); }); res.redirect('/plans'); });

app.get('/budget', needLogin, crudPage('budgets','Budget รายเดือน',['month','category','limit_amount','spent']));
app.post('/budget', needLogin, (req,res)=>{ db.prepare('INSERT INTO budgets(user_id,month,category,limit_amount,spent) VALUES(?,?,?,?,?)').run(req.session.userId,req.body.month,req.body.category,money(req.body.limit_amount),money(req.body.spent)); res.redirect('/budget'); });
app.get('/goals', needLogin, crudPage('goals','Goals',['name','target','current']));
app.post('/goals', needLogin, (req,res)=>{ db.prepare('INSERT INTO goals(user_id,name,target,current) VALUES(?,?,?,?)').run(req.session.userId,req.body.name,money(req.body.target),money(req.body.current)); res.redirect('/goals'); });
app.get('/debts', needLogin, crudPage('debts','Debt Tracker',['name','total','paid']));
app.post('/debts', needLogin, (req,res)=>{ db.prepare('INSERT INTO debts(user_id,name,total,paid) VALUES(?,?,?,?)').run(req.session.userId,req.body.name,money(req.body.total),money(req.body.paid)); res.redirect('/debts'); });
app.get('/recurring', needLogin, crudPage('recurring','Recurring',['title','amount','kind','day']));
app.post('/recurring', needLogin, (req,res)=>{ db.prepare('INSERT INTO recurring(user_id,title,amount,kind,day) VALUES(?,?,?,?,?)').run(req.session.userId,req.body.title,money(req.body.amount),req.body.kind,Number(req.body.day)); res.redirect('/recurring'); });
app.get('/backup', needLogin, (req,res)=>{ const uid=req.session.userId; const data={accounts:db.prepare('SELECT * FROM accounts WHERE user_id=?').all(uid),plans:db.prepare('SELECT * FROM plans WHERE user_id=?').all(uid),splits:db.prepare('SELECT * FROM splits WHERE user_id=?').all(uid),goals:db.prepare('SELECT * FROM goals WHERE user_id=?').all(uid),debts:db.prepare('SELECT * FROM debts WHERE user_id=?').all(uid),budgets:db.prepare('SELECT * FROM budgets WHERE user_id=?').all(uid)}; res.setHeader('Content-Disposition','attachment; filename=moneyflow-backup.json'); res.json(data); });

function crudPage(table,title,fields){ return (req,res)=>{ const rows=db.prepare(`SELECT * FROM ${table} WHERE user_id=? ORDER BY id DESC`).all(req.session.userId); res.send(page(title, `${nav()}<section class=card><h1>${title}</h1><form method=post class=form>${fields.map(f=>`<input name="${f}" placeholder="${f}" ${['target','current','total','paid','amount','limit_amount','spent','day'].includes(f)?'type=number step=0.01':''}>`).join('')}<button>เพิ่ม</button></form><div>${rows.map(r=>`<div class=box>${fields.map(f=>`<b>${f}</b>: ${esc(r[f])}`).join('<br>')}</div>`).join('')}</div></section>`)); }; }
function splitForm(uid){ const plans=db.prepare('SELECT * FROM plans WHERE user_id=?').all(uid); return `<form method=post action=/split class=form><input type=number step=0.01 name=amount placeholder="ยอดเงิน เช่น 10000" required><select name=plan_id>${plans.map(p=>`<option value=${p.id}>${esc(p.name)}</option>`).join('')}</select><input name=note placeholder="บันทึก"><button>คำนวณและบันทึก</button></form>`; }
function accountList(acc){ return acc.length? acc.map(a=>`<div class=row><div><b>${esc(a.name)}</b><br><small>${esc(a.type)} • ${fmt(a.balance)}</small></div>${a.qr_path?`<a class=btn href="${a.qr_path}" target=_blank>QR</a>`:''}</div>`).join(''):'<p>ยังไม่มีบัญชี</p>'; }
function historyList(splits){ return splits.length? splits.map(s=>`<a class=row href=/history/${s.id}><b>${fmt(s.amount)}</b><small>${new Date(s.created_at).toLocaleString('th-TH')}</small></a>`).join(''):'<p>ยังไม่มีประวัติ</p>'; }
function goalList(goals){ return goals.map(g=>`<div class=box>${esc(g.name)} ${fmt(g.current)} / ${fmt(g.target)}<progress value="${money(g.current)}" max="${money(g.target)}"></progress></div>`).join('') || '<p>ยังไม่มี Goals</p>'; }
function budgetList(rows){ return rows.map(b=>`<div class=box>${esc(b.month)} ${esc(b.category)} ${fmt(b.spent)} / ${fmt(b.limit_amount)}<progress value="${money(b.spent)}" max="${money(b.limit_amount)}"></progress></div>`).join('') || '<p>ยังไม่มี Budget</p>'; }
function nav(){ return `<nav><a href=/dashboard>Dashboard</a><a href=/plans>Plans</a><a href=/accounts>Accounts</a><a href=/budget>Budget</a><a href=/goals>Goals</a><a href=/debts>Debt</a><a href=/recurring>Recurring</a><a href=/backup>Backup</a></nav>`; }
function authForm(type){ const isReg=type==='register'; return `<section class=auth><h1>${isReg?'สมัครสมาชิก':'เข้าสู่ระบบ'}</h1><form method=post action=/${type} class=form>${isReg?'<input name=name placeholder="ชื่อของคุณ" required>':''}<input type=email name=email placeholder="email" required><input type=password name=password placeholder="password" required><button>${isReg?'สมัครสมาชิก':'Login'}</button></form><p>${isReg?'มีบัญชีแล้ว? <a href=/login>Login</a>':'ยังไม่มีบัญชี? <a href=/register>สมัครสมาชิก</a>'}</p></section>`; }
function page(title, body){ return `<!doctype html><html lang=th><head><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><title>${APP_NAME} - ${title}</title><link rel=manifest href=/manifest.json><link rel=stylesheet href=/style.css><meta name=theme-color content="#0f172a"></head><body><main>${body}</main><script>if('serviceWorker'in navigator)navigator.serviceWorker.register('/sw.js')</script></body></html>`; }
function esc(x){ return String(x ?? '').replace(/[&<>"']/g, m=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m])); }
function fmt(n){ return Number(n||0).toLocaleString('th-TH',{style:'currency',currency:'THB'}); }
app.listen(PORT, ()=> console.log(`${APP_NAME} running on ${PORT}`));
