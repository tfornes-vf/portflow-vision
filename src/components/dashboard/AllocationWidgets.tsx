import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from "recharts";
import { supabase } from "@/integrations/supabase/client";

interface AllocationData {
  name: string;
  value: number;
}

export const AllocationWidgets = () => {
  const [liquidityData, setLiquidityData] = useState<AllocationData[]>([]);
  const [statusData, setStatusData] = useState<AllocationData[]>([]);

  useEffect(() => {
    fetchAllocationData();
  }, []);

  const fetchAllocationData = async () => {
    try {
      // Fetch assets with their latest market values
      const { data: assetsData, error: assetsError } = await supabase
        .from("assets")
        .select(`
          id,
          asset_class_hard,
          cost_basis
        `);

      if (assetsError) throw assetsError;

      // Aggregate by Liquid/Illiquid
      const liquidityMap: { [key: string]: number } = {};
      const statusMap: { [key: string]: number } = { Afecto: 0, "No Afecto": 0 };

      for (const asset of assetsData || []) {
        // Get latest market value
        const { data: latestValue } = await supabase
          .from("market_values")
          .select("value_base")
          .eq("asset_id", asset.id)
          .order("valuation_date", { ascending: false })
          .limit(1)
          .maybeSingle();

        const currentValue = latestValue?.value_base || asset.cost_basis;

        // Aggregate by asset class
        const assetClass = asset.asset_class_hard || "Unknown";
        liquidityMap[assetClass] = (liquidityMap[assetClass] || 0) + currentValue;

        // Get tags for status
        const { data: tags } = await supabase
          .from("asset_tags")
          .select(`
            tags!inner(name, category)
          `)
          .eq("asset_id", asset.id);

        const statusTag = tags?.find((t: any) => t.tags.category === "Status");
        if (statusTag) {
          statusMap[statusTag.tags.name] = (statusMap[statusTag.tags.name] || 0) + currentValue;
        }
      }

      setLiquidityData(
        Object.entries(liquidityMap).map(([name, value]) => ({ name, value }))
      );
      setStatusData(
        Object.entries(statusMap).map(([name, value]) => ({ name, value }))
      );
    } catch (error) {
      console.error("Error fetching allocation data:", error);
    }
  };

  const COLORS = {
    Liquid: "hsl(var(--accent))",
    Illiquid: "hsl(var(--accent-red))",
    Afecto: "hsl(var(--success))",
    "No Afecto": "hsl(var(--muted-foreground))",
  };

  const renderChart = (data: AllocationData[], title: string) => (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={250}>
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={90}
              paddingAngle={2}
              dataKey="value"
            >
              {data.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={COLORS[entry.name as keyof typeof COLORS] || "hsl(var(--muted))"}
                />
              ))}
            </Pie>
            <Tooltip
              formatter={(value: number) =>
                `€${value.toLocaleString("es-ES", { maximumFractionDigits: 0 })}`
              }
            />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );

  return (
    <div className="grid gap-6 md:grid-cols-2">
      {renderChart(liquidityData, "Liquid vs Illiquid")}
      {renderChart(statusData, "Afecto vs No Afecto")}
    </div>
  );
};
