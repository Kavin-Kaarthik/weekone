# 🏋️ IronRoot Gym

Full-stack gym membership site with Google OAuth login, Supabase database, Stripe payments, and contact form email — built with Node.js + Express.

**Color Theme:** Soft Earth Minimal (`#F8F5F2` / `#E0C3A3` / `#8B5E3C`)

---

## 🚀 Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Copy and fill in your environment variables
cp .env.example .env

# 3. Add your keys to .env (see Setup below)

# 4. Start the server
npm start
# → http://localhost:3000
```

---

## ⚙️ Setup Steps

### 1. Supabase (Database + Auth)

1. Go to [supabase.com](https://supabase.com) → New Project
2. **Settings → API** → Copy your `URL` and `anon public` key
3. Paste into `.env` and also into `public/script.js` (top of file)
4. Enable Google OAuth:
   - **Authentication → Providers → Google → Enable**
   - Add redirect URL: `http://localhost:3000`
   - For production: `https://yourdomain.com`

5. Run these SQL queries in **Supabase → SQL Editor**:

```sql
-- Members table (auto-populated on Google login)
create table members (
  id uuid primary key,
  email text unique not null,
  name text,
  created_at timestamptz default now()
);

-- Subscriptions table
create table subscriptions (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references members(id),
  plan text not null,
  stripe_id text unique,
  amount integer,
  expires_at timestamptz,
  created_at timestamptz default now()
);

-- Contact form submissions
create table contacts (
  id uuid default uuid_generate_v4() primary key,
  name text,
  email text,
  message text,
  created_at timestamptz default now()
);
```

6. Enable Row Level Security (RLS) — go to **Authentication → Policies**

### 2. Stripe (Payments)

1. Go to [dashboard.stripe.com](https://dashboard.stripe.com) → **Developers → API Keys**
2. Copy your **Publishable Key** (`pk_test_...`) and **Secret Key** (`sk_test_...`)
3. Paste keys into `.env` as `STRIPE_PUBLIC_KEY` and `STRIPE_SECRET_KEY`
4. Also update `public/script.js` with your publishable key
5. Test with Stripe test card: `4242 4242 4242 4242` / any future date / any 3-digit CVC
6. For webhooks (production): Set `STRIPE_WEBHOOK_SECRET` after configuring webhooks in Stripe Dashboard

### 3. Gmail SMTP (Contact form email)

1. Enable 2-Factor Authentication in your Google account
2. Go to **Google Account → Security → App Passwords**
3. Generate a new App Password (select "Mail")
4. Paste the 16-character password into `.env` as `SMTP_PASS`

---

## 📁 Project Structure

```
ironroot-gym/
├── public/
│   ├── index.html      ← Full responsive frontend
│   ├── style.css       ← Soft Earth Minimal theme
│   └── script.js       ← Auth + Payments + Contact
├── server.js           ← Express server + SMTP
├── package.json
├── .env.example        ← Copy to .env and fill in
└── README.md
```

---

## ✅ Features

- **Google OAuth** via Supabase (production-safe, no client ID needed)
- **3 Pricing Plans** — 1 Month (₹1,499), 3 Month (₹3,799), 6 Month (₹6,999)
- **Stripe Checkout** with subscription saved to Supabase
- **Contact Form** — saves to DB + sends email via SMTP
- **Fully Responsive** — mobile, tablet, desktop
- **Sections:** Hero, Features, Pricing, FAQ, Contact, Footer
- **Scroll animations**, floating hero card, FAQ accordion
- **Input sanitization** — CRLF injection prevention
- **Secure nodemailer** v8.0.7 (patched vulnerabilities)

---

## 🚨 Known Gaps (Before Production)

| Gap | Fix |
|-----|-----|
| Payment not verified server-side | Implement webhook handler to save subscriptions (see STRIPE_SETUP.md) |
| Supabase keys in frontend JS | Normal for anon key; enforce RLS policies |
| No session-guarded dashboard | Add `/dashboard` route with Supabase session check |
| No rate limiting | Add `express-rate-limit` |
| No CAPTCHA on contact form | Add hCaptcha or Cloudflare Turnstile |

---

## 🌐 Deploy

**Vercel / Railway / Render:**
- Set all env vars from `.env` in the dashboard
- Update Supabase redirect URL to your production domain

---

Built with ❤️ for IronRoot Gym, Chennai.
