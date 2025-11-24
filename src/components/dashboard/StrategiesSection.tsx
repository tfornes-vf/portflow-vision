import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

const strategies = [
  {
    name: "Strategy Alpha",
    D: 2.4,
    W: 5.2,
    M: 12.8,
    YTD: 45.3,
    "1Y": 67.8,
    MAX: 125.4,
  },
  {
    name: "Strategy Beta",
    D: -0.8,
    W: 1.2,
    M: 8.5,
    YTD: 32.1,
    "1Y": 54.2,
    MAX: 98.7,
  },
  {
    name: "Strategy Gamma",
    D: 1.5,
    W: 3.8,
    M: -2.3,
    YTD: 28.9,
    "1Y": 41.5,
    MAX: 76.3,
  },
];

export const StrategiesSection = () => {
  const periods = ["D", "W", "M", "YTD", "1Y", "MAX"];

  const getValueColor = (value: number) => {
    return value >= 0 ? "profit-positive" : "profit-negative";
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Strategies Performance</CardTitle>
        <Select defaultValue="all">
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Filtrar broker" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="ibkr">IBKR</SelectItem>
            <SelectItem value="saxo">Saxo Bank</SelectItem>
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[200px]">Estrategia</TableHead>
                {periods.map((period) => (
                  <TableHead key={period} className="text-center">
                    {period}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {strategies.map((strategy) => (
                <TableRow key={strategy.name}>
                  <TableCell className="font-medium">{strategy.name}</TableCell>
                  {periods.map((period) => {
                    const value = strategy[period as keyof typeof strategy] as number;
                    return (
                      <TableCell
                        key={period}
                        className={cn(
                          "text-center font-semibold",
                          getValueColor(value)
                        )}
                      >
                        {value > 0 ? "+" : ""}
                        {value.toFixed(1)}%
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
};
