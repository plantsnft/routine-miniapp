'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { CollapsibleSection } from '~/components/CollapsibleSection';
import { formatRelativeTime } from '~/lib/utils';
import {
  CLUBGG_LINK,
  CLUBGG_CLUB_ID,
  BURRFRIENDS_CHANNEL_URL,
  CLUB_DESCRIPTION,
  CLUB_RULES,
  CLUB_GAME_TYPES,
  BURR_FID,
  BURR_NAME,
  BURR_USERNAME,
  BURR_BIO,
  BURR_X_URL,
  BURR_FARCASTER_PROFILE_URL,
} from '~/lib/constants';

interface Cast {
  hash: string;
  text: string;
  timestamp: string | number;
  author: {
    fid: number;
    username?: string;
    display_name?: string;
    pfp_url?: string;
  };
  images?: string[];
  embeds?: any[];
  replies_count: number;
  likes_count: number;
  recasts_count: number;
}

interface BurrCastsResponse {
  casts: Cast[];
  ok: boolean;
  error?: string;
}

export default function AboutPage() {
  const [casts, setCasts] = useState<Cast[]>([]);
  const [castsLoading, setCastsLoading] = useState(true);
  const [castsError, setCastsError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchCasts() {
      try {
        setCastsLoading(true);
        setCastsError(null);
        const response = await fetch('/api/burr-casts');
        const data: BurrCastsResponse = await response.json();
        
        if (!response.ok || !data.ok || data.error) {
          throw new Error(data.error || 'Failed to fetch casts');
        }
        
        setCasts(data.casts || []);
      } catch (err) {
        console.error('[About Page] Error fetching Burr casts:', err);
        setCastsError(err instanceof Error ? err.message : 'Failed to load casts');
      } finally {
        setCastsLoading(false);
      }
    }

    fetchCasts();
  }, []);

  return (
    <main className="min-h-screen p-8" style={{ background: 'var(--bg-0)' }}>
      <div className="max-w-4xl mx-auto">
        <Link href="/clubs/burrfriends/games" className="mb-4 inline-block" style={{ color: 'var(--fire-1)' }}>
          ← Back
        </Link>
        <h1 className="text-3xl font-bold mb-6" style={{ color: 'var(--text-primary)', fontWeight: 700 }}>
          About
        </h1>

        {/* Club Section */}
        <CollapsibleSection title="Club" defaultOpen={false}>
          <div style={{ color: 'var(--text-muted)', lineHeight: '1.6' }}>
            {/* Club Description */}
            <p style={{ marginBottom: '12px', color: 'var(--text-muted)' }}>
              {CLUB_DESCRIPTION}
            </p>

            {/* Club Rules */}
            <div style={{ marginBottom: '12px' }}>
              <h3 style={{ color: 'var(--text-primary)', fontWeight: 600, marginBottom: '8px', fontSize: '1rem' }}>
                Rules
              </h3>
              <ul style={{ marginLeft: '20px', marginBottom: '12px' }}>
                {CLUB_RULES.map((rule, idx) => (
                  <li key={idx} style={{ color: 'var(--text-muted)', marginBottom: '8px' }}>
                    {rule}
                  </li>
                ))}
              </ul>
            </div>

            {/* Game Types */}
            <p style={{ marginBottom: '12px', color: 'var(--text-muted)' }}>
              <strong style={{ color: 'var(--text-primary)' }}>Game Types:</strong> {CLUB_GAME_TYPES}
            </p>

            {/* ClubGG Club ID */}
            <p style={{ marginBottom: '12px', fontSize: '0.75rem', color: 'rgba(255, 255, 255, 0.52)' }}>
              ClubGG Club ID: {CLUBGG_CLUB_ID}
            </p>

            {/* Links */}
            <div style={{ marginTop: '16px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <a
                href={CLUBGG_LINK}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-primary"
                style={{ display: 'inline-block', marginTop: '0' }}
              >
                Join ClubGG
              </a>
              <a
                href={BURRFRIENDS_CHANNEL_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-secondary"
                style={{ display: 'inline-block', marginTop: '0' }}
              >
                View Channel
              </a>
            </div>
          </div>
        </CollapsibleSection>

        {/* About Burr Section */}
        <CollapsibleSection title="About Burr" defaultOpen={false}>
          <div style={{ color: 'var(--text-muted)', lineHeight: '1.6' }}>
            {/* Name */}
            <h3 style={{ color: 'var(--text-primary)', fontWeight: 600, marginBottom: '8px', fontSize: '1rem' }}>
              {BURR_NAME} ({BURR_USERNAME})
            </h3>

            {/* Bio */}
            <p style={{ marginBottom: '12px', color: 'var(--text-muted)' }}>
              {BURR_BIO}
            </p>

            {/* Links */}
            <div style={{ marginTop: '16px', marginBottom: '20px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {BURR_X_URL && (
                <a
                  href={BURR_X_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-primary"
                  style={{ display: 'inline-block', marginTop: '0' }}
                >
                  View on X
                </a>
              )}
              {BURR_FARCASTER_PROFILE_URL && (
                <a
                  href={BURR_FARCASTER_PROFILE_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-secondary"
                  style={{ display: 'inline-block', marginTop: '0' }}
                >
                  View on Farcaster
                </a>
              )}
            </div>

            {/* Recent Casts */}
            <div style={{ marginTop: '24px' }}>
              <h3 style={{ color: 'var(--text-primary)', fontWeight: 600, marginBottom: '12px', fontSize: '1rem' }}>
                Recent Casts
              </h3>
              
              {castsLoading && (
                <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '20px' }}>
                  Loading casts...
                </p>
              )}

              {castsError && (
                <div style={{ textAlign: 'center', padding: '20px' }}>
                  <p style={{ color: 'var(--fire-2)', marginBottom: '12px' }}>Error: {castsError}</p>
                  <button
                    onClick={() => window.location.reload()}
                    className="btn-primary"
                    style={{ padding: '10px 20px' }}
                  >
                    Retry
                  </button>
                </div>
              )}

              {!castsLoading && !castsError && casts.length === 0 && (
                <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '20px' }}>
                  No casts available.
                </p>
              )}

              {!castsLoading && !castsError && casts.length > 0 && (
                <div>
                  {casts.slice(0, 3).map((cast) => (
                    <div
                      key={cast.hash}
                      style={{
                        marginBottom: '30px',
                        padding: '20px',
                        backgroundColor: 'var(--bg-2)',
                        borderRadius: '8px',
                        border: '1px solid var(--stroke)',
                      }}
                    >
                      {/* Author Info */}
                      <div style={{ display: 'flex', alignItems: 'center', marginBottom: '15px' }}>
                        {cast.author.pfp_url && (
                          <img
                            src={cast.author.pfp_url}
                            alt={cast.author.display_name || cast.author.username || 'User'}
                            style={{
                              width: '40px',
                              height: '40px',
                              borderRadius: '50%',
                              marginRight: '10px',
                            }}
                          />
                        )}
                        <div>
                          <div style={{ fontWeight: 'bold', color: 'var(--text-primary)' }}>
                            {cast.author.display_name || cast.author.username || `FID ${cast.author.fid}`}
                          </div>
                          {cast.author.username && cast.author.display_name && (
                            <div style={{ fontSize: '0.9em', color: '#666' }}>@{cast.author.username}</div>
                          )}
                        </div>
                      </div>

                      {/* Cast Text */}
                      <div style={{ marginBottom: '15px', whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: 'var(--text-primary)' }}>
                        {cast.text}
                      </div>

                      {/* Images */}
                      {cast.images && cast.images.length > 0 && (
                        <div style={{ marginBottom: '15px' }}>
                          {cast.images.map((imageUrl, idx) => (
                            <img
                              key={idx}
                              src={imageUrl}
                              alt={`Image ${idx + 1}`}
                              style={{
                                maxWidth: '100%',
                                borderRadius: '8px',
                                marginBottom: '10px',
                                display: 'block',
                              }}
                            />
                          ))}
                        </div>
                      )}

                      {/* Engagement Counts */}
                      <div style={{ 
                        display: 'flex', 
                        gap: '15px', 
                        fontSize: '0.9em', 
                        color: '#666',
                        marginBottom: '10px'
                      }}>
                        {cast.replies_count > 0 && (
                          <span>💬 {cast.replies_count}</span>
                        )}
                        {cast.likes_count > 0 && (
                          <span>❤️ {cast.likes_count}</span>
                        )}
                        {cast.recasts_count > 0 && (
                          <span>🔄 {cast.recasts_count}</span>
                        )}
                      </div>

                      {/* Timestamp */}
                      <div style={{ fontSize: '0.85em', color: '#999' }}>
                        {formatRelativeTime(
                          typeof cast.timestamp === 'string' 
                            ? cast.timestamp 
                            : new Date(cast.timestamp * 1000)
                        )}
                      </div>
                    </div>
                  ))}

                  {/* View More Button */}
                  <div style={{ marginTop: '20px', textAlign: 'center' }}>
                    <a
                      href={BURR_FARCASTER_PROFILE_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn-primary"
                      style={{ 
                        display: 'inline-block',
                        padding: '10px 20px',
                        textDecoration: 'none'
                      }}
                    >
                      View More
                    </a>
                  </div>
                </div>
              )}
            </div>
          </div>
        </CollapsibleSection>
      </div>
    </main>
  );
}
