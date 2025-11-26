-- Create ib_trades table for Interactive Brokers trade data
CREATE TABLE public.ib_trades (
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
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create index on ib_trade_id for faster lookups
CREATE INDEX idx_ib_trades_ib_trade_id ON public.ib_trades(ib_trade_id);

-- Create index on date_time for time-based queries
CREATE INDEX idx_ib_trades_date_time ON public.ib_trades(date_time);

-- Create index on symbol for symbol-based queries
CREATE INDEX idx_ib_trades_symbol ON public.ib_trades(symbol);

-- Enable Row Level Security
ALTER TABLE public.ib_trades ENABLE ROW LEVEL SECURITY;

-- Policy: Allow authenticated users to view all IB trades
CREATE POLICY "Authenticated users can view IB trades" 
ON public.ib_trades 
FOR SELECT 
USING (auth.uid() IS NOT NULL);

-- Policy: Allow authenticated users to insert IB trades
CREATE POLICY "Authenticated users can insert IB trades" 
ON public.ib_trades 
FOR INSERT 
WITH CHECK (auth.uid() IS NOT NULL);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_ib_trades_updated_at
BEFORE UPDATE ON public.ib_trades
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();