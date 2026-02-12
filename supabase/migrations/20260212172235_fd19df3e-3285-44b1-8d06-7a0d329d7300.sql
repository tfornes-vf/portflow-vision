
-- Table to store daily NAV snapshots from IBKR NetAssetValueInBase
CREATE TABLE public.ib_nav_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  account_id TEXT NOT NULL DEFAULT 'TSC',
  report_date DATE NOT NULL,
  total NUMERIC NOT NULL DEFAULT 0,
  cash NUMERIC NOT NULL DEFAULT 0,
  stock NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Unique constraint: one row per account per date
ALTER TABLE public.ib_nav_history ADD CONSTRAINT ib_nav_history_account_date_unique UNIQUE (account_id, report_date);

-- Enable RLS
ALTER TABLE public.ib_nav_history ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Authenticated users can view NAV history"
ON public.ib_nav_history FOR SELECT
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can insert NAV history"
ON public.ib_nav_history FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update NAV history"
ON public.ib_nav_history FOR UPDATE
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can delete NAV history"
ON public.ib_nav_history FOR DELETE
USING (auth.uid() IS NOT NULL);

-- Index for fast date-range queries
CREATE INDEX idx_ib_nav_history_account_date ON public.ib_nav_history (account_id, report_date);
