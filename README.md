# MoneyFlow Railway

เว็บแอพจัดการเงินส่วนตัวพร้อมอัปขึ้น Railway ได้ทันที

## ฟีเจอร์
- สมัครสมาชิก / Login
- Dashboard
- แบ่งเงินตามเปอร์เซ็นต์
- หลายแผนแบ่งเงิน
- Accounts หลายบัญชี + อัปโหลด QR
- History + Transfer Workflow
- Budget รายเดือน
- Goals
- Debt Tracker
- Recurring Income/Expense
- Net Worth + Financial Score
- Backup Export JSON
- PWA ติดตั้งบนมือถือได้

## Run Local
```bash
npm install
cp .env.example .env
npm start
```
เปิด http://localhost:3000

## Deploy Railway
1. แตก ZIP แล้วอัปขึ้น GitHub repo
2. เข้า Railway > New Project > Deploy from GitHub repo
3. ตั้ง Variables:
   - `SESSION_SECRET` = ใส่รหัสยาวๆ สุ่มเอง
   - `APP_NAME` = MoneyFlow
   - `NODE_ENV` = production
4. Railway จะรัน `npm install` และ `npm start` เอง
5. เปิด Public Domain จาก Settings/Networking

## หมายเหตุสำคัญ
SQLite และไฟล์ QR จะอยู่ในโฟลเดอร์โปรเจกต์ ถ้าใช้ Railway แบบไม่มี Volume ข้อมูลอาจหายตอน redeploy/restart บางกรณี แนะนำเพิ่ม Railway Volume แล้ว mount ไว้ที่ `/app/data` และ `/app/uploads` หรืออัปเกรดเป็น PostgreSQL + Object Storage ในเวอร์ชันถัดไป
