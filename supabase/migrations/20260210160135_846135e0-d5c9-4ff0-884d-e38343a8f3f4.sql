-- Allow DELETE on ib_trades_tsc for authenticated users (needed to clear trades)
CREATE POLICY "Authenticated users can delete TSC trades"
ON public.ib_trades_tsc
FOR DELETE
USING (auth.uid() IS NOT NULL);

-- Allow UPDATE on ib_trades_tsc for authenticated users  
CREATE POLICY "Authenticated users can update TSC trades"
ON public.ib_trades_tsc
FOR UPDATE
USING (auth.uid() IS NOT NULL);