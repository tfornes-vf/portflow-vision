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
      // Fetch all assets
      const { data: assetsData, error: assetsError } = await supabase
        .from("assets")
        .select("id, name, cost_basis, entity_id");

      if (assetsError) {
        console.error("Assets error:", assetsError);
        return;
      }

      if (!assetsData || assetsData.length === 0) {
        console.log("No assets found");
        return;
      }

      // Fetch entities
      const { data: entities } = await supabase
        .from("entities")
        .select("id, name");

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

      const entityMap = new Map();
      entities?.forEach(entity => {
        entityMap.set(entity.id, entity.name);
      });

      const tagMap = new Map();
      tags?.forEach(tag => {
        tagMap.set(tag.id, tag);
      });

      const groupedData: { [key: string]: number } = {};

      assetsData.forEach(asset => {
        const currentValue = Number(latestValueMap.get(asset.id) || asset.cost_basis);

        let groupKey = "Unknown";

        if (groupBy === "entity") {
          groupKey = entityMap.get(asset.entity_id) || "Unknown";
        } else {
          const targetCategory = groupBy === "status" ? "Status" : "Bank";
          const assetTag = assetTags?.find(at => at.asset_id === asset.id);
          if (assetTag) {
            const tag = tagMap.get(assetTag.tag_id);
            if (tag && tag.category === targetCategory) {
              groupKey = tag.name;
            }
          }
        }

        groupedData[groupKey] = (groupedData[groupKey] || 0) + currentValue;
      });

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
    const { x, y, width, height, name, size, fill } = props;

    // Evitar celdas demasiado pequeñas o datos inválidos
    if (!width || !height || width < 30 || height < 24 || typeof size !== "number") {
      return null;
    }

    const displayName = name ?? "-";
    const displayValue = Number.isFinite(size) ? size : 0;

    return (
      <g>
        <rect
          x={x}
          y={y}
          width={width}
          height={height}
          style={{
            fill: fill ?? "hsl(var(--accent))",
            stroke: "hsl(var(--background))",
            strokeWidth: 2,
          }}
        />
        <text
          x={x + width / 2}
          y={y + height / 2 - 8}
          textAnchor="middle"
          fill="hsl(var(--background))"
          fontSize={12}
          fontWeight="bold"
        >
          {displayName}
        </text>
        <text
          x={x + width / 2}
          y={y + height / 2 + 8}
          textAnchor="middle"
          fill="hsl(var(--background))"
          fontSize={11}
        >
          €{displayValue.toLocaleString("es-ES", { maximumFractionDigits: 0 })}
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
        {treemapData.length === 0 ? (
          <div className="flex items-center justify-center h-[400px] text-muted-foreground">
            Cargando datos del portfolio...
          </div>
        ) : (
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
                  `€${value?.toLocaleString("es-ES", { maximumFractionDigits: 0 }) || "0"}`
                }
              />
            </Treemap>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
};
