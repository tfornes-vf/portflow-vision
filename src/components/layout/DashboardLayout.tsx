import { ReactNode, useState } from "react";
import { LogOut } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import logo from "@/assets/ycapital-logo.svg";

interface DashboardLayoutProps {
  children: (activeCategory: string) => ReactNode;
}

export const DashboardLayout = ({ children }: DashboardLayoutProps) => {
  const navigate = useNavigate();
  const [activeCategory, setActiveCategory] = useState("aggregated");

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/auth");
  };

  const categories = [
    { value: "aggregated", label: "Aggregated" },
    { value: "private-equity", label: "Private Equity" },
    { value: "real-estate", label: "Real Estate" },
    { value: "holding", label: "Holding" },
    { value: "creand", label: "Creand" },
    { value: "caixabank", label: "CaixaBank" },
    { value: "startups", label: "Startups" },
    { value: "commonsense", label: "Commonsense" },
    { value: "interactive-brokers", label: "Interactive Brokers" },
  ];

  return (
    <div className="flex min-h-screen w-full flex-col bg-background">
      {/* Header con Logo y Logout */}
      <header className="sticky top-0 z-50 border-b border-border bg-card">
        <div className="flex h-16 items-center justify-between px-6">
          <img src={logo} alt="Y Capital" className="h-10 w-auto" />
          
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={handleLogout}
          >
            <LogOut className="h-4 w-4" />
            Cerrar Sesión
          </Button>
        </div>

        {/* Navegación de Categorías */}
        <div className="border-t border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <div className="px-6 py-3">
            <Tabs value={activeCategory} onValueChange={setActiveCategory}>
              <TabsList className="h-auto w-full justify-start gap-2 bg-transparent p-0">
                {categories.map((category) => (
                  <TabsTrigger
                    key={category.value}
                    value={category.value}
                    className="rounded-full border border-border bg-card px-4 py-2 text-sm font-medium transition-smooth data-[state=active]:border-primary data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm hover:bg-secondary"
                  >
                    {category.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </div>
        </div>
      </header>

      {/* Contenido Principal */}
      <main className="flex-1">
        <div className="container mx-auto p-6 md:p-8">
          {children(activeCategory)}
        </div>
      </main>
    </div>
  );
};
