import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { ArrowLeft, Shield, Users, CheckCircle, XCircle, Loader2 } from "lucide-react";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";

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
  const [updating, setUpdating] = useState<string | null>(null);

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
      const { error } = await supabase
        .from("profiles")
        .update({ is_enabled: !profile.is_enabled })
        .eq("id", profile.id);

      if (error) throw error;

      setProfiles(prev => 
        prev.map(p => p.id === profile.id ? { ...p, is_enabled: !p.is_enabled } : p)
      );
      
      toast.success(
        profile.is_enabled 
          ? `Usuario ${profile.email} deshabilitado` 
          : `Usuario ${profile.email} habilitado`
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
        // Remove all roles
        await supabase.from("user_roles").delete().eq("user_id", userId);
        setUserRoles(prev => prev.filter(r => r.user_id !== userId));
      } else {
        // Check if role exists
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
                  Estos usuarios se han registrado pero necesitan tu aprobación para acceder.
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
                Gestiona los permisos y roles de los usuarios aprobados.
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
                      <TableHead>Rol</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead>Habilitado</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {activeUsers.map((profile) => {
                      const currentRole = getUserRole(profile.user_id);
                      const isSuperAdmin = profile.email === "antonifornes@gmail.com";
                      
                      return (
                        <TableRow key={profile.id}>
                          <TableCell className="font-medium">
                            {profile.email}
                            {isSuperAdmin && (
                              <Badge variant="default" className="ml-2">
                                Super Admin
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell>{profile.full_name || "-"}</TableCell>
                          <TableCell>
                            <Select
                              value={currentRole}
                              onValueChange={(value) => updateUserRole(profile.user_id, value as any)}
                              disabled={updating === profile.user_id || isSuperAdmin}
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
                          <TableCell>
                            <Badge variant={profile.is_enabled ? "default" : "secondary"}>
                              {profile.is_enabled ? "Activo" : "Inactivo"}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Switch
                              checked={profile.is_enabled}
                              onCheckedChange={() => toggleUserEnabled(profile)}
                              disabled={updating === profile.id || isSuperAdmin}
                            />
                          </TableCell>
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
    </SidebarProvider>
  );
};

export default Admin;
