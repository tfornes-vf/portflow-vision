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
  buySell: string;
  accountId: string;
}

// TSC account initial balance
const INITIAL_BALANCE = 430702;

// Exclude trades before this date for TSC account
const EXCLUDE_BEFORE = new Date("2025-01-15T00:00:00Z");

// Parse IBKR date format: "20251104;122328" -> ISO string
function parseIBKRDate(dateStr: string): string {
  if (!dateStr || dateStr.trim() === '') {
    return new Date().toISOString();
  }

  // Handle IBKR format: "20251104;122328"
  const match = dateStr.match(/^(\d{4})(\d{2})(\d{2});?(\d{2})(\d{2})(\d{2})?/);
  if (match) {
    const [, year, month, day, hour, min, sec = '00'] = match;
    const date = new Date(`${year}-${month}-${day}T${hour}:${min}:${sec}Z`);
    if (!isNaN(date.getTime())) {
      return date.toISOString();
    }
  }

  // Try direct parsing
  const date = new Date(dateStr);
  if (!isNaN(date.getTime())) {
    return date.toISOString();
  }

  console.warn(`Could not parse date: ${dateStr}, using current date`);
  return new Date().toISOString();
}

async function fetchFlexReport(token: string, queryId: string, reportType: string): Promise<IBKRTrade[]> {
  console.log(`⏳ Downloading ${reportType} (ID: ${queryId})...`);
  
  try {
    const requestUrl = `https://gdcdyn.interactivebrokers.com/Universal/servlet/FlexStatementService.SendRequest?t=${token}&q=${queryId}&v=3`;
    const requestResponse = await fetch(requestUrl);
    const requestText = await requestResponse.text();
    
    const refCodeMatch = requestText.match(/<ReferenceCode>(\d+)<\/ReferenceCode>/);
    if (!refCodeMatch) {
      console.error(`Failed to get reference code for ${reportType}:`, requestText);
      return [];
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
    
    // Log first 500 chars of XML for debugging
    console.log(`📄 XML preview (${reportType}):`, reportXml.substring(0, 500));
    
    // Check for Trade or TradeConfirm elements
    if (!reportXml.includes("Trade")) {
      console.log(`No trades found in ${reportType}`);
      return [];
    }
    
    const trades: IBKRTrade[] = [];
    
    // Match both <Trade> and <TradeConfirm> elements
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
        // Handle different field names between Trade and TradeConfirm
        const tradePrice = getNumAttr('tradePrice') || getNumAttr('price');
        const commission = getNumAttr('ibCommission') || getNumAttr('commission');
        const pnl = getNumAttr('fifoPnlRealized') || getNumAttr('realizedPL') || 0;
        
        trades.push({
          tradeID: tradeId,
          symbol: getAttr('symbol'),
          dateTime: getAttr('dateTime'),
          quantity: getNumAttr('quantity'),
          tradePrice: tradePrice,
          ibCommission: commission,
          fifoPnlRealized: pnl,
          buySell: getAttr('buySell'),
          accountId: getAttr('accountId') || getAttr('acctId') || 'TSC',
        });
      }
    }
    
    console.log(`✅ Downloaded ${trades.length} trades from ${reportType}`);
    if (trades.length > 0) {
      console.log(`📊 First trade sample:`, JSON.stringify(trades[0]));
    }
    return trades;
    
  } catch (error) {
    console.error(`⚠️ Error downloading ${reportType}:`, error);
    return [];
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

    // For TSC, we only have one query ID for all trades (historical + today)
    const trades = await fetchFlexReport(IBKR_TOKEN, QUERY_ID, "TSC Report");

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

    if (tradesToProcess.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "No trades to sync", count: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Sort trades by dateTime for cumulative calculation (oldest first)
    tradesToProcess.sort((a, b) => {
      const dateA = parseIBKRDate(a.dateTime);
      const dateB = parseIBKRDate(b.dateTime);
      const dateCompare = dateA.localeCompare(dateB);
      if (dateCompare !== 0) return dateCompare;
      const idA = parseInt(a.tradeID) || 0;
      const idB = parseInt(b.tradeID) || 0;
      return idA - idB;
    });

    // Calculate net amount for each trade
    const calculateNetAmount = (trade: IBKRTrade): number => {
      const amount = Math.abs(trade.quantity) * trade.tradePrice;
      return trade.buySell === 'SELL' ? amount : -amount;
    };

    console.log(`📊 Using initial balance: ${INITIAL_BALANCE}`);

    // Prepare records with cumulative balance starting from initial
    let runningBalance = INITIAL_BALANCE;
    
    const records = tradesToProcess.map(trade => {
      runningBalance += trade.fifoPnlRealized || 0;
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
      };
    });

    const { data, error } = await supabase
      .from('ib_trades_tsc')
      .upsert(records, { onConflict: 'ib_trade_id' })
      .select();

    if (error) {
      console.error('Supabase error:', error);
      throw error;
    }

    console.log(`🎉 Synced ${data?.length || 0} TSC trades to Supabase`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Synced ${data?.length || 0} TSC trades`,
        count: data?.length || 0,
        lastBalance: runningBalance
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
