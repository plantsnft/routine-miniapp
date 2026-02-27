/**
 * OpenGraph and Share Text Helpers
 * Phase 27: Enhanced Share with Game-Specific Metadata & Artwork
 */

/**
 * Format prize amount for OG description (e.g., "10M", "5M", "420K")
 */
export function formatOgPrize(amount: number | null | undefined): string {
  if (!amount || amount <= 0) return '0';
  
  if (amount >= 1_000_000) {
    const millions = amount / 1_000_000;
    return millions % 1 === 0 ? `${millions}M` : `${millions.toFixed(1)}M`;
  }
  
  if (amount >= 1_000) {
    const thousands = amount / 1_000;
    return thousands % 1 === 0 ? `${thousands}K` : `${thousands.toFixed(1)}K`;
  }
  
  return String(amount);
}

/**
 * Format staking requirement for share text
 */
export function formatOgStaking(amount: number | null | undefined): string {
  if (!amount || amount <= 0) return '';
  return formatOgPrize(amount);
}

/**
 * Build share text for a game
 */
export function buildShareText(
  gameName: string,
  prizeAmount?: number | null,
  stakingAmount?: number | null
): string {
  let text = `🎮 ${gameName}`;
  
  if (prizeAmount && prizeAmount > 0) {
    text += `\n💰 Prize: ${formatOgPrize(prizeAmount)} BETR`;
  }
  
  if (stakingAmount && stakingAmount > 0) {
    text += `\n🔒 Staking: ${formatOgStaking(stakingAmount)} required`;
  }
  
  return text;
}

/**
 * Get the appropriate image for a poker game based on game type
 */
export function getPokerGameImage(gameType?: string | null): string {
  return gameType === 'large_event' ? 'sundayhighstakes.png' : 'poker.png';
}
