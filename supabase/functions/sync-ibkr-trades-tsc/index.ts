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

// Default initial balance
const DEFAULT_INITIAL_BALANCE = 414594.50;

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

// Extract startingCash from CashReportCurrency where currency="BASE_SUMMARY"
function extractStartingCash(xml: string): number | null {
  const regex = /<CashReportCurrency[^>]*?\scurrency\s*=\s*"BASE_SUMMARY"[^>]*?\sstartingCash\s*=\s*"([^"]*)"[^>]*?\/>/gi;
  let match;
  while ((match = regex.exec(xml)) !== null) {
    const val = parseFloat(match[1]);
    if (!isNaN(val)) {
      console.log(`📊 Extracted startingCash (BASE_SUMMARY): ${val}`);
      return val;
    }
  }
  // Try reversed attribute order
  const regex2 = /<CashReportCurrency[^>]*?\sstartingCash\s*=\s*"([^"]*)"[^>]*?\scurrency\s*=\s*"BASE_SUMMARY"[^>]*?\/>/gi;
  while ((match = regex2.exec(xml)) !== null) {
    const val = parseFloat(match[1]);
    if (!isNaN(val)) {
      console.log(`📊 Extracted startingCash (BASE_SUMMARY, alt): ${val}`);
      return val;
    }
  }
  return null;
}

// Extract endingCash for verification
function extractEndingCash(xml: string): number | null {
  const regex = /<CashReportCurrency[^>]*?\scurrency\s*=\s*"BASE_SUMMARY"[^>]*?\sendingCash\s*=\s*"([^"]*)"[^>]*?\/>/gi;
  let match;
  while ((match = regex.exec(xml)) !== null) {
    const val = parseFloat(match[1]);
    if (!isNaN(val)) return val;
  }
  const regex2 = /<CashReportCurrency[^>]*?\sendingCash\s*=\s*"([^"]*)"[^>]*?\scurrency\s*=\s*"BASE_SUMMARY"[^>]*?\/>/gi;
  while ((match = regex2.exec(xml)) !== null) {
    const val = parseFloat(match[1]);
    if (!isNaN(val)) return val;
  }
  return null;
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
  startingCash: number | null;
  endingCash: number | null;
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
      return { trades: [], openPositions: [], startingCash: null, endingCash: null, rawXml: "" };
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
    
    console.log(`📄 XML preview (${reportType}):`, reportXml.substring(0, 500));
    
    // Extract cash balances
    const startingCash = extractStartingCash(reportXml);
    const endingCash = extractEndingCash(reportXml);
    console.log(`💰 startingCash: ${startingCash}, endingCash: ${endingCash}`);
    
    // Parse open positions
    const openPositions = parseOpenPositions(reportXml);
    
    // Parse trades
    if (!reportXml.includes("Trade")) {
      console.log(`No trades found in ${reportType}`);
      return { trades: [], openPositions, startingCash, endingCash, rawXml: reportXml };
    }
    
    const trades: IBKRTrade[] = [];
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
      console.log(`📊 First trade sample:`, JSON.stringify(trades[0]));
    }
    return { trades, openPositions, startingCash, endingCash, rawXml: reportXml };
    
  } catch (error) {
    console.error(`⚠️ Error downloading ${reportType}:`, error);
    return { trades: [], openPositions: [], startingCash: null, endingCash: null, rawXml: "" };
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

    const { trades, openPositions, startingCash, endingCash } = await fetchFlexReport(IBKR_TOKEN, QUERY_ID, "TSC Report");

    // Use startingCash from XML CashReportCurrency BASE_SUMMARY, otherwise default
    const INITIAL_BALANCE = startingCash ?? DEFAULT_INITIAL_BALANCE;
    console.log(`📊 Using initial cash balance: ${INITIAL_BALANCE} (from ${startingCash !== null ? 'XML CashReport' : 'default'})`);

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

    // Sort trades by dateTime + tradeID ascending (deterministic ordering)
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

    // Calculate saldo using netCash: Saldo = Previous + netCash
    let runningBalance = INITIAL_BALANCE;
    
    const records = tradesToProcess.map(trade => {
      runningBalance += (trade.netCash || 0);
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
        realized_pnl: trade.fifoPnlRealized,
        account_id: trade.accountId || 'TSC',
        saldo_actual: runningBalance,
        net_cash: trade.netCash || 0,
      };
    });

    // Verify against endingCash
    if (endingCash !== null) {
      const diff = Math.abs(runningBalance - endingCash);
      console.log(`✅ Final balance: ${runningBalance}, Expected endingCash: ${endingCash}, Diff: ${diff.toFixed(2)}`);
    }

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

    // Upsert open positions (clear old ones first, then insert new)
    let positionsCount = 0;
    if (openPositions.length > 0) {
      await supabase.from('ib_open_positions_tsc').delete().eq('account_id', 'TSC');

      const posRecords = openPositions.map(pos => ({
        symbol: pos.symbol,
        quantity: pos.quantity,
        cost_price: pos.costPrice,
        market_price: pos.marketPrice,
        market_value: pos.marketValue,
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
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Synced ${tradesCount} trades, ${positionsCount} open positions`,
        count: tradesCount,
        positionsCount,
        lastCashBalance: runningBalance,
        initialCashBalance: INITIAL_BALANCE,
        expectedEndingCash: endingCash,
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
