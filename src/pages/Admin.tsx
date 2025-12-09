import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Shield, Users, CheckCircle, Loader2, Pencil, Trash2 } from "lucide-react";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";

const SUPER_ADMIN_EMAIL = "antonifornes@gmail.com";

interface Profile {
  id: string;
  user_id: string;
  email: string;
  full_name: string | null;
  is_enabled: boolean;
  created_at: string;
}

interface UserRole {
  user_id: string;
  role: "admin" | "viewer";
}

const Admin = () => {
  const navigate = useNavigate();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [userRoles, setUserRoles] = useState<UserRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [currentUserEmail, setCurrentUserEmail] = useState("");
  const [updating, setUpdating] = useState<string | null>(null);
  
  // Edit dialog state
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingProfile, setEditingProfile] = useState<Profile | null>(null);
  const [editEmail, setEditEmail] = useState("");
  const [editFullName, setEditFullName] = useState("");
  
  // Delete dialog state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingProfile, setDeletingProfile] = useState<Profile | null>(null);

  useEffect(() => {
    checkAdminAccess();
  }, []);

  const checkAdminAccess = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigate("/auth");
        return;
      }

      setCurrentUserEmail(user.email || "");
      const isSuperAdminUser = user.email === SUPER_ADMIN_EMAIL;
      setIsSuperAdmin(isSuperAdminUser);

      // Check if user is admin
      const { data: roleData } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .eq("role", "admin")
        .single();

      if (!roleData) {
        toast.error("No tienes permisos de administrador");
        navigate("/dashboard");
        return;
      }

      setIsAdmin(true);
      fetchData();
    } catch (error) {
      console.error("Error checking admin access:", error);
      navigate("/dashboard");
    }
  };

  const fetchData = async () => {
    try {
      const [profilesRes, rolesRes] = await Promise.all([
        supabase.from("profiles").select("*").order("created_at", { ascending: false }),
        supabase.from("user_roles").select("*"),
      ]);

      if (profilesRes.data) setProfiles(profilesRes.data);
      if (rolesRes.data) setUserRoles(rolesRes.data);
    } catch (error) {
      console.error("Error fetching data:", error);
      toast.error("Error al cargar los datos");
    } finally {
      setLoading(false);
    }
  };

  const toggleUserEnabled = async (profile: Profile) => {
    setUpdating(profile.id);
    try {
      const newEnabledState = !profile.is_enabled;
      
      const { error } = await supabase
        .from("profiles")
        .update({ is_enabled: newEnabledState })
        .eq("id", profile.id);

      if (error) throw error;

      // If enabling user and they don't have a role, assign viewer role
      if (newEnabledState) {
        const existingRole = userRoles.find(r => r.user_id === profile.user_id);
        if (!existingRole) {
          await supabase
            .from("user_roles")
            .insert({ user_id: profile.user_id, role: "viewer" });
          
          setUserRoles(prev => [...prev, { user_id: profile.user_id, role: "viewer" }]);
        }
      }

      setProfiles(prev => 
        prev.map(p => p.id === profile.id ? { ...p, is_enabled: newEnabledState } : p)
      );
      
      toast.success(
        profile.is_enabled 
          ? `Usuario ${profile.email} deshabilitado` 
          : `Usuario ${profile.email} habilitado con rol viewer`
      );
    } catch (error) {
      console.error("Error toggling user:", error);
      toast.error("Error al actualizar el usuario");
    } finally {
      setUpdating(null);
    }
  };

  const updateUserRole = async (userId: string, newRole: "admin" | "viewer" | "none") => {
    setUpdating(userId);
    try {
      if (newRole === "none") {
        await supabase.from("user_roles").delete().eq("user_id", userId);
        setUserRoles(prev => prev.filter(r => r.user_id !== userId));
      } else {
        const existingRole = userRoles.find(r => r.user_id === userId);
        
        if (existingRole) {
          await supabase
            .from("user_roles")
            .update({ role: newRole })
            .eq("user_id", userId);
        } else {
          await supabase
            .from("user_roles")
            .insert({ user_id: userId, role: newRole });
        }
        
        setUserRoles(prev => {
          const filtered = prev.filter(r => r.user_id !== userId);
          return [...filtered, { user_id: userId, role: newRole }];
        });
      }
      
      toast.success("Rol actualizado correctamente");
    } catch (error) {
      console.error("Error updating role:", error);
      toast.error("Error al actualizar el rol");
    } finally {
      setUpdating(null);
    }
  };

  const openEditDialog = (profile: Profile) => {
    setEditingProfile(profile);
    setEditEmail(profile.email);
    setEditFullName(profile.full_name || "");
    setEditDialogOpen(true);
  };

  const saveProfileEdit = async () => {
    if (!editingProfile) return;
    
    setUpdating(editingProfile.id);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ 
          email: editEmail.trim(),
          full_name: editFullName.trim() || null
        })
        .eq("id", editingProfile.id);

      if (error) throw error;

      setProfiles(prev => 
        prev.map(p => p.id === editingProfile.id 
          ? { ...p, email: editEmail.trim(), full_name: editFullName.trim() || null } 
          : p
        )
      );
      
      toast.success("Perfil actualizado correctamente");
      setEditDialogOpen(false);
    } catch (error) {
      console.error("Error updating profile:", error);
      toast.error("Error al actualizar el perfil");
    } finally {
      setUpdating(null);
    }
  };

  const openDeleteDialog = (profile: Profile) => {
    setDeletingProfile(profile);
    setDeleteDialogOpen(true);
  };

  const deleteUser = async () => {
    if (!deletingProfile) return;
    
    setUpdating(deletingProfile.id);
    try {
      // Delete user roles first
      await supabase
        .from("user_roles")
        .delete()
        .eq("user_id", deletingProfile.user_id);

      // Delete profile
      const { error } = await supabase
        .from("profiles")
        .delete()
        .eq("id", deletingProfile.id);

      if (error) throw error;

      setProfiles(prev => prev.filter(p => p.id !== deletingProfile.id));
      setUserRoles(prev => prev.filter(r => r.user_id !== deletingProfile.user_id));
      
      toast.success(`Usuario ${deletingProfile.email} eliminado`);
      setDeleteDialogOpen(false);
    } catch (error) {
      console.error("Error deleting user:", error);
      toast.error("Error al eliminar el usuario");
    } finally {
      setUpdating(null);
    }
  };

  const getUserRole = (userId: string): string => {
    const role = userRoles.find(r => r.user_id === userId);
    return role?.role || "none";
  };

  const pendingUsers = profiles.filter(p => !p.is_enabled);
  const activeUsers = profiles.filter(p => p.is_enabled);

  if (!isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ml-1" />
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            <h1 className="text-lg font-semibold">Panel de Administración</h1>
            {isSuperAdmin && (
              <Badge variant="default" className="ml-2">Super Admin</Badge>
            )}
          </div>
        </header>

        <main className="flex-1 p-6 space-y-6">
          {/* Pending Users */}
          {pendingUsers.length > 0 && (
            <Card className="border-amber-200 bg-amber-50/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-amber-800">
                  <Users className="h-5 w-5" />
                  Usuarios Pendientes de Aprobación ({pendingUsers.length})
                </CardTitle>
                <CardDescription>
                  Estos usuarios se han registrado pero necesitan aprobación para acceder.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Email</TableHead>
                      <TableHead>Nombre</TableHead>
                      <TableHead>Fecha de Registro</TableHead>
                      <TableHead>Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pendingUsers.map((profile) => (
                      <TableRow key={profile.id}>
                        <TableCell className="font-medium">{profile.email}</TableCell>
                        <TableCell>{profile.full_name || "-"}</TableCell>
                        <TableCell>
                          {new Date(profile.created_at).toLocaleDateString("es-ES")}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              onClick={() => toggleUserEnabled(profile)}
                              disabled={updating === profile.id}
                            >
                              {updating === profile.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <>
                                  <CheckCircle className="h-4 w-4 mr-1" />
                                  Aprobar
                                </>
                              )}
                            </Button>
                            {isSuperAdmin && (
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => openDeleteDialog(profile)}
                                disabled={updating === profile.id}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {/* Active Users */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Usuarios Activos ({activeUsers.length})
              </CardTitle>
              <CardDescription>
                {isSuperAdmin 
                  ? "Gestiona los permisos, datos y roles de los usuarios." 
                  : "Puedes habilitar o deshabilitar usuarios."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin" />
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Email</TableHead>
                      <TableHead>Nombre</TableHead>
                      {isSuperAdmin && <TableHead>Rol</TableHead>}
                      <TableHead>Habilitado</TableHead>
                      {isSuperAdmin && <TableHead>Acciones</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {activeUsers.map((profile) => {
                      const currentRole = getUserRole(profile.user_id);
                      const isThisSuperAdmin = profile.email === SUPER_ADMIN_EMAIL;
                      
                      return (
                        <TableRow key={profile.id}>
                          <TableCell className="font-medium">
                            {profile.email}
                            {isThisSuperAdmin && (
                              <Badge variant="default" className="ml-2">
                                Super Admin
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell>{profile.full_name || "-"}</TableCell>
                          {isSuperAdmin && (
                            <TableCell>
                              <Select
                                value={currentRole}
                                onValueChange={(value) => updateUserRole(profile.user_id, value as any)}
                                disabled={updating === profile.user_id || isThisSuperAdmin}
                              >
                                <SelectTrigger className="w-32">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="none">Sin rol</SelectItem>
                                  <SelectItem value="viewer">Viewer</SelectItem>
                                  <SelectItem value="admin">Admin</SelectItem>
                                </SelectContent>
                              </Select>
                            </TableCell>
                          )}
                          <TableCell>
                            <Switch
                              checked={profile.is_enabled}
                              onCheckedChange={() => toggleUserEnabled(profile)}
                              disabled={updating === profile.id || isThisSuperAdmin}
                            />
                          </TableCell>
                          {isSuperAdmin && (
                            <TableCell>
                              {!isThisSuperAdmin && (
                                <div className="flex gap-2">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => openEditDialog(profile)}
                                    disabled={updating === profile.id}
                                  >
                                    <Pencil className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="destructive"
                                    onClick={() => openDeleteDialog(profile)}
                                    disabled={updating === profile.id}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              )}
                            </TableCell>
                          )}
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </main>
      </SidebarInset>

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Usuario</DialogTitle>
            <DialogDescription>
              Modifica los datos del usuario.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-email">Email</Label>
              <Input
                id="edit-email"
                type="email"
                value={editEmail}
                onChange={(e) => setEditEmail(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-name">Nombre Completo</Label>
              <Input
                id="edit-name"
                value={editFullName}
                onChange={(e) => setEditFullName(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={saveProfileEdit} disabled={updating === editingProfile?.id}>
              {updating === editingProfile?.id ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Guardar"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar usuario?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción eliminará permanentemente al usuario <strong>{deletingProfile?.email}</strong> y todos sus datos asociados. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={deleteUser}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SidebarProvider>
  );
};

export default Admin;
