'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Suspense } from 'react';

// ── Types ────────────────────────────────────────────────────────────────────
type AuthTab = 'login' | 'signup';
type Billing = 'monthly' | 'yearly';

const PRICES = {
  starter: { monthly: 19,  yearly: 15  },
  pro:     { monthly: 29, yearly: 23 },
  max:     { monthly: 99, yearly: 79 },
};

const BILLED = {
  starter: { monthly: 'Billed monthly', yearly: 'Billed $182/year'  },
  pro:     { monthly: 'Billed monthly', yearly: 'Billed $276/year' },
  max:     { monthly: 'Billed monthly', yearly: 'Billed $948/year' },
};

const GEN_STEPS = [
  { p: 10,  label: 'Uploading selfies securely…' },
  { p: 28,  label: 'Analyzing facial structure…' },
  { p: 52,  label: 'Running AI render pipeline…' },
  { p: 74,  label: 'Rendering studio lighting…' },
  { p: 92,  label: 'Color-grading three variants…' },
  { p: 100, label: 'Done.' },
];

// ── Sub-component: auth modal handler (reads searchParams) ───────────────────
function AuthAutoOpen({ onOpen }: { onOpen: (tab: AuthTab) => void }) {
  const params = useSearchParams();
  useEffect(() => {
    const auth = params.get('auth');
    if (auth === 'login' || auth === 'signup') onOpen(auth);
  }, [params, onOpen]);
  return null;
}

// ── Main page ────────────────────────────────────────────────────────────────
export default function HomeClient() {
  const router = useRouter();
  const supabase = createClient();

  // nav
  const [navOpen, setNavOpen] = useState(false);
    const [currentUser, setCurrentUser] = useState<{email: string} | null>(null);
      useEffect(() => {
        supabase.auth.getUser().then(({ data: { user } }) => setCurrentUser(user ? { email: user.email ?? '' } : null));
        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
          setCurrentUser(session?.user ? { email: session.user.email ?? '' } : null);
        });
        return () => subscription.unsubscribe();
      // eslint-disable-next-line react-hooks/exhaustive-deps
      }, []);
  // auth modal
  const [authOpen, setAuthOpen] = useState(false);
  const [authTab, setAuthTab] = useState<AuthTab>('login');
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState('');
  // gen modal
  const [genOpen, setGenOpen] = useState(false);
  const [genProgress, setGenProgress] = useState(0);
  const [genLabel, setGenLabel] = useState('Initializing…');
  const [genDone, setGenDone] = useState(false);
  const [genPhotos, setGenPhotos] = useState<string[]>([]);
  const [genError, setGenError] = useState('');
  // pricing
  const [billing, setBilling] = useState<Billing>('monthly');
  // upload
  const [files, setFiles] = useState<File[]>([]);
  const [isDrag, setIsDrag] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // toast
  const [toastMsg, setToastMsg] = useState('');
  const [toastVisible, setToastVisible] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // contact modal
  const [contactOpen, setContactOpen] = useState(false);
  const [contactForm, setContactForm] = useState({ name: '', email: '' });

  // ── Toast ──
  const toast = useCallback((msg: string) => {
    setToastMsg(msg);
    setToastVisible(true);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastVisible(false), 2600);
  }, []);

  // ── Scroll-reveal ──
  useEffect(() => {
    if (!('IntersectionObserver' in window)) return;
    const targets = document.querySelectorAll<HTMLElement>(
      '.section-head, .step, .pcard, .pro-card, .quote, .g, .pros-banner, .upload-card'
    );
    targets.forEach(el => el.classList.add('reveal'));
    const io = new IntersectionObserver(
      entries => entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }),
      { threshold: 0.12 }
    );
    targets.forEach(el => io.observe(el));
    return () => io.disconnect();
  }, []);

  // ── Close nav on link click ──
  useEffect(() => {
    if (navOpen) {
      const close = () => setNavOpen(false);
      document.addEventListener('click', close, { once: true });
      return () => document.removeEventListener('click', close);
    }
  }, [navOpen]);

  // ── ESC closes modals ──
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setAuthOpen(false); setGenOpen(false); setContactOpen(false); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // ── Body overflow when modal open ──
  useEffect(() => {
    document.body.style.overflow = (authOpen || genOpen || contactOpen) ? 'hidden' : '';
  }, [authOpen, genOpen, contactOpen]);

  // ── Auth handlers ──
  const openAuth = useCallback((tab: AuthTab) => {
    setAuthTab(tab);
    setAuthError('');
    setAuthOpen(true);
  }, []);

  const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setAuthLoading(true);
    setAuthError('');
    const form = e.currentTarget;
    const email = (form.elements.namedItem('email') as HTMLInputElement).value;
    const password = (form.elements.namedItem('password') as HTMLInputElement).value;
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setAuthLoading(false);
    if (error) { setAuthError(error.message); return; }
    setAuthOpen(false);
    toast('Welcome back!');
    router.refresh();
  };

  const handleSignup = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setAuthLoading(true);
    setAuthError('');
    const form = e.currentTarget;
    const name = (form.elements.namedItem('name') as HTMLInputElement).value;
    const email = (form.elements.namedItem('email') as HTMLInputElement).value;
    const password = (form.elements.namedItem('password') as HTMLInputElement).value;
    const { error } = await supabase.auth.signUp({
      email, password,
      options: { data: { full_name: name } },
    });
    setAuthLoading(false);
    if (error) { setAuthError(error.message); return; }
    setAuthOpen(false);
    toast('Account created — check your email to confirm.');
    router.refresh();
  };

  // ── Upload ──
  const addFiles = (incoming: FileList | null) => {
    if (!incoming) return;
    const valid = [...incoming].filter(
      f => /^image\/(jpeg|png|webp)$/.test(f.type) && f.size <= 20 * 1024 * 1024
    );
    if (!valid.length) { toast('Please upload JPG, PNG or WEBP under 20 MB.'); return; }
    setFiles(prev => [...prev, ...valid].slice(0, 12));
    toast(`${valid.length} photo${valid.length > 1 ? 's' : ''} added.`);
  };

  // ── Generate ──
  const handleGenerate = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { openAuth('signup'); return; }
    if (!files.length) { toast('Please upload at least one selfie first.'); return; }

    setGenError('');
    setGenPhotos([]);
    setGenDone(false);
    setGenProgress(0);
    setGenLabel(GEN_STEPS[0].label);
    setGenOpen(true);

    // Animate the progress bar while the request is in flight (stops short of 100%)
    let i = 0;
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      if (i >= GEN_STEPS.length - 1) return;
      const s = GEN_STEPS[i++];
      setGenProgress(s.p);
      setGenLabel(s.label);
      timer = setTimeout(tick, 1500 + Math.random() * 1200);
    };
    tick();

    try {
      // 1. Upload the selfie to the private "selfies" bucket
      const file = files[0];
      const ext = (file.name.split('.').pop() || 'png').toLowerCase();
      const selfiePath = `${user.id}/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from('selfies')
        .upload(selfiePath, file, { contentType: file.type, upsert: false });
      if (upErr) throw new Error(upErr.message);

      // 2. Ask the server to run fal.ai and store the result
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ selfiePath }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Generation failed');

      // 3. Show the generated photo in the popup
      clearTimeout(timer!);
      setGenProgress(100);
      setGenLabel(GEN_STEPS[GEN_STEPS.length - 1].label);
      setGenPhotos(data.photos ?? []);
      setGenDone(true);
    } catch (err) {
      clearTimeout(timer!);
      const msg = err instanceof Error ? err.message : 'Something went wrong';
      setGenError(msg);
      setGenDone(true);
      toast(msg);
    }
  };

  // ── Pricing checkout ──
  const handlePlan = async (plan: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { openAuth('signup'); return; }
    toast(`Redirecting to checkout for ${plan} plan…`);
    const res = await fetch(`/api/checkout?plan=${plan}&billing=${billing}`);
    const { url, error } = await res.json();
    if (error) { toast(error); return; }
    if (url) window.location.href = url;
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <>
      <Suspense fallback={null}>
        <AuthAutoOpen onOpen={openAuth} />
      </Suspense>

      {/* ── NAV ── */}
      <header className="navbar" id="top">
        <div className="nav-container">
          <a href="#top" className="logo" aria-label="ProFaceApp home">
            <span className="logo-mark">
              <svg viewBox="0 0 32 32" width="28" height="28" fill="none">
                <rect x="1" y="1" width="30" height="30" rx="8" fill="#0B66E4"/>
                <circle cx="16" cy="13" r="5" fill="#fff"/>
                <path d="M6 28c1.8-5.5 6-8 10-8s8.2 2.5 10 8" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" fill="none"/>
              </svg>
            </span>
            <span className="logo-text">ProFace<span className="logo-text-accent">App</span></span>
          </a>

          <nav className={`nav-links${navOpen ? ' open' : ''}`} id="nav-links">
            <a href="#pricing">Pricing</a>
            <a href="#teams">For teams</a>
            <a href="#gallery">Gallery</a>
            {currentUser && (
              <a href="/dashboard" className="nav-dashboard-link">Dashboard</a>
            )}
            <button className="btn-ghost" onClick={() => openAuth('login')}>Log in</button>
            <button className="btn-primary" onClick={() => openAuth('signup')}>Sign up</button>
          </nav>

          <button
            className={`burger${navOpen ? ' open' : ''}`}
            onClick={() => setNavOpen(o => !o)}
            aria-label="Menu"
            aria-expanded={navOpen}
          >
            <span/><span/><span/>
          </button>
        </div>
      </header>

      {/* ── HERO ── */}
      <section className="hero">
        <div className="hero-bg" aria-hidden="true">
          <svg className="wave-layer" viewBox="0 0 1440 800" preserveAspectRatio="none">
            <defs>
              <linearGradient id="wG1" x1="0" x2="1" y1="0" y2="1">
                <stop offset="0%" stopColor="#d7e6fb"/>
                <stop offset="100%" stopColor="#eef5ff"/>
              </linearGradient>
            </defs>
            <path className="wave wave-1" d="M0,140 C220,260 420,40 700,160 C980,280 1200,80 1440,200 L1440,0 L0,0 Z" fill="url(#wG1)"/>
            <path className="wave wave-4" d="M0,800 L0,640 C260,720 540,620 820,700 C1100,780 1280,640 1440,720 L1440,800 Z" fill="#ffffff"/>
          </svg>
        </div>

        <div className="hero-container">
          <div className="hero-content">
            <span className="eyebrow">
              <span className="dot"/>
              AI Headshots · Studio-grade in 90 seconds
            </span>
            <h1>Generate professional shots in seconds.</h1>
            <p className="lede">
              Upload a selfie and get a <strong>studio-quality headshot</strong> ready
              for LinkedIn, Resumes, Team pages and Press kits. No photographer, no studio.
            </p>

            <div className="upload-card">
              <label
                className={`dropzone${isDrag ? ' is-drag' : ''}`}
                onDragEnter={e => { e.preventDefault(); setIsDrag(true); }}
                onDragOver={e => { e.preventDefault(); setIsDrag(true); }}
                onDragLeave={() => setIsDrag(false)}
                onDrop={e => { e.preventDefault(); setIsDrag(false); addFiles(e.dataTransfer.files); }}
                onClick={() => fileInputRef.current?.click()}
              >
                <div className="dropzone-inner" style={{ textAlign: 'center' }}>
                  <div className="upload-icon">
                    <svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                      <polyline points="17 8 12 3 7 8"/>
                      <line x1="12" y1="3" x2="12" y2="15"/>
                    </svg>
                  </div>
                  <p className="dz-title"><strong>Drop your selfies here</strong> or click to upload</p>
                  <p className="dz-sub">JPG, PNG or WEBP · 4–10 photos · 20MB max each</p>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  hidden
                  accept="image/jpeg,image/png,image/webp"
                  onChange={e => addFiles(e.target.files)}
                />
              </label>

              {files.length > 0 && (
                <div className="thumb-row">
                  {files.slice(0, 6).map((f, i) => (
                    <div
                      key={i}
                      className="thumb"
                      style={{ backgroundImage: `url(${URL.createObjectURL(f)})` }}
                    />
                  ))}
                  {files.length > 6 && (
                    <div className="thumb thumb-more">+{files.length - 6}</div>
                  )}
                </div>
              )}

              <button type="button" className="cta" onClick={handleGenerate}>
                <span>Generate my headshots</span>
                <svg viewBox="0 0 20 20" width="18" height="18" fill="currentColor">
                  <path d="M3 10h12.2l-4.6-4.6 1.4-1.4L19 10l-7 7-1.4-1.4 4.6-4.6H3z"/>
                </svg>
              </button>

              <p className="micro">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 2l8 4v6c0 5-3.5 9-8 10-4.5-1-8-5-8-10V6l8-4z"/>
                </svg>
                Secure payments via Stripe · Your photos are private &amp; never used to train models.
              </p>
            </div>

            <div className="trust-row">
              <div className="avatars" aria-hidden="true">
                <span className="av av1"/><span className="av av2"/><span className="av av3"/><span className="av av4"/>
              </div>
              <div className="trust-copy">
                <div className="stars">★★★★★</div>
                <span><strong>14,200+</strong> professionals · rated 4.9/5</span>
              </div>
            </div>
          </div>

          <div className="hero-visual" aria-hidden="true">
            <div className="card-stack">
              <div className="snap snap-before">
                <div className="snap-label">Selfie</div>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className="snap-img" src="/hero/selfie.webp" alt="" />
              </div>
              <div className="snap snap-after a1">
                <div className="snap-label after">Pro · Boardroom</div>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className="snap-img" src="/hero/boardroom.webp" alt="" />
              </div>
              <div className="snap snap-after a2">
                <div className="snap-label after">Selfie</div>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className="snap-img" src="/hero/studio2.webp" alt="" />
              </div>
              <div className="snap snap-after a3">
                <div className="snap-label after">Pro · Portrait</div>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className="snap-img" src="/hero/portrait.webp" alt="" />
              </div>
              <div className="float-tag tag-1">Crisp focus</div>
              <div className="float-tag tag-2">Studio lighting</div>
              <div className="float-tag tag-3">Pro wardrobe</div>
            </div>
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section className="how" id="how">
        <div className="section-head">
          <span className="kicker">How it works</span>
          <h2>Studio results in three steps.</h2>
          <p>A real photoshoot takes a day. We take ninety seconds.</p>
        </div>
        <div className="steps">
          {[
            { n: '01', title: 'Upload selfies', body: '1–5 well-lit photos from different angles. Phone selfies work great.' },
            { n: '02', title: 'Pick a pack',    body: 'Choose a credit pack and our AI engine renders your shots in the background.' },
            { n: '03', title: 'Download your shot', body: 'Your polished headshot delivered to your dashboard. Download instantly.' },
          ].map(s => (
            <div key={s.n} className="step">
              <div className="step-num">{s.n}</div>
              <h3>{s.title}</h3>
              <p>{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── PRICING ── */}
      <section className="pricing" id="pricing">
        <svg className="section-wave top" viewBox="0 0 1440 80" preserveAspectRatio="none" aria-hidden="true">
          <path d="M0,40 C240,72 480,8 720,40 C960,72 1200,8 1440,40 L1440,80 L0,80 Z" fill="#eef2f8"/>
        </svg>
        <div className="section-head">
          <span className="kicker">Pricing</span>
          <h2>Simple, transparent pricing.</h2>
          <p>Each generation costs <strong>10 credits</strong> and produces 1 professional photo. Cancel anytime.</p>
          <div className="billing-toggle">
            <button className={`bt-opt${billing === 'monthly' ? ' active' : ''}`} onClick={() => setBilling('monthly')}>Monthly</button>
            <button className={`bt-opt${billing === 'yearly' ? ' active' : ''}`} onClick={() => setBilling('yearly')}>
              Yearly <span className="save-pill">Save 20%</span>
            </button>
          </div>
        </div>
        <div className="pricing-cards">
          {(['starter', 'pro', 'max'] as const).map(plan => (
            <article key={plan} className={`pcard${plan === 'pro' ? ' popular' : ''}`}>
              {plan === 'pro' && <div className="ribbon">Most popular</div>}
              <header>
                <h3>{plan.charAt(0).toUpperCase() + plan.slice(1)}</h3>
                <p className="pcard-desc">{plan === 'starter' ? 'Perfect for a quick profile refresh.' : plan === 'pro' ? 'Ideal for freelancers & job seekers.' : 'For teams, agencies & heavy users.'}</p>
              </header>
              <div className="price">
                <span className="cur">$</span>
                <span className="amt">{PRICES[plan][billing]}</span>
                <span className="per">{billing === 'yearly' ? '/mo, billed yearly' : '/month'}</span>
              </div>
              <p className="billed">{BILLED[plan][billing]}</p>
              <button className={`plan-btn${plan === 'pro' ? ' primary' : ''}`} onClick={() => handlePlan(plan)}>
                {plan === 'starter' ? 'Get Starter' : plan === 'pro' ? 'Subscribe to Pro' : 'Subscribe to Max'}
              </button>
              <ul className="features">
                {plan === 'starter' && <>
                  <li><span className="check">✓</span><span><strong>100 credits</strong> / month</span></li>
                  <li><span className="check">✓</span><span>Standard render queue</span></li>
                  <li><span className="check">✓</span><span>Private My Folders storage</span></li>
                  <li><span className="check">✓</span><span>HD downloads (1055px)</span></li>
                </>}
                {plan === 'pro' && <>
                  <li><span className="check">✓</span><span><strong>250 credits</strong> / month</span></li>
                  <li><span className="check">✓</span><span>High-likeness AI model</span></li>
                  <li><span className="check">✓</span><span>Priority render queue</span></li>
                  <li><span className="check">✓</span><span>Private My Folders storage</span></li>
                  <li><span className="check">✓</span><span>HD downloads (1055px)</span></li>
                </>}
                {plan === 'max' && <>
                  <li><span className="check">✓</span><span><strong>1,000 credits</strong> / month</span></li>
                  <li><span className="check">✓</span><span>Ultra-high likeness model</span></li>
                  <li><span className="check">✓</span><span>Instant priority rendering</span></li>
                  <li><span className="check">✓</span><span>Dedicated support</span></li>
                  <li><span className="check">✓</span><span>Private My Folders storage</span></li>
                  <li><span className="check">✓</span><span>HD downloads (1055px)</span></li>
                </>}
              </ul>
            </article>
          ))}
        </div>
        <p className="pricing-foot">
          Need just one pack?{' '}
          <button style={{ background: 'none', border: 'none', color: 'var(--blue)', cursor: 'pointer', fontSize: 'inherit', padding: 0 }} onClick={() => handlePlan('oneshot')}>
            Buy 10 credits for $4.90 — 1 generation
          </button>{' '}
        </p>
      </section>

      {/* ── GALLERY ── */}
      <section className="gallery" id="gallery">
        <div className="section-head">
          <span className="kicker">Gallery</span>
          <h2>Real selfies. Real upgrades.</h2>
          <p>A few of the 420,000+ headshots delivered last quarter.</p>
        </div>
        <div className="gallery-grid-new">
          {[
            { img: '/hero/h2.webp', cap: 'Studio Quality' },
            { img: '/hero/h9.webp', cap: 'AI Enhanced' },
            { img: '/hero/h1.webp', cap: 'Professional Headshot' },
            { img: '/hero/h11.webp', cap: 'Latest Collection' },
            { img: '/hero/h6.webp', cap: 'Professional Appearance' },
            { img: '/hero/h4.webp', cap: 'Executive Look' },
            { img: '/hero/h10.webp', cap: 'Premium Quality' },
            { img: '/hero/h8.webp', cap: 'Studio Generated' },
            { img: '/hero/h7.webp', cap: 'Business Portrait' },
            { img: '/hero/h3.webp', cap: 'Corporate Portrait' },
          ].map((item, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <figure key={i} className="gallery-item"><img src={item.img} alt={item.cap} /><figcaption>{item.cap}</figcaption></figure>
          ))}
        </div>
        <div className="testimonials">
          {[
            { q: '"I outfitted all 24 agents in one afternoon. We used to spend $6,000 a year on agency headshots — now it\'s a few clicks."', name: 'Sophie M.', role: 'Real Estate Agency Manager', av: 'qav1' },
            { q: '"My firm bio shot looked dated. I had a courthouse-ready portrait in two minutes instead of booking a half-day studio session."',           name: 'James T.', role: 'Lawyer', av: 'qav2' },
            { q: '"Saved a $500 shoot and the entire founding team now matches on the About page. Best money-and-time trade we\'ve made this quarter."',       name: 'Daniel R.',  role: 'CEO & Founder',       av: 'qav3' },
          ].map(t => (
            <blockquote key={t.name} className="quote">
              <p>{t.q}</p>
              <footer>
                <span className={`qav ${t.av}`}/>
                <span><strong>{t.name}</strong> · {t.role}</span>
              </footer>
            </blockquote>
          ))}
        </div>
      </section>

      {/* ── TEAMS ── */}
      <section className="pros" id="teams">
        <div className="pros-inner">
          <div className="pros-head">
            <span className="kicker">For teams &amp; agencies</span>
            <h2>Headshots for whole teams, in minutes.</h2>
            <p>Centralized billing, brand presets, and bulk credits priced per seat.</p>
            <div className="pros-cta">
              <button className="cta inline" onClick={() => openAuth('signup')}>
                <span>Talk to sales</span>
                <svg viewBox="0 0 20 20" width="18" height="18" fill="currentColor"><path d="M3 10h12.2l-4.6-4.6 1.4-1.4L19 10l-7 7-1.4-1.4 4.6-4.6H3z"/></svg>
              </button>
              <a href="#pricing" className="btn-ghost-2 inline">See team pricing</a>
            </div>
          </div>

          <div className="pro-grid">
            {[
              { title: 'Real estate agencies', desc: 'Outfit every agent in your roster with consistent, on-brand profile shots.', bullets: ['Bulk pack: 30 agents / 90 photos', 'Brand-color background presets'], icon: 'M3 11l9-7 9 7M5 10v10h14V10M10 20v-6h4v6' },
              { title: 'Law firms', desc: 'Editorial-grade portraits for partner pages. Conservative, courthouse-ready.', bullets: ['Conservative editorial style', 'NDA & private storage included'], icon: 'M8 7h8M8 12h8M8 17h5 M3 3h18v18H3z' },
              { title: 'Consultants & advisors', desc: 'Boardroom-grade portraits matching your pitch deck template, under an hour.', bullets: ['Pitch-deck export presets', 'Square + 3:4 + 16:9 crops'], icon: 'M12 3v18M3 9h18M3 15h18' },
              { title: 'Accounting firms', desc: 'Modernize your "Our team" page without the awkward sit-down photoshoot.', bullets: ['Warm or neutral lighting kits', 'Annual report-ready exports'], icon: 'M4 19V5l8 4 8-4v14M4 19h16' },
              { title: 'Financial advisors', desc: 'Professional shots for LinkedIn, regulatory filings, and prospectus.', bullets: ['FINRA-friendly neutral framing', 'Re-shoot any agent in 90 seconds'], icon: 'M3 21h18M5 21V8l7-5 7 5v13M10 21v-6h4v6' },
              { title: 'Recruiting & HR', desc: 'Onboard new hires with a polished portrait on day one.', bullets: ['Day-one onboarding template', 'ATS & Slack avatar exports'], icon: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75' },
            ].map(card => (
              <article key={card.title} className="pro-card">
                <div className="pro-icon">
                  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d={card.icon}/>
                  </svg>
                </div>
                <h3>{card.title}</h3>
                <p>{card.desc}</p>
                <ul className="pro-bullets">
                  {card.bullets.map(b => <li key={b}>{b}</li>)}
                </ul>
              </article>
            ))}
          </div>

          <div className="pros-banner">
            <div className="pros-banner-text">
              <h3>Need more than 1,000 credits a month?</h3>
              <p>We work with agencies and enterprises on custom packages, dedicated rendering capacity and SSO.</p>
            </div>
            <div className="pros-banner-stats">
              <div><strong>50%+</strong><span>cheaper than studio shoots</span></div>
              <div><strong>90 sec</strong><span>per pack of 3 photos</span></div>
              <div><strong>1,200+</strong><span>teams onboarded</span></div>
            </div>
          </div>
        </div>
      </section>

      {/* ── FINAL CTA ── */}
      <section className="final-cta">
        <svg className="section-wave top dark" viewBox="0 0 1440 80" preserveAspectRatio="none" aria-hidden="true">
          <path d="M0,40 C240,8 480,72 720,40 C960,8 1200,72 1440,40 L1440,80 L0,80 Z" fill="#e3eeff"/>
        </svg>
        <div className="fc-inner">
          <h2>Your next headshot is ninety seconds away.</h2>
          <p>Professional photos, delivered instantly. No studio, no waiting.</p>
          <button className="cta" style={{ maxWidth: 360, margin: '0 auto' }} onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
            <span>Upload selfies &amp; generate</span>
            <svg viewBox="0 0 20 20" width="18" height="18" fill="currentColor"><path d="M3 10h12.2l-4.6-4.6 1.4-1.4L19 10l-7 7-1.4-1.4 4.6-4.6H3z"/></svg>
          </button>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="footer">
        <div className="footer-grid">
          <div className="footer-brand">
            <a href="#top" className="logo">
              <span className="logo-mark">
                <svg viewBox="0 0 32 32" width="26" height="26" fill="none">
                  <rect x="1" y="1" width="30" height="30" rx="8" fill="#0B66E4"/>
                  <circle cx="16" cy="13" r="5" fill="#fff"/>
                  <path d="M6 28c1.8-5.5 6-8 10-8s8.2 2.5 10 8" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" fill="none"/>
                </svg>
              </span>
              <span className="logo-text">ProFace<span className="logo-text-accent">App</span></span>
            </a>
            <p>AI professional headshots for people who don't have time for a photoshoot.</p>
          </div>
          <div>
            <h4>Product</h4>
            <ul>
              <li><a href="#pricing">Pricing</a></li>
              <li><a href="#teams">For teams</a></li>
              <li><a href="#gallery">Gallery</a></li>
              <li><a href="#how">How it works</a></li>
              <li><button style={{ background:'none', border:'none', color:'var(--blue)', cursor:'pointer', fontSize:14, padding:0 }} onClick={() => openAuth('signup')}>Sign up</button></li>
            </ul>
          </div>
          <div>
            <h4>Company</h4>
            <ul>
              <li><a href="#">About</a></li>
              <li><a href="#">Press kit</a></li>
              <li><button style={{ background:'none', border:'none', color:'var(--blue)', cursor:'pointer', fontSize:14, padding:0, textAlign:'left' }} onClick={() => setContactOpen(true)}>Contact</button></li>
            </ul>
          </div>
          <div>
            <h4>Legal</h4>
            <ul>
              <li><a href="#">Privacy policy</a></li>
              <li><a href="#">Terms of service</a></li>
              <li><a href="#">Cookies</a></li>
            </ul>
          </div>
          <div>
            <h4>Follow</h4>
            <ul className="social">
              <li><a href="#">X / Twitter</a></li>
              <li><a href="#">LinkedIn</a></li>
              <li><a href="#">Instagram</a></li>
            </ul>
          </div>
        </div>
        <div className="footer-bottom">
          <p>© 2026 ProFaceApp · profaceapp.com — All rights reserved.</p>
          <p className="legal-small">ProFaceApp is an independent AI tool. Not affiliated with any social network.</p>
        </div>
      </footer>

      {/* ── AUTH MODAL ── */}
      {authOpen && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setAuthOpen(false); }}>
          <div className="modal-content" role="dialog" aria-modal="true">
            <button className="close-modal" onClick={() => setAuthOpen(false)}>×</button>
            <div className="modal-tabs">
              <button className={`tab-btn${authTab === 'login' ? ' active' : ''}`} onClick={() => { setAuthTab('login'); setAuthError(''); }}>Log in</button>
              <button className={`tab-btn${authTab === 'signup' ? ' active' : ''}`} onClick={() => { setAuthTab('signup'); setAuthError(''); }}>Sign up</button>
            </div>

            {authTab === 'login' && (
              <form className="auth-form active" onSubmit={handleLogin}>
                <h3>Welcome back</h3>
                <p className="auth-sub">Enter your details to access your folders and credits.</p>
                <label className="input-group"><span>Email</span><input name="email" type="email" placeholder="name@company.com" required /></label>
                <label className="input-group"><span>Password</span><input name="password" type="password" placeholder="••••••••" required /></label>
                {authError && <p className="auth-error">{authError}</p>}
                <button type="submit" className="cta" disabled={authLoading}><span>{authLoading ? 'Signing in…' : 'Log in'}</span></button>
                <p className="auth-foot">No account? <button type="button" style={{ background:'none', border:'none', color:'var(--blue)', cursor:'pointer', fontSize:'inherit' }} onClick={() => { setAuthTab('signup'); setAuthError(''); }}>Create one</button></p>
              </form>
            )}

            {authTab === 'signup' && (
              <form className="auth-form active" onSubmit={handleSignup}>
                <h3>Create your account</h3>
                <p className="auth-sub">Start generating studio-quality headshots today.</p>
                <label className="input-group"><span>Full name</span><input name="name" type="text" placeholder="Jane Doe" required /></label>
                <label className="input-group"><span>Email</span><input name="email" type="email" placeholder="name@company.com" required /></label>
                <label className="input-group"><span>Password</span><input name="password" type="password" placeholder="Create a password (min 8 chars)" minLength={8} required /></label>
                {authError && <p className="auth-error">{authError}</p>}
                <button type="submit" className="cta" disabled={authLoading}><span>{authLoading ? 'Creating account…' : 'Create account'}</span></button>
                <p className="auth-foot">Already have an account? <button type="button" style={{ background:'none', border:'none', color:'var(--blue)', cursor:'pointer', fontSize:'inherit' }} onClick={() => { setAuthTab('login'); setAuthError(''); }}>Log in</button></p>
              </form>
            )}
          </div>
        </div>
      )}

      {/* ── GENERATE MODAL ── */}
      {genOpen && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setGenOpen(false); }}>
          <div className="modal-content gen" role="dialog" aria-modal="true">
            <button className="close-modal" onClick={() => setGenOpen(false)}>×</button>
            {!genDone ? (
              <div>
                <h3>Generating your pack…</h3>
                <p className="auth-sub">Our AI is rendering your studio-quality pack. Usually 30–90 seconds.</p>
                <div className="progress"><div className="progress-bar" style={{ width: `${genProgress}%` }}/></div>
                <p className="progress-label">{genLabel}</p>
              </div>
            ) : genError ? (
              <div>
                <h3>Generation failed</h3>
                <p className="auth-sub">{genError} Your credits have been refunded.</p>
                <div className="result-actions">
                  <button className="btn-ghost-2" onClick={() => setGenOpen(false)}>Close</button>
                </div>
              </div>
            ) : (
              <div>
                <h3>Your headshot is ready ✨</h3>
                <p className="auth-sub">Saved to <strong>My Folders</strong>. Download or view your photo.</p>
                <div className="result-grid">
                  {genPhotos.map((url, i) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={i}
                      src={url}
                      alt={`Headshot ${i + 1}`}
                      style={{ width: '100%', borderRadius: 12, objectFit: 'cover' }}
                    />
                  ))}
                </div>
                <div className="result-actions">
                  <button className="cta" onClick={() => { setGenOpen(false); router.push('/dashboard'); }}>
                    <span>Go to My Folders</span>
                  </button>
                  <button className="btn-ghost-2" onClick={() => setGenOpen(false)}>Close</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── CONTACT MODAL ── */}
      {contactOpen && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setContactOpen(false); }}>
          <div className="modal-content" role="dialog" aria-modal="true">
            <button className="close-modal" onClick={() => setContactOpen(false)}>×</button>
            <h3>Get in touch</h3>
            <p className="auth-sub">Let's talk about how ProFaceApp can help your team.</p>
            <form className="auth-form active" onSubmit={async (e) => {
              e.preventDefault();
              try {
                const res = await fetch('/api/contact', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(contactForm),
                });
                if (res.ok) {
                  window.location.href = `mailto:support@profaceapp.com?subject=Contact from ${encodeURIComponent(contactForm.name)}&body=Name: ${encodeURIComponent(contactForm.name)}%0AEmail: ${encodeURIComponent(contactForm.email)}`;
                  toast(`Message sent! We'll contact you at ${contactForm.email}`);
                  setContactForm({ name: '', email: '' });
                  setContactOpen(false);
                }
              } catch (error) {
                toast('Failed to send message');
              }
            }}>
              <label className="input-group"><span>Name</span><input type="text" placeholder="Your name" value={contactForm.name} onChange={e => setContactForm(prev => ({ ...prev, name: e.target.value }))} required /></label>
              <label className="input-group"><span>Email</span><input type="email" placeholder="you@company.com" value={contactForm.email} onChange={e => setContactForm(prev => ({ ...prev, email: e.target.value }))} required /></label>
              <button type="submit" className="cta"><span>Send message</span></button>
            </form>
          </div>
        </div>
      )}

      {/* ── TOAST ── */}
      <div className={`toast${toastVisible ? ' show' : ''}`} role="status" aria-live="polite">
        {toastMsg}
      </div>
    </>
  );
}
