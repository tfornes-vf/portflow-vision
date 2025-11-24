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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface TagCategory {
  id: string;
  name: string;
}

interface Tag {
  id: string;
  name: string;
  color_hex: string;
  category_id: string;
  tag_categories: { name: string } | null;
}

export function TagsManager() {
  const [categories, setCategories] = useState<TagCategory[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [tagDialogOpen, setTagDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<TagCategory | null>(null);
  const [editingTag, setEditingTag] = useState<Tag | null>(null);
  const { toast } = useToast();

  const [newCategoryName, setNewCategoryName] = useState("");
  const [newTagName, setNewTagName] = useState("");
  const [newTagColor, setNewTagColor] = useState("#3B82F6");
  const [newTagCategoryId, setNewTagCategoryId] = useState("");

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    
    const { data: categoriesData } = await supabase
      .from("tag_categories")
      .select("*")
      .order("name");
    
    const { data: tagsData } = await supabase
      .from("tags")
      .select("*, tag_categories(name)")
      .order("name");

    setCategories(categoriesData || []);
    setTags(tagsData || []);
    setLoading(false);
  };

  const handleCreateCategory = async () => {
    if (!newCategoryName.trim()) return;

    const { error } = await supabase
      .from("tag_categories")
      .insert({ name: newCategoryName.trim() });

    if (error) {
      toast({
        title: "Error",
        description: "No se pudo crear la categoría",
        variant: "destructive",
      });
      return;
    }

    toast({ title: "Categoría creada correctamente" });
    setNewCategoryName("");
    setCategoryDialogOpen(false);
    fetchData();
  };

  const handleUpdateCategory = async () => {
    if (!editingCategory || !newCategoryName.trim()) return;

    const { error } = await supabase
      .from("tag_categories")
      .update({ name: newCategoryName.trim() })
      .eq("id", editingCategory.id);

    if (error) {
      toast({
        title: "Error",
        description: "No se pudo actualizar la categoría",
        variant: "destructive",
      });
      return;
    }

    toast({ title: "Categoría actualizada" });
    setEditingCategory(null);
    setNewCategoryName("");
    setCategoryDialogOpen(false);
    fetchData();
  };

  const handleDeleteCategory = async (id: string) => {
    if (!confirm("¿Eliminar esta categoría y todos sus tags?")) return;

    const { error } = await supabase
      .from("tag_categories")
      .delete()
      .eq("id", id);

    if (error) {
      toast({
        title: "Error",
        description: "No se pudo eliminar la categoría",
        variant: "destructive",
      });
      return;
    }

    toast({ title: "Categoría eliminada" });
    fetchData();
  };

  const handleCreateTag = async () => {
    if (!newTagName.trim() || !newTagCategoryId) return;

    const { error } = await supabase
      .from("tags")
      .insert({
        name: newTagName.trim(),
        color_hex: newTagColor,
        category_id: newTagCategoryId,
        tenant_id: "00000000-0000-0000-0000-000000000000", // TODO: usar tenant real
      });

    if (error) {
      toast({
        title: "Error",
        description: "No se pudo crear el tag",
        variant: "destructive",
      });
      return;
    }

    toast({ title: "Tag creado correctamente" });
    resetTagForm();
    setTagDialogOpen(false);
    fetchData();
  };

  const handleUpdateTag = async () => {
    if (!editingTag || !newTagName.trim()) return;

    const { error } = await supabase
      .from("tags")
      .update({
        name: newTagName.trim(),
        color_hex: newTagColor,
        category_id: newTagCategoryId,
      })
      .eq("id", editingTag.id);

    if (error) {
      toast({
        title: "Error",
        description: "No se pudo actualizar el tag",
        variant: "destructive",
      });
      return;
    }

    toast({ title: "Tag actualizado" });
    resetTagForm();
    setTagDialogOpen(false);
    fetchData();
  };

  const handleDeleteTag = async (id: string) => {
    if (!confirm("¿Eliminar este tag?")) return;

    const { error } = await supabase.from("tags").delete().eq("id", id);

    if (error) {
      toast({
        title: "Error",
        description: "No se pudo eliminar el tag",
        variant: "destructive",
      });
      return;
    }

    toast({ title: "Tag eliminado" });
    fetchData();
  };

  const resetTagForm = () => {
    setNewTagName("");
    setNewTagColor("#3B82F6");
    setNewTagCategoryId("");
    setEditingTag(null);
  };

  const openCategoryDialog = (category?: TagCategory) => {
    if (category) {
      setEditingCategory(category);
      setNewCategoryName(category.name);
    } else {
      setEditingCategory(null);
      setNewCategoryName("");
    }
    setCategoryDialogOpen(true);
  };

  const openTagDialog = (tag?: Tag) => {
    if (tag) {
      setEditingTag(tag);
      setNewTagName(tag.name);
      setNewTagColor(tag.color_hex);
      setNewTagCategoryId(tag.category_id);
    } else {
      resetTagForm();
    }
    setTagDialogOpen(true);
  };

  if (loading) {
    return <div className="text-muted-foreground">Cargando...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Categorías */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Categorías de Tags</CardTitle>
          <Button onClick={() => openCategoryDialog()} size="sm">
            <Plus className="h-4 w-4 mr-2" />
            Nueva Categoría
          </Button>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {categories.map((cat) => (
              <div
                key={cat.id}
                className="flex items-center justify-between p-3 border rounded-lg"
              >
                <span className="font-medium">{cat.name}</span>
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => openCategoryDialog(cat)}
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDeleteCategory(cat.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Tags */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Tags</CardTitle>
          <Button onClick={() => openTagDialog()} size="sm">
            <Plus className="h-4 w-4 mr-2" />
            Nuevo Tag
          </Button>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {tags.map((tag) => (
              <div
                key={tag.id}
                className="flex items-center justify-between p-3 border rounded-lg"
              >
                <div className="flex items-center gap-3">
                  <div
                    className="w-4 h-4 rounded"
                    style={{ backgroundColor: tag.color_hex }}
                  />
                  <span className="font-medium">{tag.name}</span>
                  <span className="text-sm text-muted-foreground">
                    ({tag.tag_categories?.name || "Sin categoría"})
                  </span>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => openTagDialog(tag)}
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDeleteTag(tag.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Dialog para categorías */}
      <Dialog open={categoryDialogOpen} onOpenChange={setCategoryDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingCategory ? "Editar Categoría" : "Nueva Categoría"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Nombre</Label>
              <Input
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                placeholder="ej: Banco, País, Sector"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCategoryDialogOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              onClick={editingCategory ? handleUpdateCategory : handleCreateCategory}
            >
              {editingCategory ? "Actualizar" : "Crear"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog para tags */}
      <Dialog open={tagDialogOpen} onOpenChange={setTagDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingTag ? "Editar Tag" : "Nuevo Tag"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Nombre</Label>
              <Input
                value={newTagName}
                onChange={(e) => setNewTagName(e.target.value)}
                placeholder="ej: Santander, España"
              />
            </div>
            <div>
              <Label>Categoría</Label>
              <Select value={newTagCategoryId} onValueChange={setNewTagCategoryId}>
                <SelectTrigger>
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
              <Label>Color</Label>
              <div className="flex gap-2">
                <Input
                  type="color"
                  value={newTagColor}
                  onChange={(e) => setNewTagColor(e.target.value)}
                  className="w-20"
                />
                <Input
                  value={newTagColor}
                  onChange={(e) => setNewTagColor(e.target.value)}
                  placeholder="#3B82F6"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTagDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={editingTag ? handleUpdateTag : handleCreateTag}>
              {editingTag ? "Actualizar" : "Crear"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
