import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface Message {
  role: "user" | "assistant" | "system";
  content: string;
}

interface TradingContext {
  currentBalance: number;
  totalPnL: number;
  returnPercent: number;
  winRate: number;
  avgWin: number;
  avgLoss: number;
  sharpeRatio: number;
  maxDrawdown: number;
  totalTrades: number;
  recentTrades: Array<{
    symbol: string;
    pnl: number;
    date: string;
    action: string;
  }>;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages, tradingContext } = await req.json() as { 
      messages: Message[]; 
      tradingContext: TradingContext;
    };

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    const formatCurrency = (value: number) => 
      new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'USD' }).format(value);

    const recentTradesSummary = tradingContext.recentTrades
      .slice(0, 10)
      .map(t => `- ${t.symbol}: ${formatCurrency(t.pnl)} (${t.action}) - ${t.date}`)
      .join('\n');

    const systemPrompt = `Eres un asistente experto en trading que ayuda a analizar el rendimiento y las operaciones del usuario. 

DATOS ACTUALES DEL USUARIO:
- Balance actual: ${formatCurrency(tradingContext.currentBalance)}
- P&L Total: ${formatCurrency(tradingContext.totalPnL)}
- Retorno: ${tradingContext.returnPercent.toFixed(2)}%
- Win Rate: ${tradingContext.winRate.toFixed(1)}%
- Ganancia promedio: ${formatCurrency(tradingContext.avgWin)}
- Pérdida promedio: ${formatCurrency(tradingContext.avgLoss)}
- Ratio de Sharpe: ${tradingContext.sharpeRatio.toFixed(2)}
- Drawdown máximo: ${formatCurrency(tradingContext.maxDrawdown)}
- Total de operaciones: ${tradingContext.totalTrades}

OPERACIONES RECIENTES:
${recentTradesSummary || 'No hay operaciones recientes'}

INSTRUCCIONES:
- Responde siempre en español
- Sé conciso pero informativo
- Usa los datos proporcionados para dar respuestas personalizadas
- Ofrece análisis y sugerencias basadas en las métricas
- Si te preguntan sobre operaciones específicas, usa los datos de operaciones recientes
- Puedes hacer cálculos y comparaciones con los datos disponibles
- No inventes datos que no tengas`;

    console.log('Sending request to Lovable AI Gateway...');

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          ...messages,
        ],
        stream: true,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI Gateway error:', response.status, errorText);
      
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Límite de solicitudes excedido. Inténtalo de nuevo más tarde." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Se requiere pago. Añade créditos a tu workspace de Lovable." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      
      return new Response(JSON.stringify({ error: "Error del gateway de IA" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log('Streaming response from AI Gateway...');

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (error) {
    console.error('Trading chat error:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Error desconocido" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
