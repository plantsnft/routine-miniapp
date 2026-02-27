'use client';

import { useEffect, useState } from 'react';

/**
 * PreviewBanner - Shows a banner if user is on a preview deployment
 * This helps avoid confusion when testing preview URLs
 */
export function PreviewBanner() {
  const [isPreview, setIsPreview] = useState(false);
  const [host, setHost] = useState<string>('');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const currentHost = window.location.host;
      setHost(currentHost);
      // Check if it's a Vercel preview URL (not prod)
      // Production URLs: burrfriends.vercel.app (main production)
      // Preview URLs: any other *.vercel.app domain (e.g., burrfriends-xxx.vercel.app)
      const isVercelPreview = currentHost.includes('vercel.app') && 
                              currentHost !== 'burrfriends.vercel.app';
      setIsPreview(isVercelPreview);
    }
  }, []);

  if (!isPreview) {
    return null;
  }

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        backgroundColor: '#ff6b6b',
        color: '#fff',
        padding: '8px',
        textAlign: 'center',
        fontSize: '12px',
        fontWeight: 'bold',
        zIndex: 10000,
        borderBottom: '2px solid #ff5252',
      }}
    >
      ⚠️ PREVIEW DEPLOYMENT: {host} — Auth may not work correctly
    </div>
  );
}

