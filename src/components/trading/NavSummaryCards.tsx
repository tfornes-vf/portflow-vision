import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { Wallet, BarChart3, Landmark } from "lucide-react";

interface NavSummaryCardsProps {
  formatCurrency: (value: number) => string;
  refreshTrigger: number;
}

export function NavSummaryCards({ formatCurrency, refreshTrigger }: NavSummaryCardsProps) {
  const [endingCash, setEndingCash] = useState<number>(0);
  const [assetsValue, setAssetsValue] = useState<number>(0);

  useEffect(() => {
    fetchData();
  }, [refreshTrigger]);

  const fetchData = async () => {
    const [metaResult, posResult] = await Promise.all([
      supabase.from("ib_sync_metadata").select("ending_cash").eq("account_id", "TSC").maybeSingle(),
      supabase.from("ib_open_positions_tsc").select("market_value"),
    ]);

    if (metaResult.data?.ending_cash) {
      setEndingCash(Number(metaResult.data.ending_cash));
    }

    if (posResult.data && posResult.data.length > 0) {
      const total = posResult.data.reduce((sum, p) => sum + Math.abs(Number(p.market_value)), 0);
      setAssetsValue(total);
    }
  };

  const totalNav = endingCash + assetsValue;

  if (endingCash === 0 && assetsValue === 0) return null;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
      <Card>
        <CardContent className="pt-4 sm:pt-5">
          <div className="flex items-center gap-2 mb-1">
            <Wallet className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs sm:text-sm text-muted-foreground">Efectivo (Cash)</span>
          </div>
          <p className="text-xl sm:text-2xl font-bold text-foreground">{formatCurrency(endingCash)}</p>
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
