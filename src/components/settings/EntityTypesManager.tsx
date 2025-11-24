import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, Trash2, Edit } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

interface EntityType {
  id: string;
  name: string;
}

export function EntityTypesManager() {
  const [entityTypes, setEntityTypes] = useState<EntityType[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<EntityType | null>(null);
  const [newName, setNewName] = useState("");
  const { toast } = useToast();

  useEffect(() => {
    fetchEntityTypes();
  }, []);

  const fetchEntityTypes = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("entity_types")
      .select("*")
      .order("name");
    setEntityTypes(data || []);
    setLoading(false);
  };

  const handleCreate = async () => {
    if (!newName.trim()) return;

    const { error } = await supabase
      .from("entity_types")
      .insert({ name: newName.trim() });

    if (error) {
      toast({
        title: "Error",
        description: "No se pudo crear el tipo de entidad",
        variant: "destructive",
      });
      return;
    }

    toast({ title: "Tipo de entidad creado" });
    setNewName("");
    setDialogOpen(false);
    fetchEntityTypes();
  };

  const handleUpdate = async () => {
    if (!editing || !newName.trim()) return;

    const { error } = await supabase
      .from("entity_types")
      .update({ name: newName.trim() })
      .eq("id", editing.id);

    if (error) {
      toast({
        title: "Error",
        description: "No se pudo actualizar el tipo de entidad",
        variant: "destructive",
      });
      return;
    }

    toast({ title: "Tipo actualizado" });
    setEditing(null);
    setNewName("");
    setDialogOpen(false);
    fetchEntityTypes();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("¿Eliminar este tipo de entidad?")) return;

    const { error } = await supabase
      .from("entity_types")
      .delete()
      .eq("id", id);

    if (error) {
      toast({
        title: "Error",
        description: "No se pudo eliminar (puede estar en uso)",
        variant: "destructive",
      });
      return;
    }

    toast({ title: "Tipo eliminado" });
    fetchEntityTypes();
  };

  const openDialog = (entityType?: EntityType) => {
    if (entityType) {
      setEditing(entityType);
      setNewName(entityType.name);
    } else {
      setEditing(null);
      setNewName("");
    }
    setDialogOpen(true);
  };

  if (loading) {
    return <div className="text-muted-foreground">Cargando...</div>;
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Tipos de Entidad</CardTitle>
          <Button onClick={() => openDialog()} size="sm">
            <Plus className="h-4 w-4 mr-2" />
            Nuevo Tipo
          </Button>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {entityTypes.map((type) => (
              <div
                key={type.id}
                className="flex items-center justify-between p-3 border rounded-lg"
              >
                <span className="font-medium">{type.name}</span>
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => openDialog(type)}
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDelete(type.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editing ? "Editar Tipo de Entidad" : "Nuevo Tipo de Entidad"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Nombre</Label>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="ej: Holding, LLC, Trust"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={editing ? handleUpdate : handleCreate}>
              {editing ? "Actualizar" : "Crear"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
