'use client';

import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

type Pack = {
  id: string;
  status: 'processing' | 'completed' | 'failed';
  photos: string[];
  created_at: string;
  style?: string;
};

type Props = {
  user: { email: string; id: string };
  profile: { credits: number; full_name?: string };
  packs: Pack[];
};

export default function DashboardClient({ user, profile, packs }: Props) {
  const router = useRouter();
  const supabase = createClient();

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push('/');
    router.refresh();
  };

  const completedPacks = packs.filter(p => p.status === 'completed');
  const photosGenerated = completedPacks.reduce((acc, p) => acc + (p.photos?.length ?? 3), 0);

  return (
    <div className="dash-layout">
      {/* Navbar */}
      <nav className="dash-nav">
        <div className="dash-nav-inner">
          <a href="/" className="logo">
            <span className="logo-mark">
              <svg viewBox="0 0 32 32" width="26" height="26" fill="none">
                <rect x="1" y="1" width="30" height="30" rx="8" fill="#0B66E4"/>
                <circle cx="16" cy="13" r="5" fill="#fff"/>
                <path d="M6 28c1.8-5.5 6-8 10-8s8.2 2.5 10 8" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" fill="none"/>
              </svg>
            </span>
            <span className="logo-text">ProFace<span className="logo-text-accent">App</span></span>
          </a>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div className="credit-bar">
              <span className="credit-dot"/>
              <strong style={{ color: 'var(--ink)', fontSize: 14 }}>{profile.credits}</strong>
              <span style={{ color: 'var(--muted)', fontSize: 14 }}>credits remaining</span>
            </div>
            <a href="#pricing" className="btn-primary" style={{ fontSize: 13, padding: '8px 16px' }}>Buy credits</a>
            <button className="btn-ghost" onClick={handleSignOut} style={{ fontSize: 14 }}>Sign out</button>
          </div>
        </div>
      </nav>

      <div className="dash-body">
        {/* Header */}
        <div className="dash-header">
          <h1>My Folders</h1>
          <p>
            Welcome back{profile.full_name ? `, ${profile.full_name}` : ''}
            {user.email ? ` (${user.email})` : ''}.
          </p>
        </div>

        {/* Stats */}
        <div className="dash-stats">
          <div className="stat-card highlight">
            <span className="stat-label">Credits remaining</span>
            <span className="stat-value">{profile.credits}</span>
            <span className="stat-sub">1 credit = 3 professional photos</span>
          </div>
          <div className="stat-card">
            <span className="stat-label">Packs generated</span>
            <span className="stat-value">{completedPacks.length}</span>
            <span className="stat-sub">{packs.filter(p => p.status === 'processing').length} processing</span>
          </div>
          <div className="stat-card">
            <span className="stat-label">Photos created</span>
            <span className="stat-value">{photosGenerated}</span>
            <span className="stat-sub">Across all your packs</span>
          </div>
        </div>

        {/* Buy more prompt */}
        {profile.credits === 0 && (
          <div style={{
            background: 'var(--blue-50)', border: '1px solid var(--blue-100)',
            borderRadius: 'var(--r-xl)', padding: '20px 24px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            gap: 16, marginBottom: 32, flexWrap: 'wrap',
          }}>
            <div>
              <p style={{ color: 'var(--ink)', fontWeight: 600, fontSize: 15 }}>You're out of credits</p>
              <p style={{ color: 'var(--muted)', fontSize: 14, marginTop: 4 }}>Buy a pack to generate more studio-quality headshots.</p>
            </div>
            <a href="/#pricing" className="btn-primary" style={{ whiteSpace: 'nowrap', textDecoration: 'none', padding: '12px 24px', borderRadius: 12 }}>Buy credits</a>
          </div>
        )}

        {/* Packs */}
        <p className="dash-section-title">Generated packs</p>

        {packs.length === 0 ? (
          <div className="empty-state">
            <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="var(--muted-2)" strokeWidth="1.5" strokeLinecap="round">
              <rect x="3" y="3" width="18" height="18" rx="2"/>
              <path d="M3 9h18M9 21V9"/>
            </svg>
            <p>No packs yet. Upload your selfies and generate your first professional headshots.</p>
            <a href="/" style={{ display: 'inline-block', marginTop: 20, color: 'var(--blue)', fontWeight: 600 }}>
              Generate my first pack →
            </a>
          </div>
        ) : (
          <div className="packs-grid">
            {packs.map(pack => (
              <div key={pack.id} className="pack-card">
                <div className="pack-photos">
                  {pack.photos && pack.photos.length > 0
                    ? pack.photos.slice(0, 3).map((url, i) => (
                      <div key={i} className="pack-photo">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={url} alt={`Headshot ${i + 1}`} />
                      </div>
                    ))
                    : [0, 1, 2].map(i => (
                      <div key={i} className={`pack-photo placeholder${i > 0 ? '' : ''}`}
                        style={i === 1 ? { background: 'radial-gradient(circle at 50% 32%,#ddbfa3 0 30%,transparent 31%),radial-gradient(circle at 50% 72%,#1a1c2b 0 38%,transparent 39%),linear-gradient(180deg,#2b2f3c,#4b5468)' } :
                               i === 2 ? { background: 'radial-gradient(circle at 50% 32%,#f0c9a3 0 30%,transparent 31%),radial-gradient(circle at 50% 72%,#2f3a26 0 38%,transparent 39%),linear-gradient(180deg,#6b8f4d,#9bbd6f)' } : undefined}
                      />
                    ))
                  }
                </div>
                <div className="pack-meta">
                  <span className="pack-date">
                    {new Date(pack.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </span>
                  <span className={`pack-status ${pack.status}`}>{pack.status}</span>
                </div>
                {pack.status === 'completed' && pack.photos?.length > 0 && (
                  <a
                    href={pack.photos[0]}
                    download
                    className="btn-ghost-2"
                    style={{ textAlign: 'center', textDecoration: 'none', padding: '10px', borderRadius: 10, display: 'block' }}
                  >
                    Download photos
                  </a>
                )}
                {pack.status === 'processing' && (
                  <div style={{ textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
                    ⏳ Your photos are being rendered…
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
