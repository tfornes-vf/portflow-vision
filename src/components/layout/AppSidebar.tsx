import { Home, Map, Building2, User } from "lucide-react";
import { NavLink } from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
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
}

export function AppSidebar() {
  const { state } = useSidebar();
  const [entities, setEntities] = useState<Entity[]>([]);

  useEffect(() => {
    fetchEntities();
  }, []);

  const fetchEntities = async () => {
    try {
      const { data, error } = await supabase
        .from("entities")
        .select("id, name")
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
          <SidebarGroupLabel>My Property</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {entities.map((entity) => (
                <SidebarMenuItem key={entity.id}>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={`/properties/${entity.id}`}
                      className="hover:bg-sidebar-accent"
                    >
                      <Building2 className="h-4 w-4" />
                      {!isCollapsed && <span>{entity.name}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
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
    </Sidebar>
  );
}
