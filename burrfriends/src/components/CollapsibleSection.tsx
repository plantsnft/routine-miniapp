'use client';

import { useState, ReactNode } from 'react';

interface CollapsibleSectionProps {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
}

/**
 * CollapsibleSection - Reusable collapsible component
 * Follows exact pattern from game page (Prize Payout Structure)
 */
export function CollapsibleSection({ title, children, defaultOpen = false }: CollapsibleSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="mb-4 hl-card" style={{ padding: '12px' }}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between text-left"
        style={{ 
          background: 'none', 
          border: 'none', 
          cursor: 'pointer',
          padding: '4px 0'
        }}
        aria-expanded={isOpen}
        aria-controls={`collapsible-${title.toLowerCase().replace(/\s+/g, '-')}`}
      >
        <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
          {title}
        </span>
        <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
          {isOpen ? '▼' : '▶'}
        </span>
      </button>
      {isOpen && (
        <div 
          id={`collapsible-${title.toLowerCase().replace(/\s+/g, '-')}`}
          className="mt-3" 
          style={{ paddingLeft: '8px' }}
        >
          {children}
        </div>
      )}
    </div>
  );
}
