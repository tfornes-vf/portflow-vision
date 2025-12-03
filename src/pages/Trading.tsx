import { useState, useEffect, useMemo } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
import { RefreshCw, Search, TrendingUp, TrendingDown, Activity, Target, BarChart3, Percent, CalendarIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { format, subDays, subWeeks, subMonths, startOfYear, parseISO, isAfter, isBefore, startOfDay, endOfDay, isToday, isYesterday } from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { DailyReturnGauge } from "@/components/trading/DailyReturnGauge";
import { DateRange } from "react-day-picker";

type Period = "T" | "1D" | "1W" | "1M" | "YTD" | "ALL" | "CUSTOM";

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
  saldo_actual?: number;
}

interface KPIs {
  totalPnL: number;
  totalTrades: number;
  winRate: number;
  maxDrawdown: number;
  sharpeRatio: number;
  avgWin: number;
  avgLoss: number;
  currentBalance: number;
  returnPercent: number;
}

const INITIAL_BALANCE = 508969.87;

export default function Trading() {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [cooldown, setCooldown] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedPeriod, setSelectedPeriod] = useState<Period>("ALL");
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
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

  const getFilterDates = (period: Period): { start: Date | null; end: Date | null } => {
    const now = new Date();
    const yesterday = startOfDay(subDays(now, 1));
    const endOfYesterday = endOfDay(subDays(now, 1));
    
    switch (period) {
      case "T": // Today
        return { start: startOfDay(now), end: endOfDay(now) };
      case "1D": // Yesterday (last complete day)
        return { start: yesterday, end: endOfYesterday };
      case "1W": 
        return { start: subWeeks(now, 1), end: now };
      case "1M": 
        return { start: subMonths(now, 1), end: now };
      case "YTD": 
        return { start: startOfYear(now), end: now };
      case "CUSTOM":
        return { 
          start: dateRange?.from || null, 
          end: dateRange?.to || dateRange?.from || null 
        };
      case "ALL": 
      default:
        return { start: null, end: null };
    }
  };

  const filteredByPeriod = useMemo(() => {
    const { start, end } = getFilterDates(selectedPeriod);
    if (!start) return trades;
    
    return trades.filter(t => {
      const tradeDate = parseISO(t.date_time);
      const afterStart = isAfter(tradeDate, start) || tradeDate.getTime() === start.getTime();
      const beforeEnd = !end || isBefore(tradeDate, end) || tradeDate.getTime() === end.getTime();
      return afterStart && beforeEnd;
    });
  }, [trades, selectedPeriod, dateRange]);

  // Calculate daily returns for gauge
  const dailyMetrics = useMemo(() => {
    const sortedTrades = [...trades].sort((a, b) => 
      new Date(a.date_time).getTime() - new Date(b.date_time).getTime()
    );

    // Group trades by day
    const tradesByDay: Record<string, Trade[]> = {};
    sortedTrades.forEach(trade => {
      const day = format(parseISO(trade.date_time), "yyyy-MM-dd");
      if (!tradesByDay[day]) tradesByDay[day] = [];
      tradesByDay[day].push(trade);
    });

    const days = Object.keys(tradesByDay).sort();
    const dailyReturns: { date: string; pnl: number; returnPercent: number; startBalance: number }[] = [];
    
    let prevBalance = INITIAL_BALANCE;
    days.forEach(day => {
      const dayTrades = tradesByDay[day];
      const dayPnL = dayTrades.reduce((sum, t) => sum + (t.realized_pnl || 0), 0);
      const returnPercent = prevBalance > 0 ? (dayPnL / prevBalance) * 100 : 0;
      dailyReturns.push({ date: day, pnl: dayPnL, returnPercent, startBalance: prevBalance });
      prevBalance += dayPnL;
    });

    // Today's return
    const today = format(new Date(), "yyyy-MM-dd");
    const todayData = dailyReturns.find(d => d.date === today);
    const dailyReturn = todayData?.returnPercent || 0;

    // Yesterday's return (last complete day)
    const yesterday = format(subDays(new Date(), 1), "yyyy-MM-dd");
    const yesterdayData = dailyReturns.find(d => d.date === yesterday);
    const lastCompleteDayReturn = yesterdayData?.returnPercent || 0;

    // Average daily return
    const avgDailyReturn = dailyReturns.length > 0 
      ? dailyReturns.reduce((sum, d) => sum + d.returnPercent, 0) / dailyReturns.length 
      : 0;

    return { dailyReturn, avgDailyReturn, lastCompleteDayReturn };
  }, [trades]);

  const kpis = useMemo((): KPIs => {
    // Only count trades with actual realized P&L (closing trades)
    const closingTrades = filteredByPeriod.filter(t => t.realized_pnl !== null && t.realized_pnl !== 0);
    const wins = closingTrades.filter(t => (t.realized_pnl || 0) > 0);
    const losses = closingTrades.filter(t => (t.realized_pnl || 0) < 0);

    // Total P&L for the filtered period
    const totalPnL = closingTrades.reduce((sum, t) => sum + (t.realized_pnl || 0), 0);
    const winRate = closingTrades.length > 0 ? (wins.length / closingTrades.length) * 100 : 0;
    const avgWin = wins.length > 0 ? wins.reduce((sum, t) => sum + (t.realized_pnl || 0), 0) / wins.length : 0;
    const avgLoss = losses.length > 0 ? Math.abs(losses.reduce((sum, t) => sum + (t.realized_pnl || 0), 0) / losses.length) : 0;

    // Get current balance from latest trade with P&L (all trades, not filtered)
    const tradesWithPnL = trades.filter(t => t.realized_pnl !== null && t.realized_pnl !== 0);
    const sortedTradesWithPnL = [...tradesWithPnL].sort((a, b) => 
      new Date(b.date_time).getTime() - new Date(a.date_time).getTime() // descending
    );
    
    const latestTradeWithPnL = sortedTradesWithPnL[0];
    const currentBalance = latestTradeWithPnL?.saldo_actual ?? INITIAL_BALANCE;
    
    const returnPercent = ((currentBalance - INITIAL_BALANCE) / INITIAL_BALANCE) * 100;

    // Calculate max drawdown from all trades
    const sortedForDrawdown = [...trades].sort((a, b) => 
      new Date(a.date_time).getTime() - new Date(b.date_time).getTime()
    );
    
    let runningBalance = INITIAL_BALANCE;
    let peak = INITIAL_BALANCE;
    let maxDrawdown = 0;
    
    for (const trade of sortedForDrawdown) {
      if (trade.saldo_actual && trade.saldo_actual > 0) {
        runningBalance = trade.saldo_actual;
      } else {
        runningBalance += (trade.realized_pnl || 0);
      }
      
      if (runningBalance > peak) peak = runningBalance;
      const drawdown = peak - runningBalance;
      if (drawdown > maxDrawdown) maxDrawdown = drawdown;
    }

    // Sharpe ratio based on daily returns
    const dailyPnL: Record<string, number> = {};
    filteredByPeriod.forEach(t => {
      const day = format(parseISO(t.date_time), "yyyy-MM-dd");
      dailyPnL[day] = (dailyPnL[day] || 0) + (t.realized_pnl || 0);
    });
    
    const dailyReturns = Object.values(dailyPnL).filter(v => v !== 0);
    const avgReturn = dailyReturns.length > 0 ? dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length : 0;
    const variance = dailyReturns.length > 1 
      ? dailyReturns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / (dailyReturns.length - 1)
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
      currentBalance,
      returnPercent,
    };
  }, [filteredByPeriod, trades]);

  const chartData = useMemo(() => {
    const sortedTrades = [...filteredByPeriod]
      .sort((a, b) => new Date(a.date_time).getTime() - new Date(b.date_time).getTime());

    if (sortedTrades.length === 0) return [];

    // Group by date and aggregate daily P&L
    const dailyData: Record<string, { balance: number; pnl: number; dailyPnL: number }> = {};
    
    // Get starting balance from all trades (before the filter period)
    const allSortedTrades = [...trades].sort((a, b) => 
      new Date(a.date_time).getTime() - new Date(b.date_time).getTime()
    );
    
    // Find starting balance at beginning of filter period
    const firstFilteredDate = new Date(sortedTrades[0].date_time);
    let startingBalance = INITIAL_BALANCE;
    
    for (const trade of allSortedTrades) {
      const tradeDate = new Date(trade.date_time);
      if (tradeDate >= firstFilteredDate) break;
      if (trade.saldo_actual && trade.saldo_actual > 0) {
        startingBalance = trade.saldo_actual;
      } else {
        startingBalance += (trade.realized_pnl || 0);
      }
    }
    
    // Calculate cumulative balance within the period
    let cumBalance = startingBalance;
    
    sortedTrades.forEach(trade => {
      const dateKey = format(parseISO(trade.date_time), "dd/MM");
      const pnl = trade.realized_pnl || 0;
      cumBalance += pnl;
      
      if (!dailyData[dateKey]) {
        dailyData[dateKey] = { balance: cumBalance, pnl: cumBalance - INITIAL_BALANCE, dailyPnL: pnl };
      } else {
        dailyData[dateKey].balance = cumBalance;
        dailyData[dateKey].pnl = cumBalance - INITIAL_BALANCE;
        dailyData[dateKey].dailyPnL += pnl;
      }
    });

    return Object.entries(dailyData).map(([date, data]) => ({
      date,
      balance: data.balance,
      pnl: data.pnl,
      dailyPnL: data.dailyPnL,
    }));
  }, [filteredByPeriod, trades]);

  // Only show trades with P&L != 0 in the table
  const searchedTrades = useMemo(() => {
    const tradesWithPnL = filteredByPeriod.filter(t => t.realized_pnl !== null && t.realized_pnl !== 0);
    if (!searchTerm) return tradesWithPnL;
    const term = searchTerm.toLowerCase();
    return tradesWithPnL.filter(t =>
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

  // Performance by symbol
  const symbolPerformance = useMemo(() => {
    const bySymbol: Record<string, { pnl: number; trades: number; wins: number }> = {};
    
    filteredByPeriod.forEach(trade => {
      const key = trade.symbol;
      if (!bySymbol[key]) {
        bySymbol[key] = { pnl: 0, trades: 0, wins: 0 };
      }
      bySymbol[key].trades++;
      if (trade.realized_pnl) {
        bySymbol[key].pnl += trade.realized_pnl;
        if (trade.realized_pnl > 0) bySymbol[key].wins++;
      }
    });

    return Object.entries(bySymbol)
      .map(([name, data]) => ({
        name,
        pnl: data.pnl,
        trades: data.trades,
        winRate: data.trades > 0 ? (data.wins / data.trades) * 100 : 0,
      }))
      .sort((a, b) => Math.abs(b.pnl) - Math.abs(a.pnl))
      .slice(0, 8);
  }, [filteredByPeriod]);

  const formatCurrency = (value: number) => 
    new Intl.NumberFormat("es-ES", { style: "currency", currency: "USD" }).format(value);

  const periods: { key: Period; label: string }[] = [
    { key: "T", label: "T" },
    { key: "1D", label: "1D" },
    { key: "1W", label: "1W" },
    { key: "1M", label: "1M" },
    { key: "YTD", label: "YTD" },
    { key: "ALL", label: "ALL" },
  ];

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

        {/* Period Filter with Date Picker */}
        <div className="flex flex-wrap gap-2 items-center">
          {periods.map((period) => (
            <Button
              key={period.key}
              variant={selectedPeriod === period.key ? "default" : "outline"}
              size="sm"
              onClick={() => {
                setSelectedPeriod(period.key);
                if (period.key !== "CUSTOM") setDateRange(undefined);
              }}
            >
              {period.label}
            </Button>
          ))}
          
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant={selectedPeriod === "CUSTOM" ? "default" : "outline"}
                size="sm"
                className={cn("gap-2", selectedPeriod === "CUSTOM" && "bg-primary")}
              >
                <CalendarIcon className="h-4 w-4" />
                {dateRange?.from ? (
                  dateRange.to ? (
                    `${format(dateRange.from, "dd/MM")} - ${format(dateRange.to, "dd/MM")}`
                  ) : (
                    format(dateRange.from, "dd/MM/yy")
                  )
                ) : (
                  "Personalizar"
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="range"
                selected={dateRange}
                onSelect={(range) => {
                  setDateRange(range);
                  if (range?.from) setSelectedPeriod("CUSTOM");
                }}
                locale={es}
                className="pointer-events-auto"
              />
            </PopoverContent>
          </Popover>
        </div>

        {/* Main Metrics Row */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          {/* Current Balance Card */}
          <Card className="lg:col-span-1">
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground mb-1">Saldo Actual</p>
              <p className="text-3xl font-bold text-foreground">{formatCurrency(kpis.currentBalance)}</p>
              <p className={`text-sm mt-1 ${kpis.returnPercent >= 0 ? "text-green-500" : "text-red-500"}`}>
                {kpis.returnPercent >= 0 ? "+" : ""}{kpis.returnPercent.toFixed(2)}% desde inicio
              </p>
            </CardContent>
          </Card>

          {/* Daily Return Gauge */}
          <div className="lg:col-span-1">
            <DailyReturnGauge 
              dailyReturn={dailyMetrics.dailyReturn}
              avgDailyReturn={dailyMetrics.avgDailyReturn}
              lastCompleteDayReturn={dailyMetrics.lastCompleteDayReturn}
            />
          </div>

          {/* KPI Cards */}
          <div className="lg:col-span-2 grid grid-cols-2 md:grid-cols-3 gap-3">
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">P&L Período</span>
                </div>
                <p className={`text-lg font-bold ${kpis.totalPnL >= 0 ? "text-green-500" : "text-red-500"}`}>
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
                <p className="text-lg font-bold">{kpis.totalTrades}</p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-2">
                  <Target className="h-4 w-4 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Win Rate</span>
                </div>
                <p className="text-lg font-bold">{kpis.winRate.toFixed(1)}%</p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-2">
                  <TrendingDown className="h-4 w-4 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Max DD</span>
                </div>
                <p className="text-lg font-bold text-red-500">
                  {formatCurrency(kpis.maxDrawdown)}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Sharpe</span>
                </div>
                <p className="text-lg font-bold">{kpis.sharpeRatio.toFixed(2)}</p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-2">
                  <Percent className="h-4 w-4 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Avg W/L</span>
                </div>
                <p className="text-xs font-medium">
                  <span className="text-green-500">{formatCurrency(kpis.avgWin)}</span>
                  <span className="text-muted-foreground"> / </span>
                  <span className="text-red-500">{formatCurrency(kpis.avgLoss)}</span>
                </p>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Performance Chart */}
        <Card>
          <CardHeader>
            <CardTitle>Rendimiento Acumulado (Saldo)</CardTitle>
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
                    domain={['auto', 'auto']}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                    }}
                    formatter={(value: number) => [formatCurrency(value), "Saldo"]}
                  />
                  <ReferenceLine y={INITIAL_BALANCE} stroke="hsl(var(--muted-foreground))" strokeDasharray="3 3" />
                  <Line
                    type="monotone"
                    dataKey="balance"
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

        {/* Symbol Performance */}
        <Card>
          <CardHeader>
            <CardTitle>Rendimiento por Símbolo</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {symbolPerformance.map((symbol) => (
                <div
                  key={symbol.name}
                  className="p-4 rounded-lg border bg-card"
                >
                  <div className="flex items-center justify-between mb-2">
                    <Badge variant="outline" className="font-mono">{symbol.name}</Badge>
                    <span className="text-xs text-muted-foreground">
                      {symbol.trades} trades
                    </span>
                  </div>
                  <p className={`text-lg font-bold ${symbol.pnl >= 0 ? "text-green-500" : "text-red-500"}`}>
                    {formatCurrency(symbol.pnl)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Win Rate: {symbol.winRate.toFixed(1)}%
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
                    <TableHead>Acción</TableHead>
                    <TableHead className="text-right">Cantidad</TableHead>
                    <TableHead className="text-right">Precio</TableHead>
                    <TableHead className="text-right">P&L</TableHead>
                    <TableHead className="text-right">Comisión</TableHead>
                    <TableHead className="text-right">Saldo</TableHead>
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
                          <Badge variant={trade.side === "BUY" ? "default" : "destructive"}>
                            {trade.side}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">{trade.quantity}</TableCell>
                        <TableCell className="text-right">${trade.price.toFixed(2)}</TableCell>
                        <TableCell className={`text-right font-medium ${(trade.realized_pnl || 0) >= 0 ? "text-green-500" : "text-red-500"}`}>
                          {formatCurrency(trade.realized_pnl || 0)}
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          ${trade.commission.toFixed(2)}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatCurrency(trade.saldo_actual || 0)}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground font-mono">
                          {trade.ib_trade_id}
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
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
