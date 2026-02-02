/**
 * MaxPreps Scraping Script
 * 
 * Scrapes historical basketball data from MaxPreps for College Park district teams.
 * 
 * Teams to scrape (for 2005-06 and 2006-07):
 * - College Park
 * - Lufkin
 * - Conroe
 * - The Woodlands
 * - Oak Ridge
 * - Magnolia
 * (Plus any other teams in district those years)
 * 
 * Usage: node scripts/scrape-maxpreps.mjs
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import https from 'https';
import { parse } from 'node-html-parser';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: join(__dirname, '..', '.env.local') });

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE, {
  db: { schema: 'basketball' },
});

// Rate limiting: wait between requests
const DELAY_MS = 2000; // 2 seconds between requests

// MaxPreps base URLs
const MAXPREPS_BASE = 'https://www.maxpreps.com';
const COLLEGE_PARK_BASE = `${MAXPREPS_BASE}/tx/the-woodlands/college-park-cavaliers/basketball`;

// Years to scrape
const YEARS = [2005, 2006]; // 2005-06 and 2006-07 seasons

// Helper: Sleep function
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Helper: Fetch HTML from URL
async function fetchHTML(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode === 200) {
          resolve(data);
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${url}`));
        }
      });
    }).on('error', reject);
  });
}

// Helper: Parse players from all-time roster page (by season section only)
// Target season e.g. 2005-06; we take only the text between that heading and the next season.
function parsePlayerStatsFromAllTime(html, year) {
  const root = parse(html);
  const players = [];
  const yearLabel = `${year}-${String(year + 1).slice(-2)}`; // e.g. 2005-06
  const bodyText = root.text || '';

  // Find the segment for this season only: between "2005-06" and the next different "20XX-XX"
  const seasonStart = bodyText.indexOf(yearLabel);
  if (seasonStart === -1) {
    return players;
  }
  const afterOurSeason = bodyText.slice(seasonStart + yearLabel.length);
  const seasonPattern = /\d{4}-\d{2}/g;
  let nextSeasonIndex = afterOurSeason.length;
  let m;
  while ((m = seasonPattern.exec(afterOurSeason)) !== null) {
    if (m[0] !== yearLabel) {
      nextSeasonIndex = m.index;
      break;
    }
  }
  const segment = afterOurSeason.slice(0, nextSeasonIndex);

  // Player patterns: "LastName, FirstName(Sr.)" or "LastName, FirstName (Sr.)"
  const patterns = [
    /([^,(]+),\s*([^()]+)\s*\((?:Fr\.?|So\.?|Jr\.?|Sr\.?|Freshman|Sophomore|Junior|Senior)\)/gi,
    /([^,(]+),\s*([^()]+)\((?:Fr\.?|So\.?|Jr\.?|Sr\.?)\)/gi,
  ];

  const seen = new Set();
  for (const re of patterns) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(segment)) !== null) {
      const lastName = m[1].trim();
      const firstName = m[2].trim();
      const name = firstName ? `${firstName} ${lastName}`.trim() : lastName;
      if (name.length < 2 || seen.has(name)) continue;
      seen.add(name);
      const gradeMatch = m[0].match(/\((Fr\.?|So\.?|Jr\.?|Sr\.?|Freshman|Sophomore|Junior|Senior)\)/i);
      let yearInSchool = null;
      if (gradeMatch) {
        const g = gradeMatch[1].toLowerCase();
        if (g.startsWith('fr')) yearInSchool = 'Freshman';
        else if (g.startsWith('so')) yearInSchool = 'Sophomore';
        else if (g.startsWith('jr')) yearInSchool = 'Junior';
        else if (g.startsWith('sr')) yearInSchool = 'Senior';
      }
      players.push({
        name,
        position: null,
        year_in_school: yearInSchool,
        height_inches: 75,
        ppg: null,
        rpg: null,
        apg: null,
        spg: null,
        bpg: null,
        mpg: null,
      });
    }
  }

  return players;
}

// Helper: Parse team standings
function parseTeamStandings(html, year) {
  const root = parse(html);
  const standings = {
    district_wins: null,
    district_losses: null,
    overall_wins: null,
    overall_losses: null,
    points_for: null,
    points_against: null,
    district_rank: null,
  };
  
  // Look for standings table or summary
  // MaxPreps structure varies, try multiple approaches
  const standingsText = root.text;
  
  // Try to find "District: X-Y" or "Overall: X-Y" patterns
  const districtMatch = standingsText.match(/District[:\s]+(\d+)[-\s]+(\d+)/i);
  const overallMatch = standingsText.match(/Overall[:\s]+(\d+)[-\s]+(\d+)/i);
  
  if (districtMatch) {
    standings.district_wins = parseInt(districtMatch[1]);
    standings.district_losses = parseInt(districtMatch[2]);
  }
  
  if (overallMatch) {
    standings.overall_wins = parseInt(overallMatch[1]);
    standings.overall_losses = parseInt(overallMatch[2]);
  }
  
  return standings;
}

// Helper: Parse schedule
function parseSchedule(html, year, teamName) {
  const root = parse(html);
  const games = [];
  
  // Look for schedule table
  const rows = root.querySelectorAll('tr, .game-row, [data-game-id]');
  
  for (const row of rows) {
    try {
      const dateCell = row.querySelector('td:first-child, .game-date');
      const opponentCell = row.querySelector('td:nth-child(2), .opponent');
      const scoreCell = row.querySelector('td:nth-child(3), .score');
      const locationCell = row.querySelector('td:nth-child(4), .location');
      
      if (!dateCell || !opponentCell) continue;
      
      const dateText = dateCell.text.trim();
      const opponentText = opponentCell.text.trim();
      const scoreText = scoreCell?.text.trim() || '';
      const locationText = locationCell?.text.trim() || '';
      
      // Parse date
      let gameDate = null;
      try {
        // Try various date formats
        const dateMatch = dateText.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
        if (dateMatch) {
          gameDate = new Date(`${dateMatch[3]}-${dateMatch[1]}-${dateMatch[2]}`);
        }
      } catch (e) {
        // Date parsing failed, skip
      }
      
      // Parse score
      let homeScore = null;
      let awayScore = null;
      let winner = null;
      let margin = null;
      
      if (scoreText) {
        const scoreMatch = scoreText.match(/(\d+)[-\s]+(\d+)/);
        if (scoreMatch) {
          const score1 = parseInt(scoreMatch[1]);
          const score2 = parseInt(scoreMatch[2]);
          
          // Determine home/away from location or assume first is home
          const isHome = locationText.toLowerCase().includes('home') || !locationText.toLowerCase().includes('away');
          
          if (isHome) {
            homeScore = score1;
            awayScore = score2;
            winner = score1 > score2 ? teamName : opponentText;
          } else {
            homeScore = score2;
            awayScore = score1;
            winner = score2 > score1 ? opponentText : teamName;
          }
          
          margin = Math.abs(score1 - score2);
        }
      }
      
      if (opponentText && opponentText.length > 1) {
        games.push({
          game_date: gameDate,
          home_team_name: locationText.toLowerCase().includes('away') ? opponentText : teamName,
          away_team_name: locationText.toLowerCase().includes('away') ? teamName : opponentText,
          home_score: homeScore,
          away_score: awayScore,
          winner_team_name: winner,
          margin: margin,
        });
      }
    } catch (err) {
      console.warn(`  ⚠️  Error parsing game row:`, err.message);
    }
  }
  
  return games;
}

// Main scraping function for a team
async function scrapeTeam(teamName, teamUrl, year) {
  console.log(`\n📊 Scraping ${teamName} (${year}-${year + 1})...`);
  
  try {
    // 1. Scrape roster (all-time roster has players by season)
    console.log(`  📋 Fetching roster (all-time)...`);
    const rosterUrl = `${teamUrl}/roster/all-time/`;
    await sleep(DELAY_MS);
    const rosterHTML = await fetchHTML(rosterUrl);
    const players = parsePlayerStatsFromAllTime(rosterHTML, year);
    console.log(`  ✅ Found ${players.length} players`);
    
    // 2. Scrape standings
    console.log(`  📊 Fetching standings...`);
    const standingsUrl = `${teamUrl}/standings/`;
    await sleep(DELAY_MS);
    const standingsHTML = await fetchHTML(standingsUrl);
    const standings = parseTeamStandings(standingsHTML, year);
    console.log(`  ✅ Standings: District ${standings.district_wins}-${standings.district_losses}, Overall ${standings.overall_wins}-${standings.overall_losses}`);
    
    // 3. Scrape schedule
    console.log(`  📅 Fetching schedule...`);
    const scheduleUrl = `${teamUrl}/schedule/`;
    await sleep(DELAY_MS);
    const scheduleHTML = await fetchHTML(scheduleUrl);
    const games = parseSchedule(scheduleHTML, year, teamName);
    console.log(`  ✅ Found ${games.length} games`);
    
    return { players, standings, games };
    
  } catch (error) {
    console.error(`  ❌ Error scraping ${teamName}:`, error.message);
    return { players: [], standings: {}, games: [] };
  }
}

// Store data in database
async function storeTeamData(teamName, year, data) {
  console.log(`\n💾 Storing ${teamName} data for ${year}...`);
  
  try {
    // 1. Store historical team
    const { data: teamData, error: teamError } = await supabase
      .from('historical_teams')
      .upsert({
        name: teamName,
        historical_year: year,
        district_wins: data.standings.district_wins,
        district_losses: data.standings.district_losses,
        overall_wins: data.standings.overall_wins,
        overall_losses: data.standings.overall_losses,
        points_for: data.standings.points_for,
        points_against: data.standings.points_against,
        district_rank: data.standings.district_rank,
        team_strength_rating: null, // Will calculate later
        maxpreps_url: `${MAXPREPS_BASE}/tx/the-woodlands/${teamName.toLowerCase().replace(/\s+/g, '-')}/basketball`,
      }, {
        onConflict: 'name,historical_year',
      });
    
    if (teamError) throw teamError;
    console.log(`  ✅ Stored team data`);
    
    // 2. Store players
    for (const player of data.players) {
      const { error: playerError } = await supabase
        .from('historical_players')
        .upsert({
          name: player.name,
          historical_year: year,
          team_name: teamName,
          position: player.position,
          height_inches: player.height_inches,
          year_in_school: player.year_in_school,
          ppg: player.ppg,
          rpg: player.rpg,
          apg: player.apg,
          spg: player.spg,
          bpg: player.bpg,
          mpg: player.mpg,
          starting_rating: null, // Will calculate later
          potential_rating: null, // Will calculate later
          best_season_year: null, // Will calculate later
          maxpreps_url: null,
        }, {
          onConflict: 'name,historical_year,team_name',
        });
      
      if (playerError) {
        console.warn(`  ⚠️  Error storing player ${player.name}:`, playerError.message);
      }
    }
    console.log(`  ✅ Stored ${data.players.length} players`);
    
    // 3. Store schedule (use insert - no unique constraint on this table)
    for (const game of data.games) {
      const { error: gameError } = await supabase
        .from('historical_schedules')
        .insert({
          historical_year: year,
          game_date: game.game_date,
          home_team_name: game.home_team_name,
          away_team_name: game.away_team_name,
          home_score: game.home_score,
          away_score: game.away_score,
          winner_team_name: game.winner_team_name,
          margin: game.margin,
          is_district_game: false, // Will determine later
          is_out_of_conference: true, // Will determine later
          expected_win_probability: null, // Will calculate later
          maxpreps_url: null,
        });
      
      if (gameError) {
        console.warn(`  ⚠️  Error storing game:`, gameError.message);
      }
    }
    console.log(`  ✅ Stored ${data.games.length} games`);
    
  } catch (error) {
    console.error(`  ❌ Error storing data:`, error.message);
    throw error;
  }
}

// Main function
async function main() {
  console.log('🚀 Starting MaxPreps scraping...\n');
  console.log('⚠️  NOTE: This script uses basic HTML parsing.');
  console.log('   MaxPreps may have dynamic content that requires browser automation.');
  console.log('   If this fails, we may need to use Puppeteer/Playwright.\n');
  
  // Teams to scrape (will need to find actual URLs from MaxPreps)
  const teams = [
    { name: 'College Park', url: COLLEGE_PARK_BASE },
    // Add other teams once we have their URLs
  ];
  
  for (const year of YEARS) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`📅 YEAR: ${year}-${year + 1}`);
    console.log('='.repeat(60));
    
    for (const team of teams) {
      const data = await scrapeTeam(team.name, team.url, year);
      await storeTeamData(team.name, year, data);
      await sleep(DELAY_MS * 2); // Extra delay between teams
    }
  }
  
  console.log('\n✅ Scraping complete!');
  console.log('\n📝 Next steps:');
  console.log('   1. Review scraped data in Supabase');
  console.log('   2. Calculate player ratings');
  console.log('   3. Calculate team strength ratings');
  console.log('   4. Mark district games in historical_schedules');
}

main().catch(console.error);
