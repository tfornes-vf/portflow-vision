import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface IBKRTrade {
  tradeID: string;
  symbol: string;
  dateTime: string;
  quantity: number;
  tradePrice: number;
  ibCommission: number;
  fifoPnlRealized: number;
  netCash: number;
  buySell: string;
  accountId: string;
  closePrice: number;
}

interface IBKROpenPosition {
  symbol: string;
  quantity: number;
  costPrice: number;
  marketPrice: number;
  marketValue: number;
  unrealizedPnl: number;
  currency: string;
  accountId: string;
}

interface NavDataPoint {
  reportDate: string; // YYYYMMDD
  total: number;
  cash: number;
  stock: number;
}

// Exclude trades before this date for TSC account
const EXCLUDE_BEFORE = new Date("2025-01-15T00:00:00Z");

// Parse IBKR date format: "20251104;122328" -> ISO string
function parseIBKRDate(dateStr: string): string {
  if (!dateStr || dateStr.trim() === '') {
    return new Date().toISOString();
  }

  const matchWithTime = dateStr.match(/^(\d{4})(\d{2})(\d{2});(\d{2})(\d{2})(\d{2})?/);
  if (matchWithTime) {
    const [, year, month, day, hour, min, sec = '00'] = matchWithTime;
    const date = new Date(`${year}-${month}-${day}T${hour}:${min}:${sec}Z`);
    if (!isNaN(date.getTime())) return date.toISOString();
  }

  const matchDateOnly = dateStr.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (matchDateOnly) {
    const [, year, month, day] = matchDateOnly;
    const date = new Date(`${year}-${month}-${day}T00:00:00Z`);
    if (!isNaN(date.getTime())) return date.toISOString();
  }

  const date = new Date(dateStr);
  if (!isNaN(date.getTime())) return date.toISOString();

  console.warn(`Could not parse date: ${dateStr}, using current date`);
  return new Date().toISOString();
}

// Parse reportDate "YYYYMMDD" -> "YYYY-MM-DD"
function parseReportDate(dateStr: string): string {
  const m = dateStr.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return dateStr;
}

// Extract EquitySummaryByReportDateInBase nodes from XML
function parseNavData(xml: string): NavDataPoint[] {
  const results: NavDataPoint[] = [];
  const regex = /<EquitySummaryByReportDateInBase\s+([^>]*?)\s*\/>/gs;
  let match;

  while ((match = regex.exec(xml)) !== null) {
    const attrs = match[1];
    const getAttr = (name: string): string => {
      const attrMatch = attrs.match(new RegExp(`${name}\\s*=\\s*"([^"]*)"`, 'i'));
      return attrMatch ? attrMatch[1] : "";
    };

    const reportDate = getAttr('reportDate');
    const totalStr = getAttr('total');
    const cashStr = getAttr('cash');
    const stockStr = getAttr('stock');

    if (reportDate && totalStr) {
      results.push({
        reportDate,
        total: parseFloat(totalStr) || 0,
        cash: parseFloat(cashStr) || 0,
        stock: parseFloat(stockStr) || 0,
      });
    }
  }

  // Also try EquitySummaryInBase (alternative node name)
  const regex2 = /<EquitySummaryInBase\s+([^>]*?)\s*\/>/gs;
  while ((match = regex2.exec(xml)) !== null) {
    const attrs = match[1];
    const getAttr = (name: string): string => {
      const attrMatch = attrs.match(new RegExp(`${name}\\s*=\\s*"([^"]*)"`, 'i'));
      return attrMatch ? attrMatch[1] : "";
    };

    const reportDate = getAttr('reportDate');
    const totalStr = getAttr('total');
    if (reportDate && totalStr && !results.find(r => r.reportDate === reportDate)) {
      results.push({
        reportDate,
        total: parseFloat(totalStr) || 0,
        cash: parseFloat(getAttr('cash')) || 0,
        stock: parseFloat(getAttr('stock')) || 0,
      });
    }
  }

  console.log(`📊 Parsed ${results.length} NAV data points`);
  if (results.length > 0) {
    console.log(`📊 NAV sample:`, JSON.stringify(results[0]));
  }
  return results;
}

// Parse OpenPosition nodes from XML
function parseOpenPositions(xml: string): IBKROpenPosition[] {
  const positions: IBKROpenPosition[] = [];
  const posRegex = /<OpenPosition\s+([^>]*?)\s*\/>/gs;
  let match;

  while ((match = posRegex.exec(xml)) !== null) {
    const attrs = match[1];
    const getAttr = (name: string): string => {
      const attrMatch = attrs.match(new RegExp(`${name}\\s*=\\s*"([^"]*)"`, 'i'));
      return attrMatch ? attrMatch[1] : "";
    };
    const getNumAttr = (name: string): number => {
      const val = getAttr(name);
      return val ? parseFloat(val) : 0;
    };

    const symbol = getAttr('symbol');
    if (symbol) {
      positions.push({
        symbol,
        quantity: getNumAttr('quantity') || getNumAttr('position'),
        costPrice: getNumAttr('costBasisPrice') || getNumAttr('costPrice'),
        marketPrice: getNumAttr('markPrice') || getNumAttr('closePrice'),
        marketValue: getNumAttr('positionValue') || getNumAttr('marketValue'),
        // RULE 2: Extract fifoPnlUnrealized directly, do NOT calculate
        unrealizedPnl: getNumAttr('fifoPnlUnrealized') || getNumAttr('unrealizedPnl'),
        currency: getAttr('currency') || 'USD',
        accountId: getAttr('accountId') || getAttr('acctId') || 'TSC',
      });
    }
  }

  console.log(`📦 Parsed ${positions.length} open positions`);
  return positions;
}

async function fetchFlexReport(token: string, queryId: string, reportType: string): Promise<{
  trades: IBKRTrade[];
  openPositions: IBKROpenPosition[];
  navData: NavDataPoint[];
  rawXml: string;
}> {
  console.log(`⏳ Downloading ${reportType} (ID: ${queryId})...`);
  
  try {
    const requestUrl = `https://gdcdyn.interactivebrokers.com/Universal/servlet/FlexStatementService.SendRequest?t=${token}&q=${queryId}&v=3`;
    const requestResponse = await fetch(requestUrl);
    const requestText = await requestResponse.text();
    
    const refCodeMatch = requestText.match(/<ReferenceCode>(\d+)<\/ReferenceCode>/);
    if (!refCodeMatch) {
      console.error(`Failed to get reference code for ${reportType}:`, requestText);
      return { trades: [], openPositions: [], navData: [], rawXml: "" };
    }
    
    const referenceCode = refCodeMatch[1];
    console.log(`Got reference code: ${referenceCode}`);
    
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const getUrl = `https://gdcdyn.interactivebrokers.com/Universal/servlet/FlexStatementService.GetStatement?t=${token}&q=${referenceCode}&v=3`;
    
    let attempts = 0;
    let reportXml = "";
    
    while (attempts < 5) {
      const getResponse = await fetch(getUrl);
      reportXml = await getResponse.text();
      
      if (reportXml.includes("<FlexStatement") || reportXml.includes("<Trade")) {
        break;
      }
      
      console.log(`Attempt ${attempts + 1}: Report not ready, waiting...`);
      await new Promise(resolve => setTimeout(resolve, 3000));
      attempts++;
    }
    
    console.log(`📄 XML length: ${reportXml.length}`);
    console.log(`📄 XML preview (${reportType}):`, reportXml.substring(0, 500));
    
    // Parse NAV data
    const navData = parseNavData(reportXml);
    
    // Parse open positions (RULE 2: only from <OpenPosition> nodes)
    const openPositions = parseOpenPositions(reportXml);
    
    // Parse trades - RULE 4: ensure we parse ALL trades including latest date
    if (!reportXml.includes("Trade")) {
      console.log(`No trades found in ${reportType}`);
      return { trades: [], openPositions, navData, rawXml: reportXml };
    }
    
    const trades: IBKRTrade[] = [];
    // Use a more robust regex that handles multiline attributes
    const tradeRegex = /<(?:Trade|TradeConfirm)\s+([^>]*?)\s*\/>/gs;
    let match;
    
    while ((match = tradeRegex.exec(reportXml)) !== null) {
      const attrs = match[1];
      
      const getAttr = (name: string): string => {
        const attrMatch = attrs.match(new RegExp(`${name}\\s*=\\s*"([^"]*)"`, 'i'));
        return attrMatch ? attrMatch[1] : "";
      };
      
      const getNumAttr = (name: string): number => {
        const val = getAttr(name);
        return val ? parseFloat(val) : 0;
      };
      
      const tradeId = getAttr('tradeID');
      if (tradeId) {
        trades.push({
          tradeID: tradeId,
          symbol: getAttr('symbol'),
          dateTime: getAttr('dateTime'),
          quantity: getNumAttr('quantity'),
          tradePrice: getNumAttr('tradePrice') || getNumAttr('price'),
          ibCommission: getNumAttr('ibCommission') || getNumAttr('commission'),
          fifoPnlRealized: getNumAttr('fifoPnlRealized') || getNumAttr('realizedPL') || 0,
          netCash: getNumAttr('netCash'),
          buySell: getAttr('buySell'),
          accountId: getAttr('accountId') || getAttr('acctId') || 'TSC',
          closePrice: getNumAttr('closePrice') || getNumAttr('tradePrice') || getNumAttr('price'),
        });
      }
    }
    
    console.log(`✅ Downloaded ${trades.length} trades from ${reportType}`);
    if (trades.length > 0) {
      // Log first and last trade to verify we're getting the full range
      console.log(`📊 First trade:`, JSON.stringify(trades[0]));
      console.log(`📊 Last trade:`, JSON.stringify(trades[trades.length - 1]));
    }
    return { trades, openPositions, navData, rawXml: reportXml };
    
  } catch (error) {
    console.error(`⚠️ Error downloading ${reportType}:`, error);
    return { trades: [], openPositions: [], navData: [], rawXml: "" };
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const IBKR_TOKEN = Deno.env.get('IBKR_TOKEN_TSC');
    const QUERY_ID = Deno.env.get('IBKR_QUERY_ID_TSC');
    
    if (!IBKR_TOKEN || !QUERY_ID) {
      throw new Error('Missing IBKR TSC credentials in environment variables');
    }

    console.log("🚀 Starting IBKR TSC sync...");

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { trades, openPositions, navData } = await fetchFlexReport(IBKR_TOKEN, QUERY_ID, "TSC Report");

    // ── NAV History ──────────────────────────────────────────────────
    let latestNav: NavDataPoint | null = null;
    if (navData.length > 0) {
      navData.sort((a, b) => a.reportDate.localeCompare(b.reportDate));
      latestNav = navData[navData.length - 1];
      console.log(`📈 Latest NAV date: ${latestNav.reportDate}, total: ${latestNav.total}, cash: ${latestNav.cash}, stock: ${latestNav.stock}`);

      const navRecords = navData.map(n => ({
        account_id: 'TSC',
        report_date: parseReportDate(n.reportDate),
        total: n.total,
        cash: n.cash,
        stock: n.stock,
      }));

      const { error: navError } = await supabase
        .from('ib_nav_history')
        .upsert(navRecords, { onConflict: 'account_id,report_date' });

      if (navError) {
        console.error('NAV history upsert error:', navError);
      } else {
        console.log(`📈 Upserted ${navRecords.length} NAV history records`);
      }

      // RULE 1: Update sync metadata with LATEST NAV values only
      const { error: metaError } = await supabase
        .from('ib_sync_metadata')
        .upsert({
          account_id: 'TSC',
          starting_cash: navData[0].cash,
          ending_cash: latestNav.cash,
          synced_at: new Date().toISOString(),
        }, { onConflict: 'account_id' });

      if (metaError) {
        console.error('Metadata save error:', metaError);
      }
    }

    // ── Trades ────────────────────────────────────────────────────────
    // Deduplicate by tradeID, preferring trades with P&L data
    const uniqueTrades = new Map<string, IBKRTrade>();
    for (const trade of trades) {
      const existing = uniqueTrades.get(trade.tradeID);
      if (!existing) {
        uniqueTrades.set(trade.tradeID, trade);
      } else if (trade.fifoPnlRealized !== 0 && existing.fifoPnlRealized === 0) {
        uniqueTrades.set(trade.tradeID, trade);
      }
    }

    let tradesToProcess = Array.from(uniqueTrades.values());
    
    // Filter out trades before the exclusion date
    tradesToProcess = tradesToProcess.filter(trade => {
      const tradeDate = new Date(parseIBKRDate(trade.dateTime));
      return tradeDate >= EXCLUDE_BEFORE;
    });
    
    console.log(`⚗️ Total unique trades after date filter: ${tradesToProcess.length}`);

    // Sort trades by dateTime + tradeID ascending
    tradesToProcess.sort((a, b) => {
      const dateA = parseIBKRDate(a.dateTime);
      const dateB = parseIBKRDate(b.dateTime);
      const dateCompare = dateA.localeCompare(dateB);
      if (dateCompare !== 0) return dateCompare;
      const idA = parseInt(a.tradeID) || 0;
      const idB = parseInt(b.tradeID) || 0;
      return idA - idB;
    });

    const calculateNetAmount = (trade: IBKRTrade): number => {
      const amount = Math.abs(trade.quantity) * trade.tradePrice;
      return trade.buySell === 'SELL' ? amount : -amount;
    };

    // RULE 3: saldo_actual = P&L Acumulado (cumulative fifoPnlRealized + ibCommission)
    // Start at 0, NOT from startingCash
    let cumulativePnl = 0;

    const records = tradesToProcess.map(trade => {
      // Net P&L = fifoPnlRealized + ibCommission (commission is already negative)
      const netPnl = trade.fifoPnlRealized + trade.ibCommission;
      cumulativePnl += netPnl;

      return {
        ib_trade_id: trade.tradeID,
        symbol: trade.symbol,
        asset_class: 'STK',
        date_time: parseIBKRDate(trade.dateTime),
        side: trade.buySell,
        quantity: Math.abs(trade.quantity),
        price: trade.tradePrice,
        amount: calculateNetAmount(trade),
        commission: Math.abs(trade.ibCommission),
        currency: 'USD',
        realized_pnl: trade.fifoPnlRealized + trade.ibCommission, // Net P&L after commission
        account_id: trade.accountId || 'TSC',
        saldo_actual: cumulativePnl, // RULE 3: P&L Acumulado starting from 0
        net_cash: trade.netCash || 0,
      };
    });

    // Upsert trades
    let tradesCount = 0;
    if (records.length > 0) {
      const { data, error } = await supabase
        .from('ib_trades_tsc')
        .upsert(records, { onConflict: 'ib_trade_id' })
        .select();

      if (error) {
        console.error('Supabase trades error:', error);
        throw error;
      }
      tradesCount = data?.length || 0;
      console.log(`🎉 Synced ${tradesCount} TSC trades`);
    }

    // ── RULE 2: Open Positions — absolute clearing then insert from XML only ──
    let positionsCount = 0;
    // ALWAYS clear ALL old positions for this account first
    const { error: deleteError } = await supabase
      .from('ib_open_positions_tsc')
      .delete()
      .eq('account_id', 'TSC');
    
    if (deleteError) {
      console.error('Error clearing old positions:', deleteError);
    } else {
      console.log('🗑️ Cleared all previous TSC positions');
    }

    if (openPositions.length > 0) {
      const posRecords = openPositions.map(pos => ({
        symbol: pos.symbol,
        quantity: pos.quantity,
        cost_price: pos.costPrice,
        market_price: pos.marketPrice,
        market_value: pos.marketValue,
        // RULE 2: Use fifoPnlUnrealized directly from XML
        unrealized_pnl: pos.unrealizedPnl,
        currency: pos.currency || 'USD',
        account_id: pos.accountId || 'TSC',
        position_date: new Date().toISOString(),
      }));

      const { data: posData, error: posError } = await supabase
        .from('ib_open_positions_tsc')
        .insert(posRecords)
        .select();

      if (posError) {
        console.error('Supabase positions error:', posError);
      } else {
        positionsCount = posData?.length || 0;
        console.log(`📦 Synced ${positionsCount} open positions`);
      }
    } else {
      console.log('📦 No open positions in XML — table is now empty for TSC');
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Synced ${tradesCount} trades, ${positionsCount} positions, ${navData.length} NAV points`,
        count: tradesCount,
        positionsCount,
        navPointsCount: navData.length,
        latestNav: latestNav ? { total: latestNav.total, cash: latestNav.cash, stock: latestNav.stock, date: latestNav.reportDate } : null,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in sync-ibkr-trades-tsc:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
