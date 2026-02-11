import { useState, useEffect, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { Wallet, BarChart3, Landmark } from "lucide-react";

interface NavSummaryCardsProps {
  formatCurrency: (value: number) => string;
  refreshTrigger: number;
  trades: Array<{ symbol: string; quantity: number; price: number; date_time: string; side: string }>;
}

export function NavSummaryCards({ formatCurrency, refreshTrigger, trades }: NavSummaryCardsProps) {
  const [endingCash, setEndingCash] = useState<number | null>(null);
  const [positions, setPositions] = useState<Array<{ symbol: string; market_value: number }>>([]);

  useEffect(() => {
    fetchData();
  }, [refreshTrigger]);

  const fetchData = async () => {
    // Fetch sync metadata for endingCash
    const [metaResult, posResult] = await Promise.all([
      supabase.from("ib_sync_metadata").select("ending_cash").eq("account_id", "TSC").maybeSingle(),
      supabase.from("ib_open_positions_tsc").select("symbol, market_value").order("symbol"),
    ]);

    if (metaResult.data?.ending_cash) {
      setEndingCash(Number(metaResult.data.ending_cash));
    }
    setPositions(posResult.data || []);
  };

  // Calculate assets value from open positions or fallback to net trade positions
  const assetsValue = useMemo(() => {
    if (positions.length > 0) {
      return positions.reduce((sum, p) => sum + Math.abs(Number(p.market_value)), 0);
    }
    // Fallback: calculate net positions from trade history
    const netBySymbol: Record<string, { qty: number; lastPrice: number }> = {};
    const sorted = [...trades].sort((a, b) => new Date(a.date_time).getTime() - new Date(b.date_time).getTime());
    for (const t of sorted) {
      if (!netBySymbol[t.symbol]) netBySymbol[t.symbol] = { qty: 0, lastPrice: t.price };
      const qty = t.side === "BUY" ? t.quantity : -t.quantity;
      netBySymbol[t.symbol].qty += qty;
      netBySymbol[t.symbol].lastPrice = t.price;
    }
    return Object.values(netBySymbol)
      .filter(v => Math.abs(v.qty) > 0.001)
      .reduce((sum, v) => sum + Math.abs(v.qty * v.lastPrice), 0);
  }, [positions, trades]);

  // Cash from endingCash metadata, fallback to 0
  const cashValue = endingCash ?? 0;
  const totalNav = cashValue + assetsValue;

  if (cashValue === 0 && assetsValue === 0) return null;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
      <Card>
        <CardContent className="pt-4 sm:pt-5">
          <div className="flex items-center gap-2 mb-1">
            <Wallet className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs sm:text-sm text-muted-foreground">Efectivo (Cash)</span>
          </div>
          <p className="text-xl sm:text-2xl font-bold text-foreground">{formatCurrency(cashValue)}</p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-4 sm:pt-5">
          <div className="flex items-center gap-2 mb-1">
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs sm:text-sm text-muted-foreground">Valor Activos</span>
          </div>
          <p className="text-xl sm:text-2xl font-bold text-foreground">{formatCurrency(assetsValue)}</p>
        </CardContent>
      </Card>

      <Card className="border-primary/30">
        <CardContent className="pt-4 sm:pt-5">
          <div className="flex items-center gap-2 mb-1">
            <Landmark className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs sm:text-sm text-muted-foreground">Patrimonio Total (NAV)</span>
          </div>
          <p className="text-xl sm:text-2xl font-bold text-foreground">{formatCurrency(totalNav)}</p>
        </CardContent>
      </Card>
    </div>
  );
}
