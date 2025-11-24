import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Treemap, ResponsiveContainer, Tooltip } from "recharts";
import { supabase } from "@/integrations/supabase/client";

interface TreemapData {
  name: string;
  size: number;
  fill: string;
}

type GroupByOption = "status" | "entity" | "bank";

export const MaptreeSection = () => {
  const [groupBy, setGroupBy] = useState<GroupByOption>("status");
  const [treemapData, setTreemapData] = useState<TreemapData[]>([]);

  useEffect(() => {
    fetchTreemapData();
  }, [groupBy]);

  const fetchTreemapData = async () => {
    try {
      const { data: assetsData, error: assetsError } = await supabase
        .from("assets")
        .select(`
          id,
          name,
          cost_basis,
          entity_id,
          entities!inner(name)
        `);

      if (assetsError) throw assetsError;

      const groupedData: { [key: string]: number } = {};

      for (const asset of assetsData || []) {
        const { data: latestValue } = await supabase
          .from("market_values")
          .select("value_base")
          .eq("asset_id", asset.id)
          .order("valuation_date", { ascending: false })
          .limit(1)
          .maybeSingle();

        const currentValue = latestValue?.value_base || asset.cost_basis;

        let groupKey = "";

        if (groupBy === "entity") {
          groupKey = asset.entities.name;
        } else {
          // Get tags for status or bank
          const { data: tags } = await supabase
            .from("asset_tags")
            .select(`
              tags!inner(name, category)
            `)
            .eq("asset_id", asset.id);

          const targetCategory = groupBy === "status" ? "Status" : "Bank";
          const tag = tags?.find((t: any) => t.tags.category === targetCategory);
          groupKey = tag?.tags.name || "Unknown";
        }

        groupedData[groupKey] = (groupedData[groupKey] || 0) + currentValue;
      }

      const colors = [
        "hsl(var(--accent))",
        "hsl(var(--accent-red))",
        "hsl(var(--success))",
        "hsl(var(--primary))",
        "hsl(var(--muted-foreground))",
      ];

      setTreemapData(
        Object.entries(groupedData).map(([name, size], index) => ({
          name,
          size,
          fill: colors[index % colors.length],
        }))
      );
    } catch (error) {
      console.error("Error fetching treemap data:", error);
    }
  };

  const CustomizedContent = (props: any) => {
    const { x, y, width, height, name, size } = props;

    if (width < 50 || height < 30) return null;

    return (
      <g>
        <rect
          x={x}
          y={y}
          width={width}
          height={height}
          style={{
            fill: props.fill,
            stroke: "hsl(var(--background))",
            strokeWidth: 2,
          }}
        />
        <text
          x={x + width / 2}
          y={y + height / 2 - 10}
          textAnchor="middle"
          fill="hsl(var(--background))"
          fontSize={14}
          fontWeight="bold"
        >
          {name}
        </text>
        <text
          x={x + width / 2}
          y={y + height / 2 + 10}
          textAnchor="middle"
          fill="hsl(var(--background))"
          fontSize={12}
        >
          €{size.toLocaleString("es-ES", { maximumFractionDigits: 0 })}
        </text>
      </g>
    );
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Portfolio Exposure (Treemap)</CardTitle>
        <Select value={groupBy} onValueChange={(value) => setGroupBy(value as GroupByOption)}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Group By" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="status">Afecto/No Afecto</SelectItem>
            <SelectItem value="entity">Empresa</SelectItem>
            <SelectItem value="bank">Banco</SelectItem>
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={400}>
          <Treemap
            data={treemapData}
            dataKey="size"
            aspectRatio={4 / 3}
            stroke="hsl(var(--background))"
            content={<CustomizedContent />}
          >
            <Tooltip
              formatter={(value: number) =>
                `€${value.toLocaleString("es-ES", { maximumFractionDigits: 0 })}`
              }
            />
          </Treemap>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
};
