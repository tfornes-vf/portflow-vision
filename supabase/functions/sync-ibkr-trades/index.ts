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

const INITIAL_BALANCE = 508969.87;

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
          accountId: getAttr('accountId') || getAttr('acctId') || 'U22563190',
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
    const IBKR_TOKEN = Deno.env.get('IBKR_TOKEN');
    const ID_HISTORIA = Deno.env.get('IBKR_ID_HISTORIA');
    const ID_HOY = Deno.env.get('IBKR_ID_HOY');
    
    if (!IBKR_TOKEN || !ID_HISTORIA || !ID_HOY) {
      throw new Error('Missing IBKR credentials in environment variables');
    }

    console.log("🚀 Starting IBKR sync...");

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const [historicalTrades, todayTrades] = await Promise.all([
      fetchFlexReport(IBKR_TOKEN, ID_HISTORIA, "Historical Report"),
      fetchFlexReport(IBKR_TOKEN, ID_HOY, "Today's Report"),
    ]);

    const allTrades = [...historicalTrades, ...todayTrades];
    const uniqueTrades = new Map<string, IBKRTrade>();
    
    // Prefer trades with P&L data when deduplicating
    for (const trade of allTrades) {
      const existing = uniqueTrades.get(trade.tradeID);
      if (!existing) {
        uniqueTrades.set(trade.tradeID, trade);
      } else if (trade.fifoPnlRealized !== 0 && existing.fifoPnlRealized === 0) {
        // Replace with the one that has P&L data
        uniqueTrades.set(trade.tradeID, trade);
      }
    }

    const tradesToProcess = Array.from(uniqueTrades.values());
    console.log(`⚗️ Total unique trades: ${tradesToProcess.length}`);

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
      return dateA.localeCompare(dateB);
    });

    // Calculate net amount for each trade
    const calculateNetAmount = (trade: IBKRTrade): number => {
      const amount = Math.abs(trade.quantity) * trade.tradePrice;
      return trade.buySell === 'SELL' ? amount : -amount;
    };

    // Calculate total P&L to find the real initial balance
    // INITIAL_BALANCE is the FINAL balance, so we need to work backwards
    const totalPnL = tradesToProcess.reduce((sum, trade) => sum + (trade.fifoPnlRealized || 0), 0);
    const realInitialBalance = INITIAL_BALANCE - totalPnL;
    
    console.log(`📊 Total P&L: ${totalPnL}, Real initial balance: ${realInitialBalance}`);

    // Prepare records with cumulative balance starting from real initial
    let runningBalance = realInitialBalance;
    
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
        account_id: trade.accountId,
        saldo_actual: runningBalance,
      };
    });

    const { data, error } = await supabase
      .from('ib_trades')
      .upsert(records, { onConflict: 'ib_trade_id' })
      .select();

    if (error) {
      console.error('Supabase error:', error);
      throw error;
    }

    console.log(`🎉 Synced ${data?.length || 0} trades to Supabase`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Synced ${data?.length || 0} trades`,
        count: data?.length || 0,
        lastBalance: runningBalance
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in sync-ibkr-trades:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
