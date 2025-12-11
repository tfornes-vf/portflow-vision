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
import { RefreshCw, Search, TrendingUp, TrendingDown, Activity, Target, BarChart3, Percent, CalendarIcon, Settings } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { format, subDays, subWeeks, subMonths, startOfYear, parseISO, isAfter, isBefore, startOfDay, endOfDay, isSameDay } from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { DailyReturnGauge } from "@/components/trading/DailyReturnGauge";
import { ColumnSelector, ColumnConfig } from "@/components/trading/ColumnSelector";
import { ExclusionFilter, ExclusionRule } from "@/components/trading/ExclusionFilter";
import { CurrencyToggle } from "@/components/trading/CurrencyToggle";
import { useTradeProcessing, ProcessedTrade } from "@/hooks/use-trade-processing";
import { useExchangeRate } from "@/hooks/use-exchange-rate";
import { useAssetAliases } from "@/hooks/use-asset-aliases";
import { AliasManagerModal } from "@/components/trading/AliasManagerModal";
import { InlineAliasEditor } from "@/components/trading/InlineAliasEditor";
import { TradingChatbot } from "@/components/trading/TradingChatbot";
import { DateRange } from "react-day-picker";

type Period = "T" | "1D" | "1W" | "1M" | "YTD" | "ALL" | "CUSTOM";

interface RawTrade {
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
  periodReturnPercent: number;
  periodStartBalance: number;
}

const INITIAL_BALANCE = 524711.04;

// Default column configuration
const DEFAULT_COLUMNS: ColumnConfig[] = [
  { key: "date_time", label: "Fecha", visible: true },
  { key: "symbol", label: "Símbolo", visible: true },
  { key: "alias", label: "Alias", visible: true },
  { key: "action", label: "Posición", visible: true },
  { key: "side", label: "Acción", visible: false, defaultHidden: true },
  { key: "quantity", label: "Cantidad", visible: false, defaultHidden: true },
  { key: "price", label: "Precio", visible: true },
  { key: "realized_pnl", label: "P&L", visible: true },
  { key: "commission", label: "Comisión", visible: false, defaultHidden: true },
  { key: "saldo_actual", label: "Saldo", visible: true },
  { key: "trade_duration", label: "Duración", visible: true },
  { key: "id", label: "ID DB", visible: false, defaultHidden: true },
  { key: "ib_trade_id", label: "ID IBKR", visible: false, defaultHidden: true },
];

export default function Trading() {
  const [rawTrades, setRawTrades] = useState<RawTrade[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedPeriod, setSelectedPeriod] = useState<Period>("ALL");
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [columns, setColumns] = useState<ColumnConfig[]>(DEFAULT_COLUMNS);
  const [exclusions, setExclusions] = useState<ExclusionRule[]>([]);
  const [displayCurrency, setDisplayCurrency] = useState<"USD" | "EUR">("USD");
  const pageSize = 20;

  // Process trades with FIFO matching
  const trades = useTradeProcessing(rawTrades);
  
  // Exchange rate hook
  const { rate: exchangeRate, convertToEur } = useExchangeRate();

  // Asset aliases hook
  const { aliases, getAliasForSymbol, upsertAlias, deleteAlias } = useAssetAliases();

  useEffect(() => {
    fetchTrades();
  }, []);

  // Countdown timer for cooldown
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => {
      setCooldown(prev => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  const fetchTrades = async () => {
    try {
      const { data, error } = await supabase
        .from("ib_trades")
        .select("*")
        .order("date_time", { ascending: false });

      if (error) throw error;
      setRawTrades(data || []);
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
    if (cooldown > 0) return;

    setSyncing(true);

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
      setCooldown(10);
    }
  };

  // Get unique symbols for exclusion filter
  const availableSymbols = useMemo(() => {
    return [...new Set(rawTrades.map(t => t.symbol))].sort();
  }, [rawTrades]);

  const handleColumnChange = (key: string, visible: boolean) => {
    setColumns(cols => cols.map(c => c.key === key ? { ...c, visible } : c));
  };

  // Currency formatting
  const formatCurrency = (value: number) => {
    if (displayCurrency === "EUR") {
      return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(convertToEur(value));
    }
    return new Intl.NumberFormat("es-ES", { style: "currency", currency: "USD" }).format(value);
  };

  const getFilterDates = (period: Period): { start: Date | null; end: Date | null } => {
    const now = new Date();
    const yesterday = startOfDay(subDays(now, 1));
    const endOfYesterday = endOfDay(subDays(now, 1));
    
    switch (period) {
      case "T":
        return { start: startOfDay(now), end: endOfDay(now) };
      case "1D":
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

  // Apply period filter
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

  // Apply exclusion filter
  const filteredByExclusions = useMemo(() => {
    if (exclusions.length === 0) return filteredByPeriod;
    
    return filteredByPeriod.filter(trade => {
      const tradeDate = parseISO(trade.date_time);
      
      for (const exclusion of exclusions) {
        if (trade.symbol === exclusion.symbol) {
          for (const excludedDate of exclusion.dates) {
            if (isSameDay(tradeDate, excludedDate)) {
              return false; // Exclude this trade
            }
          }
        }
      }
      return true;
    });
  }, [filteredByPeriod, exclusions]);

  // Calculate daily returns for gauge (using filtered trades)
  const dailyMetrics = useMemo(() => {
    const sortedTrades = [...filteredByExclusions].sort((a, b) => 
      new Date(a.date_time).getTime() - new Date(b.date_time).getTime()
    );

    // Get starting balance for the filtered period
    const allSortedTrades = [...trades].sort((a, b) => 
      new Date(a.date_time).getTime() - new Date(b.date_time).getTime()
    );
    
    let periodStartBalance = INITIAL_BALANCE;
    if (sortedTrades.length > 0) {
      const firstFilteredDate = new Date(sortedTrades[0].date_time);
      for (const trade of allSortedTrades) {
        const tradeDate = new Date(trade.date_time);
        if (tradeDate >= firstFilteredDate) break;
        if (trade.saldo_actual && trade.saldo_actual > 0) {
          periodStartBalance = trade.saldo_actual;
        } else {
          periodStartBalance += (trade.realized_pnl || 0);
        }
      }
    }

    const tradesByDay: Record<string, ProcessedTrade[]> = {};
    sortedTrades.forEach(trade => {
      const day = format(parseISO(trade.date_time), "yyyy-MM-dd");
      if (!tradesByDay[day]) tradesByDay[day] = [];
      tradesByDay[day].push(trade);
    });

    const days = Object.keys(tradesByDay).sort();
    const dailyReturns: { date: string; pnl: number; returnPercent: number; startBalance: number }[] = [];
    
    let prevBalance = periodStartBalance;
    days.forEach(day => {
      const dayTrades = tradesByDay[day];
      const dayPnL = dayTrades.reduce((sum, t) => sum + (t.realized_pnl || 0), 0);
      const returnPercent = prevBalance > 0 ? (dayPnL / prevBalance) * 100 : 0;
      dailyReturns.push({ date: day, pnl: dayPnL, returnPercent, startBalance: prevBalance });
      prevBalance += dayPnL;
    });

    const today = format(new Date(), "yyyy-MM-dd");
    const todayData = dailyReturns.find(d => d.date === today);
    const dailyReturn = todayData?.returnPercent || 0;

    const yesterday = format(subDays(new Date(), 1), "yyyy-MM-dd");
    const yesterdayData = dailyReturns.find(d => d.date === yesterday);
    const lastCompleteDayReturn = yesterdayData?.returnPercent || 0;

    const avgDailyReturn = dailyReturns.length > 0 
      ? dailyReturns.reduce((sum, d) => sum + d.returnPercent, 0) / dailyReturns.length 
      : 0;

    return { dailyReturn, avgDailyReturn, lastCompleteDayReturn };
  }, [filteredByExclusions, trades]);

  const kpis = useMemo((): KPIs => {
    const closingTrades = filteredByExclusions.filter(t => t.realized_pnl !== null && t.realized_pnl !== 0);
    const wins = closingTrades.filter(t => (t.realized_pnl || 0) > 0);
    const losses = closingTrades.filter(t => (t.realized_pnl || 0) < 0);

    const totalPnL = closingTrades.reduce((sum, t) => sum + (t.realized_pnl || 0), 0);
    const winRate = closingTrades.length > 0 ? (wins.length / closingTrades.length) * 100 : 0;
    const avgWin = wins.length > 0 ? wins.reduce((sum, t) => sum + (t.realized_pnl || 0), 0) / wins.length : 0;
    const avgLoss = losses.length > 0 ? Math.abs(losses.reduce((sum, t) => sum + (t.realized_pnl || 0), 0) / losses.length) : 0;

    const tradesWithPnL = trades.filter(t => t.realized_pnl !== null && t.realized_pnl !== 0);
    const sortedTradesWithPnL = [...tradesWithPnL].sort((a, b) => 
      new Date(b.date_time).getTime() - new Date(a.date_time).getTime()
    );
    
    const latestTradeWithPnL = sortedTradesWithPnL[0];
    const currentBalance = latestTradeWithPnL?.saldo_actual ?? INITIAL_BALANCE;
    
    const returnPercent = ((currentBalance - INITIAL_BALANCE) / INITIAL_BALANCE) * 100;

    // Calculate period start balance for filtered trades
    const sortedFilteredTrades = [...filteredByExclusions].sort((a, b) => 
      new Date(a.date_time).getTime() - new Date(b.date_time).getTime()
    );
    
    const allSortedTrades = [...trades].sort((a, b) => 
      new Date(a.date_time).getTime() - new Date(b.date_time).getTime()
    );
    
    let periodStartBalance = INITIAL_BALANCE;
    if (sortedFilteredTrades.length > 0) {
      const firstFilteredDate = new Date(sortedFilteredTrades[0].date_time);
      for (const trade of allSortedTrades) {
        const tradeDate = new Date(trade.date_time);
        if (tradeDate >= firstFilteredDate) break;
        if (trade.saldo_actual && trade.saldo_actual > 0) {
          periodStartBalance = trade.saldo_actual;
        } else {
          periodStartBalance += (trade.realized_pnl || 0);
        }
      }
    }
    
    const periodReturnPercent = periodStartBalance > 0 
      ? (totalPnL / periodStartBalance) * 100 
      : 0;

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

    const dailyPnL: Record<string, number> = {};
    filteredByExclusions.forEach(t => {
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
      totalTrades: filteredByExclusions.length,
      winRate,
      maxDrawdown,
      sharpeRatio,
      avgWin,
      avgLoss,
      currentBalance,
      returnPercent,
      periodReturnPercent,
      periodStartBalance,
    };
  }, [filteredByExclusions, trades]);

  const chartData = useMemo(() => {
    const sortedTrades = [...filteredByExclusions]
      .sort((a, b) => new Date(a.date_time).getTime() - new Date(b.date_time).getTime());

    if (sortedTrades.length === 0) return [];

    const dailyData: Record<string, { balance: number; pnl: number; dailyPnL: number }> = {};
    
    const allSortedTrades = [...trades].sort((a, b) => 
      new Date(a.date_time).getTime() - new Date(b.date_time).getTime()
    );
    
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
      balance: displayCurrency === "EUR" ? convertToEur(data.balance) : data.balance,
      pnl: displayCurrency === "EUR" ? convertToEur(data.pnl) : data.pnl,
      dailyPnL: displayCurrency === "EUR" ? convertToEur(data.dailyPnL) : data.dailyPnL,
    }));
  }, [filteredByExclusions, trades, displayCurrency, convertToEur]);

  // Only show trades with P&L != 0 in the table
  const searchedTrades = useMemo(() => {
    const tradesWithPnL = filteredByExclusions.filter(t => t.realized_pnl !== null && t.realized_pnl !== 0);
    if (!searchTerm) return tradesWithPnL;
    const term = searchTerm.toLowerCase();
    return tradesWithPnL.filter(t =>
      t.symbol.toLowerCase().includes(term) ||
      t.ib_trade_id.includes(term) ||
      t.asset_class.toLowerCase().includes(term) ||
      (t.action && t.action.toLowerCase().includes(term)) ||
      (t.trade_duration && t.trade_duration.includes(term))
    );
  }, [filteredByExclusions, searchTerm]);

  const paginatedTrades = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return searchedTrades.slice(start, start + pageSize);
  }, [searchedTrades, currentPage]);

  const totalPages = Math.ceil(searchedTrades.length / pageSize);

  const symbolPerformance = useMemo(() => {
    const bySymbol: Record<string, { pnl: number; trades: number; wins: number }> = {};
    
    filteredByExclusions.forEach(trade => {
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
  }, [filteredByExclusions]);

  const periods: { key: Period; label: string }[] = [
    { key: "T", label: "T" },
    { key: "1D", label: "1D" },
    { key: "1W", label: "1W" },
    { key: "1M", label: "1M" },
    { key: "YTD", label: "YTD" },
    { key: "ALL", label: "ALL" },
  ];

  const isColumnVisible = (key: string) => columns.find(c => c.key === key)?.visible ?? true;

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
            disabled={syncing || cooldown > 0}
            variant="outline"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${syncing ? "animate-spin" : ""}`} />
            {syncing ? "Actualizando..." : cooldown > 0 ? `Espera ${cooldown}s` : "Refresh Trades"}
          </Button>
        </div>

        {/* Top-Level Filters */}
        <div className="flex flex-wrap gap-3 items-center">
          {/* Period Filter */}
          <div className="flex gap-1">
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

          <div className="h-6 w-px bg-border" />

          {/* Currency Toggle */}
          <CurrencyToggle
            currency={displayCurrency}
            onCurrencyChange={setDisplayCurrency}
            exchangeRate={exchangeRate}
          />

          {/* Exclusion Filter */}
          <ExclusionFilter
            exclusions={exclusions}
            onExclusionsChange={setExclusions}
            availableSymbols={availableSymbols}
          />
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
                <p className={`text-xs ${kpis.periodReturnPercent >= 0 ? "text-green-500" : "text-red-500"}`}>
                  ({kpis.periodReturnPercent >= 0 ? "+" : ""}{kpis.periodReturnPercent.toFixed(2)}%)
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
                    tickFormatter={(val) => displayCurrency === "EUR" ? `€${(val / 1000).toFixed(0)}k` : `$${(val / 1000).toFixed(0)}k`}
                    className="text-muted-foreground"
                    domain={['auto', 'auto']}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                    }}
                    formatter={(value: number) => [formatCurrency(displayCurrency === "EUR" ? value / exchangeRate : value), "Saldo"]}
                  />
                  <ReferenceLine 
                    y={displayCurrency === "EUR" ? convertToEur(INITIAL_BALANCE) : INITIAL_BALANCE} 
                    stroke="hsl(var(--muted-foreground))" 
                    strokeDasharray="3 3" 
                  />
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
            <div className="flex items-center justify-between flex-wrap gap-3">
              <CardTitle>Trades Ejecutados</CardTitle>
              <div className="flex items-center gap-3">
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
                <ColumnSelector columns={columns} onColumnChange={handleColumnChange} />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    {isColumnVisible("date_time") && <TableHead>Fecha</TableHead>}
                    {isColumnVisible("symbol") && <TableHead>Símbolo</TableHead>}
                    {isColumnVisible("alias") && (
                      <TableHead>
                        <div className="flex items-center gap-1">
                          Alias
                          <AliasManagerModal
                            aliases={aliases}
                            allSymbols={availableSymbols}
                            onUpdateAlias={upsertAlias}
                            onDeleteAlias={deleteAlias}
                          />
                        </div>
                      </TableHead>
                    )}
                    {isColumnVisible("action") && <TableHead>Posición</TableHead>}
                    {isColumnVisible("side") && <TableHead>Acción</TableHead>}
                    {isColumnVisible("quantity") && <TableHead className="text-right">Cantidad</TableHead>}
                    {isColumnVisible("price") && <TableHead className="text-right">Precio</TableHead>}
                    {isColumnVisible("realized_pnl") && <TableHead className="text-right">P&L</TableHead>}
                    {isColumnVisible("commission") && <TableHead className="text-right">Comisión</TableHead>}
                    {isColumnVisible("saldo_actual") && <TableHead className="text-right">Saldo</TableHead>}
                    {isColumnVisible("trade_duration") && <TableHead>Duración</TableHead>}
                    {isColumnVisible("id") && <TableHead>ID DB</TableHead>}
                    {isColumnVisible("ib_trade_id") && <TableHead>ID IBKR</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedTrades.length > 0 ? (
                    paginatedTrades.map((trade) => (
                      <TableRow key={trade.id}>
                        {isColumnVisible("date_time") && (
                          <TableCell className="text-sm whitespace-nowrap">
                            {format(parseISO(trade.date_time), "dd/MM/yyyy HH:mm")}
                          </TableCell>
                        )}
                        {isColumnVisible("symbol") && (
                          <TableCell className="font-medium">{trade.symbol}</TableCell>
                        )}
                        {isColumnVisible("alias") && (
                          <TableCell>
                            <InlineAliasEditor
                              symbol={trade.symbol}
                              currentAlias={getAliasForSymbol(trade.symbol)}
                              onSave={upsertAlias}
                            />
                          </TableCell>
                        )}
                        {isColumnVisible("action") && (
                          <TableCell>
                            {trade.action ? (
                              <Badge variant={trade.action === "L" ? "default" : "destructive"}>
                                {trade.action === "L" ? "Long" : "Short"}
                              </Badge>
                            ) : null}
                          </TableCell>
                        )}
                        {isColumnVisible("side") && (
                          <TableCell>
                            <Badge variant={trade.side === "BUY" ? "outline" : "destructive"}>
                              {trade.side}
                            </Badge>
                          </TableCell>
                        )}
                        {isColumnVisible("quantity") && (
                          <TableCell className="text-right">{trade.quantity}</TableCell>
                        )}
                        {isColumnVisible("price") && (
                          <TableCell className="text-right">
                            {displayCurrency === "EUR" ? "€" : "$"}{trade.price.toFixed(2)}
                          </TableCell>
                        )}
                        {isColumnVisible("realized_pnl") && (
                          <TableCell className={`text-right font-medium ${(trade.realized_pnl || 0) >= 0 ? "text-green-500" : "text-red-500"}`}>
                            {formatCurrency(trade.realized_pnl || 0)}
                          </TableCell>
                        )}
                        {isColumnVisible("commission") && (
                          <TableCell className="text-right text-muted-foreground">
                            {displayCurrency === "EUR" ? "€" : "$"}{trade.commission.toFixed(2)}
                          </TableCell>
                        )}
                        {isColumnVisible("saldo_actual") && (
                          <TableCell className="text-right">
                            {formatCurrency(trade.saldo_actual || 0)}
                          </TableCell>
                        )}
                        {isColumnVisible("trade_duration") && (
                          <TableCell className="text-sm text-muted-foreground font-mono">
                            {trade.trade_duration || "-"}
                          </TableCell>
                        )}
                        {isColumnVisible("id") && (
                          <TableCell className="text-xs text-muted-foreground font-mono">
                            {trade.id.substring(0, 8)}...
                          </TableCell>
                        )}
                        {isColumnVisible("ib_trade_id") && (
                          <TableCell className="text-xs text-muted-foreground font-mono">
                            {trade.ib_trade_id}
                          </TableCell>
                        )}
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={12} className="text-center py-8 text-muted-foreground">
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

      {/* AI Chatbot */}
      <TradingChatbot
        tradingContext={{
          currentBalance: kpis.currentBalance,
          totalPnL: kpis.totalPnL,
          returnPercent: kpis.returnPercent,
          winRate: kpis.winRate,
          avgWin: kpis.avgWin,
          avgLoss: kpis.avgLoss,
          sharpeRatio: kpis.sharpeRatio,
          maxDrawdown: kpis.maxDrawdown,
          totalTrades: kpis.totalTrades,
          recentTrades: searchedTrades.slice(0, 20).map(t => ({
            symbol: t.symbol,
            pnl: t.realized_pnl || 0,
            date: format(parseISO(t.date_time), "dd/MM/yyyy HH:mm"),
            action: t.action || t.side,
          })),
        }}
      />
    </AppLayout>
  );
}
