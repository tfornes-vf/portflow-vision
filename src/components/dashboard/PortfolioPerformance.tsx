import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LineChart, Line, ResponsiveContainer, XAxis, YAxis, Tooltip } from "recharts";
import { Button } from "@/components/ui/button";
import { Eye, TrendingUp } from "lucide-react";

interface PortfolioPerformanceProps {
  totalValue: number;
  change: number;
  changePercent: number;
}

export const PortfolioPerformance = ({ 
  totalValue, 
  change, 
  changePercent 
}: PortfolioPerformanceProps) => {
  // Mock data for the performance chart
  const performanceData = Array.from({ length: 50 }, (_, i) => ({
    index: i,
    value: 16000000 + Math.random() * 2000000 + (i * 40000)
  }));

  const periods = ["1D", "1W", "1M", "YTD", "1Y", "Max"];

  return (
    <Card className="border-border bg-card">
      <CardHeader className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" className="gap-2">
              <Eye className="h-4 w-4" />
              Ocultar
            </Button>
            <Button variant="ghost" size="sm" className="gap-2">
              <TrendingUp className="h-4 w-4" />
              Rendimiento
            </Button>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" size="icon">
              <span className="text-lg">⚙️</span>
            </Button>
            <Button variant="ghost" size="icon">
              <span className="text-lg">⬆️</span>
            </Button>
          </div>
        </div>

        <div>
          <div className="flex items-baseline gap-3">
            <h2 className="text-4xl font-bold text-foreground">
              {totalValue.toLocaleString('es-ES', { 
                minimumFractionDigits: 3,
                maximumFractionDigits: 3 
              })}
              <span className="text-2xl text-muted-foreground ml-1">€</span>
            </h2>
          </div>
          <div className="flex items-center gap-2 mt-1">
            <span className={change >= 0 ? "profit-positive" : "profit-negative"}>
              {change >= 0 ? "↑" : "↓"}{Math.abs(change).toLocaleString('es-ES')} €
            </span>
            <span className={change >= 0 ? "profit-positive" : "profit-negative"}>
              ({changePercent >= 0 ? "+" : ""}{changePercent.toFixed(2)}%)
            </span>
          </div>
        </div>

        <div className="flex gap-2">
          {periods.map((period) => (
            <Button
              key={period}
              variant={period === "YTD" ? "default" : "outline"}
              size="sm"
              className="transition-smooth"
            >
              {period}
            </Button>
          ))}
        </div>
      </CardHeader>

      <CardContent>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={performanceData}>
            <XAxis dataKey="index" hide />
            <YAxis domain={['dataMin', 'dataMax']} hide />
            <Tooltip
              content={({ active, payload }) => {
                if (active && payload && payload[0]) {
                  return (
                    <div className="rounded-lg border border-border bg-card p-2 shadow-sm">
                      <span className="text-sm font-medium text-foreground">
                        {payload[0].value?.toLocaleString('es-ES', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2
                        })} €
                      </span>
                    </div>
                  );
                }
                return null;
              }}
            />
            <Line
              type="monotone"
              dataKey="value"
              stroke="hsl(var(--primary))"
              strokeWidth={2}
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
};
