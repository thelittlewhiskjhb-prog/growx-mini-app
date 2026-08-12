# GROWX Quick Start - Production Ready

## Installation (1 minute)

```bash
cd growx-mini-app
npm install
```

## Configuration (2 minutes)

Create `.env.local`:
```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-from-dashboard
```

## Run Locally

```bash
npm run dev
```

Open http://localhost:5173

## Test the App

### Client Test
1. Click "NEW MEMBER REGISTRATION"
2. Phone: `1234567890`
3. PIN: `1234`
4. Create → Login
5. Add package → Claim reward

### Admin Test
1. Click "ADMIN ACCESS"
2. Code: `GROWX-ADMIN`
3. Search: `1234567890`
4. Record allocation

## Deploy to Supabase

See `DEPLOYMENT.md` for full instructions.

Quick version:
```bash
supabase link --project-ref YOUR_REF
supabase db push
supabase functions deploy claim-reward
supabase functions deploy redeem-gift-code
supabase functions deploy admin-record-allocation
```

## Features

✅ Phone + 4-digit PIN login (no email needed)  
✅ Real balance in Supabase  
✅ 24-hour reward claim (server enforced)  
✅ Withdrawals with status tracking  
✅ Gift codes  
✅ Admin client lookup & allocation  
✅ GROW RUSH game  
✅ 10,000 user ready  

## Go Live

```bash
npm run build
# Deploy dist/ folder to Vercel, Netlify, or GitHub Pages
```

**You're ready! 🚀**
