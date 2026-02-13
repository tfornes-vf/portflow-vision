import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";

interface DailyReturnGaugeProps {
  dailyReturn: number;
  avgDailyReturn: number;
  lastCompleteDayReturn: number;
}

const DAILY_TARGET = 0.12; // Objetivo diario: 0.12%

export function DailyReturnGauge({ dailyReturn, avgDailyReturn, lastCompleteDayReturn }: DailyReturnGaugeProps) {
  const gaugeData = useMemo(() => {
    // Range: -0.12% to +0.36%, where 0.12% (target) is at center (50%)
    // This gives a total range of 0.48%
    const minValue = -DAILY_TARGET; // -0.12%
    const maxValue = DAILY_TARGET * 3; // +0.36%
    const range = maxValue - minValue; // 0.48%
    
    // Clamp and normalize lastCompleteDayReturn to 0-100%
    const clampedValue = Math.max(minValue, Math.min(maxValue, lastCompleteDayReturn));
    const percentage = ((clampedValue - minValue) / range) * 100;
    
    // Color based on whether we hit the target
    const hitTarget = lastCompleteDayReturn >= DAILY_TARGET;
    const isPositive = lastCompleteDayReturn >= 0;
    
    let fillColor: string;
    if (hitTarget) {
      fillColor = "hsl(142, 76%, 36%)"; // Green - exceeded target
    } else if (isPositive) {
      fillColor = "hsl(48, 96%, 53%)"; // Yellow - positive but below target
    } else {
      fillColor = "hsl(var(--destructive))"; // Red - negative
    }
    
    return [
      { value: percentage, color: fillColor },
      { value: 100 - percentage, color: "hsl(var(--muted))" },
    ];
  }, [lastCompleteDayReturn]);

  const formatPercent = (value: number) => `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
  
  const hitTarget = lastCompleteDayReturn >= DAILY_TARGET;

  return (
    <Card className="relative">
      <CardHeader className="pb-1 sm:pb-2 p-2.5 sm:p-6">
        <div className="flex items-center justify-between">
          <CardTitle className="text-xs sm:text-base">Rentabilidad Diaria</CardTitle>
          <div className="text-right">
            <p className="text-[9px] sm:text-xs text-muted-foreground">Objetivo</p>
            <p className="text-[10px] sm:text-sm font-bold text-muted-foreground">
              {formatPercent(DAILY_TARGET)}
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-2.5 sm:p-6 pt-0">
        <div className="relative h-[120px] sm:h-[180px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={gaugeData}
                cx="50%"
                cy="80%"
                startAngle={180}
                endAngle={0}
                innerRadius="45%"
                outerRadius="70%"
                paddingAngle={0}
                dataKey="value"
              >
                {gaugeData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} stroke="none" />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          
          {/* Target marker at center top */}
          <div className="absolute left-1/2 -translate-x-1/2" style={{ top: '12%' }}>
            <div className="flex flex-col items-center">
              <div className="w-0.5 h-2 sm:h-3 bg-foreground/50" />
              <p className="text-[8px] sm:text-[9px] text-muted-foreground mt-0.5">{formatPercent(DAILY_TARGET)}</p>
            </div>
          </div>
          
          {/* Center Value */}
          <div className="absolute inset-0 flex flex-col items-center justify-center" style={{ top: '20%' }}>
            <p className={`text-sm sm:text-xl font-bold ${hitTarget ? "text-green-500" : lastCompleteDayReturn >= 0 ? "text-yellow-500" : "text-red-500"}`}>
              {formatPercent(lastCompleteDayReturn)}
            </p>
            <p className="text-[8px] sm:text-[10px] text-muted-foreground mt-0.5 sm:mt-1">Último día completo</p>
            {hitTarget && (
              <p className="text-[8px] sm:text-[9px] text-green-500 mt-0.5">✓ Objetivo superado</p>
            )}
          </div>
        </div>
        
        {/* Legend */}
        <div className="flex justify-center gap-6 mt-1 sm:mt-2">
          <div className="text-center">
            <p className="text-[9px] sm:text-xs text-muted-foreground">Media Diaria</p>
            <p className={`text-[10px] sm:text-sm font-semibold ${avgDailyReturn >= 0 ? "text-green-500" : "text-red-500"}`}>
              {formatPercent(avgDailyReturn)}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
