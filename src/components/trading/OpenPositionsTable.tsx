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
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base sm:text-lg">Posiciones Abiertas</CardTitle>
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">
              Valor: {formatCurrency(totalMarketValue)}
            </span>
            <Badge variant={totalUnrealizedPnl >= 0 ? "default" : "destructive"}>
              P&L: {totalUnrealizedPnl >= 0 ? "+" : ""}{formatCurrency(totalUnrealizedPnl)}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Símbolo</TableHead>
                <TableHead className="text-right">Cantidad</TableHead>
                <TableHead className="text-right">Precio Coste</TableHead>
                <TableHead className="text-right">Precio Mercado</TableHead>
                <TableHead className="text-right">Valor Mercado</TableHead>
                <TableHead className="text-right">P&L No Realizado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {positions.map((pos) => (
                <TableRow key={pos.id}>
                  <TableCell>
                    <Badge variant="outline" className="font-mono">{pos.symbol}</Badge>
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {pos.quantity}
                  </TableCell>
                  <TableCell className="text-right">
                    {displayCurrency === "EUR" ? "€" : "$"}{pos.cost_price.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </TableCell>
                  <TableCell className="text-right">
                    {displayCurrency === "EUR" ? "€" : "$"}{pos.market_price.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {formatCurrency(Math.abs(pos.market_value))}
                  </TableCell>
                  <TableCell className={`text-right font-medium ${pos.unrealized_pnl >= 0 ? "text-green-500" : "text-red-500"}`}>
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
