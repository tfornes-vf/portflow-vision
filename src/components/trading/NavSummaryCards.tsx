import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { Wallet, BarChart3, Landmark } from "lucide-react";

interface NavSummaryCardsProps {
  formatCurrency: (value: number) => string;
  refreshTrigger: number;
}

export function NavSummaryCards({ formatCurrency, refreshTrigger }: NavSummaryCardsProps) {
  const [cash, setCash] = useState<number>(0);
  const [stock, setStock] = useState<number>(0);
  const [total, setTotal] = useState<number>(0);

  useEffect(() => {
    fetchNavData();
  }, [refreshTrigger]);

  const fetchNavData = async () => {
    // Get the most recent NAV snapshot from ib_nav_history
    const { data, error } = await supabase
      .from("ib_nav_history")
      .select("total, cash, stock")
      .eq("account_id", "TSC")
      .order("report_date", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("Error fetching NAV data:", error);
      return;
    }

    if (data) {
      setCash(Number(data.cash));
      setStock(Number(data.stock));
      setTotal(Number(data.total));
    }
  };

  if (cash === 0 && stock === 0 && total === 0) return null;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
      <Card>
        <CardContent className="pt-4 sm:pt-5">
          <div className="flex items-center gap-2 mb-1">
            <Wallet className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs sm:text-sm text-muted-foreground">Efectivo (Cash)</span>
          </div>
          <p className="text-xl sm:text-2xl font-bold text-foreground">{formatCurrency(cash)}</p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-4 sm:pt-5">
          <div className="flex items-center gap-2 mb-1">
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs sm:text-sm text-muted-foreground">Valor Activos</span>
          </div>
          <p className="text-xl sm:text-2xl font-bold text-foreground">{formatCurrency(stock)}</p>
        </CardContent>
      </Card>

      <Card className="border-primary/30">
        <CardContent className="pt-4 sm:pt-5">
          <div className="flex items-center gap-2 mb-1">
            <Landmark className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs sm:text-sm text-muted-foreground">Patrimonio Total (NAV)</span>
          </div>
          <p className="text-xl sm:text-2xl font-bold text-foreground">{formatCurrency(total)}</p>
        </CardContent>
      </Card>
    </div>
  );
}
