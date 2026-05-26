'use client';

import { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

// Module-level Set survives React StrictMode unmount/remount cycles
const confirmedSessions = new Set<string>();

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
  const [downloading, setDownloading] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get('session_id');
    if (!sessionId) return;
    // Module-level Set persists across StrictMode unmount/remount — unlike useRef
    if (confirmedSessions.has(sessionId)) return;
    confirmedSessions.add(sessionId);
    fetch(`/api/checkout/confirm?session_id=${encodeURIComponent(sessionId)}`)
      .then(r => r.json())
      .then(data => {
        if (data.credited) {
          const url = new URL(window.location.href);
          url.searchParams.delete('session_id');
          url.searchParams.delete('checkout');
          window.history.replaceState({}, '', url.toString());
          router.refresh();
        }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push('/');
    router.refresh();
  };

  const handleDownload = useCallback(async (photoUrl: string, filename: string) => {
    try {
      setDownloading(filename);
      const res = await fetch(`/api/download?url=${encodeURIComponent(photoUrl)}`);
      if (!res.ok) throw new Error('Download failed');
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(objectUrl);
    } catch {
      alert('Download failed. Please try again.');
    } finally {
      setDownloading(null);
    }
  }, []);

  const completedPacks = packs.filter(p => p.status === 'completed');
  const photosGenerated = completedPacks.reduce((acc, p) => acc + (p.photos?.length ?? 1), 0);

  return (
    <div className="dash-layout">
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
            <a href="/#pricing" className="btn-primary" style={{ fontSize: 13, padding: '8px 16px' }}>Buy credits</a>
            <button className="btn-ghost" onClick={handleSignOut} style={{ fontSize: 14 }}>Sign out</button>
          </div>
        </div>
      </nav>

      <div className="dash-body">
        <div className="dash-header">
          <h1>My Photos</h1>
          <p>
            Welcome back{profile.full_name ? `, ${profile.full_name}` : ''}
            {user.email ? ` (${user.email})` : ''}.
          </p>
        </div>

        <div className="dash-stats">
          <div className="stat-card highlight">
            <span className="stat-label">Credits remaining</span>
            <span className="stat-value">{profile.credits}</span>
            <span className="stat-sub">100 credits = 1 professional photo</span>
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

        {profile.credits < 100 && (
          <div style={{
            background: 'var(--blue-50)', border: '1px solid var(--blue-100)',
            borderRadius: 'var(--r-xl)', padding: '20px 24px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            gap: 16, marginBottom: 32, flexWrap: 'wrap',
          }}>
            <div>
              <p style={{ color: 'var(--ink)', fontWeight: 600, fontSize: 15 }}>
                {profile.credits === 0 ? "You're out of credits" : 'Not enough credits'}
              </p>
              <p style={{ color: 'var(--muted)', fontSize: 14, marginTop: 4 }}>
                You need at least 100 credits to generate a professional headshot.
              </p>
            </div>
            <a href="/#pricing" className="btn-primary" style={{ whiteSpace: 'nowrap', textDecoration: 'none', padding: '12px 24px', borderRadius: 12 }}>Buy credits</a>
          </div>
        )}

        <p className="dash-section-title">Generated photos</p>

        {packs.length === 0 ? (
          <div className="empty-state">
            <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="var(--muted-2)" strokeWidth="1.5" strokeLinecap="round">
              <rect x="3" y="3" width="18" height="18" rx="2"/>
              <path d="M3 9h18M9 21V9"/>
            </svg>
            <p>No photos yet. Upload your selfie and generate your first professional headshot.</p>
            <a href="/" style={{ display: 'inline-block', marginTop: 20, color: 'var(--blue)', fontWeight: 600 }}>
              Generate my first photo
            </a>
          </div>
        ) : (
          <div className="packs-grid">
            {packs.map(pack => (
              <div key={pack.id} className="pack-card">
                <div className="pack-photos">
                  {pack.photos && pack.photos.length > 0
                    ? pack.photos.slice(0, 1).map((url, i) => (
                        <div key={i} className="pack-photo" style={{ position: 'relative' }}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={url} alt={`Headshot ${i + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 8 }} />
                          <button
                            onClick={() => handleDownload(url, `headshot-${pack.id}-${i + 1}.png`)}
                            disabled={downloading === `headshot-${pack.id}-${i + 1}.png`}
                            style={{
                              position: 'absolute', bottom: 6, right: 6,
                              background: 'rgba(0,0,0,0.72)', color: '#fff',
                              border: 'none', borderRadius: 8, padding: '5px 10px',
                              fontSize: 12, fontWeight: 600, cursor: 'pointer',
                            }}
                          >
                            {downloading === `headshot-${pack.id}-${i + 1}.png` ? '...' : 'Download'}
                          </button>
                        </div>
                      ))
                    : [0].map(i => (
                        <div key={i} className="pack-photo" style={{ background: '#e0e0e0', borderRadius: 8 }} />
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
                  <button
                    onClick={async () => {
                      for (let i = 0; i < pack.photos.length; i++) {
                        await handleDownload(pack.photos[i], `headshot-${pack.id}-${i + 1}.png`);
                      }
                    }}
                    className="btn-ghost-2"
                    style={{ width: '100%', marginTop: 8, padding: '10px', borderRadius: 10, cursor: 'pointer' }}
                  >
                    Download all ({pack.photos.length})
                  </button>
                )}

                {pack.status === 'processing' && (
                  <div style={{ textAlign: 'center', color: 'var(--muted)', fontSize: 13, marginTop: 8 }}>
                    Your photo is being rendered...
                  </div>
                )}

                {pack.status === 'failed' && (
                  <div style={{ textAlign: 'center', color: '#e55', fontSize: 13, marginTop: 8 }}>
                    Generation failed. 100 credits refunded.
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
