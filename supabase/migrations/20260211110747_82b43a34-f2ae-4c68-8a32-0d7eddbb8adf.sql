
-- Create sync metadata table to store cash balances from IBKR reports
CREATE TABLE public.ib_sync_metadata (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  account_id text NOT NULL DEFAULT 'TSC',
  starting_cash numeric DEFAULT 0,
  ending_cash numeric DEFAULT 0,
  synced_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(account_id)
);

ALTER TABLE public.ib_sync_metadata ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view sync metadata"
  ON public.ib_sync_metadata FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can insert sync metadata"
  ON public.ib_sync_metadata FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update sync metadata"
  ON public.ib_sync_metadata FOR UPDATE
  USING (auth.uid() IS NOT NULL);
