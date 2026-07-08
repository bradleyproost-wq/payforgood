# MoneyFlow

เว็บแอพจัดการเงินส่วนตัว พร้อมอัปขึ้น GitHub และ Deploy บน Railway ได้เลย

## Features
- Register / Login
- Dashboard
- Money Split Plans
- Accounts + QR Upload
- Transfer Workflow
- History
- Monthly Budget
- Goals
- Debt Tracker
- Recurring Income/Expense
- Net Worth + Financial Score
- PWA installable app
- Backup JSON

## Run locally
```bash
npm install
cp .env.example .env
npm start
```
Open `http://localhost:3000`

## Deploy Railway
1. Upload this folder to GitHub
2. Railway > New Project > Deploy from GitHub
3. Add Variables:
```bash
SESSION_SECRET=your-long-secret
APP_NAME=MoneyFlow
NODE_ENV=production
```
4. Deploy
