import { NeynarAPIClient, Configuration } from '@neynar/nodejs-sdk';
import { NEYNAR_API_KEY } from './constants';

let neynarClient: NeynarAPIClient | null = null;

export function getNeynarClient() {
  if (!neynarClient) {
    if (!NEYNAR_API_KEY) {
      throw new Error('NEYNAR_API_KEY not configured');
    }
    const config = new Configuration({ apiKey: NEYNAR_API_KEY });
    neynarClient = new NeynarAPIClient(config);
  }
  return neynarClient;
}

/**
 * Fetch FID for a Farcaster username
 */
export async function fetchFidByUsername(username: string): Promise<number | null> {
  try {
    const client = getNeynarClient();
    const result = await client.searchUser(username);
    
    if (result.result?.users && result.result.users.length > 0) {
      return result.result.users[0].fid;
    }
    
    return null;
  } catch (error) {
    console.error(`[Neynar] Failed to fetch FID for username ${username}:`, error);
    return null;
  }
}
