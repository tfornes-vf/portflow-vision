-- Add saldo_actual column to ib_trades table for cumulative balance tracking
ALTER TABLE public.ib_trades 
ADD COLUMN IF NOT EXISTS saldo_actual numeric DEFAULT 0;

-- Add index for faster date-based queries
CREATE INDEX IF NOT EXISTS idx_ib_trades_date_time ON public.ib_trades(date_time);

-- Add index for symbol-based queries
CREATE INDEX IF NOT EXISTS idx_ib_trades_symbol ON public.ib_trades(symbol);