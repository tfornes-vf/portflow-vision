import { Home, Map, Building2, User, Settings, Plus, MoreVertical, Edit2, Settings as SettingsIcon } from "lucide-react";
import { NavLink } from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { EntityManagementModal } from "@/components/modals/EntityManagementModal";
import { EntitySettingsDialog } from "@/components/modals/EntitySettingsDialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

interface Entity {
  id: string;
  name: string;
  type_id: string | null;
}

export function AppSidebar() {
  const { state } = useSidebar();
  const [entities, setEntities] = useState<Entity[]>([]);
  const [entityModalOpen, setEntityModalOpen] = useState(false);
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [settingsDialogOpen, setSettingsDialogOpen] = useState(false);
  const [selectedEntity, setSelectedEntity] = useState<Entity | null>(null);
  const [newName, setNewName] = useState("");

  useEffect(() => {
    fetchEntities();
  }, []);

  const fetchEntities = async () => {
    try {
      const { data, error } = await supabase
        .from("entities")
        .select("id, name, type_id")
        .order("name", { ascending: true });

      if (error) {
        console.error("Error fetching entities:", error);
        return;
      }
      
      setEntities(data || []);
    } catch (error) {
      console.error("Error fetching entities:", error);
    }
  };

  const handleRename = (entity: Entity) => {
    setSelectedEntity(entity);
    setNewName(entity.name);
    setRenameDialogOpen(true);
  };

  const handleSettings = (entity: Entity) => {
    setSelectedEntity(entity);
    setSettingsDialogOpen(true);
  };

  const saveRename = async () => {
    if (!selectedEntity || !newName.trim()) return;

    try {
      const { error } = await supabase
        .from("entities")
        .update({ name: newName.trim() })
        .eq("id", selectedEntity.id);

      if (error) throw error;

      toast({ title: "Nombre actualizado correctamente" });
      setRenameDialogOpen(false);
      fetchEntities();
    } catch (error) {
      console.error("Error renaming entity:", error);
      toast({
        title: "Error",
        description: "No se pudo actualizar el nombre",
        variant: "destructive",
      });
    }
  };

  const dashboardItems = [
    { title: "Daily", url: "/", icon: Home },
    { title: "Maptree", url: "/maptree", icon: Map },
  ];

  const isCollapsed = state === "collapsed";

  return (
    <Sidebar className={isCollapsed ? "w-14" : "w-64"}>
      <SidebarHeader className="border-b border-sidebar-border p-4">
        {!isCollapsed && (
          <h1 className="text-xl font-bold text-sidebar-foreground">
            Alphafolio
          </h1>
        )}
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Dashboard</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {dashboardItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={item.url}
                      end
                      className="hover:bg-sidebar-accent"
                    >
                      <item.icon className="h-4 w-4" />
                      {!isCollapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <div className="flex items-center justify-between px-2">
            <SidebarGroupLabel>My Property</SidebarGroupLabel>
            {!isCollapsed && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0"
                onClick={() => setEntityModalOpen(true)}
              >
                <Plus className="h-4 w-4" />
              </Button>
            )}
          </div>
          <SidebarGroupContent>
            <SidebarMenu>
              {entities.map((entity) => (
                <SidebarMenuItem key={entity.id}>
                  <div className="group flex items-center w-full">
                    <SidebarMenuButton asChild className="flex-1">
                      <NavLink
                        to={`/properties/${entity.id}`}
                        className="hover:bg-sidebar-accent"
                      >
                        <Building2 className="h-4 w-4" />
                        {!isCollapsed && <span>{entity.name}</span>}
                      </NavLink>
                    </SidebarMenuButton>
                    {!isCollapsed && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <MoreVertical className="h-3 w-3" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleRename(entity)}>
                            <Edit2 className="h-3 w-3 mr-2" />
                            Cambiar nombre
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleSettings(entity)}>
                            <SettingsIcon className="h-3 w-3 mr-2" />
                            Configuración
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Configuración</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <NavLink
                    to="/settings"
                    className="hover:bg-sidebar-accent"
                  >
                    <Settings className="h-4 w-4" />
                    {!isCollapsed && <span>Configuración</span>}
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border p-4">
        <div className="flex items-center gap-2">
          <Avatar className="h-8 w-8">
            <AvatarFallback className="bg-sidebar-primary text-sidebar-primary-foreground">
              <User className="h-4 w-4" />
            </AvatarFallback>
          </Avatar>
          {!isCollapsed && (
            <div className="flex flex-col">
              <span className="text-sm font-medium text-sidebar-foreground">
                Usuario
              </span>
            </div>
          )}
        </div>
      </SidebarFooter>

      <EntityManagementModal
        open={entityModalOpen}
        onOpenChange={setEntityModalOpen}
        onSuccess={fetchEntities}
      />

      <Dialog open={renameDialogOpen} onOpenChange={setRenameDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cambiar nombre</DialogTitle>
            <DialogDescription>
              Ingresa el nuevo nombre para {selectedEntity?.name}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="new-name">Nuevo nombre</Label>
            <Input
              id="new-name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Nombre de la entidad"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={saveRename}>Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {selectedEntity && (
        <EntitySettingsDialog
          entityId={selectedEntity.id}
          entityName={selectedEntity.name}
          entityTypeId={selectedEntity.type_id}
          open={settingsDialogOpen}
          onOpenChange={setSettingsDialogOpen}
          onSuccess={fetchEntities}
        />
      )}
    </Sidebar>
  );
}
