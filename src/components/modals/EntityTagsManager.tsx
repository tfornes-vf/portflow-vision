import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
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
import { toast } from "@/hooks/use-toast";
import { Trash2, Edit2, Plus } from "lucide-react";

interface Tag {
  id: string;
  name: string;
  color_hex: string | null;
  category_id: string | null;
  category_name?: string;
}

interface TagCategory {
  id: string;
  name: string;
}

interface EntityTagsManagerProps {
  entityId: string;
  entityName: string;
}

export function EntityTagsManager({ entityId, entityName }: EntityTagsManagerProps) {
  const [tags, setTags] = useState<Tag[]>([]);
  const [categories, setCategories] = useState<TagCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingTag, setEditingTag] = useState<Tag | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    color_hex: "#3B82F6",
    category_id: "",
  });

  useEffect(() => {
    fetchData();
  }, [entityId]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [tagsRes, categoriesRes] = await Promise.all([
        supabase
          .from("tags")
          .select(`
            id,
            name,
            color_hex,
            category_id,
            tag_categories(name)
          `)
          .eq("entity_id", entityId)
          .order("name"),
        supabase.from("tag_categories").select("id, name").order("name"),
      ]);

      if (tagsRes.error) throw tagsRes.error;
      if (categoriesRes.error) throw categoriesRes.error;

      const tagsWithCategory = tagsRes.data?.map((tag: any) => ({
        ...tag,
        category_name: tag.tag_categories?.name,
      }));

      setTags(tagsWithCategory || []);
      setCategories(categoriesRes.data || []);
    } catch (error) {
      console.error("Error fetching data:", error);
      toast({
        title: "Error",
        description: "No se pudieron cargar los tags",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({ name: "", color_hex: "#3B82F6", category_id: "" });
    setEditingTag(null);
    setIsCreating(false);
  };

  const handleSave = async () => {
    if (!formData.name.trim() || !formData.category_id) {
      toast({
        title: "Error",
        description: "Completa todos los campos obligatorios",
        variant: "destructive",
      });
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuario no autenticado");

      const { data: tenantData } = await supabase
        .from("entities")
        .select("tenant_id")
        .eq("id", entityId)
        .single();

      if (!tenantData) throw new Error("No se pudo obtener el tenant");

      if (editingTag) {
        const { error } = await supabase
          .from("tags")
          .update({
            name: formData.name,
            color_hex: formData.color_hex,
            category_id: formData.category_id,
          })
          .eq("id", editingTag.id);

        if (error) throw error;
        toast({ title: "Tag actualizado correctamente" });
      } else {
        const { error } = await supabase.from("tags").insert({
          name: formData.name,
          color_hex: formData.color_hex,
          category_id: formData.category_id,
          entity_id: entityId,
          tenant_id: tenantData.tenant_id,
        });

        if (error) throw error;
        toast({ title: "Tag creado correctamente" });
      }

      resetForm();
      fetchData();
    } catch (error) {
      console.error("Error saving tag:", error);
      toast({
        title: "Error",
        description: "No se pudo guardar el tag",
        variant: "destructive",
      });
    }
  };

  const handleEdit = (tag: Tag) => {
    setEditingTag(tag);
    setFormData({
      name: tag.name,
      color_hex: tag.color_hex || "#3B82F6",
      category_id: tag.category_id || "",
    });
    setIsCreating(true);
  };

  const handleDelete = async (tagId: string) => {
    if (!confirm("¿Estás seguro de eliminar este tag?")) return;

    try {
      const { error } = await supabase.from("tags").delete().eq("id", tagId);
      if (error) throw error;

      toast({ title: "Tag eliminado correctamente" });
      fetchData();
    } catch (error) {
      console.error("Error deleting tag:", error);
      toast({
        title: "Error",
        description: "No se pudo eliminar el tag",
        variant: "destructive",
      });
    }
  };

  if (loading) {
    return <div className="text-sm text-muted-foreground">Cargando tags...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">Tags Personalizados de {entityName}</h3>
        <Button
          onClick={() => setIsCreating(true)}
          size="sm"
          variant="outline"
          className="h-7"
        >
          <Plus className="h-3 w-3 mr-1" />
          Nuevo Tag
        </Button>
      </div>

      {isCreating && (
        <div className="border rounded-lg p-4 space-y-3 bg-muted/30">
          <h4 className="text-sm font-medium">
            {editingTag ? "Editar Tag" : "Crear Nuevo Tag"}
          </h4>
          <div className="space-y-2">
            <div>
              <Label htmlFor="tag-name">Nombre *</Label>
              <Input
                id="tag-name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Ej: Proyecto X"
              />
            </div>
            <div>
              <Label htmlFor="tag-category">Categoría *</Label>
              <Select
                value={formData.category_id}
                onValueChange={(value) =>
                  setFormData({ ...formData, category_id: value })
                }
              >
                <SelectTrigger id="tag-category">
                  <SelectValue placeholder="Selecciona una categoría" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id}>
                      {cat.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="tag-color">Color</Label>
              <div className="flex gap-2">
                <Input
                  id="tag-color"
                  type="color"
                  value={formData.color_hex}
                  onChange={(e) =>
                    setFormData({ ...formData, color_hex: e.target.value })
                  }
                  className="w-20 h-9"
                />
                <Input
                  value={formData.color_hex}
                  onChange={(e) =>
                    setFormData({ ...formData, color_hex: e.target.value })
                  }
                  className="flex-1"
                />
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <Button onClick={handleSave} size="sm">
              {editingTag ? "Actualizar" : "Crear"}
            </Button>
            <Button onClick={resetForm} size="sm" variant="outline">
              Cancelar
            </Button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {tags.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No hay tags personalizados. Crea uno para empezar.
          </p>
        ) : (
          tags.map((tag) => (
            <div
              key={tag.id}
              className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50"
            >
              <div className="flex items-center gap-3">
                <div
                  className="w-4 h-4 rounded"
                  style={{ backgroundColor: tag.color_hex || "#3B82F6" }}
                />
                <div>
                  <p className="text-sm font-medium">{tag.name}</p>
                  <p className="text-xs text-muted-foreground">{tag.category_name}</p>
                </div>
              </div>
              <div className="flex gap-1">
                <Button
                  onClick={() => handleEdit(tag)}
                  size="sm"
                  variant="ghost"
                  className="h-7 w-7 p-0"
                >
                  <Edit2 className="h-3 w-3" />
                </Button>
                <Button
                  onClick={() => handleDelete(tag.id)}
                  size="sm"
                  variant="ghost"
                  className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
