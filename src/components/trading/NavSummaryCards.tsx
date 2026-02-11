import { useState, useEffect, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { Wallet, BarChart3, Landmark } from "lucide-react";

interface NavSummaryCardsProps {
  cashBalance: number;
  formatCurrency: (value: number) => string;
  refreshTrigger: number;
  trades: Array<{ symbol: string; quantity: number; price: number; date_time: string }>;
}

export function NavSummaryCards({ cashBalance, formatCurrency, refreshTrigger, trades }: NavSummaryCardsProps) {
  const [positions, setPositions] = useState<Array<{ symbol: string; market_value: number; unrealized_pnl: number }>>([]);

  useEffect(() => {
    fetchPositions();
  }, [refreshTrigger]);

  const fetchPositions = async () => {
    const { data } = await supabase
      .from("ib_open_positions_tsc")
      .select("symbol, market_value, unrealized_pnl, quantity")
      .order("symbol");
    setPositions(data || []);
  };

  // If no open positions from DB, calculate net positions from trade history
  const assetsValue = useMemo(() => {
    if (positions.length > 0) {
      return positions.reduce((sum, p) => sum + Math.abs(p.market_value), 0);
    }
    // Fallback: calculate from trade history
    const netBySymbol: Record<string, { qty: number; lastPrice: number }> = {};
    const sorted = [...trades].sort((a, b) => new Date(a.date_time).getTime() - new Date(b.date_time).getTime());
    for (const t of sorted) {
      if (!netBySymbol[t.symbol]) netBySymbol[t.symbol] = { qty: 0, lastPrice: t.price };
      netBySymbol[t.symbol].qty += t.quantity;
      netBySymbol[t.symbol].lastPrice = t.price;
    }
    return Object.values(netBySymbol)
      .filter(v => v.qty !== 0)
      .reduce((sum, v) => sum + Math.abs(v.qty * v.lastPrice), 0);
  }, [positions, trades]);

  const totalNav = cashBalance + assetsValue;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
      <Card>
        <CardContent className="pt-4 sm:pt-5">
          <div className="flex items-center gap-2 mb-1">
            <Wallet className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs sm:text-sm text-muted-foreground">Efectivo (Cash)</span>
          </div>
          <p className="text-xl sm:text-2xl font-bold text-foreground">{formatCurrency(cashBalance)}</p>
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
