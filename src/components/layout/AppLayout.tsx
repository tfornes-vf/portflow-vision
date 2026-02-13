import { ReactNode } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface AppLayoutProps {
  children: ReactNode;
}

export const AppLayout = ({ children }: AppLayoutProps) => {
  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0 overflow-x-hidden">
          <header className="sticky top-0 z-40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
            <div className="flex h-14 items-center gap-2 sm:gap-4 px-3 sm:px-6">
              <SidebarTrigger />
              <div className="flex-1" />
              <div className="flex items-center gap-2 sm:gap-3">
                <Select defaultValue="gestor">
                  <SelectTrigger className="w-[100px] sm:w-[140px] text-xs sm:text-sm">
                    <SelectValue placeholder="Rol" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="gestor">IM Gestor</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="viewer">Viewer</SelectItem>
                  </SelectContent>
                </Select>
                <Select defaultValue="vf-empresa">
                  <SelectTrigger className="w-[120px] sm:w-[160px] text-xs sm:text-sm hidden sm:flex">
                    <SelectValue placeholder="Entidad" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="vf-empresa">VF Empresa</SelectItem>
                    <SelectItem value="holding">Holding Principal</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </header>
          <main className="flex-1 overflow-x-hidden overflow-y-auto">
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
};
