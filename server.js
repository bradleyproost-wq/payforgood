const express = require('express');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const bcrypt = require('bcryptjs');
const Database = require('better-sqlite3');
const multer = require('multer');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 8080;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, 'uploads');
fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'moneyflow.db'));
db.pragma('journal_mode = WAL');
db.exec(`
CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,email TEXT UNIQUE NOT NULL,password TEXT NOT NULL,pin TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS plans(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL,name TEXT NOT NULL,items TEXT NOT NULL,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS accounts(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL,name TEXT NOT NULL,type TEXT DEFAULT 'bank',balance REAL DEFAULT 0,qr_path TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS splits(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL,plan_name TEXT,amount REAL NOT NULL,items TEXT NOT NULL,status TEXT DEFAULT 'pending',created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS budgets(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL,month TEXT NOT NULL,category TEXT NOT NULL,limit_amount REAL NOT NULL,spent REAL DEFAULT 0);
CREATE TABLE IF NOT EXISTS goals(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL,name TEXT NOT NULL,target REAL NOT NULL,current REAL DEFAULT 0);
CREATE TABLE IF NOT EXISTS debts(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL,name TEXT NOT NULL,total REAL NOT NULL,paid REAL DEFAULT 0,min_payment REAL DEFAULT 0);
CREATE TABLE IF NOT EXISTS recurring(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL,name TEXT NOT NULL,kind TEXT NOT NULL,amount REAL NOT NULL,frequency TEXT DEFAULT 'monthly',day INTEGER);
CREATE TABLE IF NOT EXISTS assets(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL,name TEXT NOT NULL,kind TEXT DEFAULT 'asset',value REAL NOT NULL);
`);

app.use(express.urlencoded({ extended: true, limit:'10mb' }));
app.use(express.json({ limit:'10mb' }));
app.use(session({ store: new SQLiteStore({ db:'sessions.sqlite', dir:DATA_DIR }), secret: process.env.SESSION_SECRET || 'dev-secret-change-me', resave:false, saveUninitialized:false, cookie:{ maxAge: 1000*60*60*24*30, sameSite:'lax' }}));
app.use('/uploads', express.static(UPLOAD_DIR));
app.use(express.static(path.join(__dirname, 'public')));
const upload = multer({ dest: UPLOAD_DIR, limits:{ fileSize: 5*1024*1024 }, fileFilter:(req,file,cb)=> cb(null, ['image/png','image/jpeg','image/webp'].includes(file.mimetype)) });

function user(req){ return req.session.user || null; }
function auth(req,res,next){ if(!user(req)) return res.status(401).json({error:'login_required'}); next(); }
function uid(req){ return req.session.user.id; }
function one(sql,...p){ return db.prepare(sql).get(...p); }
function all(sql,...p){ return db.prepare(sql).all(...p); }
function run(sql,...p){ return db.prepare(sql).run(...p); }
function parseItems(v){ try{return JSON.parse(v||'[]')}catch{return[]} }

app.get('/api/me',(req,res)=>res.json({user:user(req)}));
app.post('/api/register',(req,res)=>{ const {name,email,password}=req.body; if(!name||!email||!password) return res.status(400).json({error:'กรอกข้อมูลไม่ครบ'}); try{ const hash=bcrypt.hashSync(password,10); const info=run('INSERT INTO users(name,email,password) VALUES(?,?,?)',name,email.toLowerCase(),hash); req.session.user={id:info.lastInsertRowid,name,email:email.toLowerCase()}; const items=[{name:'ลงทุน',percent:40,accountId:null},{name:'หนี้',percent:30,accountId:null},{name:'เงินเก็บ',percent:20,accountId:null},{name:'ใช้ส่วนตัว',percent:10,accountId:null}]; run('INSERT INTO plans(user_id,name,items) VALUES(?,?,?)',info.lastInsertRowid,'แผนหลัก 40/30/20/10',JSON.stringify(items)); res.json({ok:true,user:req.session.user}); }catch(e){res.status(400).json({error:'อีเมลนี้ถูกใช้แล้ว'});} });
app.post('/api/login',(req,res)=>{ const {email,password}=req.body; const u=one('SELECT * FROM users WHERE email=?',(email||'').toLowerCase()); if(!u||!bcrypt.compareSync(password||'',u.password)) return res.status(400).json({error:'อีเมลหรือรหัสผ่านผิด'}); req.session.user={id:u.id,name:u.name,email:u.email}; res.json({ok:true,user:req.session.user}); });
app.post('/api/logout',(req,res)=>req.session.destroy(()=>res.json({ok:true})));

app.get('/api/data',auth,(req,res)=>{ const id=uid(req); const accounts=all('SELECT * FROM accounts WHERE user_id=? ORDER BY id DESC',id); const plans=all('SELECT * FROM plans WHERE user_id=? ORDER BY id DESC',id).map(p=>({...p,items:parseItems(p.items)})); const splits=all('SELECT * FROM splits WHERE user_id=? ORDER BY id DESC LIMIT 100',id).map(s=>({...s,items:parseItems(s.items)})); const budgets=all('SELECT * FROM budgets WHERE user_id=? ORDER BY id DESC',id); const goals=all('SELECT * FROM goals WHERE user_id=? ORDER BY id DESC',id); const debts=all('SELECT * FROM debts WHERE user_id=? ORDER BY id DESC',id); const recurring=all('SELECT * FROM recurring WHERE user_id=? ORDER BY id DESC',id); const assets=all('SELECT * FROM assets WHERE user_id=? ORDER BY id DESC',id); const cash=accounts.reduce((a,b)=>a+Number(b.balance||0),0); const assetTotal=assets.reduce((a,b)=>a+Number(b.value||0),0)+cash; const debtLeft=debts.reduce((a,b)=>a+Math.max(0,Number(b.total||0)-Number(b.paid||0)),0); const netWorth=assetTotal-debtLeft; const income=splits.reduce((a,b)=>a+Number(b.amount||0),0); const savingRate=income ? Math.round(((splits.flatMap(s=>s.items).filter(i=>String(i.name).includes('เก็บ')||String(i.name).includes('ลงทุน')).reduce((a,b)=>a+Number(b.amount||0),0))/income)*100) : 0; const debtRatio=assetTotal? Math.round((debtLeft/assetTotal)*100):0; const score=Math.max(0,Math.min(100,60+Math.min(20,savingRate)-Math.min(25,Math.round(debtRatio/2))+ (goals.length?5:0)+(budgets.length?5:0))); res.json({accounts,plans,splits,budgets,goals,debts,recurring,assets,summary:{cash,assetTotal,debtLeft,netWorth,income,savingRate,debtRatio,score}}); });

app.post('/api/plans',auth,(req,res)=>{ run('INSERT INTO plans(user_id,name,items) VALUES(?,?,?)',uid(req),req.body.name||'แผนใหม่',JSON.stringify(req.body.items||[])); res.json({ok:true}); });
app.delete('/api/plans/:id',auth,(req,res)=>{ run('DELETE FROM plans WHERE id=? AND user_id=?',req.params.id,uid(req)); res.json({ok:true}); });
app.post('/api/accounts',auth,upload.single('qr'),(req,res)=>{ const qr=req.file?('/uploads/'+req.file.filename):null; run('INSERT INTO accounts(user_id,name,type,balance,qr_path) VALUES(?,?,?,?,?)',uid(req),req.body.name,req.body.type||'bank',Number(req.body.balance||0),qr); res.json({ok:true}); });
app.delete('/api/accounts/:id',auth,(req,res)=>{ run('DELETE FROM accounts WHERE id=? AND user_id=?',req.params.id,uid(req)); res.json({ok:true}); });
app.post('/api/split',auth,(req,res)=>{ const amount=Number(req.body.amount||0); const items=(req.body.items||[]).map(i=>({...i,amount: Math.round(amount*Number(i.percent||0))/100})); run('INSERT INTO splits(user_id,plan_name,amount,items,status) VALUES(?,?,?,?,?)',uid(req),req.body.planName||'Manual',amount,JSON.stringify(items),'pending'); res.json({ok:true,items}); });
app.post('/api/splits/:id/done',auth,(req,res)=>{ run('UPDATE splits SET status=? WHERE id=? AND user_id=?','done',req.params.id,uid(req)); res.json({ok:true}); });
app.delete('/api/splits/:id',auth,(req,res)=>{ run('DELETE FROM splits WHERE id=? AND user_id=?',req.params.id,uid(req)); res.json({ok:true}); });
for (const [route,table,fields] of [['budgets','budgets',['month','category','limit_amount','spent']],['goals','goals',['name','target','current']],['debts','debts',['name','total','paid','min_payment']],['recurring','recurring',['name','kind','amount','frequency','day']],['assets','assets',['name','kind','value']]]){
 app.post('/api/'+route,auth,(req,res)=>{ const vals=fields.map(f=> req.body[f] ?? (f.includes('amount')||['target','current','total','paid','min_payment','value','spent','day'].includes(f)?0:'')); run(`INSERT INTO ${table}(user_id,${fields.join(',')}) VALUES(?${fields.map(()=>',?').join('')})`,uid(req),...vals); res.json({ok:true}); });
 app.delete('/api/'+route+'/:id',auth,(req,res)=>{ run(`DELETE FROM ${table} WHERE id=? AND user_id=?`,req.params.id,uid(req)); res.json({ok:true}); });
}
app.get('/api/backup',auth,(req,res)=>{ const id=uid(req); res.json({accounts:all('SELECT * FROM accounts WHERE user_id=?',id),plans:all('SELECT * FROM plans WHERE user_id=?',id),splits:all('SELECT * FROM splits WHERE user_id=?',id),budgets:all('SELECT * FROM budgets WHERE user_id=?',id),goals:all('SELECT * FROM goals WHERE user_id=?',id),debts:all('SELECT * FROM debts WHERE user_id=?',id),recurring:all('SELECT * FROM recurring WHERE user_id=?',id),assets:all('SELECT * FROM assets WHERE user_id=?',id)}); });
app.get('/health',(req,res)=>res.json({ok:true}));
app.get('*',(req,res)=>res.sendFile(path.join(__dirname,'public','index.html')));
app.listen(PORT,()=>console.log(`MoneyFlow ready on ${PORT}`));
