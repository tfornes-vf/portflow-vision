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
  reportDate: string;
  total: number;
  cash: number;
  stock: number;
}

const EXCLUDE_BEFORE = new Date("2025-01-15T00:00:00Z");

function parseIBKRDate(dateStr: string): string {
  if (!dateStr || dateStr.trim() === '') return new Date().toISOString();

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

function parseReportDate(dateStr: string): string {
  const m = dateStr.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return dateStr;
}

// Helper to extract attributes from an XML tag string
function getAttr(attrs: string, name: string): string {
  const attrMatch = attrs.match(new RegExp(`${name}\\s*=\\s*"([^"]*)"`, 'i'));
  return attrMatch ? attrMatch[1] : "";
}

function getNumAttr(attrs: string, name: string): number {
  const val = getAttr(attrs, name);
  return val ? parseFloat(val) : 0;
}

// Parse ALL self-closing tags matching a given tag name from XML
function parseAllTags(xml: string, tagName: string): string[] {
  const results: string[] = [];
  // Match both self-closing <Tag ... /> and opening+closing <Tag ...>...</Tag>
  const selfClosingRegex = new RegExp(`<${tagName}\\s+([^>]*?)\\s*/>`, 'gs');
  let match;
  while ((match = selfClosingRegex.exec(xml)) !== null) {
    results.push(match[1]);
  }
  return results;
}

function parseNavData(xml: string): NavDataPoint[] {
  const results: NavDataPoint[] = [];
  
  // Try EquitySummaryByReportDateInBase first
  let tags = parseAllTags(xml, 'EquitySummaryByReportDateInBase');
  console.log(`🔍 parseNavData: Found ${tags.length} EquitySummaryByReportDateInBase tags`);
  
  // Fallback to EquitySummaryInBase
  if (tags.length === 0) {
    tags = parseAllTags(xml, 'EquitySummaryInBase');
    console.log(`🔍 parseNavData: Found ${tags.length} EquitySummaryInBase tags (fallback)`);
  }

  for (const attrs of tags) {
    const reportDate = getAttr(attrs, 'reportDate');
    const totalStr = getAttr(attrs, 'total');
    if (reportDate && totalStr) {
      results.push({
        reportDate,
        total: parseFloat(totalStr) || 0,
        cash: parseFloat(getAttr(attrs, 'cash')) || 0,
        stock: parseFloat(getAttr(attrs, 'stock')) || 0,
      });
    }
  }

  console.log(`📊 Parsed ${results.length} NAV data points`);
  if (results.length > 0) {
    console.log(`📊 NAV first: ${JSON.stringify(results[0])}`);
    console.log(`📊 NAV last: ${JSON.stringify(results[results.length - 1])}`);
  }
  return results;
}

function parseOpenPositions(xml: string): IBKROpenPosition[] {
  const positions: IBKROpenPosition[] = [];
  const tags = parseAllTags(xml, 'OpenPosition');
  console.log(`🔍 parseOpenPositions: Found ${tags.length} OpenPosition tags`);

  for (const attrs of tags) {
    const symbol = getAttr(attrs, 'symbol');
    if (symbol) {
      positions.push({
        symbol,
        quantity: getNumAttr(attrs, 'quantity') || getNumAttr(attrs, 'position'),
        costPrice: getNumAttr(attrs, 'costBasisPrice') || getNumAttr(attrs, 'costPrice'),
        marketPrice: getNumAttr(attrs, 'markPrice') || getNumAttr(attrs, 'closePrice'),
        marketValue: getNumAttr(attrs, 'positionValue') || getNumAttr(attrs, 'marketValue'),
        unrealizedPnl: getNumAttr(attrs, 'fifoPnlUnrealized') || getNumAttr(attrs, 'unrealizedPnl'),
        currency: getAttr(attrs, 'currency') || 'USD',
        accountId: getAttr(attrs, 'accountId') || getAttr(attrs, 'acctId') || 'TSC',
      });
    }
  }

  console.log(`📦 Parsed ${positions.length} open positions`);
  return positions;
}

function parseTrades(xml: string): IBKRTrade[] {
  const trades: IBKRTrade[] = [];
  
  // Parse Trade tags
  const tradeTags = parseAllTags(xml, 'Trade');
  // Parse TradeConfirm tags
  const confirmTags = parseAllTags(xml, 'TradeConfirm');
  const allTags = [...tradeTags, ...confirmTags];
  
  console.log(`🔍 parseTrades: Found ${tradeTags.length} Trade tags + ${confirmTags.length} TradeConfirm tags`);

  for (const attrs of allTags) {
    const tradeId = getAttr(attrs, 'tradeID');
    if (tradeId) {
      trades.push({
        tradeID: tradeId,
        symbol: getAttr(attrs, 'symbol'),
        dateTime: getAttr(attrs, 'dateTime'),
        quantity: getNumAttr(attrs, 'quantity'),
        tradePrice: getNumAttr(attrs, 'tradePrice') || getNumAttr(attrs, 'price'),
        ibCommission: getNumAttr(attrs, 'ibCommission') || getNumAttr(attrs, 'commission'),
        fifoPnlRealized: getNumAttr(attrs, 'fifoPnlRealized') || getNumAttr(attrs, 'realizedPL') || 0,
        netCash: getNumAttr(attrs, 'netCash'),
        buySell: getAttr(attrs, 'buySell'),
        accountId: getAttr(attrs, 'accountId') || getAttr(attrs, 'acctId') || 'TSC',
        closePrice: getNumAttr(attrs, 'closePrice') || getNumAttr(attrs, 'tradePrice') || getNumAttr(attrs, 'price'),
      });
    }
  }

  console.log(`✅ Parsed ${trades.length} trades total`);
  if (trades.length > 0) {
    console.log(`📊 First trade: ${JSON.stringify(trades[0])}`);
    console.log(`📊 Last trade: ${JSON.stringify(trades[trades.length - 1])}`);
  }
  return trades;
}

interface FetchResult {
  trades: IBKRTrade[];
  openPositions: IBKROpenPosition[];
  navData: NavDataPoint[];
  fetchSuccess: boolean;
}

async function fetchFlexReport(token: string, queryId: string, reportType: string): Promise<FetchResult> {
  console.log(`⏳ Downloading ${reportType} (ID: ${queryId})...`);
  
  try {
    const requestUrl = `https://gdcdyn.interactivebrokers.com/Universal/servlet/FlexStatementService.SendRequest?t=${token}&q=${queryId}&v=3`;
    const requestResponse = await fetch(requestUrl);
    const requestText = await requestResponse.text();
    
    console.log(`📡 SendRequest response: ${requestText.substring(0, 300)}`);
    
    const refCodeMatch = requestText.match(/<ReferenceCode>(\d+)<\/ReferenceCode>/);
    if (!refCodeMatch) {
      // Check for specific errors
      if (requestText.includes('Token has expired') || requestText.includes('1012')) {
        console.error(`❌ IBKR Token has expired for ${reportType}. Please generate a new token.`);
      } else {
        console.error(`❌ Failed to get reference code for ${reportType}:`, requestText);
      }
      return { trades: [], openPositions: [], navData: [], fetchSuccess: false };
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
    console.log(`📄 XML preview: ${reportXml.substring(0, 500)}`);
    
    if (!reportXml.includes("<FlexStatement")) {
      console.error(`❌ No valid FlexStatement found in response`);
      return { trades: [], openPositions: [], navData: [], fetchSuccess: false };
    }

    // Parse all data types
    const navData = parseNavData(reportXml);
    const openPositions = parseOpenPositions(reportXml);
    const trades = parseTrades(reportXml);

    console.log(`📋 SUMMARY: ${trades.length} trades, ${openPositions.length} positions, ${navData.length} NAV points`);
    
    return { trades, openPositions, navData, fetchSuccess: true };
    
  } catch (error) {
    console.error(`⚠️ Error downloading ${reportType}:`, error);
    return { trades: [], openPositions: [], navData: [], fetchSuccess: false };
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

    const { trades, openPositions, navData, fetchSuccess } = await fetchFlexReport(IBKR_TOKEN, QUERY_ID, "TSC Report");

    // ⚠️ GUARD: If the fetch failed (e.g. token expired), do NOT touch the database
    if (!fetchSuccess) {
      console.error('❌ Fetch failed — skipping all DB operations to preserve existing data');
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'IBKR fetch failed (token may have expired). Database was NOT modified.',
          message: 'Synced 0 trades, 0 positions, 0 NAV points — IBKR token may be expired',
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

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
    
    tradesToProcess = tradesToProcess.filter(trade => {
      const tradeDate = new Date(parseIBKRDate(trade.dateTime));
      return tradeDate >= EXCLUDE_BEFORE;
    });
    
    console.log(`⚗️ Total unique trades after date filter: ${tradesToProcess.length}`);

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

    // RULE 3: P&L Acumulado starting from 0
    let cumulativePnl = 0;

    const records = tradesToProcess.map(trade => {
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
        realized_pnl: trade.fifoPnlRealized + trade.ibCommission,
        account_id: 'TSC',  // Always normalize to 'TSC'
        saldo_actual: cumulativePnl,
        net_cash: trade.netCash || 0,
      };
    });

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

    // ── RULE 2: Open Positions — DELETE then INSERT from XML only ──
    let positionsCount = 0;
    // Delete ALL positions for this account (both 'TSC' and 'U20133521' variants)
    const { error: deleteError } = await supabase
      .from('ib_open_positions_tsc')
      .delete()
      .in('account_id', ['TSC', 'U20133521']);
    
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
        unrealized_pnl: pos.unrealizedPnl,
        currency: pos.currency || 'USD',
        account_id: 'TSC',  // Always normalize to 'TSC' to match DELETE
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
