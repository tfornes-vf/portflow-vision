
-- Add net_cash column to ib_trades_tsc for precise cash balance tracking
ALTER TABLE public.ib_trades_tsc ADD COLUMN IF NOT EXISTS net_cash numeric DEFAULT 0;
