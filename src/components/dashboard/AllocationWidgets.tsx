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
      // Fetch all assets
      const { data: assetsData, error: assetsError } = await supabase
        .from("assets")
        .select("id, asset_class_hard, cost_basis");

      if (assetsError) {
        console.error("Assets error:", assetsError);
        return;
      }

      if (!assetsData || assetsData.length === 0) {
        console.log("No assets found");
        return;
      }

      // Fetch all market values at once
      const assetIds = assetsData.map(a => a.id);
      const { data: marketValues } = await supabase
        .from("market_values")
        .select("asset_id, value_base, valuation_date")
        .in("asset_id", assetIds)
        .order("valuation_date", { ascending: false });

      // Fetch all asset tags at once
      const { data: assetTags } = await supabase
        .from("asset_tags")
        .select("asset_id, tag_id")
        .in("asset_id", assetIds);

      // Fetch all tags
      const { data: tags } = await supabase
        .from("tags")
        .select("id, name, category");

      // Create maps for quick lookup
      const latestValueMap = new Map();
      marketValues?.forEach(mv => {
        if (!latestValueMap.has(mv.asset_id)) {
          latestValueMap.set(mv.asset_id, mv.value_base);
        }
      });

      const tagMap = new Map();
      tags?.forEach(tag => {
        tagMap.set(tag.id, tag);
      });

      // Aggregate data
      const liquidityMap: { [key: string]: number } = {};
      const statusMap: { [key: string]: number } = {};

      assetsData.forEach(asset => {
        const currentValue = latestValueMap.get(asset.id) || asset.cost_basis;

        // Aggregate by asset class
        const assetClass = asset.asset_class_hard || "Unknown";
        liquidityMap[assetClass] = (liquidityMap[assetClass] || 0) + Number(currentValue);

        // Get status tag
        const assetTag = assetTags?.find(at => at.asset_id === asset.id);
        if (assetTag) {
          const tag = tagMap.get(assetTag.tag_id);
          if (tag && tag.category === "Status") {
            statusMap[tag.name] = (statusMap[tag.name] || 0) + Number(currentValue);
          }
        }
      });

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
