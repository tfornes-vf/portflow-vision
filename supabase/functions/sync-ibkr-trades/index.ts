import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface IBKRTrade {
  tradeID: string;
  symbol: string;
  assetClass: string;
  tradeDate: string;
  buySell: string;
  quantity: number;
  tradePrice: number;
  netAmount: number;
  ibCommission: number;
  currency: string;
  realizedPL: number | null;
  accountId: string;
}

async function fetchFlexReport(token: string, queryId: string, reportType: string): Promise<IBKRTrade[]> {
  console.log(`⏳ Downloading ${reportType} (ID: ${queryId})...`);
  
  try {
    // Step 1: Request the report
    const requestUrl = `https://gdcdyn.interactivebrokers.com/Universal/servlet/FlexStatementService.SendRequest?t=${token}&q=${queryId}&v=3`;
    const requestResponse = await fetch(requestUrl);
    const requestText = await requestResponse.text();
    
    // Parse reference code from XML response
    const refCodeMatch = requestText.match(/<ReferenceCode>(\d+)<\/ReferenceCode>/);
    if (!refCodeMatch) {
      console.error(`Failed to get reference code for ${reportType}:`, requestText);
      return [];
    }
    
    const referenceCode = refCodeMatch[1];
    console.log(`Got reference code: ${referenceCode}`);
    
    // Step 2: Wait and fetch the report (IBKR needs time to generate)
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
    
    if (!reportXml.includes("<Trade")) {
      console.log(`No trades found in ${reportType}`);
      return [];
    }
    
    // Parse trades from XML
    const trades: IBKRTrade[] = [];
    const tradeMatches = reportXml.matchAll(/<Trade([^>]+)\/>/g);
    
    for (const match of tradeMatches) {
      const attrs = match[1];
      
      const getAttr = (name: string): string => {
        const attrMatch = attrs.match(new RegExp(`${name}="([^"]*)"`, 'i'));
        return attrMatch ? attrMatch[1] : "";
      };
      
      const getNumAttr = (name: string): number => {
        const val = getAttr(name);
        return val ? parseFloat(val) : 0;
      };
      
      // Handle different column names between reports
      const tradeId = getAttr('tradeID') || getAttr('tradeId');
      const tradeDate = getAttr('tradeDate') || getAttr('dateTime') || getAttr('date');
      const price = getNumAttr('tradePrice') || getNumAttr('price');
      const commission = getNumAttr('ibCommission') || getNumAttr('commission');
      const amount = getNumAttr('netAmount') || getNumAttr('netCash') || getNumAttr('proceeds');
      
      if (tradeId) {
        trades.push({
          tradeID: tradeId.replace(/\.0$/, ''),
          symbol: getAttr('symbol'),
          assetClass: getAttr('assetClass') || getAttr('assetCategory') || 'STK',
          tradeDate: tradeDate,
          buySell: getAttr('buySell') || getAttr('side') || 'BUY',
          quantity: getNumAttr('quantity'),
          tradePrice: price,
          netAmount: amount,
          ibCommission: commission,
          currency: getAttr('currency'),
          realizedPL: getNumAttr('realizedPL') || null,
          accountId: getAttr('accountId') || getAttr('acctId') || 'default',
        });
      }
    }
    
    console.log(`✅ Downloaded ${trades.length} trades from ${reportType}`);
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

    // Download both reports
    const [historicalTrades, todayTrades] = await Promise.all([
      fetchFlexReport(IBKR_TOKEN, ID_HISTORIA, "Historical Report"),
      fetchFlexReport(IBKR_TOKEN, ID_HOY, "Today's Report"),
    ]);

    // Merge and deduplicate by tradeID
    const allTrades = [...historicalTrades, ...todayTrades];
    const uniqueTrades = new Map<string, IBKRTrade>();
    
    for (const trade of allTrades) {
      if (!uniqueTrades.has(trade.tradeID)) {
        uniqueTrades.set(trade.tradeID, trade);
      }
    }

    const tradesToUpsert = Array.from(uniqueTrades.values());
    console.log(`⚗️ Total unique trades: ${tradesToUpsert.length}`);

    if (tradesToUpsert.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "No trades to sync", count: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Connect to Supabase
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Upsert trades (using ib_trade_id as conflict key)
    const records = tradesToUpsert.map(trade => ({
      ib_trade_id: trade.tradeID,
      symbol: trade.symbol,
      asset_class: trade.assetClass,
      date_time: trade.tradeDate ? new Date(trade.tradeDate).toISOString() : new Date().toISOString(),
      side: trade.buySell,
      quantity: trade.quantity,
      price: trade.tradePrice,
      amount: trade.netAmount,
      commission: trade.ibCommission,
      currency: trade.currency,
      realized_pnl: trade.realizedPL,
      account_id: trade.accountId,
    }));

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
        count: data?.length || 0
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
