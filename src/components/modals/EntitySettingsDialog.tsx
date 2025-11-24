import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/hooks/use-toast";
import { EntityTagsManager } from "./EntityTagsManager";

interface EntityType {
  id: string;
  name: string;
}

interface EntitySettingsDialogProps {
  entityId: string;
  entityName: string;
  entityTypeId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function EntitySettingsDialog({
  entityId,
  entityName,
  entityTypeId,
  open,
  onOpenChange,
  onSuccess,
}: EntitySettingsDialogProps) {
  const [name, setName] = useState(entityName);
  const [typeId, setTypeId] = useState(entityTypeId || "");
  const [entityTypes, setEntityTypes] = useState<EntityType[]>([]);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  useEffect(() => {
    if (open) {
      setName(entityName);
      setTypeId(entityTypeId || "");
      fetchEntityTypes();
    }
  }, [open, entityName, entityTypeId]);

  const fetchEntityTypes = async () => {
    try {
      const { data, error } = await supabase
        .from("entity_types")
        .select("id, name")
        .order("name");

      if (error) throw error;
      setEntityTypes(data || []);
    } catch (error) {
      console.error("Error fetching entity types:", error);
    }
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
      const { error } = await supabase
        .from("entities")
        .update({
          name: name.trim(),
          type_id: typeId || null,
        })
        .eq("id", entityId);

      if (error) throw error;

      toast({ title: "Entidad actualizada correctamente" });
      onSuccess();
      onOpenChange(false);
    } catch (error) {
      console.error("Error updating entity:", error);
      toast({
        title: "Error",
        description: "No se pudo actualizar la entidad",
        variant: "destructive",
      });
    }
  };

  const handleDelete = async () => {
    try {
      // Delete related assets first (cascade)
      const { error: assetsError } = await supabase
        .from("assets")
        .delete()
        .eq("entity_id", entityId);

      if (assetsError) throw assetsError;

      // Delete related local tags
      const { error: tagsError } = await supabase
        .from("tags")
        .delete()
        .eq("entity_id", entityId);

      if (tagsError) throw tagsError;

      // Delete entity
      const { error } = await supabase
        .from("entities")
        .delete()
        .eq("id", entityId);

      if (error) throw error;

      toast({ title: "Entidad eliminada correctamente" });
      onSuccess();
      onOpenChange(false);
      setShowDeleteDialog(false);
    } catch (error) {
      console.error("Error deleting entity:", error);
      toast({
        title: "Error",
        description: "No se pudo eliminar la entidad",
        variant: "destructive",
      });
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Configuración de {entityName}</DialogTitle>
            <DialogDescription>
              Gestiona la información y tags personalizados de esta entidad
            </DialogDescription>
          </DialogHeader>

          <Tabs defaultValue="general" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="general">General</TabsTrigger>
              <TabsTrigger value="tags">Tags Locales</TabsTrigger>
            </TabsList>

            <TabsContent value="general" className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label htmlFor="entity-name">Nombre *</Label>
                <Input
                  id="entity-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Nombre de la entidad"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="entity-type">Tipo</Label>
                <Select value={typeId} onValueChange={setTypeId}>
                  <SelectTrigger id="entity-type">
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

              <div className="flex gap-2 pt-4">
                <Button onClick={handleSave}>Guardar Cambios</Button>
                <Button variant="outline" onClick={() => onOpenChange(false)}>
                  Cancelar
                </Button>
              </div>

              <div className="pt-6 border-t">
                <h3 className="text-sm font-medium text-destructive mb-2">
                  Zona de Peligro
                </h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Eliminar esta entidad borrará todos sus activos y tags personalizados.
                  Esta acción no se puede deshacer.
                </p>
                <Button
                  variant="destructive"
                  onClick={() => setShowDeleteDialog(true)}
                >
                  Eliminar Entidad
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="tags" className="mt-4">
              <EntityTagsManager entityId={entityId} entityName={entityName} />
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Estás seguro?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción eliminará permanentemente la entidad "{entityName}" y todos sus
              activos y tags personalizados asociados. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
