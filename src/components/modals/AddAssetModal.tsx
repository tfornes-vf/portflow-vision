import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

interface TagCategory {
  id: string;
  name: string;
  is_mandatory: boolean;
}

interface Tag {
  id: string;
  name: string;
  category_id: string;
}

interface Asset {
  id: string;
  name: string;
}

interface AddAssetModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entityId: string;
  onSuccess: () => void;
}

export function AddAssetModal({
  open,
  onOpenChange,
  entityId,
  onSuccess,
}: AddAssetModalProps) {
  const [activeTab, setActiveTab] = useState("position");
  const [tagCategories, setTagCategories] = useState<TagCategory[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  
  // Nueva Posición fields
  const [name, setName] = useState("");
  const [ticker, setTicker] = useState("");
  const [quantity, setQuantity] = useState("");
  const [costBasis, setCostBasis] = useState("");
  const [currentValue, setCurrentValue] = useState("");
  const [assetClass, setAssetClass] = useState("");
  const [selectedTags, setSelectedTags] = useState<Record<string, string>>({});

  // Transacción fields
  const [selectedAssetId, setSelectedAssetId] = useState("");
  const [transactionType, setTransactionType] = useState<"buy" | "sell">("buy");
  const [txQuantity, setTxQuantity] = useState("");
  const [txPrice, setTxPrice] = useState("");
  const [txDate, setTxDate] = useState(new Date().toISOString().split("T")[0]);

  const { toast } = useToast();

  useEffect(() => {
    if (open) {
      fetchTagCategories();
      fetchTags();
      fetchAssets();
    }
  }, [open, entityId]);

  const fetchTagCategories = async () => {
    const { data } = await supabase
      .from("tag_categories")
      .select("*")
      .order("name");
    setTagCategories(data || []);
  };

  const fetchTags = async () => {
    const { data } = await supabase.from("tags").select("*").order("name");
    setTags(data || []);
  };

  const fetchAssets = async () => {
    const { data } = await supabase
      .from("assets")
      .select("id, name")
      .eq("entity_id", entityId)
      .order("name");
    setAssets(data || []);
  };

  const resetForm = () => {
    setName("");
    setTicker("");
    setQuantity("");
    setCostBasis("");
    setCurrentValue("");
    setAssetClass("");
    setSelectedTags({});
    setSelectedAssetId("");
    setTxQuantity("");
    setTxPrice("");
    setTxDate(new Date().toISOString().split("T")[0]);
  };

  const validateMandatoryTags = () => {
    const mandatoryCategories = tagCategories.filter((c) => c.is_mandatory);
    for (const category of mandatoryCategories) {
      if (!selectedTags[category.id]) {
        toast({
          title: "Error",
          description: `Debe seleccionar un tag para la categoría "${category.name}"`,
          variant: "destructive",
        });
        return false;
      }
    }
    return true;
  };

  const handleCreatePosition = async () => {
    if (!name.trim() || !costBasis || !currentValue || !assetClass) {
      toast({
        title: "Error",
        description: "Complete todos los campos obligatorios",
        variant: "destructive",
      });
      return;
    }

    if (!validateMandatoryTags()) return;

    try {
      // Create asset
      const { data: asset, error: assetError } = await supabase
        .from("assets")
        .insert({
          name: name.trim(),
          entity_id: entityId,
          asset_class_hard: assetClass,
          cost_basis: parseFloat(costBasis),
        })
        .select()
        .single();

      if (assetError) throw assetError;

      // Create market value
      const { error: valueError } = await supabase.from("market_values").insert({
        asset_id: asset.id,
        value_base: parseFloat(currentValue),
        value_local: parseFloat(currentValue),
        valuation_date: new Date().toISOString().split("T")[0],
      });

      if (valueError) throw valueError;

      // Create asset tags
      const tagInserts = Object.values(selectedTags).map((tagId) => ({
        asset_id: asset.id,
        tag_id: tagId,
      }));

      if (tagInserts.length > 0) {
        const { error: tagsError } = await supabase
          .from("asset_tags")
          .insert(tagInserts);
        if (tagsError) throw tagsError;
      }

      toast({ title: "Posición creada correctamente" });
      resetForm();
      onSuccess();
      onOpenChange(false);
    } catch (error) {
      console.error("Error creating position:", error);
      toast({
        title: "Error",
        description: "No se pudo crear la posición",
        variant: "destructive",
      });
    }
  };

  const handleCreateTransaction = async () => {
    if (!selectedAssetId || !txQuantity || !txPrice) {
      toast({
        title: "Error",
        description: "Complete todos los campos obligatorios",
        variant: "destructive",
      });
      return;
    }

    try {
      // Create transaction record
      const { error: txError } = await supabase.from("transactions").insert({
        asset_id: selectedAssetId,
        transaction_type: transactionType,
        quantity: parseFloat(txQuantity),
        price: parseFloat(txPrice),
        transaction_date: txDate,
      });

      if (txError) throw txError;

      // Fetch current asset data
      const { data: asset } = await supabase
        .from("assets")
        .select("cost_basis")
        .eq("id", selectedAssetId)
        .single();

      if (!asset) throw new Error("Asset not found");

      // Calculate new values based on transaction type
      let newCostBasis = asset.cost_basis;
      const transactionValue = parseFloat(txQuantity) * parseFloat(txPrice);

      if (transactionType === "buy") {
        // Weighted average for buys
        newCostBasis = asset.cost_basis + transactionValue;
      } else {
        // For sells, reduce cost basis proportionally
        newCostBasis = asset.cost_basis - transactionValue;
      }

      // Update asset cost basis
      const { error: updateError } = await supabase
        .from("assets")
        .update({ cost_basis: newCostBasis })
        .eq("id", selectedAssetId);

      if (updateError) throw updateError;

      // Check if position should be closed
      if (transactionType === "sell" && newCostBasis <= 0) {
        const shouldClose = confirm(
          "La cantidad resultante es cero o negativa. ¿Desea cerrar esta posición?"
        );
        if (shouldClose) {
          await supabase.from("assets").delete().eq("id", selectedAssetId);
          toast({ title: "Posición cerrada" });
        }
      } else {
        toast({ title: "Transacción registrada" });
      }

      resetForm();
      onSuccess();
      onOpenChange(false);
    } catch (error) {
      console.error("Error creating transaction:", error);
      toast({
        title: "Error",
        description: "No se pudo registrar la transacción",
        variant: "destructive",
      });
    }
  };

  const getTagsByCategory = (categoryId: string) => {
    return tags.filter((t) => t.category_id === categoryId);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Añadir</DialogTitle>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="position">Nueva Posición</TabsTrigger>
            <TabsTrigger value="transaction">Añadir Transacción</TabsTrigger>
          </TabsList>

          <TabsContent value="position" className="space-y-4 mt-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Nombre *</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="ej: Apple Inc."
                />
              </div>
              <div>
                <Label>Ticker (opcional)</Label>
                <Input
                  value={ticker}
                  onChange={(e) => setTicker(e.target.value)}
                  placeholder="ej: AAPL"
                />
              </div>
            </div>

            <div>
              <Label>Tipo de Activo *</Label>
              <Select value={assetClass} onValueChange={setAssetClass}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccione tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Stocks">Stocks</SelectItem>
                  <SelectItem value="Bonds">Bonds</SelectItem>
                  <SelectItem value="Real Estate">Real Estate</SelectItem>
                  <SelectItem value="Cash">Cash</SelectItem>
                  <SelectItem value="Private Equity">Private Equity</SelectItem>
                  <SelectItem value="Crypto">Crypto</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label>Cantidad</Label>
                <Input
                  type="number"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  placeholder="0"
                />
              </div>
              <div>
                <Label>Precio de Compra *</Label>
                <Input
                  type="number"
                  value={costBasis}
                  onChange={(e) => setCostBasis(e.target.value)}
                  placeholder="0.00"
                />
              </div>
              <div>
                <Label>Valor Actual *</Label>
                <Input
                  type="number"
                  value={currentValue}
                  onChange={(e) => setCurrentValue(e.target.value)}
                  placeholder="0.00"
                />
              </div>
            </div>

            <div className="space-y-3 border-t pt-4">
              <h3 className="font-medium">Tags</h3>
              {tagCategories.map((category) => (
                <div key={category.id}>
                  <Label>
                    {category.name}
                    {category.is_mandatory && (
                      <span className="text-destructive ml-1">*</span>
                    )}
                  </Label>
                  <Select
                    value={selectedTags[category.id] || ""}
                    onValueChange={(value) =>
                      setSelectedTags({ ...selectedTags, [category.id]: value })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccione..." />
                    </SelectTrigger>
                    <SelectContent>
                      {getTagsByCategory(category.id).map((tag) => (
                        <SelectItem key={tag.id} value={tag.id}>
                          {tag.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button onClick={handleCreatePosition}>Crear Posición</Button>
            </div>
          </TabsContent>

          <TabsContent value="transaction" className="space-y-4 mt-4">
            <div>
              <Label>Activo *</Label>
              <Select value={selectedAssetId} onValueChange={setSelectedAssetId}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccione un activo" />
                </SelectTrigger>
                <SelectContent>
                  {assets.map((asset) => (
                    <SelectItem key={asset.id} value={asset.id}>
                      {asset.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Tipo de Transacción *</Label>
              <Select
                value={transactionType}
                onValueChange={(value: "buy" | "sell") =>
                  setTransactionType(value)
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="buy">Compra</SelectItem>
                  <SelectItem value="sell">Venta</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label>Cantidad *</Label>
                <Input
                  type="number"
                  value={txQuantity}
                  onChange={(e) => setTxQuantity(e.target.value)}
                  placeholder="0"
                />
              </div>
              <div>
                <Label>Precio *</Label>
                <Input
                  type="number"
                  value={txPrice}
                  onChange={(e) => setTxPrice(e.target.value)}
                  placeholder="0.00"
                />
              </div>
              <div>
                <Label>Fecha *</Label>
                <Input
                  type="date"
                  value={txDate}
                  onChange={(e) => setTxDate(e.target.value)}
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button onClick={handleCreateTransaction}>
                Registrar Transacción
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
