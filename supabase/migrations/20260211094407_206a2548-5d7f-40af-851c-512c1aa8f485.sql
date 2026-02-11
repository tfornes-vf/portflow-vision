
-- Create table for TSC open positions from IBKR
CREATE TABLE public.ib_open_positions_tsc (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  symbol text NOT NULL,
  quantity numeric NOT NULL DEFAULT 0,
  cost_price numeric NOT NULL DEFAULT 0,
  market_price numeric NOT NULL DEFAULT 0,
  market_value numeric NOT NULL DEFAULT 0,
  unrealized_pnl numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'USD',
  account_id text NOT NULL DEFAULT 'TSC',
  position_date timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(symbol, account_id)
);

-- Enable RLS
ALTER TABLE public.ib_open_positions_tsc ENABLE ROW LEVEL SECURITY;

-- RLS policies matching ib_trades_tsc pattern
CREATE POLICY "Authenticated users can view TSC positions"
ON public.ib_open_positions_tsc FOR SELECT
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can insert TSC positions"
ON public.ib_open_positions_tsc FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update TSC positions"
ON public.ib_open_positions_tsc FOR UPDATE
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can delete TSC positions"
ON public.ib_open_positions_tsc FOR DELETE
USING (auth.uid() IS NOT NULL);
