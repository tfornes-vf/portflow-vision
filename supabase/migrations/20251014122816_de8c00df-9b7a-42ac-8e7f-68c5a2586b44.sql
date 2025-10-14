-- Add foreign key relationship between trades and asset_aliases
ALTER TABLE public.trades ADD COLUMN asset_alias_id UUID REFERENCES public.asset_aliases(id) ON DELETE SET NULL;