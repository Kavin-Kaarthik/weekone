// ============================================================
//  IronRoot Gym — Frontend Script
//  Supabase Auth (Google OAuth) + Stripe + Contact Form
// ============================================================

// Config variables - loaded from API
let SUPABASE_URL;
let SUPABASE_ANON;
let STRIPE_PUBLIC_KEY;
let db;
let stripe;

// Load config from server
async function loadConfig() {
  try {
    const res = await fetch('/config');
    const config = await res.json();
    
    SUPABASE_URL = config.supabaseUrl;
    SUPABASE_ANON = config.supabaseAnonKey;
    STRIPE_PUBLIC_KEY = config.stripePublicKey;
    
    // Init Supabase
    const { createClient } = supabase;
    db = createClient(SUPABASE_URL, SUPABASE_ANON);
    
    // Init Stripe
    stripe = Stripe(STRIPE_PUBLIC_KEY);
    
    console.log('✓ Config loaded successfully');
  } catch (err) {
    console.error('Failed to load config:', err.message);
    showToast('Failed to initialize app. Please refresh the page.');
  }
}

// ---- Nav scroll effect ----
window.addEventListener('scroll', () => {
  document.getElementById('nav').classList.toggle('scrolled', window.scrollY > 20);
});

// ---- Mobile menu ----
function toggleMenu() {
  document.getElementById('mobile-menu').classList.toggle('open');
}

// ---- Auth state ----
async function initAuth() {
  const { data: { session } } = await db.auth.getSession();
  updateAuthUI(session?.user || null);

  db.auth.onAuthStateChange((_event, session) => {
    updateAuthUI(session?.user || null);
    if (session?.user) saveUserToDb(session.user);
  });
}

function updateAuthUI(user) {
  const loading  = document.getElementById('auth-loading');
  const loginBtn = document.getElementById('login-btn');
  const userInfo = document.getElementById('user-info');

  loading.style.display = 'none';

  if (user) {
    loginBtn.style.display = 'none';
    userInfo.style.display = 'flex';
    document.getElementById('user-name').textContent = user.user_metadata?.full_name?.split(' ')[0] || 'Member';
    const avatar = document.getElementById('user-avatar');
    avatar.src = user.user_metadata?.avatar_url || '';
    avatar.style.display = user.user_metadata?.avatar_url ? 'block' : 'none';
  } else {
    loginBtn.style.display = 'inline-block';
    userInfo.style.display = 'none';
  }
}

async function signInWithGoogle() {
  try {
    const { error } = await db.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.href }
    });
    if (error) {
      console.error('Supabase OAuth error:', error);
      const msg = error.error_description || error.msg || error.message || JSON.stringify(error);
      showToast('Login failed: ' + msg + ' — Enable Google provider in Supabase Auth settings.', 8000);
    }
  } catch (err) {
    console.error('Sign-in exception:', err);
    showToast('Login failed: ' + (err.message || String(err)), 8000);
  }
}

async function signOut() {
  await db.auth.signOut();
  showToast('You have been signed out.');
}

async function saveUserToDb(user) {
  if (!user?.email) return;
  const { error } = await db
    .from('members')
    .upsert({ id: user.id, email: user.email, name: user.user_metadata?.full_name || '' }, { onConflict: 'id' });
  if (error && error.code !== '23505') console.warn('DB upsert:', error.message);
}

// ---- Payment (Stripe) ----
async function handlePayment(planKey, amount, planLabel) {
  const { data: { session } } = await db.auth.getSession();

  if (!session?.user) {
    showToast('Please sign in with Google to purchase a plan.');
    document.getElementById('login-btn').style.display = 'inline-block';
    return;
  }

  if (!STRIPE_PUBLIC_KEY || !stripe) {
    showToast(`Payment not configured. Please contact the site admin.`);
    return;
  }

  try {
    // Store payment info in session storage for after redirect
    const months = planKey === 'basic' ? 1 : planKey === 'standard' ? 3 : 6;
    sessionStorage.setItem('pendingPayment', JSON.stringify({
      planKey: planKey,
      planLabel: planLabel,
      amount: amount,
      durationMonths: months,
      userId: session.user.id
    }));

    // Create checkout session on server
    const res = await fetch('/create-checkout-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        planKey: planKey,
        amount: amount,
        planLabel: planLabel,
        userEmail: session.user.email,
        userName: session.user.user_metadata?.full_name || '',
        userId: session.user.id
      })
    });

    const data = await res.json();

    if (data.error) {
      showToast('Error: ' + data.error);
      sessionStorage.removeItem('pendingPayment');
      return;
    }

    // Redirect to Stripe Checkout
    const result = await stripe.redirectToCheckout({ sessionId: data.sessionId });

    if (result.error) {
      showToast('Payment error: ' + result.error.message);
      sessionStorage.removeItem('pendingPayment');
    }
  } catch (err) {
    showToast('Network error: ' + err.message);
    sessionStorage.removeItem('pendingPayment');
  }
}

// ---- Handle payment success redirect ----
async function handlePaymentSuccess() {
  const params = new URLSearchParams(window.location.search);
  const isSuccess = params.get('payment') === 'success';
  const isCancelled = params.get('payment') === 'cancelled';

  if (isCancelled) {
    showToast('Payment cancelled.');
    window.history.replaceState({}, document.title, window.location.pathname);
    return;
  }

  if (!isSuccess) return;

  try {
    const { data: { session } } = await db.auth.getSession();
    if (!session?.user) return;

    const pendingPaymentStr = sessionStorage.getItem('pendingPayment');
    if (!pendingPaymentStr) return;

    const pendingPayment = JSON.parse(pendingPaymentStr);
    const expiry = new Date();
    expiry.setMonth(expiry.getMonth() + pendingPayment.durationMonths);

    // Save subscription to Supabase
    const { error } = await db.from('subscriptions').insert([{
      user_id: session.user.id,
      plan: pendingPayment.planLabel,
      stripe_id: 'payment_' + Date.now(),
      amount: pendingPayment.amount,
      expires_at: expiry.toISOString()
    }]);

    if (error) {
      console.warn('Subscription save:', error.message);
      showToast('⚠️ Payment succeeded but failed to activate subscription. Contact support.');
    } else {
      showToast(`🎉 Payment successful! Your ${pendingPayment.planLabel} membership is active.`);
    }

    // Clear session storage and URL
    sessionStorage.removeItem('pendingPayment');
    window.history.replaceState({}, document.title, window.location.pathname);
  } catch (err) {
    console.error('Payment success handler:', err.message);
  }
}

// ---- Contact Form ----
async function submitContact(e) {
  e.preventDefault();
  const btn = document.getElementById('contact-submit');
  const msg = document.getElementById('contact-msg');

  const name    = sanitize(document.getElementById('c-name').value.trim());
  const email   = sanitize(document.getElementById('c-email').value.trim());
  const message = sanitize(document.getElementById('c-message').value.trim());

  if (!name || !email || !message) {
    setFormMsg(msg, 'Please fill in all fields.', 'error');
    return;
  }
  if (!validateEmail(email)) {
    setFormMsg(msg, 'Please enter a valid email address.', 'error');
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Sending…';
  setFormMsg(msg, '', '');

  try {
    let dbSuccess = false;
    let emailSuccess = false;

    // Save to Supabase contacts table
    try {
      const { error: dbErr } = await db.from('contacts').insert([{ name, email, message }]);
      if (!dbErr) {
        dbSuccess = true;
      } else {
        console.warn('Contact DB error:', dbErr.message);
      }
    } catch (dbError) {
      console.warn('Supabase error:', dbError.message);
    }

    // Send to server for email notification
    try {
      const res = await fetch('/contact', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ name, email, message })
      });
      const data = await res.json();
      if (data.success) {
        // server returns emailSent boolean to indicate SMTP delivery
        emailSuccess = data.emailSent === true;
        if (!emailSuccess) console.warn('Server saved contact but failed to send email notification.');
      }
    } catch (fetchError) {
      console.warn('Email send error:', fetchError.message);
    }

    // Show result
    if (dbSuccess && emailSuccess) {
      setFormMsg(msg, '✓ Message sent! We\'ll get back to you shortly.', 'success');
      document.getElementById('contact-form').reset();
    } else if (dbSuccess && !emailSuccess) {
      setFormMsg(msg, '✓ Saved! Email notification failed — we will still respond here.', 'success');
      document.getElementById('contact-form').reset();
    } else if (!dbSuccess && emailSuccess) {
      setFormMsg(msg, '✓ Message sent via email, but failed to save locally. Please contact support if you don\'t hear back.', 'success');
      document.getElementById('contact-form').reset();
    } else {
      setFormMsg(msg, 'Failed to send message. Please try again.', 'error');
    }
  } catch (err) {
    console.error('Contact form error:', err);
    setFormMsg(msg, 'Network error. Please try again.', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Send Message';
  }
}
function toggleFaq(button) {
  const item = button.parentElement;
  const icon = button.querySelector(".faq-icon");

  // toggle current
  item.classList.toggle("open");

  // change icon
  if (item.classList.contains("open")) {
    icon.textContent = "-";
  } else {
    icon.textContent = "+";
  }
}

// ---- Toast ----
function showToast(text, duration = 3600) {
  const t = document.getElementById('toast');
  t.textContent = text;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), duration);
}

// ---- Scroll reveal ----
function initReveal() {
  const items = document.querySelectorAll('.feature-card, .price-card, .faq-item, .contact-form, .contact-info, .section-header');
  items.forEach(el => el.classList.add('reveal'));

  const obs = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        e.target.classList.add('visible');
        obs.unobserve(e.target);
      }
    });
  }, { threshold: 0.12 });

  items.forEach(el => obs.observe(el));
}

// ---- Helpers ----
function sanitize(input) {
  return String(input).replace(/[\r\n<>&]/g, ' ').substring(0, 1000);
}

function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function setFormMsg(el, text, type) {
  el.textContent = text;
  el.className = 'form-msg' + (type ? ' ' + type : '');
}

// ---- Boot ----
document.addEventListener('DOMContentLoaded', async () => {
  await loadConfig();
  initAuth();
  initReveal();
  handlePaymentSuccess();
});
