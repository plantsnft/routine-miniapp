# Setting Up 24h Price Change Tracking

This document explains how to set up the 24h price change tracking system for the CATWALK token.

## Overview

The system now tracks token prices in Supabase and calculates 24h change from stored historical data. This provides a reliable fallback when external APIs (CoinGecko, DexScreener) don't provide 24h change data.

## Database Setup

1. **Run the SQL migration** in your Supabase SQL Editor:
   - Open `supabase_migration_price_history.sql`
   - Copy the entire contents
   - Paste into Supabase SQL Editor
   - Click "Run"

This will create:
- `price_history` table to store price snapshots
- Indexes for efficient queries
- Row Level Security (RLS) policies for public read/write access
- A cleanup function for old records

## How It Works

1. **Price Storage**: Every time the `/api/token-price` endpoint is called and successfully fetches a price, it stores a snapshot in the `price_history` table.

2. **24h Change Calculation**: 
   - First, the system tries to get 24h change from external APIs (CoinGecko, DexScreener)
   - If not available, it queries the database for the price from ~24 hours ago
   - Calculates the percentage change: `((current_price - price_24h_ago) / price_24h_ago) * 100`

3. **Automatic Cleanup**: The system includes a cleanup function that can be called periodically to remove records older than 7 days. You can set this up as:
   - A Vercel Cron Job (edge function)
   - A Supabase cron job
   - Or manually call it via an API endpoint

## Important Notes

- **Initial Data**: The 24h change will only show after the system has been running for at least 24 hours (to collect historical data)
- **Price Snapshots**: Prices are stored on every API call, so as long as the endpoint is called regularly (every 30 seconds from the ticker), you'll have good data
- **Non-Critical Errors**: If price storage fails, the API will still return price data (it just won't store the snapshot)

## Testing

After running the migration:

1. Wait for the ticker to make a few API calls (it refreshes every 30 seconds)
2. Check the browser console for logs like:
   - `[Token Price] Calculated 24h change from stored data: X.XX`
3. After 24 hours, you should see 24h change values in the banner

## Troubleshooting

If 24h change still shows as null:
- Check Supabase logs to ensure the `price_history` table was created
- Verify RLS policies allow public inserts
- Check browser console for any errors related to price storage
- Ensure at least 24 hours have passed since setup

