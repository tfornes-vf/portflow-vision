import { Home, Building2, User, Settings, Plus, MoreVertical, Edit2, Settings as SettingsIcon, LineChart, Shield, LogOut, Camera, Palette } from "lucide-react";
import { NavLink, useNavigate } from "react-router-dom";
import { useEffect, useState, useRef } from "react";
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
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface Entity {
  id: string;
  name: string;
  type_id: string | null;
}

// Available avatar colors
const AVATAR_COLORS = [
  { name: "Rojo", value: "bg-red-500" },
  { name: "Rosa", value: "bg-pink-500" },
  { name: "Púrpura", value: "bg-purple-500" },
  { name: "Índigo", value: "bg-indigo-500" },
  { name: "Azul", value: "bg-blue-500" },
  { name: "Cian", value: "bg-cyan-500" },
  { name: "Verde", value: "bg-teal-500" },
  { name: "Lima", value: "bg-green-500" },
  { name: "Amarillo", value: "bg-yellow-500" },
  { name: "Naranja", value: "bg-orange-500" },
  { name: "Gris", value: "bg-gray-500" },
  { name: "Slate", value: "bg-slate-600" },
];

// Gmail-style avatar colors based on first letter
const getDefaultAvatarColor = (name: string): string => {
  const colors = AVATAR_COLORS.map(c => c.value);
  const charCode = (name || "U").toUpperCase().charCodeAt(0);
  return colors[charCode % colors.length];
};

const getInitial = (name: string): string => {
  return (name || "U").charAt(0).toUpperCase();
};

export function AppSidebar() {
  const { state } = useSidebar();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [entities, setEntities] = useState<Entity[]>([]);
  const [entityModalOpen, setEntityModalOpen] = useState(false);
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [settingsDialogOpen, setSettingsDialogOpen] = useState(false);
  const [selectedEntity, setSelectedEntity] = useState<Entity | null>(null);
  const [newName, setNewName] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [userName, setUserName] = useState("");
  const [userId, setUserId] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarColor, setAvatarColor] = useState<string | null>(null);
  
  // Profile edit state
  const [profileDialogOpen, setProfileDialogOpen] = useState(false);
  const [editingName, setEditingName] = useState("");
  const [editingColor, setEditingColor] = useState("");
  const [previewAvatarUrl, setPreviewAvatarUrl] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);

  useEffect(() => {
    fetchEntities();
    checkAdminStatus();
  }, []);

  const checkAdminStatus = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      setUserId(user.id);

      // Fetch user profile
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name, avatar_url, avatar_color")
        .eq("user_id", user.id)
        .single();

      if (profile) {
        setUserName(profile.full_name || user.email?.split("@")[0] || "Usuario");
        setAvatarUrl(profile.avatar_url);
        setAvatarColor(profile.avatar_color);
      } else {
        setUserName(user.email?.split("@")[0] || "Usuario");
      }

      const { data: roleData } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .eq("role", "admin")
        .single();

      setIsAdmin(!!roleData);
    } catch (error) {
      console.error("Error checking admin status:", error);
    }
  };

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

  const openProfileDialog = () => {
    setEditingName(userName);
    setEditingColor(avatarColor || getDefaultAvatarColor(userName));
    setPreviewAvatarUrl(avatarUrl);
    setProfileDialogOpen(true);
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !userId) return;

    // Validate file type
    if (!file.type.startsWith("image/")) {
      toast({
        title: "Error",
        description: "Solo se permiten archivos de imagen",
        variant: "destructive",
      });
      return;
    }

    // Validate file size (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
      toast({
        title: "Error",
        description: "La imagen no puede superar 2MB",
        variant: "destructive",
      });
      return;
    }

    setUploadingAvatar(true);
    try {
      const fileExt = file.name.split(".").pop();
      const fileName = `${userId}/avatar.${fileExt}`;

      // Delete old avatar if exists
      await supabase.storage.from("avatars").remove([`${userId}/avatar.png`, `${userId}/avatar.jpg`, `${userId}/avatar.jpeg`, `${userId}/avatar.webp`]);

      // Upload new avatar
      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(fileName, file, { upsert: true });

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from("avatars")
        .getPublicUrl(fileName);

      setPreviewAvatarUrl(publicUrl + "?t=" + Date.now());
      toast({ title: "Imagen subida correctamente" });
    } catch (error) {
      console.error("Error uploading avatar:", error);
      toast({
        title: "Error",
        description: "No se pudo subir la imagen",
        variant: "destructive",
      });
    } finally {
      setUploadingAvatar(false);
    }
  };

  const removeAvatar = async () => {
    setPreviewAvatarUrl(null);
  };

  const saveProfileChanges = async () => {
    if (!editingName.trim() || !userId) return;
    
    setSavingProfile(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ 
          full_name: editingName.trim(),
          avatar_url: previewAvatarUrl,
          avatar_color: editingColor
        })
        .eq("user_id", userId);

      if (error) throw error;

      setUserName(editingName.trim());
      setAvatarUrl(previewAvatarUrl);
      setAvatarColor(editingColor);
      toast({ title: "Perfil actualizado correctamente" });
      setProfileDialogOpen(false);
    } catch (error) {
      console.error("Error updating profile:", error);
      toast({
        title: "Error",
        description: "No se pudo actualizar el perfil",
        variant: "destructive",
      });
    } finally {
      setSavingProfile(false);
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate("/auth");
  };

  const dashboardItems = [
    { title: "Daily", url: "/", icon: Home },
    { title: "Trading", url: "/trading", icon: LineChart },
  ];

  const isCollapsed = state === "collapsed";
  const currentAvatarColor = avatarColor || getDefaultAvatarColor(userName);
  const editPreviewColor = editingColor || getDefaultAvatarColor(editingName || userName);
  const initial = getInitial(userName);

  return (
    <Sidebar className={isCollapsed ? "w-14" : "w-64"}>
      <SidebarHeader className="p-4">
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
              {isAdmin && (
                <SidebarMenuItem>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to="/admin"
                      className="hover:bg-sidebar-accent"
                    >
                      <Shield className="h-4 w-4" />
                      {!isCollapsed && <span>Administración</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border p-4">
        <div className="flex items-center justify-between">
          <button
            onClick={openProfileDialog}
            className="flex items-center gap-2 hover:opacity-80 transition-opacity cursor-pointer"
          >
            <Avatar className="h-9 w-9">
              {avatarUrl ? (
                <AvatarImage src={avatarUrl} alt={userName} />
              ) : null}
              <AvatarFallback className={`${currentAvatarColor} text-white font-semibold text-sm`}>
                {initial}
              </AvatarFallback>
            </Avatar>
            {!isCollapsed && (
              <span className="text-sm font-medium text-sidebar-foreground truncate max-w-[120px]">
                {userName}
              </span>
            )}
          </button>
          {!isCollapsed && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleSignOut}
              className="h-8 w-8 p-0"
              title="Cerrar sesión"
            >
              <LogOut className="h-4 w-4" />
            </Button>
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

      {/* Profile Edit Dialog */}
      <Dialog open={profileDialogOpen} onOpenChange={setProfileDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Editar perfil</DialogTitle>
            <DialogDescription>
              Personaliza tu avatar y nombre
            </DialogDescription>
          </DialogHeader>
          
          <div className="flex flex-col items-center gap-4 py-4">
            {/* Avatar Preview */}
            <div className="relative">
              <Avatar className="h-24 w-24">
                {previewAvatarUrl ? (
                  <AvatarImage src={previewAvatarUrl} alt={editingName} />
                ) : null}
                <AvatarFallback className={`${editPreviewColor} text-white font-bold text-3xl`}>
                  {getInitial(editingName || userName)}
                </AvatarFallback>
              </Avatar>
            </div>

            <Tabs defaultValue="color" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="color">
                  <Palette className="h-4 w-4 mr-2" />
                  Color
                </TabsTrigger>
                <TabsTrigger value="photo">
                  <Camera className="h-4 w-4 mr-2" />
                  Foto
                </TabsTrigger>
              </TabsList>
              
              <TabsContent value="color" className="space-y-4">
                <div className="grid grid-cols-6 gap-2 p-2">
                  {AVATAR_COLORS.map((color) => (
                    <button
                      key={color.value}
                      onClick={() => {
                        setEditingColor(color.value);
                        setPreviewAvatarUrl(null);
                      }}
                      className={`h-8 w-8 rounded-full ${color.value} transition-all hover:scale-110 ${
                        editingColor === color.value && !previewAvatarUrl
                          ? "ring-2 ring-offset-2 ring-primary"
                          : ""
                      }`}
                      title={color.name}
                    />
                  ))}
                </div>
              </TabsContent>
              
              <TabsContent value="photo" className="space-y-4">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileSelect}
                  className="hidden"
                />
                <div className="flex flex-col gap-2">
                  <Button
                    variant="outline"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadingAvatar}
                    className="w-full"
                  >
                    <Camera className="h-4 w-4 mr-2" />
                    {uploadingAvatar ? "Subiendo..." : "Subir foto"}
                  </Button>
                  {previewAvatarUrl && (
                    <Button
                      variant="ghost"
                      onClick={removeAvatar}
                      className="w-full text-destructive"
                    >
                      Eliminar foto
                    </Button>
                  )}
                  <p className="text-xs text-muted-foreground text-center">
                    Máximo 2MB. JPG, PNG o WebP.
                  </p>
                </div>
              </TabsContent>
            </Tabs>

            {/* Name Input */}
            <div className="w-full space-y-2">
              <Label htmlFor="profile-name">Nombre</Label>
              <Input
                id="profile-name"
                value={editingName}
                onChange={(e) => setEditingName(e.target.value)}
                placeholder="Tu nombre"
              />
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setProfileDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={saveProfileChanges} disabled={savingProfile}>
              {savingProfile ? "Guardando..." : "Guardar"}
            </Button>
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
