import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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

interface Entity {
  id: string;
  name: string;
  type_id: string | null;
}

interface EntityType {
  id: string;
  name: string;
}

interface EntityManagementModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entity?: Entity | null;
  onSuccess: () => void;
}

export function EntityManagementModal({
  open,
  onOpenChange,
  entity,
  onSuccess,
}: EntityManagementModalProps) {
  const [name, setName] = useState("");
  const [typeId, setTypeId] = useState("");
  const [entityTypes, setEntityTypes] = useState<EntityType[]>([]);
  const { toast } = useToast();

  useEffect(() => {
    fetchEntityTypes();
  }, []);

  useEffect(() => {
    if (entity) {
      setName(entity.name);
      setTypeId(entity.type_id || "");
    } else {
      setName("");
      setTypeId("");
    }
  }, [entity]);

  const fetchEntityTypes = async () => {
    const { data } = await supabase
      .from("entity_types")
      .select("*")
      .order("name");
    setEntityTypes(data || []);
  };

  const handleSave = async () => {
    if (!name.trim()) {
      toast({
        title: "Error",
        description: "El nombre es obligatorio",
        variant: "destructive",
      });
      return;
    }

    try {
      if (entity) {
        // Update existing entity
        const { error } = await supabase
          .from("entities")
          .update({
            name: name.trim(),
            type_id: typeId || null,
          })
          .eq("id", entity.id);

        if (error) throw error;
        toast({ title: "Entidad actualizada" });
      } else {
        // Create new entity
        const { error } = await supabase.from("entities").insert({
          name: name.trim(),
          type_id: typeId || null,
          tenant_id: "00000000-0000-0000-0000-000000000000", // TODO: use real tenant
        });

        if (error) throw error;
        toast({ title: "Entidad creada" });
      }

      onSuccess();
      onOpenChange(false);
    } catch (error) {
      console.error("Error saving entity:", error);
      toast({
        title: "Error",
        description: "No se pudo guardar la entidad",
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {entity ? "Editar Entidad" : "Nueva Entidad"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Nombre</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="ej: Mi Holding Principal"
            />
          </div>
          <div>
            <Label>Tipo</Label>
            <Select value={typeId} onValueChange={setTypeId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecciona un tipo" />
              </SelectTrigger>
              <SelectContent>
                {entityTypes.map((type) => (
                  <SelectItem key={type.id} value={type.id}>
                    {type.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSave}>
            {entity ? "Actualizar" : "Crear"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
