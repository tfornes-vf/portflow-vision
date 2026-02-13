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

    // Track net position per symbol to determine open/close
    const netPosition: Record<string, number> = {}; // key -> net qty (positive = long, negative = short)

    for (const trade of sortedTrades) {
      const key = `${trade.account_id}:${trade.symbol}`;
      const currentPos = netPosition[key] || 0;
      const signedQty = trade.side === "BUY" ? Math.abs(trade.quantity) : -Math.abs(trade.quantity);
      const newPos = currentPos + signedQty;

      // Determine if this trade is opening or closing (or both for partial)
      const isIncreasingPosition = Math.abs(newPos) > Math.abs(currentPos);
      const isClosingPosition = Math.abs(newPos) < Math.abs(currentPos) || (currentPos !== 0 && Math.sign(newPos) !== Math.sign(currentPos));

      if (isIncreasingPosition && !isClosingPosition) {
        // Pure opening trade
        if (!openPositions[key]) {
          openPositions[key] = [];
        }
        openPositions[key].push({ trade, remainingQty: Math.abs(trade.quantity) });
      } else if (isClosingPosition) {
        // Closing trade: match with opening trades using FIFO
        let qtyToClose = Math.min(Math.abs(trade.quantity), Math.abs(currentPos));
        const closingTime = parseISO(trade.date_time);
        let earliestOpeningTime: Date | null = null;

        if (openPositions[key]) {
          while (qtyToClose > 0 && openPositions[key].length > 0) {
            const oldest = openPositions[key][0];
            const matchedQty = Math.min(qtyToClose, oldest.remainingQty);
            
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

        if (earliestOpeningTime) {
          const durationSeconds = differenceInSeconds(closingTime, earliestOpeningTime);
          tradeDurations[trade.id] = durationSeconds;
        }

        // If trade also opens in opposite direction, add remainder as opening
        if (Math.sign(newPos) !== 0 && Math.sign(newPos) !== Math.sign(currentPos)) {
          if (!openPositions[key]) {
            openPositions[key] = [];
          }
          openPositions[key].push({ trade, remainingQty: Math.abs(newPos) });
        }
      }

      netPosition[key] = newPos;
    }

    // Map trades to processed trades with duration and action
    return trades.map((trade): ProcessedTrade => {
      const hasDuration = tradeDurations[trade.id] !== undefined;
      
      let action: "L" | "S" | null = null;
      let trade_duration: string | null = null;

      if (hasDuration) {
        // This is a closing trade
        // SELL to close = was Long (L), BUY to close = was Short (S)
        action = trade.side === "SELL" ? "L" : "S";
        trade_duration = formatDuration(tradeDurations[trade.id]);
      }

      return {
        ...trade,
        trade_duration,
        action,
      };
    });
  }, [trades]);
}
