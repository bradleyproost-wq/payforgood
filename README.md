# MoneyFlow Ready

Railway-ready personal finance web app.

## Deploy to Railway
1. Upload all files to GitHub repository root.
2. Railway > New Project > Deploy from GitHub.
3. Variables:
```
SESSION_SECRET=use-a-long-random-string
APP_NAME=MoneyFlow
NODE_ENV=production
NIXPACKS_NODE_VERSION=22
```
4. Deploy.

## Start command
Leave blank or use:
```
npm start
```

## Features
- Register/Login
- Dashboard
- Split money by percent
- Plans
- Accounts + QR upload
- History + transfer status
- Budget
- Goals
- Debt tracker
- Recurring items
- Net worth / financial score
- JSON Backup
- PWA installable
