# BUDDY UP – Deep links and "Open Mini App" frame

## 4.1 Deep link `?gameId=` (required on v1 and v2)

- **On load:** Both `/buddy-up` and `/buddy-up-v2` read `?gameId=` from the URL on mount. If present, they select that game, fetch it, and show the correct view (signup, in-progress, or settled).
- **If 404:** When `gameId` is in the URL but the game is not found or has ended, the app shows: "This game doesn't exist or has ended" with a link to the BUDDY UP list.
- **Notifications:** Game-created, game-started, and round-started notifications use `targetUrl: /buddy-up?gameId=...` so tapping them opens the app with the game selected. v1 must support this because it is still live.

## 4.2 "Open Mini App" frame button

- **Behaviour:** The "Open Mini App" button in Farcaster frames/embeds may **not** forward `?gameId=` (or other query params) when opening the miniapp. This is a known platform/client limitation.
- **What we control:** We **do not** control the frame SDK or how Neynar/Farcaster opens the miniapp. We can only ensure our app and notifications behave correctly when the user reaches a URL that includes `?gameId=`.
- **Recommendation:** Use the **raw URL** (e.g. `https://your-domain/buddy-up?gameId=xxx`) when sharing. When the user follows that link, the client opens the miniapp with the full URL and 4.1 applies. For notifications, we set `targetUrl` with `?gameId=`; opening from the notification should use that full URL.
- **If "Open Mini App" fails:** Document for users: if the frame’s "Open Mini App" does not open the right game, copy or tap the raw URL instead. 4.1 covers the raw-URL case.

## Checklist

- [x] v1 and v2 read `?gameId=` on mount.
- [x] 404 / ended game: show "This game doesn't exist or has ended" + link to list.
- [x] Notifications: `targetUrl` includes `?gameId=`.
- [x] Open Mini App: documented; rely on 4.1 for raw URL.

---

## Scheduled-game countdown ("Next BUDDY UP in 2h") — implemented

- **DB:** `poker.buddy_up_schedule` (singleton row `id=1`): `next_run_at` (timestamptz, nullable), `updated_at`, `updated_by_fid`.
- **API:** `GET /api/buddy-up/next-run` returns `{ nextRunAt: string | null }`; if `next_run_at` is in the past, clears it and returns null. `POST /api/buddy-up/schedule` (admin): body `{ clear: true }` or `{ inHours: number }` or `{ nextRunAt: string }`.
- **Games page:** BUDDY UP card shows "Next BUDDY UP in Xh Xm" / "Xm Xs" when `next_run_at` is in the future (1s tick). Admin: "Next: 1h | 2h | 3h | Clear". No auto-creation of games; display only.
- The **in-round** countdown ("Advancing in X:XX") is in Phase 4: admin sets 1–5 min when completing a round; "Start Round" is disabled until the countdown ends.
