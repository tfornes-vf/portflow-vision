import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Building2, DollarSign, MoreVertical } from "lucide-react";
import { cn } from "@/lib/utils";

interface Position {
  id: string;
  title: string;
  icon: "building" | "dollar";
  purchaseAmount: number;
  currentPosition: number;
  profitLoss: number;
  profitLossPercent: number;
}

interface PositionsTableProps {
  activeCategory: string;
}

export const PositionsTable = ({ activeCategory }: PositionsTableProps) => {
  // Mock positions data - in production this would be filtered by category
  const positions: Position[] = [
    {
      id: "1",
      title: "Pistacho Fields SL",
      icon: "dollar",
      purchaseAmount: 3700000,
      currentPosition: 4720000,
      profitLoss: 243680.07,
      profitLossPercent: 6.44,
    },
    {
      id: "2",
      title: "Qualitas Funds VA-I-FCR",
      icon: "dollar",
      purchaseAmount: 1399999,
      currentPosition: 2623038,
      profitLoss: 1223039,
      profitLossPercent: 87.36,
    },
    {
      id: "3",
      title: "Vineyards Origen SL",
      icon: "building",
      purchaseAmount: 1726000,
      currentPosition: 2000000,
      profitLoss: 274000,
      profitLossPercent: 15.87,
    },
    {
      id: "4",
      title: "Cisneros 4,08B3, Bellaterra",
      icon: "building",
      purchaseAmount: 1000000,
      currentPosition: 1700000,
      profitLoss: 63289.83,
      profitLossPercent: 3.87,
    },
    {
      id: "5",
      title: "Montserny 8, 08B3, Bellaterra",
      icon: "building",
      purchaseAmount: 1200000,
      currentPosition: 1200000,
      profitLoss: 0,
      profitLossPercent: 0,
    },
    {
      id: "6",
      title: "Sphere Sotogrande",
      icon: "building",
      purchaseAmount: 730813,
      currentPosition: 858000,
      profitLoss: 24443.64,
      profitLossPercent: 2.96,
    },
    {
      id: "7",
      title: "Masia Can Santamaria, Sant Feliu Sasserra, 08174",
      icon: "building",
      purchaseAmount: 465000,
      currentPosition: 780000,
      profitLoss: 36501.02,
      profitLossPercent: 4.77,
    },
    {
      id: "8",
      title: "Qualitas Funds Direct II SCR B",
      icon: "dollar",
      purchaseAmount: 545000,
      currentPosition: 724850,
      profitLoss: 45512.97,
      profitLossPercent: 6.79,
    },
  ];

  const periods = ["1D", "1W", "1M", "YTD", "1Y", "Max"];

  return (
    <Card className="border-border bg-card">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-muted-heading">Posiciones</CardTitle>
          <Button size="sm">
            + Agregar transacción
          </Button>
        </div>
        <div className="flex gap-2 pt-2">
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
        <div className="rounded-md border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Título ↓</TableHead>
                <TableHead className="text-right">Comprar</TableHead>
                <TableHead className="text-right">Posición ↑</TableHead>
                <TableHead className="text-right">P/L ↓</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {positions.map((position) => (
                <TableRow key={position.id} className="transition-smooth hover:bg-muted/50">
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted">
                        {position.icon === "building" ? (
                          <Building2 className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <DollarSign className="h-4 w-4 text-muted-foreground" />
                        )}
                      </div>
                      <span className="font-medium text-foreground">
                        {position.title}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {position.purchaseAmount.toLocaleString('es-ES', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2
                    })} €
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {position.currentPosition.toLocaleString('es-ES', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2
                    })} €
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex flex-col items-end">
                      <span
                        className={cn(
                          "font-semibold",
                          position.profitLoss >= 0
                            ? "profit-positive"
                            : "profit-negative"
                        )}
                      >
                        {position.profitLoss >= 0 ? "+" : ""}
                        {position.profitLoss.toLocaleString('es-ES', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2
                        })} €
                      </span>
                      <span
                        className={cn(
                          "text-xs",
                          position.profitLoss >= 0
                            ? "profit-positive"
                            : "profit-negative"
                        )}
                      >
                        {position.profitLossPercent >= 0 ? "+" : ""}
                        {position.profitLossPercent.toFixed(2)} %
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon">
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <div className="mt-4 flex justify-center">
          <Button variant="ghost" size="sm">
            Ver más ↓
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};
