'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { BURRFRIENDS_CHANNEL_PARENT_URL } from '~/lib/constants';
import { formatRelativeTime } from '~/lib/utils';

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
  images: string[];
  embeds: any[];
  replies_count: number;
  likes_count: number;
  recasts_count: number;
}

interface ChannelStats {
  member_count?: number;
  follower_count?: number;
}

interface FeedResponse {
  casts: Cast[];
  channelStats: ChannelStats;
  cached?: boolean;
  stale?: boolean;
  asOf?: string;
  error?: string;
}

export default function BurrfriendsFeedPage() {
  const [feed, setFeed] = useState<FeedResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchFeed() {
      try {
        setLoading(true);
        setError(null);
        const response = await fetch('/api/burrfriends-feed');
        const data = await response.json();
        
        if (!response.ok || data.error) {
          throw new Error(data.error || 'Failed to fetch feed');
        }
        
        setFeed(data);
      } catch (err) {
        console.error('[BETR WITH BURR Feed] Error:', err);
        setError(err instanceof Error ? err.message : 'Failed to load feed');
      } finally {
        setLoading(false);
      }
    }

    fetchFeed();
  }, []);

  if (loading) {
    return (
      <div style={{ padding: '20px', textAlign: 'center' }}>
        <h1 style={{ marginBottom: '20px' }}>BETR WITH BURR Channel Feed</h1>
        <p>Loading feed...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: '20px', textAlign: 'center' }}>
        <h1 style={{ marginBottom: '20px' }}>BETR WITH BURR Channel Feed</h1>
        <p style={{ color: 'red', marginBottom: '20px' }}>Error: {error}</p>
        <button
          onClick={() => window.location.reload()}
          className="btn-primary"
          style={{ padding: '10px 20px' }}
        >
          Retry
        </button>
      </div>
    );
  }

  if (!feed) {
    return (
      <div style={{ padding: '20px', textAlign: 'center' }}>
        <h1 style={{ marginBottom: '20px' }}>BETR WITH BURR Channel Feed</h1>
        <p>No feed data available.</p>
      </div>
    );
  }

  const { casts, channelStats } = feed;

  return (
    <div style={{ padding: '20px', maxWidth: '800px', margin: '0 auto' }}>
      <Link href="/clubs/burrfriends/games" className="mb-4 inline-block" style={{ color: 'var(--fire-1)' }}>
        ← Back
      </Link>
      <h1 style={{ marginBottom: '20px', textAlign: 'center' }}>BETR WITH BURR Channel Feed</h1>
      
      {/* Channel Stats Section */}
      {(channelStats.member_count !== undefined || channelStats.follower_count !== undefined) && (
        <div style={{ 
          marginBottom: '30px', 
          padding: '15px', 
          backgroundColor: 'var(--bg-secondary, #f5f5f5)', 
          borderRadius: '8px',
          textAlign: 'center'
        }}>
          {channelStats.member_count !== undefined && (
            <div style={{ marginBottom: '10px' }}>
              <strong>Members:</strong> {channelStats.member_count.toLocaleString()}
            </div>
          )}
          {channelStats.follower_count !== undefined && (
            <div>
              <strong>Followers:</strong> {channelStats.follower_count.toLocaleString()}
            </div>
          )}
        </div>
      )}

      {/* Feed Section */}
      <div style={{ marginBottom: '30px' }}>
        {casts.length === 0 ? (
          <p style={{ textAlign: 'center', color: '#666' }}>No posts available.</p>
        ) : (
          casts.map((cast) => (
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
                  <div style={{ fontWeight: 'bold' }}>
                    {cast.author.display_name || cast.author.username || `FID ${cast.author.fid}`}
                  </div>
                  {cast.author.username && cast.author.display_name && (
                    <div style={{ fontSize: '0.9em', color: '#666' }}>@{cast.author.username}</div>
                  )}
                </div>
              </div>

              {/* Cast Text */}
              <div style={{ marginBottom: '15px', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
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

              {/* Embeds (non-image) */}
              {cast.embeds && cast.embeds.length > 0 && (
                <div style={{ marginBottom: '15px' }}>
                  {cast.embeds
                    .filter((embed: any) => !embed.url || !/\.(jpg|jpeg|png|gif|webp)/i.test(embed.url))
                    .map((embed: any, idx: number) => (
                      <div
                        key={idx}
                        style={{
                          padding: '10px',
                          backgroundColor: 'var(--bg-primary, #fff)',
                          borderRadius: '4px',
                          border: '1px solid var(--border-color, #ddd)',
                          marginBottom: '10px',
                        }}
                      >
                        {embed.url && (
                          <a
                            href={embed.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ color: 'var(--link-color, #0066cc)', textDecoration: 'none' }}
                          >
                            {embed.url}
                          </a>
                        )}
                        {embed.open_graph && (
                          <div>
                            {embed.open_graph.title && (
                              <div style={{ fontWeight: 'bold', marginTop: '5px' }}>
                                {embed.open_graph.title}
                              </div>
                            )}
                            {embed.open_graph.description && (
                              <div style={{ fontSize: '0.9em', color: '#666', marginTop: '5px' }}>
                                {embed.open_graph.description}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
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
          ))
        )}
      </div>

      {/* View More Button */}
      <div style={{ textAlign: 'center', marginTop: '40px' }}>
        <a
          href={BURRFRIENDS_CHANNEL_PARENT_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-primary"
          style={{ 
            padding: '10px 20px',
            display: 'inline-block',
            textDecoration: 'none',
          }}
        >
          View more
        </a>
      </div>
    </div>
  );
}
