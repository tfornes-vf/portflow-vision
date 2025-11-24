import { useState, useEffect } from "react";
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
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface Position {
  id: string;
  title: string;
  icon: "building" | "dollar";
  purchaseAmount: number;
  currentPosition: number;
  profitLoss: number;
  profitLossPercent: number;
  assetClass: string;
}

interface PositionsTableProps {
  activeCategory: string;
}

const CATEGORY_TO_TAG_MAP: Record<string, string> = {
  "private-equity": "Private Equity",
  "real-estate": "Real Estate",
  "startups": "Startups",
  "stocks": "Stocks",
  "bonds": "Bonds",
};

export const PositionsTable = ({ activeCategory }: PositionsTableProps) => {
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    fetchPositions();
  }, [activeCategory]);

  const fetchPositions = async () => {
    try {
      setLoading(true);
      
      let query = supabase
        .from("assets")
        .select(`
          id,
          name,
          cost_basis,
          asset_class_hard,
          asset_tags (
            tags (
              name,
              category
            )
          )
        `);

      const { data: assetsData, error: assetsError } = await query;

      if (assetsError) throw assetsError;
      if (!assetsData) {
        setPositions([]);
        return;
      }

      let filteredAssets = assetsData;

      if (activeCategory !== "aggregated") {
        const targetTag = CATEGORY_TO_TAG_MAP[activeCategory];
        
        if (targetTag) {
          filteredAssets = assetsData.filter(asset => 
            asset.asset_tags?.some((at: any) => 
              at.tags?.name === targetTag
            )
          );
        } else {
          const bankTags = ["Andbank", "Santander", "CaixaBank", "Creand"];
          const targetBank = activeCategory === "interactive-brokers" 
            ? null 
            : bankTags.find(bank => bank.toLowerCase() === activeCategory.toLowerCase());

          if (targetBank) {
            filteredAssets = assetsData.filter(asset =>
              asset.asset_tags?.some((at: any) =>
                at.tags?.name === targetBank
              )
            );
          }
        }
      }

      const positionsWithValues: Position[] = [];

      for (const asset of filteredAssets) {
        const { data: latestValue } = await supabase
          .from("market_values")
          .select("value_base")
          .eq("asset_id", asset.id)
          .order("valuation_date", { ascending: false })
          .limit(1)
          .maybeSingle();

        const currentValue = latestValue?.value_base || asset.cost_basis;
        const profitLoss = currentValue - asset.cost_basis;
        const profitLossPercent = asset.cost_basis > 0 
          ? (profitLoss / asset.cost_basis) * 100 
          : 0;

        positionsWithValues.push({
          id: asset.id,
          title: asset.name,
          icon: asset.asset_class_hard === "Liquid" ? "dollar" : "building",
          purchaseAmount: asset.cost_basis,
          currentPosition: currentValue,
          profitLoss,
          profitLossPercent,
          assetClass: asset.asset_class_hard,
        });
      }

      setPositions(positionsWithValues);
    } catch (error) {
      console.error("Error fetching positions:", error);
      toast({
        title: "Error",
        description: "No se pudieron cargar las posiciones",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

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
              {loading ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">
                    Cargando posiciones...
                  </TableCell>
                </TableRow>
              ) : positions.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">
                    No hay posiciones para mostrar
                  </TableCell>
                </TableRow>
              ) : (
                positions.map((position) => (
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
              ))
              )}
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
