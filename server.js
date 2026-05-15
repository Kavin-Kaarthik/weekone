// ============================================================
//  IronRoot Gym — Node/Express Server
//  Serves static files + handles contact form email
// ============================================================

require('dotenv').config();

const express  = require('express');
const nodemailer = require('nodemailer');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const path     = require('path');

const app  = express();
const PORT = process.env.PORT || 3000;

// ---- Middleware ----
app.use(express.json({ limit: '10kb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ---- Input helpers ----
function sanitize(input) {
  return String(input || '').replace(/[\r\n<>&]/g, ' ').trim().substring(0, 1000);
}

function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// ---- Email transporter ----
let transporter = null;

if (process.env.SMTP_EMAIL && process.env.SMTP_PASS) {
  transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    requireTLS: true,
    auth: {
      user: process.env.SMTP_EMAIL,
      pass: process.env.SMTP_PASS
    },
    connectionTimeout: 10000,
    socketTimeout: 10000
  });
}

// ---- Public config endpoint ----
app.get('/config', (_req, res) => {
  res.json({
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY,
    stripePublicKey: process.env.STRIPE_PUBLIC_KEY
  });
});

// ---- Stripe checkout endpoint ----
app.post('/create-checkout-session', async (req, res) => {
  const { planKey, amount, planLabel, userEmail, userName, userId } = req.body;

  // Validate input
  if (!amount || !planLabel || !userEmail || !userId) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  if (!process.env.STRIPE_SECRET_KEY) {
    return res.status(500).json({ error: 'Stripe not configured' });
  }

  try {
    // Calculate subscription duration in months
    const months = planKey === 'basic' ? 1 : planKey === 'standard' ? 3 : 6;

    // Create Stripe checkout session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      customer_email: userEmail,
      line_items: [
        {
          price_data: {
            currency: 'inr',
            product_data: {
              name: 'IronRoot Gym',
              description: `${planLabel} Membership (${months} month${months > 1 ? 's' : ''})`
            },
            unit_amount: amount * 100 // Stripe expects amount in paise
          },
          quantity: 1
        }
      ],
      success_url: `${process.env.DOMAIN || 'http://localhost:3000'}/?payment=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.DOMAIN || 'http://localhost:3000'}/?payment=cancelled`,
      metadata: {
        userId: userId,
        planLabel: planLabel,
        planKey: planKey,
        durationMonths: months
      }
    });

    res.json({ sessionId: session.id });
  } catch (err) {
    console.error('Stripe error:', err.message);
    res.status(500).json({ error: 'Failed to create checkout session' });
  }
});

// ---- Contact form endpoint ----
app.post('/contact', async (req, res) => {
  const name    = sanitize(req.body.name);
  const email   = sanitize(req.body.email);
  const message = sanitize(req.body.message);

  // Validation
  if (!name || !email || !message) {
    return res.status(400).json({ success: false, error: 'All fields are required.' });
  }
  if (!validateEmail(email)) {
    return res.status(400).json({ success: false, error: 'Invalid email address.' });
  }

  // Send email if SMTP is configured
  let emailSent = false;
  if (transporter) {
    try {
      await transporter.sendMail({
        from:    `"IronRoot Gym" <${process.env.SMTP_EMAIL}>`,
        to:      process.env.SMTP_EMAIL,
        replyTo: email,
        subject: `[IronRoot] New message from ${name}`,
        text: [
          `Name:    ${name}`,
          `Email:   ${email}`,
          `Message: ${message}`,
          '',
          '— IronRoot Contact Form'
        ].join('\n')
      });
      emailSent = true;
    } catch (err) {
      console.error('SMTP error:', err.message);
    }
  } else {
    console.warn('SMTP not configured. Set SMTP_EMAIL and SMTP_PASS in .env');
  }

  // Return details about which channels succeeded so frontend can show accurate feedback
  return res.json({ success: true, emailSent });
});

// ---- Health check ----
app.get('/health', (_req, res) => res.json({ status: 'ok' }));

// ---- Catch-all → serve index ----
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ---- Start ----
app.listen(PORT, () => {
  console.log(`\n✅  IronRoot Gym server running at http://localhost:${PORT}\n`);
});
