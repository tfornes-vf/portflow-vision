import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { AddAssetModal } from "@/components/modals/AddAssetModal";

interface AssetWithValue {
  id: string;
  name: string;
  cost_basis: number;
  current_value: number;
  profit_loss: number;
  profit_loss_percent: number;
  asset_class_hard: string;
  entity_name: string;
  tags: Array<{ id: string; name: string; category_id: string; category_name: string }>;
}

interface TagCategory {
  id: string;
  name: string;
}

interface Tag {
  id: string;
  name: string;
  category_id: string;
}

export default function Properties() {
  const { entityId } = useParams<{ entityId: string }>();
  const [assets, setAssets] = useState<AssetWithValue[]>([]);
  const [filteredAssets, setFilteredAssets] = useState<AssetWithValue[]>([]);
  const [tagCategories, setTagCategories] = useState<TagCategory[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  
  // Nivel 1: Categoría seleccionada (dimension)
  const [selectedCategory, setSelectedCategory] = useState<string>("asset_class");
  
  // Nivel 2: Tags seleccionados (filtros activos)
  const [activeFilters, setActiveFilters] = useState<string[]>([]);
  
  // Modal state
  const [addModalOpen, setAddModalOpen] = useState(false);
  
  const { toast } = useToast();

  useEffect(() => {
    if (entityId) {
      fetchTagCategories();
      fetchTags();
      fetchAssets();
    }
  }, [entityId]);

  useEffect(() => {
    applyFilters();
  }, [assets, activeFilters, selectedCategory]);

  const fetchTagCategories = async () => {
    const { data } = await supabase
      .from("tag_categories")
      .select("id, name")
      .order("name");
    setTagCategories(data || []);
  };

  const fetchTags = async () => {
    const { data } = await supabase
      .from("tags")
      .select("id, name, category_id")
      .order("name");
    setTags(data || []);
  };

  const fetchAssets = async () => {
    if (!entityId) return;

    try {
      const { data: assetsData, error: assetsError } = await supabase
        .from("assets")
        .select(`
          id,
          name,
          cost_basis,
          asset_class_hard,
          entity_id,
          entities!inner(name)
        `)
        .eq("entity_id", entityId);

      if (assetsError) throw assetsError;
      if (!assetsData) return;

      const assetsWithValues: AssetWithValue[] = [];

      for (const asset of assetsData) {
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

        // Fetch tags for this asset
        const { data: assetTags } = await supabase
          .from("asset_tags")
          .select(`
            tag_id,
            tags!inner(
              id,
              name,
              category_id,
              tag_categories(name)
            )
          `)
          .eq("asset_id", asset.id);

        const tags = assetTags?.map(at => ({
          id: at.tags.id,
          name: at.tags.name,
          category_id: at.tags.category_id,
          category_name: at.tags.tag_categories?.name || ""
        })) || [];

        assetsWithValues.push({
          id: asset.id,
          name: asset.name,
          cost_basis: asset.cost_basis,
          current_value: currentValue,
          profit_loss: profitLoss,
          profit_loss_percent: profitLossPercent,
          asset_class_hard: asset.asset_class_hard,
          entity_name: asset.entities.name,
          tags
        });
      }

      setAssets(assetsWithValues);
    } catch (error) {
      console.error("Error fetching assets:", error);
      toast({
        title: "Error",
        description: "No se pudieron cargar los activos",
        variant: "destructive",
      });
    }
  };

  const applyFilters = () => {
    if (activeFilters.length === 0) {
      setFilteredAssets(assets);
      return;
    }

    const filtered = assets.filter((asset) => {
      if (selectedCategory === "asset_class") {
        return activeFilters.includes(asset.asset_class_hard);
      } else {
        // Filter by tag category
        return asset.tags.some(
          (tag) => tag.category_id === selectedCategory && activeFilters.includes(tag.id)
        );
      }
    });

    setFilteredAssets(filtered);
  };

  const getAvailableFilters = () => {
    if (selectedCategory === "asset_class") {
      // Native dimension: asset classes
      const assetClasses = Array.from(new Set(assets.map(a => a.asset_class_hard)));
      return assetClasses.map(ac => ({ id: ac, name: ac }));
    } else {
      // Tag category dimension
      return tags.filter(t => t.category_id === selectedCategory);
    }
  };

  const toggleFilter = (filterId: string) => {
    setActiveFilters(prev =>
      prev.includes(filterId)
        ? prev.filter(f => f !== filterId)
        : [...prev, filterId]
    );
  };

  const availableFilters = getAvailableFilters();
  const totalValue = filteredAssets.reduce((sum, a) => sum + a.current_value, 0);
  const totalCost = filteredAssets.reduce((sum, a) => sum + a.cost_basis, 0);
  const totalPL = totalValue - totalCost;

  const filterOptions = [
    { id: "asset_class", label: "Tipo de Activo" },
    ...tagCategories.map(cat => ({ id: cat.id, label: cat.name }))
  ];

  return (
    <AppLayout>
      <div className="container mx-auto p-6 space-y-6">
        {/* Header con selector de dimensión */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground">
              My Property
            </h1>
            <p className="text-muted-foreground mt-1">
              Gestiona tus activos
            </p>
          </div>

          <Select value={selectedCategory} onValueChange={(val) => {
            setSelectedCategory(val);
            setActiveFilters([]); // Reset filters cuando cambia dimensión
          }}>
            <SelectTrigger className="w-[200px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {filterOptions.map((option) => (
                <SelectItem key={option.id} value={option.id}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Barra de filtros horizontal (Nivel 2) */}
        <div className="flex flex-wrap gap-2 p-4 bg-muted/50 rounded-lg">
          <Button
            variant={activeFilters.length === 0 ? "default" : "outline"}
            size="sm"
            onClick={() => setActiveFilters([])}
          >
            Todos
          </Button>
          {availableFilters.map((filter) => (
            <Button
              key={filter.id}
              variant={activeFilters.includes(filter.id) ? "default" : "outline"}
              size="sm"
              onClick={() => toggleFilter(filter.id)}
            >
              {filter.name}
            </Button>
          ))}
        </div>

        {/* Métricas */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Valor Total
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                €{totalValue.toLocaleString('es-ES', { maximumFractionDigits: 0 })}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Inversión
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                €{totalCost.toLocaleString('es-ES', { maximumFractionDigits: 0 })}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                P/L Total
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className={cn(
                "text-2xl font-bold",
                totalPL >= 0 ? "text-green-600" : "text-red-600"
              )}>
                {totalPL > 0 ? "+" : ""}
                €{totalPL.toLocaleString('es-ES', { maximumFractionDigits: 0 })}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tabla de activos */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Activos</CardTitle>
            <Button onClick={() => setAddModalOpen(true)} size="sm">
              <Plus className="h-4 w-4 mr-2" />
              Añadir
            </Button>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nombre</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead className="text-right">Inversión</TableHead>
                    <TableHead className="text-right">Valor Actual</TableHead>
                    <TableHead className="text-right">P/L</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredAssets.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground">
                        No hay activos para mostrar
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredAssets.map((asset) => (
                      <TableRow key={asset.id}>
                        <TableCell className="font-medium">{asset.name}</TableCell>
                        <TableCell>{asset.asset_class_hard}</TableCell>
                        <TableCell className="text-right">
                          €{asset.cost_basis.toLocaleString('es-ES', { maximumFractionDigits: 0 })}
                        </TableCell>
                        <TableCell className="text-right">
                          €{asset.current_value.toLocaleString('es-ES', { maximumFractionDigits: 0 })}
                        </TableCell>
                        <TableCell
                          className={cn(
                            "text-right font-semibold",
                            asset.profit_loss >= 0
                              ? "text-green-600"
                              : "text-red-600"
                          )}
                        >
                          {asset.profit_loss > 0 ? "+" : ""}
                          €{asset.profit_loss.toLocaleString('es-ES', { maximumFractionDigits: 0 })}
                          {" "}
                          ({asset.profit_loss_percent > 0 ? "+" : ""}
                          {asset.profit_loss_percent.toFixed(1)}%)
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

      <AddAssetModal
        open={addModalOpen}
        onOpenChange={setAddModalOpen}
        entityId={entityId || ""}
        onSuccess={fetchAssets}
      />
    </AppLayout>
  );
}
