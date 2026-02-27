/**
 * Script to check and fix participant game_id mismatches
 * 
 * Usage:
 *   Set environment variables, then run:
 *   npx tsx scripts/fix-participant-game-id.ts <fid> <correct-game-id>
 * 
 * Or to just check what's wrong:
 *   npx tsx scripts/fix-participant-game-id.ts <fid>
 */

// Get environment variables with fallbacks
const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE || '';

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
  process.exit(1);
}

// Use REST API with schema headers (like pokerDb does)
const getServiceHeaders = () => ({
  apikey: supabaseServiceKey,
  Authorization: `Bearer ${supabaseServiceKey}`,
  'Content-Type': 'application/json',
  'Accept-Profile': 'poker',
  'Content-Profile': 'poker',
});

async function fetchParticipants(fid: number) {
  const url = `${supabaseUrl.replace(/\/$/, '')}/rest/v1/participants?fid=eq.${fid}&order=inserted_at.desc`;
  const response = await fetch(url, {
    headers: getServiceHeaders(),
  });
  
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to fetch participants: ${response.status} ${text}`);
  }
  
  return response.json();
}

async function updateParticipant(participantId: string, gameId: string) {
  const url = `${supabaseUrl.replace(/\/$/, '')}/rest/v1/participants?id=eq.${participantId}`;
  const headers = {
    ...getServiceHeaders(),
    'Prefer': 'return=representation', // Request the updated row in response
  };
  
  const response = await fetch(url, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ game_id: gameId }),
  });
  
  // Get response body as text first (can only read once)
  const text = await response.text();
  
  if (!response.ok) {
    throw new Error(`Failed to update participant: ${response.status} ${text}`);
  }
  
  // Treat 204 No Content as success (no body)
  if (response.status === 204) {
    return null; // Success but no body returned
  }
  
  // Handle empty body (even if status is 200)
  if (!text || text.trim() === '') {
    return null; // Empty body means success but no representation returned
  }
  
  // Parse JSON only if body is non-empty
  try {
    const updated = JSON.parse(text);
    return Array.isArray(updated) ? updated[0] : updated;
  } catch (e) {
    // If JSON parsing fails, treat as success (empty/invalid JSON response still means update succeeded)
    console.warn('Warning: Could not parse response JSON, but update likely succeeded:', e);
    return null;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const fid = args[0] ? parseInt(args[0], 10) : null;
  const correctGameId = args[1] || null;

  if (!fid || isNaN(fid)) {
    console.error('Usage: npx tsx scripts/fix-participant-game-id.ts <fid> [correct-game-id]');
    console.error('  fid: Your Farcaster FID');
    console.error('  correct-game-id: (optional) The correct game ID to fix to');
    process.exit(1);
  }

  console.log(`\nChecking participants for FID: ${fid}\n`);

  // Fetch all participants for this FID (poker schema)
  let participants;
  try {
    participants = await fetchParticipants(fid);
  } catch (error: any) {
    console.error('Error fetching participants:', error);
    process.exit(1);
  }

  if (!participants || participants.length === 0) {
    console.log('No participants found for this FID.');
    process.exit(0);
  }

  console.log(`Found ${participants.length} participant(s):\n`);

  // Show all participants
  for (const p of participants) {
    console.log(`Participant ID: ${p.id}`);
    console.log(`  Game ID: ${p.game_id}`);
    console.log(`  FID: ${p.fid}`);
    console.log(`  Status: ${p.status}`);
    console.log(`  Created: ${p.inserted_at}`);
    console.log('');
  }

  // If correctGameId is provided, fix the data
  if (correctGameId) {
    console.log(`\nFixing participant to game_id: ${correctGameId}\n`);

    // Find the participant to update (use the most recent one, or match by game_id if it exists)
    const participantToFix = participants.find((p: { id: string; game_id: string; fid: number; status: string }) => p.game_id === correctGameId) || participants[0];

    if (participantToFix.game_id === correctGameId) {
      console.log('Participant already has correct game_id.');
      process.exit(0);
    }

    console.log(`Updating participant ${participantToFix.id}`);
    console.log(`  Old game_id: ${participantToFix.game_id}`);
    console.log(`  New game_id: ${correctGameId}`);

    try {
      await updateParticipant(participantToFix.id, correctGameId);
    } catch (updateError: any) {
      console.error('Error updating participant:', updateError);
      process.exit(1);
    }

    console.log('\n✅ Participant updated successfully!');
    
    // Re-fetch the updated participant to confirm and display
    try {
      const updatedParticipants = await fetchParticipants(fid);
      const updatedParticipant = updatedParticipants.find((p: { id: string; game_id: string; fid: number; status: string }) => p.id === participantToFix.id);
      if (updatedParticipant) {
        console.log('\nUpdated participant record:');
        console.log(`  ID: ${updatedParticipant.id}`);
        console.log(`  Game ID: ${updatedParticipant.game_id}`);
        console.log(`  FID: ${updatedParticipant.fid}`);
        console.log(`  Status: ${updatedParticipant.status}`);
        if (updatedParticipant.game_id === correctGameId) {
          console.log('  ✅ game_id matches expected value!');
        } else {
          console.warn(`  ⚠️  game_id (${updatedParticipant.game_id}) does not match expected (${correctGameId})`);
        }
      } else {
        console.log('\n⚠️  Could not re-fetch updated participant to verify');
      }
    } catch (fetchError: any) {
      console.warn('\n⚠️  Could not re-fetch updated participant:', fetchError.message);
    }
  } else {
    console.log('\nTo fix a participant, provide the correct game_id as the second argument.');
    console.log('Example: npx tsx scripts/fix-participant-game-id.ts 318447 8d43bf7b-092c-46e7-b369-c753a23fda29');
  }
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});

