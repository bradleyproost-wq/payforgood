# MoneyFlow Pro — GitHub + Railway Ready

เว็บแอปจัดการเงินส่วนตัวแบบพร้อม Deploy บน Railway

## Features
- สมัครสมาชิก / Login ด้วย JWT Cookie
- Dashboard
- แบ่งเงินตามเปอร์เซ็นต์
- Accounts หลายบัญชี + QR URL
- History การแบ่งเงิน
- Budget รายเดือน
- Goals
- Debt Tracker
- Recurring income/expense
- Net Worth
- Financial Health Score
- Backup JSON
- PWA manifest
- PostgreSQL + Prisma

## Deploy on Railway
1. แตก ZIP แล้วอัปไฟล์ทั้งหมดขึ้น GitHub
2. Railway → New Project → Deploy from GitHub
3. Add PostgreSQL บน Railway
4. ตั้ง Variables:

```env
DATABASE_URL=เอาจาก Railway PostgreSQL
JWT_SECRET=ใส่รหัสยาวๆสุ่มเอง
NEXT_PUBLIC_APP_NAME=MoneyFlow Pro
NODE_ENV=production
```

5. Deploy

Railway จะรัน:
```bash
npm run db:push && npm start
```

## Local dev
```bash
npm install
cp .env.example .env
npm run db:push
npm run dev
```

## หมายเหตุ
เวอร์ชันนี้เป็น V1 ที่ใช้งานจริงได้และขยายต่อได้ ไม่ใช่ตัวอย่างหน้าเดียว
