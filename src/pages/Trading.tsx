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
import { RefreshCw, Search, TrendingUp, TrendingDown, Activity, Target, BarChart3, Percent, CalendarIcon, Settings, Globe } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { format, subDays, subWeeks, subMonths, startOfYear, parseISO, isAfter, isBefore, startOfDay, endOfDay, isSameDay } from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { DailyReturnGauge } from "@/components/trading/DailyReturnGauge";
import { ColumnSelector, ColumnConfig } from "@/components/trading/ColumnSelector";
import { ExclusionFilter, ExclusionRule, PresetConfig } from "@/components/trading/ExclusionFilter";
import { CurrencyToggle } from "@/components/trading/CurrencyToggle";
import { useTradeProcessing, ProcessedTrade } from "@/hooks/use-trade-processing";
import { useExchangeRate } from "@/hooks/use-exchange-rate";
import { useAssetAliases } from "@/hooks/use-asset-aliases";
import { AliasManagerModal } from "@/components/trading/AliasManagerModal";
import { InlineAliasEditor } from "@/components/trading/InlineAliasEditor";
import { TradingChatbot } from "@/components/trading/TradingChatbot";
import { OpenPositionsTable } from "@/components/trading/OpenPositionsTable";
import { NavSummaryCards } from "@/components/trading/NavSummaryCards";
import { DateRange } from "react-day-picker";

type Period = "T" | "1D" | "1W" | "1M" | "YTD" | "ALL" | "CUSTOM";

type TimezoneOption = "America/New_York" | "Europe/Madrid" | "Europe/London" | "UTC";

const TIMEZONE_LABELS: Record<TimezoneOption, string> = {
  "America/New_York": "Nueva York (ET)",
  "Europe/Madrid": "España (GMT+1)",
  "Europe/London": "Londres (GMT)",
  "UTC": "UTC",
};

// Hours to ADD to NY time to get target timezone
const TZ_OFFSET_FROM_NY: Record<TimezoneOption, number> = {
  "America/New_York": 0,
  "Europe/Madrid": 6,   // NY(EST) = GMT-5, España = GMT+1 → +6h
  "Europe/London": 5,   // NY(EST) = GMT-5, Londres = GMT → +5h
  "UTC": 5,             // NY(EST) = GMT-5, UTC = GMT → +5h
};

/** Convert a date_time string (stored as NY time) to the target timezone for display */
function formatInTimezone(dateStr: string, tz: TimezoneOption, _fmt: string): string {
  // The date_time from IBKR XML is New York time, stored naively (no tz info).
  // parseISO treats it as UTC, but it's actually NY. We apply a manual offset.
  const parsed = parseISO(dateStr);
  const offset = TZ_OFFSET_FROM_NY[tz];
  const adjusted = new Date(parsed.getTime() + offset * 60 * 60 * 1000);
  const dd = String(adjusted.getUTCDate()).padStart(2, "0");
  const mm = String(adjusted.getUTCMonth() + 1).padStart(2, "0");
  const yyyy = adjusted.getUTCFullYear();
  const hh = String(adjusted.getUTCHours()).padStart(2, "0");
  const min = String(adjusted.getUTCMinutes()).padStart(2, "0");
  return `${dd}/${mm}/${yyyy} ${hh}:${min}`;
}

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
  net_cash?: number | null;
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

// Account configuration
type AccountId = "U22563190" | "TSC" | "ALL";

interface AccountConfig {
  name: string;
  initialBalance: number;
  table: "ib_trades" | "ib_trades_tsc";
  syncFunction: string;
  excludeBefore?: Date;
}

const ACCOUNT_CONFIG: Record<Exclude<AccountId, "ALL">, AccountConfig> = {
  "U22563190": {
    name: "Principal",
    initialBalance: 524711.04,
    table: "ib_trades",
    syncFunction: "sync-ibkr-trades",
  },
  "TSC": {
    name: "TSC",
    initialBalance: 414594.50,
    table: "ib_trades_tsc",
    syncFunction: "sync-ibkr-trades-tsc",
    excludeBefore: new Date("2025-01-15"),
  },
};

// Presets for exclusion filter per account
const ACCOUNT_PRESETS: Record<Exclude<AccountId, "ALL">, PresetConfig> = {
  "U22563190": {
    label: "MBTX5 (12-17 Nov 2025)",
    exclusions: [{
      symbol: "MBTX5",
      dates: [],
      allDates: false,
    }],
  },
  "TSC": {
    label: "3SLE, QIH6, IGLN (todos)",
    exclusions: [
      { symbol: "3SLE", dates: [], allDates: true },
      { symbol: "QIH6", dates: [], allDates: true },
      { symbol: "IGLN", dates: [], allDates: true },
    ],
  },
};

const DEFAULT_ACCOUNT: AccountId = "TSC";

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
  const [navCurrency, setNavCurrency] = useState<"USD" | "EUR">("EUR");
  const [tradesCurrency, setTradesCurrency] = useState<"USD" | "EUR">("USD");
  const [selectedAccount, setSelectedAccount] = useState<AccountId>(DEFAULT_ACCOUNT);
  const [positionsRefreshTrigger, setPositionsRefreshTrigger] = useState(0);
  const [metadataStartingCash, setMetadataStartingCash] = useState<number | null>(null);
  const [metadataEndingCash, setMetadataEndingCash] = useState<number | null>(null);
  const [timezone, setTimezone] = useState<TimezoneOption>("Europe/Madrid");
  const [navHistory, setNavHistory] = useState<{ report_date: string; total: number; cash: number; stock: number }[]>([]);
  const pageSize = 20;

  // Get initial balance: prefer metadata startingCash, fallback to config
  const getInitialBalance = () => {
    if (metadataStartingCash !== null && selectedAccount !== "ALL") {
      return metadataStartingCash;
    }
    if (selectedAccount === "ALL") {
      return ACCOUNT_CONFIG["U22563190"].initialBalance + ACCOUNT_CONFIG["TSC"].initialBalance;
    }
    return ACCOUNT_CONFIG[selectedAccount].initialBalance;
  };

  // Process trades with FIFO matching
  const trades = useTradeProcessing(rawTrades);
  
  // Exchange rate hook
  const { rate: exchangeRate, convertToEur, convertToUsd } = useExchangeRate();

  // Asset aliases hook
  const { aliases, getAliasForSymbol, upsertAlias, deleteAlias } = useAssetAliases();

  // Fetch metadata (startingCash, endingCash) from ib_sync_metadata
  const fetchMetadata = async () => {
    if (selectedAccount === "ALL") {
      setMetadataStartingCash(null);
      setMetadataEndingCash(null);
      return;
    }
    const accountId = selectedAccount === "U22563190" ? "U22563190" : "TSC";
    const { data } = await supabase
      .from("ib_sync_metadata")
      .select("starting_cash, ending_cash")
      .eq("account_id", accountId)
      .maybeSingle();
    if (data) {
      setMetadataStartingCash(data.starting_cash ? Number(data.starting_cash) : null);
      setMetadataEndingCash(data.ending_cash ? Number(data.ending_cash) : null);
    }
  };

  // Fetch NAV history
  const fetchNavHistory = async () => {
    const { data } = await supabase
      .from("ib_nav_history")
      .select("report_date, total, cash, stock")
      .eq("account_id", selectedAccount === "ALL" ? "TSC" : (selectedAccount === "U22563190" ? "U22563190" : "TSC"))
      .order("report_date", { ascending: true });
    setNavHistory(data || []);
  };

  // Fetch trades and metadata when account changes
  useEffect(() => {
    fetchTrades();
    fetchMetadata();
    fetchNavHistory();
  }, [selectedAccount]);

  // Countdown timer for cooldown
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => {
      setCooldown(prev => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  const fetchTrades = async () => {
    setLoading(true);
    try {
      if (selectedAccount === "ALL") {
        // Fetch from both tables
        const [result1, result2] = await Promise.all([
          supabase.from("ib_trades").select("*").order("date_time", { ascending: false }),
          supabase.from("ib_trades_tsc").select("*").order("date_time", { ascending: false }),
        ]);
        
        if (result1.error) throw result1.error;
        if (result2.error) throw result2.error;
        
        const allTrades = [...(result1.data || []), ...(result2.data || [])];
        allTrades.sort((a, b) => new Date(b.date_time).getTime() - new Date(a.date_time).getTime());
        setRawTrades(allTrades);
      } else {
        const config = ACCOUNT_CONFIG[selectedAccount];
        const { data, error } = await supabase
          .from(config.table)
          .select("*")
          .order("date_time", { ascending: false });

        if (error) throw error;
        setRawTrades(data || []);
      }
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
      if (selectedAccount === "ALL") {
        // Sync both accounts sequentially
        const { data: data1, error: error1 } = await supabase.functions.invoke("sync-ibkr-trades");
        if (error1) throw error1;
        
        const { data: data2, error: error2 } = await supabase.functions.invoke("sync-ibkr-trades-tsc");
        if (error2) throw error2;
        
        toast({
          title: "Sincronización completada",
          description: `Principal: ${data1?.count || 0} trades, TSC: ${data2?.count || 0} trades`,
        });
      } else {
        const config = ACCOUNT_CONFIG[selectedAccount];
        const { data, error } = await supabase.functions.invoke(config.syncFunction);

        if (error) throw error;

        toast({
          title: "Sincronización completada",
          description: data?.message || "Trades actualizados correctamente",
        });
      }

      await fetchTrades();
      await fetchMetadata();
      await fetchNavHistory();
      setPositionsRefreshTrigger(prev => prev + 1);
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

  // NAV formatting (values come in EUR from IBKR)
  const formatNavCurrency = (value: number) => {
    if (navCurrency === "USD") {
      return new Intl.NumberFormat("es-ES", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(convertToUsd(value));
    }
    return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(value);
  };

  // Trades formatting (values come in USD from IBKR)
  const formatTradesCurrency = (value: number) => {
    if (tradesCurrency === "EUR") {
      return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(convertToEur(value));
    }
    return new Intl.NumberFormat("es-ES", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(value);
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
          // If allDates flag is set or dates array is empty, exclude all dates for this symbol
          if (exclusion.allDates || exclusion.dates.length === 0) {
            return false;
          }
          // Otherwise check specific dates
          for (const excludedDate of exclusion.dates) {
            if (isSameDay(tradeDate, excludedDate)) {
              return false;
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
    
    let periodStartBalance = getInitialBalance();
    if (sortedTrades.length > 0) {
      const firstFilteredDate = new Date(sortedTrades[0].date_time);
      for (const trade of allSortedTrades) {
        const tradeDate = new Date(trade.date_time);
        if (tradeDate >= firstFilteredDate) break;
        periodStartBalance += (trade.realized_pnl || 0) - (trade.commission || 0);
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

    // Calculate running balance from PnL (not from stored saldo_actual which may be stale)
    const initialBalance = getInitialBalance();
    const allTotalPnL = trades
      .filter(t => t.realized_pnl !== null && t.realized_pnl !== 0)
      .reduce((sum, t) => sum + (t.realized_pnl || 0), 0);
    const allTotalCommission = trades.reduce((sum, t) => sum + (t.commission || 0), 0);
    
    // currentBalance = startingCash + all realized PnL - all commissions
    const currentBalance = initialBalance + allTotalPnL - allTotalCommission;
    
    // Return % based on starting cash
    const returnPercent = initialBalance > 0 ? ((currentBalance - initialBalance) / initialBalance) * 100 : 0;

    // Period start balance for filtered trades
    const sortedFilteredTrades = [...filteredByExclusions].sort((a, b) => 
      new Date(a.date_time).getTime() - new Date(b.date_time).getTime()
    );
    
    const allSortedTrades = [...trades].sort((a, b) => 
      new Date(a.date_time).getTime() - new Date(b.date_time).getTime()
    );
    
    let periodStartBalance = initialBalance;
    if (sortedFilteredTrades.length > 0) {
      const firstFilteredDate = new Date(sortedFilteredTrades[0].date_time);
      for (const trade of allSortedTrades) {
        const tradeDate = new Date(trade.date_time);
        if (tradeDate >= firstFilteredDate) break;
        periodStartBalance += (trade.realized_pnl || 0) - (trade.commission || 0);
      }
    }
    
    const periodReturnPercent = periodStartBalance > 0 
      ? (totalPnL / periodStartBalance) * 100 
      : 0;

    // Max Drawdown calculated from PnL-based running balance
    let runningBal = initialBalance;
    let peak = initialBalance;
    let maxDrawdown = 0;
    
    for (const trade of allSortedTrades) {
      runningBal += (trade.realized_pnl || 0) - (trade.commission || 0);
      if (runningBal > peak) peak = runningBal;
      const drawdown = peak - runningBal;
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
      totalTrades: closingTrades.length,
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

  // Chart data: prefer NAV history from ib_nav_history; fallback to trade-based calculation
  const chartData = useMemo(() => {
    if (navHistory.length > 0) {
      // Use NAV time series directly
      const { start, end } = getFilterDates(selectedPeriod);
      let filtered = navHistory;
      if (start) {
        filtered = filtered.filter(n => {
          const d = new Date(n.report_date);
          const afterStart = d >= startOfDay(start);
          const beforeEnd = !end || d <= endOfDay(end);
          return afterStart && beforeEnd;
        });
      }
      const firstTotal = filtered.length > 0 ? filtered[0].total : 0;
      return filtered.map(n => {
        const total = Number(n.total);
        return {
          date: format(new Date(n.report_date), "dd/MM"),
          balance: navCurrency === "USD" ? convertToUsd(total) : total,
          pnl: navCurrency === "USD" ? convertToUsd(total - firstTotal) : (total - firstTotal),
          dailyPnL: 0,
        };
      });
    }

    // Fallback: calculate from trades
    const sortedTrades = [...filteredByExclusions]
      .sort((a, b) => new Date(a.date_time).getTime() - new Date(b.date_time).getTime());

    if (sortedTrades.length === 0) return [];

    const dailyData: Record<string, { balance: number; pnl: number; dailyPnL: number }> = {};
    
    const allSortedTrades = [...trades].sort((a, b) => 
      new Date(a.date_time).getTime() - new Date(b.date_time).getTime()
    );
    
    const firstFilteredDate = new Date(sortedTrades[0].date_time);
    let startingBalance = getInitialBalance();
    
    for (const trade of allSortedTrades) {
      const tradeDate = new Date(trade.date_time);
      if (tradeDate >= firstFilteredDate) break;
      startingBalance += (trade.realized_pnl || 0) - (trade.commission || 0);
    }
    
    let cumBalance = startingBalance;
    
    sortedTrades.forEach(trade => {
      const dateKey = format(parseISO(trade.date_time), "dd/MM");
      const pnl = (trade.realized_pnl || 0) - (trade.commission || 0);
      cumBalance += pnl;
      
      if (!dailyData[dateKey]) {
        dailyData[dateKey] = { balance: cumBalance, pnl: cumBalance - getInitialBalance(), dailyPnL: pnl };
      } else {
        dailyData[dateKey].balance = cumBalance;
        dailyData[dateKey].pnl = cumBalance - getInitialBalance();
        dailyData[dateKey].dailyPnL += pnl;
      }
    });

    return Object.entries(dailyData).map(([date, data]) => ({
      date,
      balance: navCurrency === "USD" ? convertToUsd(data.balance) : data.balance,
      pnl: navCurrency === "USD" ? convertToUsd(data.pnl) : data.pnl,
      dailyPnL: navCurrency === "USD" ? convertToUsd(data.dailyPnL) : data.dailyPnL,
    }));
  }, [filteredByExclusions, trades, navCurrency, convertToEur, convertToUsd, navHistory, selectedPeriod]);

  // Compute client-side running balance: startingCash + cumulative netCash (or pnl-commission if netCash=0)
  const computedBalanceMap = useMemo(() => {
    const map: Record<string, number> = {};
    const sorted = [...trades].sort((a, b) => {
      const dateCmp = new Date(a.date_time).getTime() - new Date(b.date_time).getTime();
      if (dateCmp !== 0) return dateCmp;
      return (parseInt(a.ib_trade_id) || 0) - (parseInt(b.ib_trade_id) || 0);
    });
    let bal = getInitialBalance();
    for (const t of sorted) {
      const netCash = (t as any).net_cash;
      if (netCash && netCash !== 0) {
        bal += Number(netCash);
      } else {
        bal += (t.realized_pnl || 0) - (t.commission || 0);
      }
      map[t.id] = bal;
    }
    return map;
  }, [trades, metadataStartingCash]);

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
    
    // Only count trades with realized_pnl !== 0
    const tradesWithPnL = filteredByExclusions.filter(t => t.realized_pnl !== null && t.realized_pnl !== 0);
    
    tradesWithPnL.forEach(trade => {
      const key = trade.symbol;
      if (!bySymbol[key]) {
        bySymbol[key] = { pnl: 0, trades: 0, wins: 0 };
      }
      bySymbol[key].trades++;
      bySymbol[key].pnl += trade.realized_pnl || 0;
      if ((trade.realized_pnl || 0) > 0) bySymbol[key].wins++;
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
      <div className="container mx-auto px-2 py-3 sm:p-6 space-y-3 sm:space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-lg sm:text-3xl font-bold tracking-tight text-foreground">Trading</h1>
          <div className="flex items-center gap-1.5 sm:gap-3">
            <Select value={selectedAccount} onValueChange={(v) => setSelectedAccount(v as AccountId)}>
              <SelectTrigger className="w-[90px] sm:w-[180px] text-xs sm:text-sm h-8 sm:h-10">
                <SelectValue placeholder="Cuenta" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="U22563190">Principal</SelectItem>
                <SelectItem value="TSC">TSC</SelectItem>
                <SelectItem value="ALL">Todas</SelectItem>
              </SelectContent>
            </Select>
            
            <Button 
              onClick={syncTrades} 
              disabled={syncing || cooldown > 0}
              variant="outline"
              size="sm"
              className="text-xs h-8 sm:h-10 px-2 sm:px-3"
            >
              <RefreshCw className={`h-3.5 w-3.5 sm:h-4 sm:w-4 ${syncing ? "animate-spin" : ""}`} />
              <span className="hidden sm:inline ml-2">{syncing ? "Actualizando..." : cooldown > 0 ? `Espera ${cooldown}s` : "Refresh"}</span>
              <span className="sm:hidden ml-1">{syncing ? "..." : cooldown > 0 ? `${cooldown}s` : ""}</span>
            </Button>
          </div>
        </div>

        {/* Top-Level Filters */}
        <div className="space-y-1.5 sm:space-y-0 sm:flex sm:flex-wrap sm:gap-3 sm:items-center">
          {/* Period Filter */}
          <div className="flex gap-0.5 flex-wrap">
            {periods.map((period) => (
              <Button
                key={period.key}
                variant={selectedPeriod === period.key ? "default" : "outline"}
                size="sm"
                className="h-7 sm:h-9 px-2 sm:px-3 text-[11px] sm:text-xs"
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
                  className={cn("gap-1 h-7 sm:h-9 px-2 sm:px-3 text-[11px] sm:text-xs", selectedPeriod === "CUSTOM" && "bg-primary")}
                >
                  <CalendarIcon className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                  <span className="hidden sm:inline">
                    {dateRange?.from ? (
                      dateRange.to ? (
                        `${format(dateRange.from, "dd/MM")} - ${format(dateRange.to, "dd/MM")}`
                      ) : (
                        format(dateRange.from, "dd/MM/yy")
                      )
                    ) : (
                      "Custom"
                    )}
                  </span>
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

          {/* Second row on mobile: toggles & filters */}
          <div className="flex gap-1.5 items-center flex-wrap">
            <div className="hidden sm:block h-5 w-px bg-border" />

            <CurrencyToggle
              currency={navCurrency}
              onCurrencyChange={setNavCurrency}
              exchangeRate={exchangeRate}
            />

            <Select value={timezone} onValueChange={(v) => setTimezone(v as TimezoneOption)}>
              <SelectTrigger className="w-[100px] sm:w-[160px] text-[10px] sm:text-xs h-7 sm:h-9">
                <Globe className="h-3 w-3 mr-1 text-muted-foreground shrink-0" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.entries(TIMEZONE_LABELS) as [TimezoneOption, string][]).map(([value, label]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <ExclusionFilter
              exclusions={exclusions}
              onExclusionsChange={setExclusions}
              availableSymbols={availableSymbols}
              preset={selectedAccount !== "ALL" ? ACCOUNT_PRESETS[selectedAccount] : undefined}
            />
          </div>
        </div>

        {/* NAV Summary Cards */}
        <NavSummaryCards
          formatCurrency={formatNavCurrency}
          refreshTrigger={positionsRefreshTrigger}
        />

        {/* Main Metrics Row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4">
          {/* Current PnL Balance Card */}
          <Card>
            <CardContent className="p-2.5 sm:pt-6">
              <p className="text-[10px] sm:text-sm text-muted-foreground mb-0.5">Saldo P&L Acumulado</p>
              <p className="text-base sm:text-3xl font-bold text-foreground">{formatNavCurrency(kpis.currentBalance)}</p>
              <p className={`text-[10px] sm:text-xs mt-0.5 ${kpis.returnPercent >= 0 ? "text-green-500" : "text-red-500"}`}>
                {kpis.returnPercent >= 0 ? "+" : ""}{kpis.returnPercent.toFixed(2)}%
              </p>
            </CardContent>
          </Card>

          {/* Daily Return Gauge */}
          <div>
            <DailyReturnGauge 
              dailyReturn={dailyMetrics.dailyReturn}
              avgDailyReturn={dailyMetrics.avgDailyReturn}
              lastCompleteDayReturn={dailyMetrics.lastCompleteDayReturn}
            />
          </div>

          {/* KPI Cards */}
          <div className="col-span-2 grid grid-cols-3 gap-1.5 sm:gap-3">
            <Card>
              <CardContent className="p-2 sm:pt-4">
                <div className="flex items-center gap-1">
                  <TrendingUp className="h-3 w-3 sm:h-4 sm:w-4 text-muted-foreground shrink-0" />
                  <span className="text-[9px] sm:text-xs text-muted-foreground truncate">P&L</span>
                </div>
                <p className={`text-xs sm:text-lg font-bold truncate ${kpis.totalPnL >= 0 ? "text-green-500" : "text-red-500"}`}>
                  {formatTradesCurrency(kpis.totalPnL)}
                </p>
                <p className={`text-[9px] sm:text-xs ${kpis.periodReturnPercent >= 0 ? "text-green-500" : "text-red-500"}`}>
                  {kpis.periodReturnPercent >= 0 ? "+" : ""}{kpis.periodReturnPercent.toFixed(2)}%
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-2 sm:pt-4">
                <div className="flex items-center gap-1">
                  <Activity className="h-3 w-3 sm:h-4 sm:w-4 text-muted-foreground shrink-0" />
                  <span className="text-[9px] sm:text-xs text-muted-foreground truncate">Trades</span>
                </div>
                <p className="text-xs sm:text-lg font-bold">{kpis.totalTrades}</p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-2 sm:pt-4">
                <div className="flex items-center gap-1">
                  <Target className="h-3 w-3 sm:h-4 sm:w-4 text-muted-foreground shrink-0" />
                  <span className="text-[9px] sm:text-xs text-muted-foreground truncate">Win Rate</span>
                </div>
                <p className="text-xs sm:text-lg font-bold">{kpis.winRate.toFixed(1)}%</p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-2 sm:pt-4">
                <div className="flex items-center gap-1">
                  <TrendingDown className="h-3 w-3 sm:h-4 sm:w-4 text-muted-foreground shrink-0" />
                  <span className="text-[9px] sm:text-xs text-muted-foreground truncate">Max DD</span>
                </div>
                <p className="text-xs sm:text-lg font-bold text-destructive truncate">
                  {formatTradesCurrency(kpis.maxDrawdown)}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-2 sm:pt-4">
                <div className="flex items-center gap-1">
                  <BarChart3 className="h-3 w-3 sm:h-4 sm:w-4 text-muted-foreground shrink-0" />
                  <span className="text-[9px] sm:text-xs text-muted-foreground truncate">Sharpe</span>
                </div>
                <p className="text-xs sm:text-lg font-bold">{kpis.sharpeRatio.toFixed(2)}</p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-2 sm:pt-4">
                <div className="flex items-center gap-1">
                  <Percent className="h-3 w-3 sm:h-4 sm:w-4 text-muted-foreground shrink-0" />
                  <span className="text-[9px] sm:text-xs text-muted-foreground truncate">Avg W/L</span>
                </div>
                <p className="text-[9px] sm:text-xs font-medium truncate">
                  <span className="text-green-500">{formatTradesCurrency(kpis.avgWin)}</span>
                  <span className="text-muted-foreground"> / </span>
                  <span className="text-red-500">{formatTradesCurrency(kpis.avgLoss)}</span>
                </p>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Performance Chart */}
        <Card>
          <CardHeader className="p-3 sm:p-6">
            <CardTitle className="text-sm sm:text-lg">Rendimiento Acumulado (Saldo)</CardTitle>
          </CardHeader>
          <CardContent className="p-2 sm:p-6 pt-0">
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={220} className="sm:!h-[300px]">
                <LineChart data={chartData} margin={{ left: -10, right: 5, top: 5, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis 
                    dataKey="date" 
                    tick={{ fontSize: 10 }}
                    className="text-muted-foreground"
                    interval="preserveStartEnd"
                  />
                  <YAxis 
                    tick={{ fontSize: 10 }}
                    tickFormatter={(val) => navCurrency === "USD" ? `$${(val / 1000).toFixed(0)}k` : `€${(val / 1000).toFixed(0)}k`}
                    className="text-muted-foreground"
                    domain={['auto', 'auto']}
                    width={45}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                      fontSize: "12px",
                    }}
                    formatter={(value: number) => [formatNavCurrency(value), "Saldo"]}
                  />
                  <ReferenceLine 
                    y={navCurrency === "USD" ? convertToUsd(getInitialBalance()) : getInitialBalance()}
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
              <div className="h-[220px] sm:h-[300px] flex items-center justify-center text-muted-foreground text-sm">
                No hay datos para mostrar
              </div>
            )}
          </CardContent>
        </Card>

        {/* Symbol Performance */}
        <Card>
          <CardHeader className="p-3 sm:p-6">
            <CardTitle className="text-sm sm:text-lg">Rendimiento por Símbolo</CardTitle>
          </CardHeader>
          <CardContent className="p-2 sm:p-6 pt-0">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-1.5 sm:gap-4">
              {symbolPerformance.map((symbol) => (
                <div
                  key={symbol.name}
                  className="p-2 sm:p-4 rounded-lg border bg-card"
                >
                  <div className="flex items-center justify-between mb-0.5 sm:mb-2">
                    <Badge variant="outline" className="font-mono text-[9px] sm:text-xs px-1.5 sm:px-2">{symbol.name}</Badge>
                    <span className="text-[9px] sm:text-xs text-muted-foreground">
                      {symbol.trades}
                    </span>
                  </div>
                  <p className={`text-xs sm:text-lg font-bold truncate ${symbol.pnl >= 0 ? "text-green-500" : "text-red-500"}`}>
                    {formatTradesCurrency(symbol.pnl)}
                  </p>
                  <p className="text-[9px] sm:text-xs text-muted-foreground">
                    WR: {symbol.winRate.toFixed(1)}%
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Open Positions */}
        <OpenPositionsTable
          formatCurrency={formatNavCurrency}
          displayCurrency={navCurrency}
          refreshTrigger={positionsRefreshTrigger}
        />

        {/* Trades Table */}
        <Card>
          <CardHeader className="p-3 sm:p-6">
            <div className="space-y-2 sm:space-y-0 sm:flex sm:items-center sm:justify-between sm:gap-3">
              <CardTitle className="text-sm sm:text-lg">Trades Ejecutados</CardTitle>
              <div className="flex items-center gap-1.5 sm:gap-3">
                <CurrencyToggle
                  currency={tradesCurrency}
                  onCurrencyChange={setTradesCurrency}
                  exchangeRate={exchangeRate}
                />
                <div className="relative flex-1 sm:w-64">
                  <Search className="absolute left-2 sm:left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 sm:h-4 sm:w-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar..."
                    value={searchTerm}
                    onChange={(e) => {
                      setSearchTerm(e.target.value);
                      setCurrentPage(1);
                    }}
                    className="pl-7 sm:pl-9 h-8 sm:h-10 text-xs sm:text-sm"
                  />
                </div>
                <ColumnSelector columns={columns} onColumnChange={handleColumnChange} />
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-2 sm:p-6 pt-0">
            <div className="rounded-md border overflow-x-auto -mx-0.5">
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
                            {formatInTimezone(trade.date_time, timezone, "dd/MM/yyyy HH:mm")}
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
                            {tradesCurrency === "EUR" ? "€" : "$"}{Math.round(trade.price).toLocaleString("es-ES")}
                          </TableCell>
                        )}
                        {isColumnVisible("realized_pnl") && (
                          <TableCell className={`text-right font-medium ${(trade.realized_pnl || 0) >= 0 ? "text-green-500" : "text-red-500"}`}>
                            {formatTradesCurrency(trade.realized_pnl || 0)}
                          </TableCell>
                        )}
                        {isColumnVisible("commission") && (
                          <TableCell className="text-right text-muted-foreground">
                            {tradesCurrency === "EUR" ? "€" : "$"}{Math.round(trade.commission).toLocaleString("es-ES")}
                          </TableCell>
                        )}
                        {isColumnVisible("saldo_actual") && (
                          <TableCell className="text-right">
                            {formatTradesCurrency(computedBalanceMap[trade.id] || 0)}
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
              <div className="flex flex-col sm:flex-row items-center justify-between mt-4 gap-2">
                <p className="text-xs sm:text-sm text-muted-foreground">
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
            date: formatInTimezone(t.date_time, timezone, "dd/MM/yyyy HH:mm"),
            action: t.action || t.side,
          })),
        }}
      />
    </AppLayout>
  );
}
