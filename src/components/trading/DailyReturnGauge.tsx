import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";

interface DailyReturnGaugeProps {
  dailyReturn: number;
  avgDailyReturn: number;
  lastCompleteDayReturn: number;
}

export function DailyReturnGauge({ dailyReturn, avgDailyReturn, lastCompleteDayReturn }: DailyReturnGaugeProps) {
  const gaugeData = useMemo(() => {
    // Normalize the value for gauge display (-10% to +10% range)
    const normalizedValue = Math.max(-10, Math.min(10, avgDailyReturn));
    const percentage = ((normalizedValue + 10) / 20) * 100;
    
    return [
      { value: percentage, color: avgDailyReturn >= 0 ? "hsl(var(--chart-2))" : "hsl(var(--destructive))" },
      { value: 100 - percentage, color: "hsl(var(--muted))" },
    ];
  }, [avgDailyReturn]);

  const formatPercent = (value: number) => `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;

  return (
    <Card className="relative">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Rentabilidad Diaria</CardTitle>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Último día completo</p>
            <p className={`text-sm font-bold ${lastCompleteDayReturn >= 0 ? "text-green-500" : "text-red-500"}`}>
              {formatPercent(lastCompleteDayReturn)}
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="relative h-[180px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={gaugeData}
                cx="50%"
                cy="80%"
                startAngle={180}
                endAngle={0}
                innerRadius={60}
                outerRadius={90}
                paddingAngle={0}
                dataKey="value"
              >
                {gaugeData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} stroke="none" />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          
          {/* Center Value */}
          <div className="absolute inset-0 flex flex-col items-center justify-center" style={{ top: '20%' }}>
            <p className={`text-3xl font-bold ${dailyReturn >= 0 ? "text-green-500" : "text-red-500"}`}>
              {formatPercent(dailyReturn)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">Hoy</p>
          </div>
        </div>
        
        {/* Legend */}
        <div className="flex justify-center gap-6 mt-2">
          <div className="text-center">
            <p className="text-xs text-muted-foreground">Media Diaria</p>
            <p className={`text-sm font-semibold ${avgDailyReturn >= 0 ? "text-green-500" : "text-red-500"}`}>
              {formatPercent(avgDailyReturn)}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
