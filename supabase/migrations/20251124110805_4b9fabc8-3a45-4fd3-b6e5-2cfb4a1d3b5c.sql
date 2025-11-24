-- Add is_mandatory column to tag_categories
ALTER TABLE public.tag_categories
ADD COLUMN is_mandatory boolean DEFAULT false;

-- Create transactions table for transaction history
CREATE TABLE public.transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid NOT NULL REFERENCES public.assets(id) ON DELETE CASCADE,
  transaction_type text NOT NULL CHECK (transaction_type IN ('buy', 'sell')),
  quantity numeric NOT NULL,
  price numeric NOT NULL,
  transaction_date date NOT NULL DEFAULT CURRENT_DATE,
  notes text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- Enable RLS on transactions
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

-- Create policies for transactions
CREATE POLICY "Admins can manage transactions"
  ON public.transactions
  FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Enabled users can view transactions"
  ON public.transactions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.user_id = auth.uid()
      AND profiles.is_enabled = true
    )
  );

-- Add trigger for updated_at on transactions
CREATE TRIGGER update_transactions_updated_at
  BEFORE UPDATE ON public.transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();