# About Page & Navigation Improvements - Implementation Plan

## Overview
This plan outlines the implementation of:
1. Back button on Burrfriends channel page
2. "About" button on homepage (5th button)
3. About page with collapsible "Club" and "About Burr" sections

---

## Phase 1: Add Back Button to Burrfriends Channel Page

### 1.1 Update `/burrfriends` Page
- **File**: `burrfriends/src/app/burrfriends/page.tsx`
- **Changes**:
  - Add back button at top of page (before h1)
  - Link back to `/clubs/burrfriends/games` (homepage)
  - Style: Match existing back button pattern from game page
  - Pattern: `<Link href="/clubs/burrfriends/games" className="mb-4 inline-block" style={{ color: 'var(--fire-1)' }}>← Back</Link>`

### 1.2 Implementation Details
- Use Next.js `Link` component for navigation
- Follow existing pattern from `src/app/games/[id]/page.tsx` (line 841)
- Style: `color: 'var(--fire-1)'` (teal accent color)
- Position: Above page content, left-aligned
- Text: "← Back" or "← Back to Home"

---

## Phase 2: Add "About" Button to Homepage

### 2.1 Update Homepage Navigation
- **File**: `burrfriends/src/app/clubs/[slug]/games/page.tsx`
- **Changes**:
  - Add 5th button: "About" 
  - Position: Inline with existing 4 buttons (Create New Game, Previous Games, Club GG, Burrfriends)
  - Link to `/about` route
  - Ensure all 5 buttons fit on one line (may need to adjust font size/padding)

### 2.2 Button Styling
- Match existing button styles (`padding: '4px 8px'`, `fontSize: '8px'`)
- Ensure `flexWrap: 'nowrap'` is maintained
- **OPTIMIZATION**: If 5 buttons don't fit, consider:
  - Reduce font size to `7px` for all buttons
  - Reduce padding to `3px 6px` for all buttons
  - Or allow wrapping on very small screens with `flexWrap: 'wrap'` as fallback
- Test responsive behavior on mobile devices

---

## Phase 3: Create About Page Structure

### 3.1 Create About Page Route
- **File**: `burrfriends/src/app/about/page.tsx` (new file)
- **Component Type**: `'use client'` (required for collapsible interactivity and API calls)
- **Structure**:
  - **Page Layout**: Follow app pattern:
    - `<main className="min-h-screen p-8" style={{ background: 'var(--bg-0)' }}>`
    - `<div className="max-w-4xl mx-auto">` (matches homepage and game pages - consistent with most pages)
    - **Note**: Channel feed uses `maxWidth: '800px'` inline style, but About page should use `max-w-4xl` to match homepage/game pages
  - **Page header**: "About" (h1, centered or left-aligned)
  - **Two collapsible sections**:
    1. "Club" section
    2. "About Burr" section
  - **Styling**: Use app CSS variables (`var(--bg-0)`, `var(--text-primary)`, etc.)
  - **Cards**: Use `hl-card` class for section containers (matches existing pattern)
  - **Authentication**: About page does NOT require authentication (informational page, similar to channel feed)

### 3.2 Collapsible Component
- **File**: `burrfriends/src/components/CollapsibleSection.tsx` (new file)
- **Features**:
  - Expand/collapse functionality (use useState for isOpen state)
  - Smooth animation (CSS transition on max-height or opacity)
  - Chevron icon indicating state (▶ when closed, ▼ when open) - **EXACT pattern from game page**
  - Accessible (keyboard navigation, ARIA attributes: `aria-expanded`, `aria-controls`)
- **Pattern Reference**: **EXACT pattern** from "Prize Payout Structure" collapsible in `src/app/games/[id]/page.tsx` (lines 921-940)
  - Button with `onClick` to toggle state
  - Chevron: `{isOpen ? '▼' : '▶'}`
  - Conditional render: `{isOpen && <div>content</div>}`
  - Styling: `className="w-full flex items-center justify-between text-left"` with `background: 'none'`, `border: 'none'`
- **Props**: `title: string`, `children: React.ReactNode`, `defaultOpen?: boolean`
- **Container**: Wrap in `hl-card` for consistent styling

---

## Phase 4: Club Section Content

### 4.1 Club Information
- **Content to include**:
  - **Club Description**: "A private Farcaster poker club that runs games via the ClubGG app (Club ID: 183586). Rules emphasize community > extraction."
  - **ClubGG Link**: `https://clubgg.app.link/fFMQldwxAZb` (link to ClubGG)
  - **ClubGG Club ID**: 183586 (display as reference info)
  - **Club Rules**: 
    1. Match your Warpcast handle to your screenname
    2. Don't sit out
    3. Support sponsors
    4. Be kind
  - **Game Types**: Regular SNG/OS/tourneys with staking/passcode entry mechanics and $BETR-linked prize tiers
  - **Channel Link**: Link to `https://warpcast.com/~/channel/burrfrens` (Farcaster channel)

### 4.2 Implementation
- **File**: `burrfriends/src/app/about/page.tsx`
- Display in "Club" collapsible section (wrapped in `hl-card` with `style={{ padding: '12px' }}`)
- Format: Clean, readable layout with:
  - Club description paragraph (use `p` tag with `style={{ color: 'var(--text-muted)', marginBottom: '12px', lineHeight: '1.6' }}`)
  - Rules as bulleted list (use `ul` with `li` items, styled with app colors)
    - Pattern: `<ul style={{ marginLeft: '20px', marginBottom: '12px' }}><li style={{ color: 'var(--text-muted)', marginBottom: '8px' }}>Rule text</li></ul>`
  - Game types as brief summary (paragraph with muted color)
  - Links (ClubGG, Channel) as clickable buttons/links
    - Use `btn-primary` class for prominent action links (matches game page ClubGG button pattern)
    - Pattern: `<a href={CLUBGG_LINK} target="_blank" rel="noopener noreferrer" className="btn-primary" style={{ display: 'inline-block', marginTop: '12px', marginRight: '8px' }}>Join ClubGG</a>`
  - ClubGG Club ID displayed as reference (smaller text, `text-xs` class, muted color)
- Links should open in new tab with proper security attributes (`target="_blank"`, `rel="noopener noreferrer"`)
- **Styling**: Use app CSS variables and existing classes (`hl-card`, `btn-primary`, `text-xs`, etc.)
- **Spacing**: Use consistent margins (`marginBottom: '12px'`, `marginTop: '12px'`) matching existing patterns

### 4.3 Constants
- **File**: `burrfriends/src/lib/constants.ts`
- Add:
  - `CLUBGG_LINK = "https://clubgg.app.link/fFMQldwxAZb"`
  - `CLUBGG_CLUB_ID = "183586"`
  - `BURRFRIENDS_CHANNEL_URL = "https://warpcast.com/~/channel/burrfrens"`
  - `CLUB_DESCRIPTION = "A private Farcaster poker club that runs games via the ClubGG app (Club ID: 183586). Rules emphasize community > extraction."`
  - `CLUB_RULES = ["Match your Warpcast handle to your screenname", "Don't sit out", "Support sponsors", "Be kind"]`
  - `CLUB_GAME_TYPES = "Regular SNG/OS/tourneys with staking/passcode entry mechanics and $BETR-linked prize tiers"`

---

## Phase 5: About Burr Section Content

### 5.1 Burr Information
- **Content to include**:
  - **Name**: Melissa Burr (burr.eth)
  - **Short Bio**: "Community organizer/runner of /burrfrens, host of poker tourneys, involved in betrmint/$BETR events and Farcaster pods; frequent announcer of tourneys, stakes, and rules."
  - **Note**: "Do not tag them if you're surprising."
  - **X (Twitter) Link**: `https://x.com/burrrrrberry`
  - **Recent Burr Casts**: Fetch from Neynar API (FID: 311933)
  - **Farcaster Profile**: Link to Burr's Farcaster profile (can derive from FID or username)

### 5.2 Recent Casts Implementation
- **API Endpoint**: Create `/api/burr-casts` endpoint
- **Functionality**:
  - Fetch recent casts from Burr's FID (311933)
  - Use Neynar API: `GET https://api.neynar.com/v2/farcaster/feed/user/casts?fid=311933&limit=10`
  - Display last 10 casts (default)
  - Show: text, timestamp, engagement counts (likes, replies, recasts)
  - **Format**: **EXACT same format as channel feed** (`src/app/burrfriends/page.tsx` lines 135-266)
    - Same card styling (`hl-card` or similar background/border)
    - Same author display (pfp, name, username)
    - Same engagement counts display
    - Same timestamp formatting (use `formatRelativeTime` utility)
  - Include link to view cast on Farcaster (if hash available)
  - Add loading state while fetching (spinner or "Loading casts...")
  - Add error handling with retry option (similar to channel feed error handling)

### 5.3 Constants
- **File**: `burrfriends/src/lib/constants.ts`
- Add:
  - `BURR_FID = 311933`
  - `BURR_NAME = "Melissa Burr"`
  - `BURR_USERNAME = "burr.eth"` (or fetch from Neynar API)
  - `BURR_BIO = "Community organizer/runner of /burrfrens, host of poker tourneys, involved in betrmint/$BETR events and Farcaster pods; frequent announcer of tourneys, stakes, and rules."`
  - `BURR_NOTE = "Do not tag them if you're surprising."`
  - `BURR_X_URL = "https://x.com/burrrrrberry"`
  - `BURR_FARCASTER_PROFILE_URL` (can construct from FID or fetch username from Neynar - e.g., `https://warpcast.com/burr.eth`)

---

## Phase 6: Burr Casts API Endpoint

### 6.1 Create API Route
- **File**: `burrfriends/src/app/api/burr-casts/route.ts` (new file)
- **Method**: GET
- **Functionality**:
  - Fetch casts from Neynar API for FID 311933
  - Return last 10 casts
  - Include: text, timestamp, author info, engagement counts
  - **Response Format**: Match channel feed API structure:
    ```typescript
    {
      casts: Array<{
        hash: string;
        text: string;
        timestamp: string | number;
        author: { fid, username, display_name, pfp_url };
        replies_count: number;
        likes_count: number;
        recasts_count: number;
        images?: string[];
        embeds?: any[];
      }>;
      ok: boolean;
      error?: string;
    }
    ```
  - **Error Handling**: Return `{ ok: false, error: "...", casts: [] }` on failure
  - **Pattern**: Follow same structure as `src/app/api/burrfriends-feed/route.ts` for consistency

### 6.2 Implementation Strategy (OPTIMIZED)
- **Start Simple**: Direct API call on page load (no caching initially)
- **API Endpoint**: `GET https://api.neynar.com/v2/farcaster/feed/user/casts?fid=311933&limit=10`
- **API Call Pattern**: Follow existing Neynar API patterns:
  - Use `getNeynarClient()` from `~/lib/neynar` OR direct fetch with `x-api-key` header
  - Handle errors gracefully (try/catch, structured error responses)
  - Format casts consistently (same structure as channel feed)
- **Response Format**: Match channel feed API structure (see 6.1)
- **Rationale**:
  - About page is visited less frequently than channel feed
  - 1 API call per About page visit is acceptable
  - Simpler implementation (no database table, no cron job needed)
  - Can add caching later if traffic increases

### 6.3 Future Optimization (If Needed)
- If About page becomes popular, add caching:
  - **Table**: `poker.burr_casts_cache` (similar to channel feed cache)
  - **Refresh**: Combine with existing channel feed cron OR add manual refresh endpoint
  - **Note**: Vercel Hobby plan only allows 1 cron job (already used for channel feed)

---

## Implementation Order (OPTIMIZED)

### Step 1: Phase 1 - Back Button ✅
- Quick win, simple implementation
- Improves navigation UX immediately
- **Can be done independently**

### Step 2: Phase 3 - About Page Structure ✅
- **MUST be done before Phase 2** (button needs page to exist)
- Create page and collapsible component
- Placeholder content initially
- Page should exist (even if empty) before adding button

### Step 3: Phase 2 - About Button ✅
- Add navigation button AFTER page exists
- Test that all 5 buttons fit on one line
- May need to reduce font size to `7px` or adjust padding if needed

### Step 4: Phase 4 - Club Section ✅
- Add ClubGG link (known: `https://clubgg.app.link/fFMQldwxAZb`)
- Add ClubGG Club ID: 183586
- Add club description (provided)
- Add club rules (4 rules provided)
- Add game types summary (provided)
- Add channel link to `/burrfrens` channel
- Format as clean, readable layout

### Step 5: Phase 6 - Burr Casts API (Simplified)
- **OPTIMIZATION**: Start with direct API call (no caching initially)
- Fetch casts on-demand when About page loads
- Use endpoint: `GET https://api.neynar.com/v2/farcaster/feed/user/casts?fid=311933&limit=10`
- Format response similar to channel feed for consistency
- Add error handling and loading states
- **Reason**: About page is less frequently visited, direct API call is acceptable

### Step 6: Phase 5 - About Burr Section ✅
- Add name: "Melissa Burr (burr.eth)"
- Add bio (provided)
- Add note: "Do not tag them if you're surprising."
- Add X link: `https://x.com/burrrrrberry`
- Add Farcaster profile link (can construct from FID or fetch username)
- Display casts from Phase 6 API
- Add loading/error states
- Format casts similar to channel feed display

---

## Questions to Resolve

1. ~~**Stock Info**: What stock information should be displayed?~~ **RESOLVED**: Not needed - club description mentions "$BETR-linked prize tiers" which is sufficient
2. ~~**Club Rules**: Where are the club rules?~~ **RESOLVED**: Rules provided - see Phase 4.1
3. ~~**Burr's Bio**: What is Burr's short bio text?~~ **RESOLVED**: Bio provided - see Phase 5.1
4. ~~**Burr's X URL**: What is Burr's X/Twitter profile URL?~~ **RESOLVED**: `https://x.com/burrrrrberry`
5. ~~**Burr's Farcaster Username**: Is it "burr.eth" or should we fetch from Neynar API?~~ **RESOLVED**: Use "burr.eth" as provided, can enhance later to fetch from Neynar API if needed
6. ~~**Casts Caching**: Should Burr's casts be cached?~~ **OPTIMIZED**: Start with direct API call, add caching later if needed
7. **Number of Casts**: How many recent casts to show? (default: 10)

---

## Files to Create/Modify

### New Files:
1. `burrfriends/src/app/about/page.tsx` - About page
2. `burrfriends/src/components/CollapsibleSection.tsx` - Reusable collapsible component
3. `burrfriends/src/app/api/burr-casts/route.ts` - API endpoint for Burr's casts (direct API call, no caching initially)
4. `burrfriends/supabase_migration_burr_casts_cache.sql` - Database migration (OPTIONAL - only if caching needed later)

### Modified Files:
1. `burrfriends/src/app/burrfriends/page.tsx` - Add back button
2. `burrfriends/src/app/clubs/[slug]/games/page.tsx` - Add About button
3. `burrfriends/src/lib/constants.ts` - Add new constants

---

## Testing Checklist

- [ ] Back button appears on `/burrfriends` page
- [ ] Back button navigates to homepage correctly
- [ ] About button appears on homepage (5th button)
- [ ] All 5 buttons fit on one line (or wrap gracefully on mobile)
- [ ] About page loads correctly
- [ ] Collapsible sections expand/collapse smoothly
- [ ] Collapsible sections are accessible (keyboard navigation works)
- [ ] Club section shows club description
- [ ] Club section shows ClubGG link (opens correctly in new tab)
- [ ] Club section shows ClubGG Club ID (183586)
- [ ] Club section shows all 4 rules correctly (bulleted list)
- [ ] Club section shows game types summary
- [ ] Club section shows channel link (opens correctly in new tab)
- [ ] About Burr section shows name (Melissa Burr / burr.eth)
- [ ] About Burr section shows bio correctly
- [ ] About Burr section shows note about tagging
- [ ] About Burr section shows X link (opens correctly in new tab)
- [ ] About Burr section shows Farcaster profile link (opens correctly)
- [ ] About Burr section displays recent casts
- [ ] Casts display correctly (text, timestamp, engagement counts)
- [ ] Casts loading state works (spinner while fetching)
- [ ] Casts error handling works (error message, retry option)
- [ ] Mobile responsive design works
- [ ] All links open in new tabs with proper security (`rel="noopener noreferrer"`)

---

## Notes

- Follow existing code patterns and styling **EXACTLY**
- Ensure end-to-end functionality
- **Page Layout**: Use `<main className="min-h-screen p-8" style={{ background: 'var(--bg-0)' }}>` and `<div className="max-w-4xl mx-auto">` (matches all other pages)
- **Styling**: Use app CSS variables (`var(--bg-0)`, `var(--text-primary)`, `var(--fire-1)`, etc.) and existing classes (`hl-card`, `btn-primary`, `text-xs`)
- **Back Button**: Follow exact pattern from game page (`← Back` with `color: 'var(--fire-1)'`)
- **Collapsible**: Use EXACT pattern from game page (lines 921-940) - same button structure, chevron icons, conditional rendering
- **Cast Display**: Use EXACT same format as channel feed page (same card styling, author display, engagement counts, timestamp formatting)
- **API Rate Limits**: Direct API call is acceptable for About page (less frequent visits)
- **Loading States**: Add loading spinner while fetching casts (use existing loading patterns)
- **Error Handling**: Gracefully handle API failures (show error message, allow retry) - follow channel feed error handling pattern
- **Performance**: If About page becomes popular, consider adding caching later
- **Vercel Cron Limitation**: Only 1 cron job allowed on Hobby plan (already used for channel feed)
- **Content Updates**: All content is now provided - Club info, Burr bio, and X URL are all available
- **Farcaster Profile Link**: Can construct URL from username (e.g., `https://warpcast.com/burr.eth`) or fetch from Neynar API
- **External Links**: Always use `target="_blank" rel="noopener noreferrer"` (matches existing pattern)
- **Channel Link**: Use `https://warpcast.com/~/channel/burrfrens` (note: "burrfrens" not "burrfriends")
- **Utilities**: Use `formatRelativeTime` from `~/lib/utils.ts` for timestamp formatting (same as channel feed)

## Key Optimizations Made

1. ✅ **Fixed Implementation Order**: About page created before About button
2. ✅ **Simplified Caching**: Start with direct API call, add caching later if needed
3. ✅ **Button Layout**: Added fallback options if 5 buttons don't fit
4. ✅ **API Endpoint**: Confirmed correct Neynar endpoint for user casts
5. ✅ **Resource Efficiency**: Avoids unnecessary database table and cron job initially
6. ✅ **Content Integration**: Incorporated provided club description, rules, and Burr bio
7. ✅ **Club Details**: Added ClubGG Club ID, channel link, and game types summary
8. ✅ **Burr Details**: Added name, bio, note, X URL, and Farcaster profile link structure
9. ✅ **Collapsible Pattern**: Found existing pattern in codebase to follow for consistency
10. ✅ **All Content Provided**: All required information is now available (club rules, Burr bio, X URL)

## Content Summary (From User)

### Club Section:
- **Description**: "A private Farcaster poker club that runs games via the ClubGG app (Club ID: 183586). Rules emphasize community > extraction."
- **Rules**: 
  1. Match your Warpcast handle to your screenname
  2. Don't sit out
  3. Support sponsors
  4. Be kind
- **Game Types**: Regular SNG/OS/tourneys with staking/passcode entry mechanics and $BETR-linked prize tiers
- **Channel**: `/burrfrens` on Farcaster
- **ClubGG Club ID**: 183586

### About Burr Section:
- **Name**: Melissa Burr (burr.eth)
- **Bio**: "Community organizer/runner of /burrfrens, host of poker tourneys, involved in betrmint/$BETR events and Farcaster pods; frequent announcer of tourneys, stakes, and rules."
- **Note**: "Do not tag them if you're surprising."
- **X URL**: `https://x.com/burrrrrberry`
- **FID**: 311933

## End-to-End Flow Verification

### User Journey 1: Navigate to About Page
1. User on homepage (`/clubs/burrfriends/games`)
2. User clicks "About" button (5th button in navigation)
3. Navigates to `/about` page
4. Page loads with app layout (background, max-width container)
5. Sees page header "About"
6. Sees two collapsible sections: "Club" and "About Burr"
7. Both sections start collapsed (or can be set to one open by default)

### User Journey 2: View Club Information
1. User on `/about` page
2. User clicks "Club" section header (chevron ▶)
3. Section expands smoothly (chevron changes to ▼)
4. Section shows:
   - Club description paragraph
   - 4 club rules (bulleted list)
   - Game types summary
   - ClubGG link button (opens in new tab)
   - Channel link button (opens in new tab)
   - ClubGG Club ID (smaller text, reference info)

### User Journey 3: View About Burr
1. User on `/about` page
2. User clicks "About Burr" section header (chevron ▶)
3. Section expands smoothly (chevron changes to ▼)
4. Section shows:
   - Name: "Melissa Burr (burr.eth)"
   - Bio paragraph
   - Note about tagging (styled differently, maybe italic or smaller)
   - X link button (opens in new tab)
   - Farcaster profile link (opens in new tab)
   - Recent casts section:
     - Loading state: "Loading casts..." or spinner
     - Success: Displays 10 casts (same format as channel feed)
     - Error: Shows error message with retry button

### User Journey 4: Navigate Back from Channel Feed
1. User on `/burrfriends` page (channel feed)
2. User sees back button at top (← Back)
3. User clicks back button
4. Navigates back to `/clubs/burrfriends/games` (homepage)

### User Journey 5: View Burr Casts
1. User on `/about` page, "About Burr" section expanded
2. Casts API is called automatically on page load
3. Loading state shows while fetching
4. Casts display in same format as channel feed:
   - Author info (pfp, name, username)
   - Cast text
   - Images (if any)
   - Engagement counts (likes, replies, recasts)
   - Timestamp (relative time, e.g., "2 hours ago")
   - Link to view on Farcaster (if hash available)

## Technical Verification

### ✅ API Endpoint Confirmed
- Neynar API: `GET /v2/farcaster/feed/user/casts?fid=311933&limit=10`
- Returns array of cast objects with all needed fields
- Response structure matches channel feed API pattern

### ✅ Component Patterns
- **Collapsible**: Found existing pattern in game page (lines 921-940) - will use EXACT same structure
- **Button styling**: Existing patterns in homepage (8px font, 4px 8px padding) - About button matches
- **Link components**: Next.js Link for internal, `<a>` with `target="_blank" rel="noopener noreferrer"` for external
- **Back button**: Pattern from game page (line 841) - simple Link with teal color

### ✅ Page Layout Patterns
- **Main container**: `<main className="min-h-screen p-8" style={{ background: 'var(--bg-0)' }}>`
- **Content wrapper**: `<div className="max-w-4xl mx-auto">` (matches homepage, game pages)
- **Cards**: Use `hl-card` class for section containers
- **Styling**: All CSS variables and classes match existing app design system

### ✅ Constants Structure
- All constants defined in `constants.ts`
- All content provided (no TBD items remaining)
- Constants follow existing naming patterns

### ✅ Responsive Design
- Button layout has fallbacks for mobile (font size reduction, padding adjustment, or wrap)
- Collapsible sections work on all screen sizes (same pattern as game page)
- About page uses max-width container (`max-w-4xl`) matching other pages
- Page padding (`p-8`) matches other pages

### ✅ Error Handling
- API errors handled gracefully (follow channel feed error handling pattern)
- Loading states for async operations (spinner or text, matches existing patterns)
- Retry mechanisms where appropriate (button to retry on error)

### ✅ Styling Consistency
- Uses app CSS variables (`var(--bg-0)`, `var(--text-primary)`, `var(--fire-1)`, etc.)
- Uses existing classes (`hl-card`, `btn-primary`, `btn-secondary`, `text-xs`)
- Matches existing page layouts and spacing
- Follows existing color scheme (teal accents, dark background)

### ✅ Cast Display Consistency
- Same format as channel feed page (`/burrfriends`)
- Same card styling, author display, engagement counts
- Same timestamp formatting (uses `formatRelativeTime` utility)
- Same image/embed handling

## Final Status: ✅ READY FOR IMPLEMENTATION

All content is provided, all technical details are confirmed, and the plan is optimized for end-to-end functionality. The implementation order is correct, and all edge cases are considered.

## Pattern Matching Verification

### ✅ Page Layout
- **Pattern**: `<main className="min-h-screen p-8" style={{ background: 'var(--bg-0)' }}>`
- **Container**: `<div className="max-w-4xl mx-auto">` (matches homepage, game pages)
- **About page will match**: ✅

### ✅ Back Button
- **Pattern**: `<Link href="..." className="mb-4 inline-block" style={{ color: 'var(--fire-1)' }}>← Back</Link>`
- **Location**: Game page line 841
- **About page will match**: ✅

### ✅ Collapsible Component
- **Pattern**: Button with `onClick` toggle, chevron (▶/▼), conditional render
- **Location**: Game page lines 921-940
- **About page will match**: ✅

### ✅ Cast Display
- **Pattern**: Card with author info, text, images, engagement counts, timestamp
- **Location**: Channel feed page lines 135-266
- **About page will match**: ✅

### ✅ External Links
- **Pattern**: `<a href="..." target="_blank" rel="noopener noreferrer" className="btn-primary">`
- **Location**: Game page lines 1171-1188
- **About page will match**: ✅

### ✅ Styling
- **CSS Variables**: `var(--bg-0)`, `var(--text-primary)`, `var(--fire-1)`, etc.
- **Classes**: `hl-card`, `btn-primary`, `text-xs`, etc.
- **About page will match**: ✅

### ✅ Loading/Error States
- **Pattern**: Loading text/spinner, error message with retry
- **Location**: Channel feed page lines 68-90
- **About page will match**: ✅

## Final Verification Checklist

- [x] Page structure matches existing pages (`main` + `max-w-4xl` container)
- [x] Back button matches game page pattern
- [x] Collapsible matches game page pattern exactly
- [x] Cast display matches channel feed format exactly
- [x] External links use proper security attributes
- [x] All styling uses app CSS variables and classes
- [x] Loading/error states follow existing patterns
- [x] All content provided (no TBD items)
- [x] API endpoint confirmed and tested
- [x] Implementation order is correct
- [x] Button layout has responsive fallbacks
- [x] All utilities imported correctly (`formatRelativeTime`)

**Status**: ✅ **PLAN IS COMPLETE AND READY FOR IMPLEMENTATION**
