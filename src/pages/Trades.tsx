import { useState, useEffect } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { es } from "date-fns/locale";

interface Trade {
  id: string;
  symbol: string;
  profit_loss: number;
  lot_size: number;
  closed_at: string;
  strategies: { name: string } | null;
}

type TimePeriod = "D" | "S" | "M" | "YTD" | "AÑO" | "ALL";

export default function Trades() {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [strategies, setStrategies] = useState<{ id: string; name: string }[]>([]);
  const [selectedPeriod, setSelectedPeriod] = useState<TimePeriod>("D");
  const [selectedStrategy, setSelectedStrategy] = useState<string>("all");
  const { toast } = useToast();

  useEffect(() => {
    fetchStrategies();
    fetchTrades();
  }, [selectedPeriod, selectedStrategy]);

  const fetchStrategies = async () => {
    try {
      const { data, error } = await supabase
        .from("strategies")
        .select("id, name")
        .eq("is_active", true);

      if (error) throw error;
      setStrategies(data || []);
    } catch (error) {
      console.error("Error fetching strategies:", error);
    }
  };

  const fetchTrades = async () => {
    try {
      let query = supabase
        .from("trades")
        .select(`
          id,
          symbol,
          profit_loss,
          lot_size,
          closed_at,
          strategies (name)
        `)
        .not("closed_at", "is", null)
        .order("closed_at", { ascending: false });

      // Apply strategy filter
      if (selectedStrategy !== "all") {
        query = query.eq("strategy_id", selectedStrategy);
      }

      // Apply time period filter
      const now = new Date();
      let startDate: Date | null = null;

      switch (selectedPeriod) {
        case "D":
          startDate = new Date(now.setHours(0, 0, 0, 0));
          break;
        case "S":
          startDate = new Date(now.setDate(now.getDate() - now.getDay()));
          break;
        case "M":
          startDate = new Date(now.getFullYear(), now.getMonth(), 1);
          break;
        case "YTD":
          startDate = new Date(now.getFullYear(), 0, 1);
          break;
        case "AÑO":
          startDate = new Date(now.setFullYear(now.getFullYear() - 1));
          break;
      }

      if (startDate) {
        query = query.gte("closed_at", startDate.toISOString());
      }

      const { data, error } = await query;

      if (error) throw error;
      setTrades(data || []);
    } catch (error) {
      console.error("Error fetching trades:", error);
      toast({
        title: "Error",
        description: "No se pudieron cargar las operaciones",
        variant: "destructive",
      });
    }
  };

  const periods: { value: TimePeriod; label: string }[] = [
    { value: "D", label: "D" },
    { value: "S", label: "S" },
    { value: "M", label: "M" },
    { value: "YTD", label: "YTD" },
    { value: "AÑO", label: "AÑO" },
    { value: "ALL", label: "ALL" },
  ];

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Operaciones</h1>
          <p className="text-muted-foreground">
            Historial completo de tus operaciones
          </p>
        </div>

        {/* Filters */}
        <Card>
          <CardHeader>
            <CardTitle>Filtros</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {periods.map((period) => (
                <Button
                  key={period.value}
                  variant={selectedPeriod === period.value ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSelectedPeriod(period.value)}
                  className="transition-smooth"
                >
                  {period.label}
                </Button>
              ))}
            </div>

            <Select value={selectedStrategy} onValueChange={setSelectedStrategy}>
              <SelectTrigger className="w-full md:w-[300px]">
                <SelectValue placeholder="Todas las estrategias" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas las estrategias</SelectItem>
                {strategies.map((strategy) => (
                  <SelectItem key={strategy.id} value={strategy.id}>
                    {strategy.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        {/* Trades Table */}
        <Card>
          <CardHeader>
            <CardTitle>Listado de Operaciones</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha y Hora</TableHead>
                    <TableHead>Activo</TableHead>
                    <TableHead>Estrategia</TableHead>
                    <TableHead className="text-right">Tamaño (Lote)</TableHead>
                    <TableHead className="text-right">P/L</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {trades.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground">
                        No hay operaciones para mostrar
                      </TableCell>
                    </TableRow>
                  ) : (
                    trades.map((trade) => (
                      <TableRow key={trade.id} className="transition-smooth hover:bg-muted/50">
                        <TableCell className="font-medium">
                          {trade.closed_at &&
                            format(new Date(trade.closed_at), "dd/MM/yyyy HH:mm", {
                              locale: es,
                            })}
                        </TableCell>
                        <TableCell>
                          {trade.symbol}
                        </TableCell>
                        <TableCell>{trade.strategies?.name || "-"}</TableCell>
                        <TableCell className="text-right">
                          {trade.lot_size}
                        </TableCell>
                        <TableCell
                          className={cn(
                            "text-right font-semibold",
                            trade.profit_loss >= 0
                              ? "profit-positive"
                              : "profit-negative"
                          )}
                        >
                          ${trade.profit_loss?.toFixed(2)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
