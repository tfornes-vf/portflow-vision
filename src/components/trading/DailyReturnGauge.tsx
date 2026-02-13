import { Card, CardContent } from "@/components/ui/card";
import { TrendingUp, TrendingDown, Target, CheckCircle } from "lucide-react";

interface DailyReturnGaugeProps {
  dailyReturn: number;
  avgDailyReturn: number;
  lastCompleteDayReturn: number;
}

const DAILY_TARGET = 0.12;

export function DailyReturnGauge({ dailyReturn, avgDailyReturn, lastCompleteDayReturn }: DailyReturnGaugeProps) {
  const formatPercent = (value: number) => `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
  const hitTarget = lastCompleteDayReturn >= DAILY_TARGET;
  const isPositive = lastCompleteDayReturn >= 0;

  // Progress bar: map value from -0.12% to +0.36% onto 0-100%
  const minVal = -DAILY_TARGET;
  const maxVal = DAILY_TARGET * 3;
  const clamped = Math.max(minVal, Math.min(maxVal, lastCompleteDayReturn));
  const pct = ((clamped - minVal) / (maxVal - minVal)) * 100;

  const barColor = hitTarget
    ? "bg-green-500"
    : isPositive
      ? "bg-yellow-500"
      : "bg-destructive";

  return (
    <Card className="h-full">
      <CardContent className="p-3 sm:p-5 flex flex-col justify-between h-full gap-2 sm:gap-3">
        {/* Header */}
        <div className="flex items-center justify-between">
          <span className="text-xs sm:text-sm font-medium text-foreground">Rentabilidad Diaria</span>
          <div className="flex items-center gap-1 text-muted-foreground">
            <Target className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
            <span className="text-[10px] sm:text-xs">{formatPercent(DAILY_TARGET)}</span>
          </div>
        </div>

        {/* Main value */}
        <div className="flex items-center gap-2">
          {isPositive ? (
            <TrendingUp className={`h-5 w-5 sm:h-6 sm:w-6 shrink-0 ${hitTarget ? "text-green-500" : "text-yellow-500"}`} />
          ) : (
            <TrendingDown className="h-5 w-5 sm:h-6 sm:w-6 text-destructive shrink-0" />
          )}
          <span className={`text-xl sm:text-2xl font-bold ${hitTarget ? "text-green-500" : isPositive ? "text-yellow-500" : "text-destructive"}`}>
            {formatPercent(lastCompleteDayReturn)}
          </span>
        </div>

        {/* Progress bar */}
        <div className="space-y-1">
          <div className="h-2 sm:h-2.5 w-full rounded-full bg-muted overflow-hidden relative">
            <div
              className={`h-full rounded-full transition-all ${barColor}`}
              style={{ width: `${pct}%` }}
            />
            {/* Target marker at 50% */}
            <div className="absolute top-0 h-full w-px bg-foreground/40" style={{ left: "50%" }} />
          </div>
          <div className="flex justify-between text-[9px] sm:text-[10px] text-muted-foreground">
            <span>{formatPercent(minVal)}</span>
            <span>{formatPercent(maxVal)}</span>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[9px] sm:text-xs text-muted-foreground">Media Diaria</p>
            <p className={`text-xs sm:text-sm font-semibold ${avgDailyReturn >= 0 ? "text-green-500" : "text-destructive"}`}>
              {formatPercent(avgDailyReturn)}
            </p>
          </div>
          {hitTarget && (
            <div className="flex items-center gap-1 text-green-500">
              <CheckCircle className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              <span className="text-[10px] sm:text-xs font-medium">Objetivo</span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
