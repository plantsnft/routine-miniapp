'use client';

import { useEffect, useState } from 'react';

interface HealthInfo {
  status: string;
  version?: string;
  buildSha?: string;
  chainId?: number;
  contractAddress?: string | null;
}

/**
 * App Footer Component
 * Displays build version/SHA and health info for debugging
 */
export default function AppFooter() {
  const [healthInfo, setHealthInfo] = useState<HealthInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Fetch health info on mount
    fetch('/api/health')
      .then((res) => res.json())
      .then((data) => {
        setHealthInfo(data);
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
      });
  }, []);

  if (loading || !healthInfo) {
    return null; // Don't show footer until loaded
  }

  return (
    <footer className="border-t border-gray-200 dark:border-gray-800 mt-auto py-2 px-4 text-xs text-gray-500 dark:text-gray-400">
      <div className="flex flex-col sm:flex-row justify-between items-center gap-1">
        <div className="flex items-center gap-3">
          {healthInfo.version && (
            <span>
              v{healthInfo.version}
            </span>
          )}
          {healthInfo.buildSha && (
            <span className="font-mono">
              {healthInfo.buildSha}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {healthInfo.chainId && (
            <span>
              Chain: {healthInfo.chainId}
            </span>
          )}
          {healthInfo.contractAddress && (
            <span className="font-mono text-[10px]">
              {healthInfo.contractAddress.slice(0, 6)}...{healthInfo.contractAddress.slice(-4)}
            </span>
          )}
        </div>
      </div>
    </footer>
  );
}

