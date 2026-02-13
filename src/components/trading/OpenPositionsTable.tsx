import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";

interface OpenPosition {
  id: string;
  symbol: string;
  quantity: number;
  cost_price: number;
  market_price: number;
  market_value: number;
  unrealized_pnl: number;
  currency: string;
}

interface OpenPositionsTableProps {
  formatCurrency: (value: number) => string;
  displayCurrency: "USD" | "EUR";
  refreshTrigger: number;
}

export function OpenPositionsTable({ formatCurrency, displayCurrency, refreshTrigger }: OpenPositionsTableProps) {
  const [positions, setPositions] = useState<OpenPosition[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPositions();
  }, [refreshTrigger]);

  const fetchPositions = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("ib_open_positions_tsc")
        .select("*")
        .order("symbol", { ascending: true });

      if (error) throw error;
      setPositions(data || []);
    } catch (error) {
      console.error("Error fetching open positions:", error);
    } finally {
      setLoading(false);
    }
  };

  const totalUnrealizedPnl = positions.reduce((sum, p) => sum + p.unrealized_pnl, 0);
  const totalMarketValue = positions.reduce((sum, p) => sum + Math.abs(p.market_value), 0);

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base sm:text-lg">Posiciones Abiertas</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Cargando posiciones...</p>
        </CardContent>
      </Card>
    );
  }

  if (positions.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader className="p-3 sm:p-6">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-sm sm:text-lg">Posiciones Abiertas</CardTitle>
          <div className="flex items-center gap-2 sm:gap-3">
            <span className="text-[10px] sm:text-sm text-muted-foreground hidden sm:inline">
              Valor: {formatCurrency(totalMarketValue)}
            </span>
            <Badge variant={totalUnrealizedPnl >= 0 ? "default" : "destructive"} className="text-[10px] sm:text-xs">
              P&L: {totalUnrealizedPnl >= 0 ? "+" : ""}{formatCurrency(totalUnrealizedPnl)}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-2 sm:p-6 pt-0">
        <div className="rounded-md border overflow-x-auto max-w-full">
          <Table className="min-w-[400px]">
            <TableHeader>
              <TableRow>
                <TableHead className="text-[10px] sm:text-sm">Símbolo</TableHead>
                <TableHead className="text-right text-[10px] sm:text-sm">Cant.</TableHead>
                <TableHead className="text-right text-[10px] sm:text-sm hidden sm:table-cell">P. Coste</TableHead>
                <TableHead className="text-right text-[10px] sm:text-sm hidden sm:table-cell">P. Mercado</TableHead>
                <TableHead className="text-right text-[10px] sm:text-sm">Valor</TableHead>
                <TableHead className="text-right text-[10px] sm:text-sm">P&L</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {positions.map((pos) => (
                <TableRow key={pos.id}>
                  <TableCell className="py-1.5 sm:py-4">
                    <Badge variant="outline" className="font-mono text-[9px] sm:text-xs px-1 sm:px-2">{pos.symbol}</Badge>
                  </TableCell>
                  <TableCell className="text-right font-medium text-xs sm:text-sm py-1.5 sm:py-4">
                    {pos.quantity}
                  </TableCell>
                  <TableCell className="text-right text-xs sm:text-sm py-1.5 sm:py-4 hidden sm:table-cell">
                    {displayCurrency === "EUR" ? "€" : "$"}{pos.cost_price.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </TableCell>
                  <TableCell className="text-right text-xs sm:text-sm py-1.5 sm:py-4 hidden sm:table-cell">
                    {displayCurrency === "EUR" ? "€" : "$"}{pos.market_price.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </TableCell>
                  <TableCell className="text-right font-medium text-xs sm:text-sm py-1.5 sm:py-4">
                    {formatCurrency(Math.abs(pos.market_value))}
                  </TableCell>
                  <TableCell className={`text-right font-medium text-xs sm:text-sm py-1.5 sm:py-4 ${pos.unrealized_pnl >= 0 ? "text-green-500" : "text-red-500"}`}>
                    {pos.unrealized_pnl >= 0 ? "+" : ""}{formatCurrency(pos.unrealized_pnl)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
