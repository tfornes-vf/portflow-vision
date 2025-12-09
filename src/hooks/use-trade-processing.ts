import { useMemo } from "react";
import { differenceInSeconds, differenceInDays, differenceInHours, differenceInMinutes, parseISO } from "date-fns";

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

export interface ProcessedTrade extends RawTrade {
  trade_duration: string | null;
  action: "L" | "S" | null;
}

interface OpenPosition {
  trade: RawTrade;
  remainingQty: number;
}

function formatDuration(seconds: number): string {
  if (seconds < 0) return "";
  
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  if (days > 0) {
    return `${days}d ${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }
  return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

export function useTradeProcessing(trades: RawTrade[]): ProcessedTrade[] {
  return useMemo(() => {
    // Sort trades chronologically for FIFO matching
    const sortedTrades = [...trades].sort(
      (a, b) => new Date(a.date_time).getTime() - new Date(b.date_time).getTime()
    );

    // Group by account_id and symbol for FIFO matching
    const openPositions: Record<string, OpenPosition[]> = {};
    const tradeDurations: Record<string, number> = {}; // trade id -> duration in seconds

    for (const trade of sortedTrades) {
      const key = `${trade.account_id}:${trade.symbol}`;
      
      // Opening trade: realized_pnl = 0 or null
      const isOpening = trade.realized_pnl === 0 || trade.realized_pnl === null;
      
      if (isOpening) {
        // Add to open positions queue
        if (!openPositions[key]) {
          openPositions[key] = [];
        }
        openPositions[key].push({ trade, remainingQty: Math.abs(trade.quantity) });
      } else {
        // Closing trade: match with opening trades using FIFO
        let qtyToClose = Math.abs(trade.quantity);
        const closingTime = parseISO(trade.date_time);
        let earliestOpeningTime: Date | null = null;

        if (openPositions[key]) {
          while (qtyToClose > 0 && openPositions[key].length > 0) {
            const oldest = openPositions[key][0];
            const matchedQty = Math.min(qtyToClose, oldest.remainingQty);
            
            // Track the earliest opening time for this closing trade
            const openingTime = parseISO(oldest.trade.date_time);
            if (!earliestOpeningTime || openingTime < earliestOpeningTime) {
              earliestOpeningTime = openingTime;
            }

            oldest.remainingQty -= matchedQty;
            qtyToClose -= matchedQty;

            if (oldest.remainingQty <= 0) {
              openPositions[key].shift();
            }
          }
        }

        // Calculate duration from earliest matched opening to closing
        if (earliestOpeningTime) {
          const durationSeconds = differenceInSeconds(closingTime, earliestOpeningTime);
          tradeDurations[trade.id] = durationSeconds;
        }
      }
    }

    // Map trades to processed trades with duration and action
    return trades.map((trade): ProcessedTrade => {
      const isClosing = trade.realized_pnl !== 0 && trade.realized_pnl !== null;
      
      let action: "L" | "S" | null = null;
      let trade_duration: string | null = null;

      if (isClosing) {
        // Action: SELL to close = was Long (L), BUY to close = was Short (S)
        action = trade.side === "SELL" ? "L" : "S";
        
        // Duration
        const durationSeconds = tradeDurations[trade.id];
        if (durationSeconds !== undefined) {
          trade_duration = formatDuration(durationSeconds);
        }
      }

      return {
        ...trade,
        trade_duration,
        action,
      };
    });
  }, [trades]);
}
