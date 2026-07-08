# MoneyFlow Working Final

Deploy ได้ทันทีบน Railway แบบไม่ต้องใช้ Database ภายนอก ใช้ไฟล์ JSON ภายใน `data/db.json`

## Railway
Variables:
```env
SESSION_SECRET=ใส่รหัสยาวๆ
APP_NAME=MoneyFlow
NODE_ENV=production
```

Start Command:
```bash
npm start
```

Health check:
`/health`

## Features
- Register / Login
- Dashboard
- Split calculator + History
- Plans
- Accounts + QR URL
- Budget
- Goals
- Debt
- Net Worth / Financial Score
- Backup JSON
- PWA
