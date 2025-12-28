-- Migration: Add contract address field for payment escrow
-- Run this in Supabase SQL Editor

-- Add escrow contract address to games table
ALTER TABLE public.games
  ADD COLUMN IF NOT EXISTS escrow_contract_address text;

COMMENT ON COLUMN public.games.escrow_contract_address IS 'Address of the GameEscrow contract on Base network for this game';

