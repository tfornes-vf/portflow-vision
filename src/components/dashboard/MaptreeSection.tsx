import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Treemap, ResponsiveContainer, Tooltip } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { X, Plus } from "lucide-react";

interface TreemapNode {
  name: string;
  size?: number;
  children?: TreemapNode[];
  fill?: string;
  path?: string[];
}

interface GroupDimension {
  id: string;
  type: "tag_category" | "native";
  label: string;
  categoryId?: string;
}

interface Asset {
  id: string;
  name: string;
  cost_basis: number;
  entity_id: string;
  asset_class_hard: string;
}

export const MaptreeSection = () => {
  const [activeDimensions, setActiveDimensions] = useState<GroupDimension[]>([]);
  const [availableDimensions, setAvailableDimensions] = useState<GroupDimension[]>([]);
  const [treemapData, setTreemapData] = useState<TreemapNode[]>([]);
  const [rawAssets, setRawAssets] = useState<any[]>([]);

  useEffect(() => {
    fetchAvailableDimensions();
    fetchAssets();
  }, []);

  useEffect(() => {
    if (rawAssets.length > 0 && activeDimensions.length > 0) {
      buildNestedTreemap();
    } else if (rawAssets.length > 0) {
      buildFlatTreemap();
    }
  }, [activeDimensions, rawAssets]);

  const fetchAvailableDimensions = async () => {
    try {
      const { data: categories } = await supabase
        .from("tag_categories")
        .select("id, name");

      const dimensions: GroupDimension[] = [
        { id: "entity", type: "native", label: "Entidad" },
        { id: "asset_class", type: "native", label: "Clase de Activo" },
      ];

      categories?.forEach((cat) => {
        dimensions.push({
          id: `tag_${cat.id}`,
          type: "tag_category",
          label: cat.name,
          categoryId: cat.id,
        });
      });

      setAvailableDimensions(dimensions);
    } catch (error) {
      console.error("Error fetching dimensions:", error);
    }
  };

  const fetchAssets = async () => {
    try {
      const { data: assetsData, error: assetsError } = await supabase
        .from("assets")
        .select("id, name, cost_basis, entity_id, asset_class_hard");

      if (assetsError || !assetsData) return;

      const { data: entities } = await supabase
        .from("entities")
        .select("id, name");

      const assetIds = assetsData.map((a) => a.id);
      const { data: marketValues } = await supabase
        .from("market_values")
        .select("asset_id, value_base, valuation_date")
        .in("asset_id", assetIds)
        .order("valuation_date", { ascending: false });

      const { data: assetTags } = await supabase
        .from("asset_tags")
        .select("asset_id, tag_id")
        .in("asset_id", assetIds);

      const { data: tags } = await supabase
        .from("tags")
        .select(`id, name, category_id, tag_categories(id, name)`);

      const latestValueMap = new Map();
      marketValues?.forEach((mv) => {
        if (!latestValueMap.has(mv.asset_id)) {
          latestValueMap.set(mv.asset_id, mv.value_base);
        }
      });

      const entityMap = new Map();
      entities?.forEach((entity) => {
        entityMap.set(entity.id, entity.name);
      });

      const tagMap = new Map();
      tags?.forEach((tag) => {
        tagMap.set(tag.id, tag);
      });

      const assetTagsMap = new Map();
      assetTags?.forEach((at) => {
        if (!assetTagsMap.has(at.asset_id)) {
          assetTagsMap.set(at.asset_id, []);
        }
        assetTagsMap.get(at.asset_id).push(at.tag_id);
      });

      const enrichedAssets = assetsData.map((asset) => ({
        ...asset,
        currentValue: Number(latestValueMap.get(asset.id) || asset.cost_basis),
        entityName: entityMap.get(asset.entity_id) || "Unknown",
        tags: (assetTagsMap.get(asset.id) || []).map((tagId: string) => tagMap.get(tagId)).filter(Boolean),
      }));

      setRawAssets(enrichedAssets);
    } catch (error) {
      console.error("Error fetching assets:", error);
    }
  };

  const buildFlatTreemap = () => {
    const colors = [
      "hsl(var(--accent))",
      "hsl(var(--primary))",
      "hsl(var(--success))",
      "hsl(var(--accent-red))",
      "hsl(var(--muted-foreground))",
    ];

    const data: TreemapNode[] = rawAssets.map((asset, idx) => ({
      name: asset.name,
      size: asset.currentValue,
      fill: colors[idx % colors.length],
      path: [asset.name],
    }));

    setTreemapData(data);
  };

  const buildNestedTreemap = () => {
    const groupAssets = (assets: any[], dimensions: GroupDimension[], level = 0): TreemapNode[] => {
      if (level >= dimensions.length) {
        const colors = [
          "hsl(var(--accent))",
          "hsl(var(--primary))",
          "hsl(var(--success))",
          "hsl(var(--accent-red))",
          "hsl(var(--muted-foreground))",
        ];
        return assets.map((asset, idx) => ({
          name: asset.name,
          size: asset.currentValue,
          fill: colors[idx % colors.length],
          path: [...(asset.path || []), asset.name],
        }));
      }

      const dimension = dimensions[level];
      const grouped = new Map<string, any[]>();

      assets.forEach((asset) => {
        let key = "Unknown";

        if (dimension.type === "native") {
          if (dimension.id === "entity") {
            key = asset.entityName;
          } else if (dimension.id === "asset_class") {
            key = asset.asset_class_hard || "Unknown";
          }
        } else if (dimension.type === "tag_category" && dimension.categoryId) {
          const tag = asset.tags?.find((t: any) => t.category_id === dimension.categoryId);
          if (tag) key = tag.name;
        }

        if (!grouped.has(key)) grouped.set(key, []);
        grouped.get(key)!.push({
          ...asset,
          path: [...(asset.path || []), key],
        });
      });

      const colors = [
        "hsl(var(--accent))",
        "hsl(var(--primary))",
        "hsl(var(--success))",
        "hsl(var(--accent-red))",
        "hsl(var(--muted-foreground))",
      ];

      return Array.from(grouped.entries()).map(([name, groupedAssets], idx) => {
        const children = groupAssets(groupedAssets, dimensions, level + 1);
        const totalSize = children.reduce((sum, child) => sum + (child.size || 0), 0);

        return {
          name,
          children,
          size: totalSize,
          fill: colors[idx % colors.length],
          path: [name],
        };
      });
    };

    const nestedData = groupAssets(rawAssets, activeDimensions);
    setTreemapData(nestedData);
  };

  const addDimension = (dimensionId: string) => {
    const dimension = availableDimensions.find((d) => d.id === dimensionId);
    if (dimension && !activeDimensions.find((d) => d.id === dimensionId)) {
      setActiveDimensions([...activeDimensions, dimension]);
    }
  };

  const removeDimension = (dimensionId: string) => {
    setActiveDimensions(activeDimensions.filter((d) => d.id !== dimensionId));
  };

  const CustomizedContent = (props: any) => {
    const { x, y, width, height, name, size, fill, depth } = props;

    if (!width || !height || width < 30 || height < 24) {
      return null;
    }

    const displayName = name ?? "-";
    const displayValue = typeof size === "number" && Number.isFinite(size) ? size : 0;
    const isLeaf = !props.children || props.children.length === 0;

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
            strokeWidth: depth === 0 ? 3 : 2,
            opacity: isLeaf ? 1 : 0.7,
          }}
        />
        {width > 40 && height > 30 && (
          <>
            <text
              x={x + width / 2}
              y={y + height / 2 - (isLeaf ? 8 : 0)}
              textAnchor="middle"
              fill="hsl(var(--background))"
              fontSize={isLeaf ? 11 : 13}
              fontWeight={isLeaf ? "normal" : "bold"}
            >
              {displayName.length > 20 ? displayName.substring(0, 18) + "..." : displayName}
            </text>
            {isLeaf && displayValue > 0 && (
              <text
                x={x + width / 2}
                y={y + height / 2 + 10}
                textAnchor="middle"
                fill="hsl(var(--background))"
                fontSize={10}
              >
                €{displayValue.toLocaleString("es-ES", { maximumFractionDigits: 0 })}
              </text>
            )}
          </>
        )}
      </g>
    );
  };
  const unusedDimensions = availableDimensions.filter(
    (d) => !activeDimensions.find((ad) => ad.id === d.id)
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Portfolio Exposure (Treemap)</CardTitle>
        
        <div className="space-y-3 mt-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted-foreground font-medium">Dimensiones activas:</span>
            {activeDimensions.length === 0 ? (
              <span className="text-sm text-muted-foreground italic">Ninguna seleccionada</span>
            ) : (
              activeDimensions.map((dim) => (
                <Badge
                  key={dim.id}
                  variant="secondary"
                  className="pl-3 pr-1 py-1 gap-1 text-sm"
                >
                  {dim.label}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-4 w-4 p-0 hover:bg-transparent"
                    onClick={() => removeDimension(dim.id)}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </Badge>
              ))
            )}
          </div>

          {unusedDimensions.length > 0 && (
            <div className="flex items-center gap-2">
              <Select onValueChange={addDimension}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Añadir dimensión..." />
                </SelectTrigger>
                <SelectContent>
                  {unusedDimensions.map((dim) => (
                    <SelectItem key={dim.id} value={dim.id}>
                      {dim.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      </CardHeader>

      <CardContent>
        {treemapData.length === 0 ? (
          <div className="flex items-center justify-center h-[500px] text-muted-foreground">
            Cargando datos del portfolio...
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={500}>
            <Treemap
              data={treemapData}
              dataKey="size"
              aspectRatio={4 / 3}
              stroke="hsl(var(--background))"
              content={<CustomizedContent />}
            >
              <Tooltip
                content={({ payload }: any) => {
                  if (!payload?.[0]) return null;
                  const data = payload[0].payload;
                  return (
                    <div className="bg-popover text-popover-foreground border rounded-md p-3 shadow-md">
                      <p className="font-semibold text-sm mb-1">{data.name}</p>
                      {data.path && data.path.length > 1 && (
                        <p className="text-xs text-muted-foreground mb-1">
                          {data.path.join(" > ")}
                        </p>
                      )}
                      {data.size && (
                        <p className="text-sm font-medium">
                          €{data.size.toLocaleString("es-ES", { maximumFractionDigits: 0 })}
                        </p>
                      )}
                    </div>
                  );
                }}
              />
            </Treemap>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
};
