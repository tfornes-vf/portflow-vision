import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type Period = "1D" | "1W" | "1M" | "YTD" | "ALL";

interface HeatmapCell {
  date: string;
  value: number;
}

interface Strategy {
  name: string;
  data: HeatmapCell[];
}

// Mock data - will be replaced with real data from Supabase
const generateMockData = (period: Period): Strategy[] => {
  const strategies = ["Strategy Alpha", "Strategy Beta", "Strategy Gamma"];
  const now = new Date();
  
  const getCellCount = (period: Period) => {
    switch (period) {
      case "1D": return 24; // 24 hours
      case "1W": return 7;  // 7 days
      case "1M": return 30; // 30 days
      case "YTD": return Math.ceil((now.getTime() - new Date(now.getFullYear(), 0, 1).getTime()) / (1000 * 60 * 60 * 24));
      case "ALL": return 52; // 52 weeks
    }
  };

  const getDateLabel = (index: number, period: Period) => {
    const date = new Date(now);
    switch (period) {
      case "1D":
        date.setHours(index);
        return `${index}h`;
      case "1W":
        const days = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
        return days[(now.getDay() - 6 + index) % 7];
      case "1M":
        date.setDate(date.getDate() - (29 - index));
        return date.getDate().toString();
      case "YTD":
      case "ALL":
        date.setDate(date.getDate() - (getCellCount(period) - 1 - index));
        return `${date.getMonth() + 1}/${date.getDate()}`;
    }
  };

  const cellCount = getCellCount(period);

  return strategies.map(name => ({
    name,
    data: Array.from({ length: cellCount }, (_, i) => ({
      date: getDateLabel(i, period),
      value: (Math.random() - 0.5) * 10 // Random value between -5 and 5
    }))
  }));
};

export const StrategiesHeatmap = () => {
  const [selectedPeriod, setSelectedPeriod] = useState<Period>("1W");
  const strategies = generateMockData(selectedPeriod);

  const getColorFromValue = (value: number): string => {
    if (value === 0) return "hsl(var(--muted))";
    
    // Normalize value to -1 to 1 range (assuming max ±10%)
    const normalized = Math.max(-1, Math.min(1, value / 10));
    
    if (normalized > 0) {
      // Positive: white to green
      const intensity = Math.round(normalized * 100);
      return `hsl(142, ${45 + intensity * 0.3}%, ${95 - intensity * 0.45}%)`;
    } else {
      // Negative: white to red
      const intensity = Math.round(Math.abs(normalized) * 100);
      return `hsl(0, ${45 + intensity * 0.4}%, ${95 - intensity * 0.45}%)`;
    }
  };

  const periods: Period[] = ["1D", "1W", "1M", "YTD", "ALL"];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Strategies Performance</CardTitle>
        <div className="flex gap-2">
          {periods.map((period) => (
            <Button
              key={period}
              variant={selectedPeriod === period ? "default" : "outline"}
              size="sm"
              onClick={() => setSelectedPeriod(period)}
              className="min-w-[50px]"
            >
              {period}
            </Button>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        <TooltipProvider>
          <div className="overflow-x-auto">
            <div className="inline-block min-w-full">
              {/* Header with dates/times */}
              <div className="flex mb-2">
                <div className="w-32 flex-shrink-0" />
                <div className="flex gap-1 flex-1">
                  {strategies[0]?.data.map((cell, i) => (
                    <div
                      key={i}
                      className="flex-1 min-w-[16px] text-[10px] text-muted-foreground text-center"
                    >
                      {i % Math.ceil(strategies[0].data.length / 12) === 0 ? cell.date : ""}
                    </div>
                  ))}
                </div>
              </div>

              {/* Strategy rows */}
              {strategies.map((strategy) => (
                <div key={strategy.name} className="flex items-center mb-2">
                  <div className="w-32 flex-shrink-0 pr-4">
                    <span className="text-sm font-medium">{strategy.name}</span>
                  </div>
                  <div className="flex gap-1 flex-1">
                    {strategy.data.map((cell, i) => (
                      <Tooltip key={i} delayDuration={0}>
                        <TooltipTrigger asChild>
                          <div
                            className={cn(
                              "flex-1 min-w-[16px] h-8 rounded-sm cursor-pointer transition-all hover:ring-2 hover:ring-primary hover:ring-offset-1",
                              "border border-border/20"
                            )}
                            style={{
                              backgroundColor: getColorFromValue(cell.value),
                            }}
                          />
                        </TooltipTrigger>
                        <TooltipContent>
                          <div className="text-xs space-y-1">
                            <p className="font-medium">{strategy.name}</p>
                            <p className="text-muted-foreground">{cell.date}</p>
                            <p className={cn(
                              "font-semibold",
                              cell.value >= 0 ? "text-green-600" : "text-red-600"
                            )}>
                              {cell.value > 0 ? "+" : ""}{cell.value.toFixed(2)}%
                            </p>
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    ))}
                  </div>
                </div>
              ))}

              {/* Legend */}
              <div className="flex items-center justify-center gap-4 mt-6 pt-4 border-t">
                <span className="text-xs text-muted-foreground">Pérdida</span>
                <div className="flex gap-1">
                  {[-5, -2.5, 0, 2.5, 5].map((val) => (
                    <div
                      key={val}
                      className="w-6 h-4 rounded-sm border border-border/20"
                      style={{ backgroundColor: getColorFromValue(val) }}
                    />
                  ))}
                </div>
                <span className="text-xs text-muted-foreground">Ganancia</span>
              </div>
            </div>
          </div>
        </TooltipProvider>
      </CardContent>
    </Card>
  );
};
