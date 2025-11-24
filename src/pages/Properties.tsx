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
  asset_class_hard: string;
  entity_name: string;
  tags: Array<{ id: string; name: string; category_name: string }>;
}

interface GroupingDimension {
  id: string;
  label: string;
  type: "native" | "tag_category";
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
  const [groupingDimensions, setGroupingDimensions] = useState<GroupingDimension[]>([]);
  const [selectedGrouping, setSelectedGrouping] = useState<string>("asset_class");
  const { toast } = useToast();

  useEffect(() => {
    fetchBrokers();
    fetchStrategies();
    fetchGroupingDimensions();
    fetchAssets();
  }, []);

  useEffect(() => {
    fetchTrades();
  }, [selectedPeriod, selectedStrategy]);

  const fetchGroupingDimensions = async () => {
    try {
      const { data: categories, error } = await supabase
        .from("tag_categories")
        .select("id, name");

      if (error) throw error;

      const dimensions: GroupingDimension[] = [
        { id: "asset_class", label: "Tipo de Activo", type: "native" },
        { id: "entity", label: "Entidad", type: "native" },
      ];

      if (categories) {
        categories.forEach(cat => {
          dimensions.push({
            id: cat.id,
            label: cat.name,
            type: "tag_category"
          });
        });
      }

      setGroupingDimensions(dimensions);
    } catch (error) {
      console.error("Error fetching grouping dimensions:", error);
    }
  };

  const fetchAssets = async () => {
    try {
      const { data: assetsData, error: assetsError } = await supabase
        .from("assets")
        .select(`
          id,
          name,
          cost_basis,
          asset_class_hard,
          entity_id,
          entities!inner(name, tenant_id)
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

        // Fetch tags for this asset
        const { data: assetTags } = await supabase
          .from("asset_tags")
          .select(`
            tag_id,
            tags!inner(
              id,
              name,
              tag_categories(name)
            )
          `)
          .eq("asset_id", asset.id);

        const tags = assetTags?.map(at => ({
          id: at.tags.id,
          name: at.tags.name,
          category_name: at.tags.tag_categories?.name || ""
        })) || [];

        assetsWithValues.push({
          id: asset.id,
          name: asset.name,
          cost_basis: asset.cost_basis,
          current_value: currentValue,
          profit_loss: profitLoss,
          profit_loss_percent: profitLossPercent,
          asset_class_hard: asset.asset_class_hard,
          entity_name: asset.entities.name,
          tags
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

  const groupAssets = () => {
    const grouped: { [key: string]: AssetWithValue[] } = {};
    
    assets.forEach(asset => {
      let groupKey = "Sin categoría";
      
      const dimension = groupingDimensions.find(d => d.id === selectedGrouping);
      if (!dimension) return;

      if (dimension.type === "native") {
        if (selectedGrouping === "asset_class") {
          groupKey = asset.asset_class_hard || "Sin clasificar";
        } else if (selectedGrouping === "entity") {
          groupKey = asset.entity_name || "Sin entidad";
        }
      } else {
        // Tag category grouping
        const relevantTag = asset.tags.find(t => {
          const category = groupingDimensions.find(d => d.id === selectedGrouping);
          return t.category_name === category?.label;
        });
        groupKey = relevantTag?.name || "Sin asignar";
      }

      if (!grouped[groupKey]) {
        grouped[groupKey] = [];
      }
      grouped[groupKey].push(asset);
    });

    return grouped;
  };

  const groupedAssets = groupAssets();

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
                
                {/* Dynamic Grouping Filter */}
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle>Activos</CardTitle>
                      <Select value={selectedGrouping} onValueChange={setSelectedGrouping}>
                        <SelectTrigger className="w-[200px]">
                          <SelectValue placeholder="Agrupar por" />
                        </SelectTrigger>
                        <SelectContent>
                          {groupingDimensions.map((dim) => (
                            <SelectItem key={dim.id} value={dim.id}>
                              {dim.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-6">
                      {Object.entries(groupedAssets).map(([groupName, groupAssets]) => (
                        <div key={groupName}>
                          <h3 className="text-lg font-semibold mb-3 text-foreground">
                            {groupName}
                          </h3>
                          <div className="rounded-md border">
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead>Nombre</TableHead>
                                  <TableHead className="text-right">Inversión</TableHead>
                                  <TableHead className="text-right">Valor Actual</TableHead>
                                  <TableHead className="text-right">P/L</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {groupAssets.map((asset) => (
                                  <TableRow key={asset.id}>
                                    <TableCell className="font-medium">{asset.name}</TableCell>
                                    <TableCell className="text-right">
                                      €{asset.cost_basis.toLocaleString('es-ES', { maximumFractionDigits: 0 })}
                                    </TableCell>
                                    <TableCell className="text-right">
                                      €{asset.current_value.toLocaleString('es-ES', { maximumFractionDigits: 0 })}
                                    </TableCell>
                                    <TableCell
                                      className={cn(
                                        "text-right font-semibold",
                                        asset.profit_loss >= 0
                                          ? "profit-positive"
                                          : "profit-negative"
                                      )}
                                    >
                                      {asset.profit_loss > 0 ? "+" : ""}
                                      €{asset.profit_loss.toLocaleString('es-ES', { maximumFractionDigits: 0 })}
                                      {" "}
                                      ({asset.profit_loss_percent > 0 ? "+" : ""}
                                      {asset.profit_loss_percent.toFixed(1)}%)
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </>
            )}
          </div>
        )}
      </DashboardLayout>
    </AppLayout>
  );
}
