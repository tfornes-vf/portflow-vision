-- Create table for TSC account trades (separate from main ib_trades)
CREATE TABLE public.ib_trades_tsc (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ib_trade_id TEXT NOT NULL UNIQUE,
  symbol TEXT NOT NULL,
  asset_class TEXT NOT NULL,
  date_time TIMESTAMP WITH TIME ZONE NOT NULL,
  side TEXT NOT NULL,
  quantity NUMERIC NOT NULL,
  price NUMERIC NOT NULL,
  amount NUMERIC NOT NULL,
  commission NUMERIC NOT NULL,
  currency TEXT NOT NULL,
  realized_pnl NUMERIC,
  account_id TEXT NOT NULL,
  saldo_actual NUMERIC DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.ib_trades_tsc ENABLE ROW LEVEL SECURITY;

-- Create RLS policies (same as ib_trades)
CREATE POLICY "Authenticated users can view TSC trades" 
ON public.ib_trades_tsc 
FOR SELECT 
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can insert TSC trades" 
ON public.ib_trades_tsc 
FOR INSERT 
WITH CHECK (auth.uid() IS NOT NULL);

-- Create index for performance
CREATE INDEX idx_ib_trades_tsc_date_time ON public.ib_trades_tsc(date_time);
CREATE INDEX idx_ib_trades_tsc_symbol ON public.ib_trades_tsc(symbol);