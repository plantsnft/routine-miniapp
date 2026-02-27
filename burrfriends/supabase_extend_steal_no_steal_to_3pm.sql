-- One-off: Extend the most recent STEAL OR NO STEAL game (matches with latest deadline) until 3 PM EST tomorrow.
-- Targets: matches 04ce9c36... and aec0dadd... (both from the same round, deadline 2026-02-24 06:04 UTC).

-- 3 PM EST tomorrow = 2026-02-25 15:00 Eastern
-- negotiation_ends_at: now so players are immediately in decision phase
-- decision_deadline: 3 PM EST tomorrow

UPDATE poker.steal_no_steal_matches
SET
  negotiation_ends_at = NOW() - INTERVAL '1 minute',
  decision_deadline = '2026-02-25 15:00:00-05',
  updated_at = NOW()
WHERE status = 'active'
  AND id IN (
    '04ce9c36-db36-4037-9cb9-afce6a1e825b',
    'aec0dadd-0635-4e7f-902e-dd0a2fe2a2d5'
  );
