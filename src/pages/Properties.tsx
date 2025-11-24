import { useState, useEffect } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { MetricCard } from "@/components/dashboard/MetricCard";
import { PortfolioChart } from "@/components/dashboard/PortfolioChart";
import { PortfolioPerformance } from "@/components/dashboard/PortfolioPerformance";
import { PositionsTable } from "@/components/dashboard/PositionsTable";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Wallet, TrendingUp, DollarSign } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { es } from "date-fns/locale";

interface AssetWithValue {
  id: string;
  name: string;
  cost_basis: number;
  current_value: number;
  profit_loss: number;
  profit_loss_percent: number;
}

interface Broker {
  id: string;
  name: string;
}

interface Trade {
  id: string;
  symbol: string;
  profit_loss: number;
  lot_size: number;
  closed_at: string;
  strategies: { name: string } | null;
}

type TimePeriod = "D" | "S" | "M" | "YTD" | "AÑO" | "ALL";

export default function Properties() {
  const [brokers, setBrokers] = useState<Broker[]>([]);
  const [selectedBroker, setSelectedBroker] = useState<string>("all");
  const [trades, setTrades] = useState<Trade[]>([]);
  const [strategies, setStrategies] = useState<{ id: string; name: string }[]>([]);
  const [selectedPeriod, setSelectedPeriod] = useState<TimePeriod>("D");
  const [selectedStrategy, setSelectedStrategy] = useState<string>("all");
  const [assets, setAssets] = useState<AssetWithValue[]>([]);
  const [totalNetWorth, setTotalNetWorth] = useState(0);
  const [totalCostBasis, setTotalCostBasis] = useState(0);
  const [totalProfitLoss, setTotalProfitLoss] = useState(0);
  const { toast } = useToast();

  useEffect(() => {
    fetchBrokers();
    fetchStrategies();
    fetchAssets();
  }, []);

  useEffect(() => {
    fetchTrades();
  }, [selectedPeriod, selectedStrategy]);

  const fetchAssets = async () => {
    try {
      const { data: assetsData, error: assetsError } = await supabase
        .from("assets")
        .select(`
          id,
          name,
          cost_basis,
          entity_id,
          entities!inner(tenant_id)
        `);

      if (assetsError) throw assetsError;

      if (!assetsData) return;

      const assetsWithValues: AssetWithValue[] = [];
      let totalValue = 0;
      let totalCost = 0;

      for (const asset of assetsData) {
        const { data: latestValue, error: valueError } = await supabase
          .from("market_values")
          .select("value_base")
          .eq("asset_id", asset.id)
          .order("valuation_date", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (valueError) {
          console.error("Error fetching market value:", valueError);
          continue;
        }

        const currentValue = latestValue?.value_base || asset.cost_basis;
        const profitLoss = currentValue - asset.cost_basis;
        const profitLossPercent = asset.cost_basis > 0 
          ? (profitLoss / asset.cost_basis) * 100 
          : 0;

        assetsWithValues.push({
          id: asset.id,
          name: asset.name,
          cost_basis: asset.cost_basis,
          current_value: currentValue,
          profit_loss: profitLoss,
          profit_loss_percent: profitLossPercent,
        });

        totalValue += currentValue;
        totalCost += asset.cost_basis;
      }

      setAssets(assetsWithValues);
      setTotalNetWorth(totalValue);
      setTotalCostBasis(totalCost);
      setTotalProfitLoss(totalValue - totalCost);
    } catch (error) {
      console.error("Error fetching assets:", error);
      toast({
        title: "Error",
        description: "No se pudieron cargar los activos",
        variant: "destructive",
      });
    }
  };

  const fetchBrokers = async () => {
    try {
      const { data, error } = await supabase
        .from("brokers")
        .select("id, name")
        .eq("is_active", true);

      if (error) throw error;
      setBrokers(data || []);
    } catch (error) {
      console.error("Error fetching brokers:", error);
      toast({
        title: "Error",
        description: "No se pudieron cargar los brokers",
        variant: "destructive",
      });
    }
  };

  const fetchStrategies = async () => {
    try {
      const { data, error } = await supabase
        .from("strategies")
        .select("id, name")
        .eq("is_active", true);

      if (error) throw error;
      setStrategies(data || []);
    } catch (error) {
      console.error("Error fetching strategies:", error);
    }
  };

  const fetchTrades = async () => {
    try {
      let query = supabase
        .from("trades")
        .select(`
          id,
          symbol,
          profit_loss,
          lot_size,
          closed_at,
          strategies (name)
        `)
        .not("closed_at", "is", null)
        .order("closed_at", { ascending: false });

      if (selectedStrategy !== "all") {
        query = query.eq("strategy_id", selectedStrategy);
      }

      const now = new Date();
      let startDate: Date | null = null;

      switch (selectedPeriod) {
        case "D":
          startDate = new Date(now.setHours(0, 0, 0, 0));
          break;
        case "S":
          startDate = new Date(now.setDate(now.getDate() - now.getDay()));
          break;
        case "M":
          startDate = new Date(now.getFullYear(), now.getMonth(), 1);
          break;
        case "YTD":
          startDate = new Date(now.getFullYear(), 0, 1);
          break;
        case "AÑO":
          startDate = new Date(now.setFullYear(now.getFullYear() - 1));
          break;
      }

      if (startDate) {
        query = query.gte("closed_at", startDate.toISOString());
      }

      const { data, error } = await query;

      if (error) throw error;
      setTrades(data || []);
    } catch (error) {
      console.error("Error fetching trades:", error);
      toast({
        title: "Error",
        description: "No se pudieron cargar las operaciones",
        variant: "destructive",
      });
    }
  };

  const periods: { value: TimePeriod; label: string }[] = [
    { value: "D", label: "D" },
    { value: "S", label: "S" },
    { value: "M", label: "M" },
    { value: "YTD", label: "YTD" },
    { value: "AÑO", label: "AÑO" },
    { value: "ALL", label: "ALL" },
  ];

  return (
    <AppLayout>
      <DashboardLayout>
        {(activeCategory) => (
          <div className="space-y-6">
            {activeCategory === "interactive-brokers" ? (
              <>
                {/* Header */}
                <div className="flex items-center justify-between">
                  <div>
                    <h1 className="text-3xl font-bold tracking-tight text-foreground">
                      Dashboard
                    </h1>
                    <p className="text-muted-foreground mt-1">
                      Vista de Interactive Brokers
                    </p>
                  </div>

                  <Select value={selectedBroker} onValueChange={setSelectedBroker}>
                    <SelectTrigger className="w-[200px]">
                      <SelectValue placeholder="Selecciona un broker" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos los brokers</SelectItem>
                      {brokers.map((broker) => (
                        <SelectItem key={broker.id} value={broker.id}>
                          {broker.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Metrics */}
                <div className="grid gap-4 md:grid-cols-3">
                  <MetricCard
                    title="Balance Total"
                    value={`€${totalNetWorth.toLocaleString('es-ES', { maximumFractionDigits: 0 })}`}
                    icon={<Wallet className="h-4 w-4" />}
                    trend={{
                      value: totalProfitLoss > 0 ? ((totalProfitLoss / totalCostBasis) * 100) : 0,
                      isPositive: totalProfitLoss >= 0
                    }}
                  />
                  <MetricCard
                    title="Capital Invertido"
                    value={`€${totalCostBasis.toLocaleString('es-ES', { maximumFractionDigits: 0 })}`}
                    icon={<TrendingUp className="h-4 w-4" />}
                  />
                  <MetricCard
                    title="Ganancia/Pérdida"
                    value={`€${totalProfitLoss.toLocaleString('es-ES', { maximumFractionDigits: 0 })}`}
                    icon={<DollarSign className="h-4 w-4" />}
                    trend={{
                      value: totalCostBasis > 0 ? (totalProfitLoss / totalCostBasis) * 100 : 0,
                      isPositive: totalProfitLoss >= 0
                    }}
                  />
                </div>

                {/* Chart */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-muted-heading">Distribución del Capital</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <PortfolioChart
                      invested={totalCostBasis}
                      available={totalNetWorth - totalCostBasis}
                    />
                  </CardContent>
                </Card>

                {/* Operaciones Section */}
                <Card>
                  <CardHeader className="space-y-4">
                    <CardTitle className="text-muted-heading">Operaciones</CardTitle>
                    <div className="flex flex-col gap-4">
                      <div className="flex flex-wrap gap-2">
                        {periods.map((period) => (
                          <Button
                            key={period.value}
                            variant={selectedPeriod === period.value ? "default" : "outline"}
                            size="sm"
                            onClick={() => setSelectedPeriod(period.value)}
                            className="transition-smooth"
                          >
                            {period.label}
                          </Button>
                        ))}
                      </div>

                      <Select value={selectedStrategy} onValueChange={setSelectedStrategy}>
                        <SelectTrigger className="w-full md:w-[300px]">
                          <SelectValue placeholder="Todas las estrategias" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Todas las estrategias</SelectItem>
                          {strategies.map((strategy) => (
                            <SelectItem key={strategy.id} value={strategy.id}>
                              {strategy.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Fecha y Hora</TableHead>
                            <TableHead>Activo</TableHead>
                            <TableHead>Estrategia</TableHead>
                            <TableHead className="text-right">Tamaño (Lote)</TableHead>
                            <TableHead className="text-right">P/L</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {trades.length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={5} className="text-center text-muted-foreground">
                                No hay operaciones para mostrar
                              </TableCell>
                            </TableRow>
                          ) : (
                            trades.map((trade) => (
                              <TableRow key={trade.id} className="transition-smooth hover:bg-muted/50">
                                <TableCell className="font-medium">
                                  {trade.closed_at &&
                                    format(new Date(trade.closed_at), "dd/MM/yyyy HH:mm", {
                                      locale: es,
                                    })}
                                </TableCell>
                                <TableCell>
                                  {trade.symbol}
                                </TableCell>
                                <TableCell>{trade.strategies?.name || "-"}</TableCell>
                                <TableCell className="text-right">
                                  {trade.lot_size}
                                </TableCell>
                                <TableCell
                                  className={cn(
                                    "text-right font-semibold",
                                    trade.profit_loss >= 0
                                      ? "profit-positive"
                                      : "profit-negative"
                                  )}
                                >
                                  ${trade.profit_loss?.toFixed(2)}
                                </TableCell>
                              </TableRow>
                            ))
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              </>
            ) : (
              <>
                {/* Portfolio Performance View for Other Categories */}
                <PortfolioPerformance 
                  totalValue={totalNetWorth}
                  change={totalProfitLoss}
                  changePercent={totalCostBasis > 0 ? (totalProfitLoss / totalCostBasis) * 100 : 0}
                />
                
                <PositionsTable activeCategory={activeCategory} />
              </>
            )}
          </div>
        )}
      </DashboardLayout>
    </AppLayout>
  );
}
