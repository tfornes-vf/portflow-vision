import { useState, useEffect } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Plus, Edit } from "lucide-react";

interface Profile {
  id: string;
  user_id: string;
  email: string;
  full_name: string | null;
  role?: "admin" | "viewer";
  is_enabled: boolean;
}

interface Broker {
  id: string;
  name: string;
  api_key: string;
  is_active: boolean;
}

interface AssetAlias {
  id: string;
  symbol: string;
  alias: string;
}

export default function Backoffice() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [brokers, setBrokers] = useState<Broker[]>([]);
  const [aliases, setAliases] = useState<AssetAlias[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    checkAdminRole();
    fetchProfiles();
    fetchBrokers();
    fetchAliases();
  }, []);

  const checkAdminRole = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();

    setIsAdmin(!!data);
  };

  const fetchProfiles = async () => {
    const { data: profilesData, error: profilesError } = await supabase
      .from("profiles")
      .select("*");
    
    if (profilesError) {
      console.error("Error fetching profiles:", profilesError);
      return;
    }

    // Fetch roles from user_roles table
    const { data: rolesData } = await supabase
      .from("user_roles")
      .select("user_id, role");

    // Merge profiles with roles
    const profilesWithRoles = profilesData?.map(profile => {
      const userRole = rolesData?.find(r => r.user_id === profile.user_id);
      return {
        ...profile,
        role: userRole?.role as "admin" | "viewer" | undefined
      };
    }) || [];

    setProfiles(profilesWithRoles);
  };

  const fetchBrokers = async () => {
    const { data, error } = await supabase.from("brokers").select("*");
    if (error) {
      console.error("Error fetching brokers:", error);
      return;
    }
    setBrokers(data || []);
  };

  const fetchAliases = async () => {
    const { data, error } = await supabase.from("asset_aliases").select("*");
    if (error) {
      console.error("Error fetching aliases:", error);
      return;
    }
    setAliases(data || []);
  };

  const toggleUserStatus = async (profileId: string, currentStatus: boolean) => {
    const { error } = await supabase
      .from("profiles")
      .update({ is_enabled: !currentStatus })
      .eq("id", profileId);

    if (error) {
      toast({
        title: "Error",
        description: "No se pudo actualizar el estado del usuario",
        variant: "destructive",
      });
      return;
    }

    toast({ title: "Usuario actualizado correctamente" });
    fetchProfiles();
  };

  const updateUserRole = async (profileId: string, role: "admin" | "viewer") => {
    // Find the profile to get user_id
    const profile = profiles.find(p => p.id === profileId);
    if (!profile) {
      toast({
        title: "Error",
        description: "Perfil no encontrado",
        variant: "destructive",
      });
      return;
    }

    // Delete existing role
    await supabase
      .from("user_roles")
      .delete()
      .eq("user_id", profile.user_id);

    // Insert new role
    const { error } = await supabase
      .from("user_roles")
      .insert({ user_id: profile.user_id, role });

    if (error) {
      toast({
        title: "Error",
        description: "No se pudo actualizar el rol del usuario",
        variant: "destructive",
      });
      return;
    }

    toast({ title: "Rol actualizado correctamente" });
    fetchProfiles();
  };

  if (!isAdmin) {
    return (
      <AppLayout>
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <h2 className="text-2xl font-bold mb-2">Acceso Denegado</h2>
            <p className="text-muted-foreground">
              No tienes permisos para acceder a esta sección
            </p>
          </CardContent>
        </Card>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Administración</h1>
          <p className="text-muted-foreground">
            Gestiona usuarios, brokers y configuración del sistema
          </p>
        </div>

        <Tabs defaultValue="users" className="space-y-4">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="users">Usuarios</TabsTrigger>
            <TabsTrigger value="brokers">Brokers</TabsTrigger>
            <TabsTrigger value="aliases">Alias de Activos</TabsTrigger>
          </TabsList>

          {/* Users Tab */}
          <TabsContent value="users" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Gestión de Usuarios</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Email</TableHead>
                      <TableHead>Nombre</TableHead>
                      <TableHead>Rol</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead>Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {profiles.map((profile) => (
                      <TableRow key={profile.id}>
                        <TableCell className="font-medium">{profile.email}</TableCell>
                        <TableCell>{profile.full_name || "-"}</TableCell>
                        <TableCell>
                          <Select
                            value={profile.role}
                            onValueChange={(value: "admin" | "viewer") =>
                              updateUserRole(profile.id, value)
                            }
                          >
                            <SelectTrigger className="w-32">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="viewer">Viewer</SelectItem>
                              <SelectItem value="admin">Admin</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <Switch
                            checked={profile.is_enabled}
                            onCheckedChange={() =>
                              toggleUserStatus(profile.id, profile.is_enabled)
                            }
                          />
                        </TableCell>
                        <TableCell>
                          <span
                            className={
                              profile.is_enabled ? "text-success" : "text-destructive"
                            }
                          >
                            {profile.is_enabled ? "Activo" : "Deshabilitado"}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Brokers Tab */}
          <TabsContent value="brokers" className="space-y-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Gestión de Brokers</CardTitle>
                <BrokerDialog onSuccess={fetchBrokers} />
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nombre</TableHead>
                      <TableHead>API Key</TableHead>
                      <TableHead>Estado</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {brokers.map((broker) => (
                      <TableRow key={broker.id}>
                        <TableCell className="font-medium">{broker.name}</TableCell>
                        <TableCell className="font-mono text-sm">
                          {broker.api_key.slice(0, 20)}...
                        </TableCell>
                        <TableCell>
                          <span
                            className={
                              broker.is_active ? "text-success" : "text-destructive"
                            }
                          >
                            {broker.is_active ? "Activo" : "Inactivo"}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Aliases Tab */}
          <TabsContent value="aliases" className="space-y-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Alias de Activos</CardTitle>
                <AliasDialog onSuccess={fetchAliases} />
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Símbolo</TableHead>
                      <TableHead>Alias</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {aliases.map((alias) => (
                      <TableRow key={alias.id}>
                        <TableCell className="font-mono font-medium">
                          {alias.symbol}
                        </TableCell>
                        <TableCell>{alias.alias}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}

// Broker Dialog Component
function BrokerDialog({ onSuccess }: { onSuccess: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const { error } = await supabase.from("brokers").insert({
      name,
      api_key: apiKey,
      api_secret: apiSecret,
    });

    if (error) {
      toast({
        title: "Error",
        description: "No se pudo crear el broker",
        variant: "destructive",
      });
      return;
    }

    toast({ title: "Broker creado correctamente" });
    setOpen(false);
    setName("");
    setApiKey("");
    setApiSecret("");
    onSuccess();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Nuevo Broker
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Agregar Nuevo Broker</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="name">Nombre del Broker</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="ej. Interactive Brokers"
              required
            />
          </div>
          <div>
            <Label htmlFor="apiKey">API Key</Label>
            <Input
              id="apiKey"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="API Key"
              required
            />
          </div>
          <div>
            <Label htmlFor="apiSecret">API Secret</Label>
            <Input
              id="apiSecret"
              type="password"
              value={apiSecret}
              onChange={(e) => setApiSecret(e.target.value)}
              placeholder="API Secret"
              required
            />
          </div>
          <Button type="submit" className="w-full">
            Guardar Broker
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// Alias Dialog Component
function AliasDialog({ onSuccess }: { onSuccess: () => void }) {
  const [open, setOpen] = useState(false);
  const [symbol, setSymbol] = useState("");
  const [alias, setAlias] = useState("");
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const { error } = await supabase.from("asset_aliases").insert({
      symbol,
      alias,
    });

    if (error) {
      toast({
        title: "Error",
        description: "No se pudo crear el alias",
        variant: "destructive",
      });
      return;
    }

    toast({ title: "Alias creado correctamente" });
    setOpen(false);
    setSymbol("");
    setAlias("");
    onSuccess();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Nuevo Alias
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Agregar Nuevo Alias</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="symbol">Símbolo del Broker</Label>
            <Input
              id="symbol"
              value={symbol}
              onChange={(e) => setSymbol(e.target.value.toUpperCase())}
              placeholder="ej. XAUUSD"
              required
            />
          </div>
          <div>
            <Label htmlFor="alias">Alias</Label>
            <Input
              id="alias"
              value={alias}
              onChange={(e) => setAlias(e.target.value)}
              placeholder="ej. Oro"
              required
            />
          </div>
          <Button type="submit" className="w-full">
            Guardar Alias
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
