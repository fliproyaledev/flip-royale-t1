# FLIP ROYALE 🎮

A cryptocurrency prediction game built on Next.js where players predict token price movements and compete for points.

## 🚀 Deployment Guide

### Prerequisites
- Node.js 18+ installed
- GitHub account
- Vercel account (free tier works)

### Step 1: Prepare for GitHub

1. **Check .gitignore** - Make sure these are ignored:
   ```
   node_modules/
   .next/
   *.log
   .env.local
   data/*.json
   ```

2. **Initialize Git** (if not already done):
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   ```

3. **Create GitHub Repository**:
   - Go to GitHub and create a new repository
   - Don't initialize with README (you already have one)
   - Copy the repository URL

4. **Push to GitHub**:
   ```bash
   git remote add origin YOUR_GITHUB_REPO_URL
   git branch -M main
   git push -u origin main
   ```

### Step 2: Deploy to Vercel

1. **Go to Vercel**:
   - Visit [vercel.com](https://vercel.com)
   - Sign in with GitHub

2. **Import Project**:
   - Click "Add New Project"
   - Select your GitHub repository
   - Vercel will auto-detect Next.js

3. **Configure Build Settings**:
   - **Framework Preset**: Next.js (auto-detected)
   - **Build Command**: `npm run build` (default)
   - **Output Directory**: `.next` (default)
   - **Install Command**: `npm install` (default)

4. **Environment Variables** (Optional):
   - If you want to customize price polling interval:
     - Variable: `PRICE_POLL_INTERVAL_MS`
     - Value: `60000` (60 seconds) or `120000` (2 minutes)
     - Minimum: `15000` (15 seconds)

5. **Deploy**:
   - Click "Deploy"
   - Wait for build to complete (usually 2-3 minutes)

### Step 3: Post-Deployment Setup

1. **Data Files**:
   - The `data/` folder contains `users.json` and `duels.json`
   - These will be empty initially on Vercel
   - They will populate as users register and play

2. **Verify Deployment**:
   - Check that all pages load correctly
   - Test user registration
   - Verify price fetching works

### Step 4: Custom Domain (Optional)

1. In Vercel dashboard, go to your project → Settings → Domains
2. Add your custom domain
3. Follow DNS configuration instructions

## 📁 Project Structure

```
flip-flop-new/
├── pages/              # Next.js pages
│   ├── api/           # API endpoints
│   ├── index.tsx      # PLAY page
│   ├── arena.tsx      # Arena mode
│   ├── guide.tsx      # Game guide
│   └── ...
├── lib/               # Core logic
│   ├── tokens.ts      # Token definitions
│   ├── price_orchestrator.ts  # Price polling
│   ├── users.ts       # User management
│   └── ...
├── public/            # Static assets
│   ├── avatars/       # User avatars
│   ├── token-logos/   # Token logos
│   └── logo.png       # Site logo
├── data/              # JSON data files (created at runtime)
└── styles/            # CSS files
```

## 🔧 Configuration

### Vercel KV (Required for Production)
**CRITICAL**: Vercel'de dosya sistemi READ-ONLY'dir! Verilerin kalıcı olması için Vercel KV kurulumu şarttır.

1. **Vercel Dashboard'da KV Database Oluşturun**:
   - Vercel Dashboard → Storage → Create Database → KV
   - Database adını seçin (örn: `flip-royale-kv`)
   - Region seçin (örn: `iad1` - US East)

2. **Environment Variables Otomatik Eklenir**:
   - `KV_URL` - Redis connection URL
   - `KV_REST_API_URL` - REST API endpoint
   - `KV_REST_API_TOKEN` - API token
   - `KV_REST_API_READ_ONLY_TOKEN` - Read-only token

3. **Local Development**:
   - KV yoksa otomatik olarak JSON dosyalarına fallback yapar
   - Production'da KV kullanılır

### Price Polling Interval
Set `PRICE_POLL_INTERVAL_MS` environment variable:
- Default: 60,000ms (1 minute)
- Minimum: 15,000ms (15 seconds)
- Recommended: 60,000ms - 180,000ms (1-3 minutes)

### Admin Access
- Prices page is admin-only
- Set `isAdmin` in localStorage to access

## 🎮 Game Features

- **PLAY Mode**: Daily prediction rounds with 5 cards
- **Arena Mode**: 1v1 duels with entry fees
- **Leaderboard**: Daily rankings and bonuses
- **Inventory**: Card collection system
- **Live Prices**: Real-time token prices from Dexscreener/GeckoTerminal

## 📝 Notes

- **Data Storage**: Production'da Vercel KV kullanılır (Redis). Local development'da JSON dosyalarına fallback yapar.
- **Data Files**: `data/users.json`, `data/duels.json`, `data/rounds.json` - Local dev için kullanılır, production'da KV kullanılır.
- Rounds reset daily at 00:00 UTC
- New users receive 50,000 points and 1 Common Pack
- Arena rooms auto-create 25 rooms daily at 00:00 UTC
- **Migration**: Mevcut JSON verileri ilk KV erişiminde otomatik olarak KV'ye migrate edilir.

## 🐛 Troubleshooting

**Build fails:**
- Check Node.js version (needs 18+)
- Verify all dependencies in package.json
- Check for TypeScript errors

**Prices not loading:**
- Verify API endpoints are accessible
- Check network requests in browser console
- Ensure PriceOrchestrator is running

**Users not saving:**
- Check `data/` folder exists
- Verify file permissions
- Check API endpoint logs

## 📄 License

Private project - All rights reserved

