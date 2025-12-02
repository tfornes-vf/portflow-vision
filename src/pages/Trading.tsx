import { useState, useEffect, useMemo } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { RefreshCw, Search, TrendingUp, TrendingDown, Activity, Target, BarChart3, Percent } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { format, subDays, subWeeks, subMonths, startOfYear, parseISO, isAfter } from "date-fns";

type Period = "1D" | "1W" | "1M" | "YTD" | "ALL";

interface Trade {
  id: string;
  ib_trade_id: string;
  symbol: string;
  asset_class: string;
  date_time: string;
  side: string;
  quantity: number;
  price: number;
  amount: number;
  commission: number;
  currency: string;
  realized_pnl: number | null;
  account_id: string;
}

interface KPIs {
  totalPnL: number;
  totalTrades: number;
  winRate: number;
  maxDrawdown: number;
  sharpeRatio: number;
  avgWin: number;
  avgLoss: number;
}

export default function Trading() {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [cooldown, setCooldown] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedPeriod, setSelectedPeriod] = useState<Period>("ALL");
  const pageSize = 20;

  useEffect(() => {
    fetchTrades();
  }, []);

  const fetchTrades = async () => {
    try {
      const { data, error } = await supabase
        .from("ib_trades")
        .select("*")
        .order("date_time", { ascending: false });

      if (error) throw error;
      setTrades(data || []);
    } catch (error) {
      console.error("Error fetching trades:", error);
      toast({
        title: "Error",
        description: "No se pudieron cargar los trades",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const syncTrades = async () => {
    if (cooldown) return;

    setSyncing(true);
    setCooldown(true);

    try {
      const { data, error } = await supabase.functions.invoke("sync-ibkr-trades");

      if (error) throw error;

      toast({
        title: "Sincronización completada",
        description: data?.message || "Trades actualizados correctamente",
      });

      await fetchTrades();
    } catch (error) {
      console.error("Error syncing trades:", error);
      toast({
        title: "Error",
        description: "No se pudieron sincronizar los trades",
        variant: "destructive",
      });
    } finally {
      setSyncing(false);
      setTimeout(() => setCooldown(false), 10000);
    }
  };

  const getFilterDate = (period: Period): Date | null => {
    const now = new Date();
    switch (period) {
      case "1D": return subDays(now, 1);
      case "1W": return subWeeks(now, 1);
      case "1M": return subMonths(now, 1);
      case "YTD": return startOfYear(now);
      case "ALL": return null;
    }
  };

  const filteredByPeriod = useMemo(() => {
    const filterDate = getFilterDate(selectedPeriod);
    if (!filterDate) return trades;
    return trades.filter(t => isAfter(parseISO(t.date_time), filterDate));
  }, [trades, selectedPeriod]);

  const kpis = useMemo((): KPIs => {
    const closedTrades = filteredByPeriod.filter(t => t.realized_pnl !== null && t.realized_pnl !== 0);
    const wins = closedTrades.filter(t => (t.realized_pnl || 0) > 0);
    const losses = closedTrades.filter(t => (t.realized_pnl || 0) < 0);

    const totalPnL = closedTrades.reduce((sum, t) => sum + (t.realized_pnl || 0), 0);
    const winRate = closedTrades.length > 0 ? (wins.length / closedTrades.length) * 100 : 0;
    const avgWin = wins.length > 0 ? wins.reduce((sum, t) => sum + (t.realized_pnl || 0), 0) / wins.length : 0;
    const avgLoss = losses.length > 0 ? Math.abs(losses.reduce((sum, t) => sum + (t.realized_pnl || 0), 0) / losses.length) : 0;

    // Calculate max drawdown
    let peak = 0;
    let maxDrawdown = 0;
    let cumulative = 0;
    const sortedTrades = [...closedTrades].sort((a, b) => 
      new Date(a.date_time).getTime() - new Date(b.date_time).getTime()
    );
    
    for (const trade of sortedTrades) {
      cumulative += trade.realized_pnl || 0;
      if (cumulative > peak) peak = cumulative;
      const drawdown = peak - cumulative;
      if (drawdown > maxDrawdown) maxDrawdown = drawdown;
    }

    // Simple Sharpe approximation (daily returns std)
    const returns = sortedTrades.map(t => t.realized_pnl || 0);
    const avgReturn = returns.length > 0 ? returns.reduce((a, b) => a + b, 0) / returns.length : 0;
    const variance = returns.length > 1 
      ? returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / (returns.length - 1)
      : 0;
    const stdDev = Math.sqrt(variance);
    const sharpeRatio = stdDev > 0 ? (avgReturn / stdDev) * Math.sqrt(252) : 0;

    return {
      totalPnL,
      totalTrades: filteredByPeriod.length,
      winRate,
      maxDrawdown,
      sharpeRatio,
      avgWin,
      avgLoss,
    };
  }, [filteredByPeriod]);

  const chartData = useMemo(() => {
    const sortedTrades = [...filteredByPeriod]
      .filter(t => t.realized_pnl !== null)
      .sort((a, b) => new Date(a.date_time).getTime() - new Date(b.date_time).getTime());

    let cumulative = 0;
    return sortedTrades.map(trade => {
      cumulative += trade.realized_pnl || 0;
      return {
        date: format(parseISO(trade.date_time), "dd/MM"),
        pnl: cumulative,
        daily: trade.realized_pnl || 0,
      };
    });
  }, [filteredByPeriod]);

  const searchedTrades = useMemo(() => {
    if (!searchTerm) return filteredByPeriod;
    const term = searchTerm.toLowerCase();
    return filteredByPeriod.filter(t =>
      t.symbol.toLowerCase().includes(term) ||
      t.ib_trade_id.includes(term) ||
      t.asset_class.toLowerCase().includes(term)
    );
  }, [filteredByPeriod, searchTerm]);

  const paginatedTrades = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return searchedTrades.slice(start, start + pageSize);
  }, [searchedTrades, currentPage]);

  const totalPages = Math.ceil(searchedTrades.length / pageSize);

  const strategyPerformance = useMemo(() => {
    const byAssetClass: Record<string, { pnl: number; trades: number; wins: number }> = {};
    
    filteredByPeriod.forEach(trade => {
      const key = trade.asset_class || "Unknown";
      if (!byAssetClass[key]) {
        byAssetClass[key] = { pnl: 0, trades: 0, wins: 0 };
      }
      byAssetClass[key].trades++;
      if (trade.realized_pnl) {
        byAssetClass[key].pnl += trade.realized_pnl;
        if (trade.realized_pnl > 0) byAssetClass[key].wins++;
      }
    });

    return Object.entries(byAssetClass).map(([name, data]) => ({
      name,
      pnl: data.pnl,
      trades: data.trades,
      winRate: data.trades > 0 ? (data.wins / data.trades) * 100 : 0,
    }));
  }, [filteredByPeriod]);

  const formatCurrency = (value: number) => 
    new Intl.NumberFormat("es-ES", { style: "currency", currency: "USD" }).format(value);

  const periods: Period[] = ["1D", "1W", "1M", "YTD", "ALL"];

  if (loading) {
    return (
      <AppLayout>
        <div className="container mx-auto p-6 space-y-6">
          <Skeleton className="h-10 w-48" />
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-24" />)}
          </div>
          <Skeleton className="h-80" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="container mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground">Trading</h1>
            <p className="text-muted-foreground mt-1">Análisis de rendimiento de trading IBKR</p>
          </div>
          <Button 
            onClick={syncTrades} 
            disabled={syncing || cooldown}
            variant="outline"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${syncing ? "animate-spin" : ""}`} />
            {syncing ? "Actualizando..." : cooldown ? "Espera 10s" : "Refresh Trades"}
          </Button>
        </div>

        {/* Period Filter */}
        <div className="flex gap-2">
          {periods.map((period) => (
            <Button
              key={period}
              variant={selectedPeriod === period ? "default" : "outline"}
              size="sm"
              onClick={() => setSelectedPeriod(period)}
            >
              {period}
            </Button>
          ))}
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">P&L Total</span>
              </div>
              <p className={`text-xl font-bold ${kpis.totalPnL >= 0 ? "text-green-500" : "text-red-500"}`}>
                {formatCurrency(kpis.totalPnL)}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Trades</span>
              </div>
              <p className="text-xl font-bold">{kpis.totalTrades}</p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-2">
                <Target className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Win Rate</span>
              </div>
              <p className="text-xl font-bold">{kpis.winRate.toFixed(1)}%</p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-2">
                <TrendingDown className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Max Drawdown</span>
              </div>
              <p className="text-xl font-bold text-red-500">
                {formatCurrency(kpis.maxDrawdown)}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Sharpe Ratio</span>
              </div>
              <p className="text-xl font-bold">{kpis.sharpeRatio.toFixed(2)}</p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-2">
                <Percent className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Avg Win/Loss</span>
              </div>
              <p className="text-sm font-medium">
                <span className="text-green-500">{formatCurrency(kpis.avgWin)}</span>
                {" / "}
                <span className="text-red-500">{formatCurrency(kpis.avgLoss)}</span>
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Performance Chart */}
        <Card>
          <CardHeader>
            <CardTitle>Rendimiento Acumulado</CardTitle>
          </CardHeader>
          <CardContent>
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis 
                    dataKey="date" 
                    tick={{ fontSize: 12 }}
                    className="text-muted-foreground"
                  />
                  <YAxis 
                    tick={{ fontSize: 12 }}
                    tickFormatter={(val) => `$${(val / 1000).toFixed(0)}k`}
                    className="text-muted-foreground"
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                    }}
                    formatter={(value: number) => [formatCurrency(value), "P&L Acumulado"]}
                  />
                  <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeDasharray="3 3" />
                  <Line
                    type="monotone"
                    dataKey="pnl"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                No hay datos para mostrar
              </div>
            )}
          </CardContent>
        </Card>

        {/* Strategy Performance */}
        <Card>
          <CardHeader>
            <CardTitle>Rendimiento por Asset Class</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {strategyPerformance.map((strategy) => (
                <div
                  key={strategy.name}
                  className="p-4 rounded-lg border bg-card"
                >
                  <div className="flex items-center justify-between mb-2">
                    <Badge variant="outline">{strategy.name}</Badge>
                    <span className="text-xs text-muted-foreground">
                      {strategy.trades} trades
                    </span>
                  </div>
                  <p className={`text-lg font-bold ${strategy.pnl >= 0 ? "text-green-500" : "text-red-500"}`}>
                    {formatCurrency(strategy.pnl)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Win Rate: {strategy.winRate.toFixed(1)}%
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Trades Table */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Trades Ejecutados</CardTitle>
              <div className="relative w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por símbolo, ID..."
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="pl-9"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Símbolo</TableHead>
                    <TableHead>Clase</TableHead>
                    <TableHead>Acción</TableHead>
                    <TableHead className="text-right">Cantidad</TableHead>
                    <TableHead className="text-right">Precio</TableHead>
                    <TableHead className="text-right">Monto</TableHead>
                    <TableHead className="text-right">P&L</TableHead>
                    <TableHead className="text-right">Comisión</TableHead>
                    <TableHead>ID</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedTrades.length > 0 ? (
                    paginatedTrades.map((trade) => (
                      <TableRow key={trade.id}>
                        <TableCell className="text-sm">
                          {format(parseISO(trade.date_time), "dd/MM/yyyy HH:mm")}
                        </TableCell>
                        <TableCell className="font-medium">{trade.symbol}</TableCell>
                        <TableCell>
                          <Badge variant="secondary">{trade.asset_class}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={trade.side === "BUY" ? "default" : "destructive"}>
                            {trade.side}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">{trade.quantity}</TableCell>
                        <TableCell className="text-right">${trade.price.toFixed(2)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(trade.amount)}</TableCell>
                        <TableCell className={`text-right font-medium ${
                          (trade.realized_pnl || 0) >= 0 ? "text-green-500" : "text-red-500"
                        }`}>
                          {trade.realized_pnl ? formatCurrency(trade.realized_pnl) : "-"}
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          ${trade.commission.toFixed(2)}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {trade.ib_trade_id.slice(-8)}
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                        No se encontraron trades
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-4">
                <p className="text-sm text-muted-foreground">
                  Mostrando {((currentPage - 1) * pageSize) + 1} - {Math.min(currentPage * pageSize, searchedTrades.length)} de {searchedTrades.length}
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                  >
                    Anterior
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                  >
                    Siguiente
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
