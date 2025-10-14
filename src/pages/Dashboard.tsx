import { useState, useEffect } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { MetricCard } from "@/components/dashboard/MetricCard";
import { PortfolioChart } from "@/components/dashboard/PortfolioChart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Wallet, TrendingUp, DollarSign } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface Broker {
  id: string;
  name: string;
}

export default function Dashboard() {
  const [brokers, setBrokers] = useState<Broker[]>([]);
  const [selectedBroker, setSelectedBroker] = useState<string>("all");
  const { toast } = useToast();

  // Mock data - en producción esto vendría de la API del broker
  const totalBalance = 50000;
  const investedCapital = 32000;
  const availableCapital = totalBalance - investedCapital;

  useEffect(() => {
    fetchBrokers();
  }, []);

  const fetchBrokers = async () => {
    try {
      const { data, error } = await supabase
        .from("brokers")
        .select("id, name")
        .eq("is_active", true);

      if (error) throw error;
      setBrokers(data || []);
    } catch (error) {
      console.error("Error fetching brokers:", error);
      toast({
        title: "Error",
        description: "No se pudieron cargar los brokers",
        variant: "destructive",
      });
    }
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
            <p className="text-muted-foreground">
              Vista general de tu portfolio de trading
            </p>
          </div>
          
          <Select value={selectedBroker} onValueChange={setSelectedBroker}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Todos los Brokers" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los Brokers</SelectItem>
              {brokers.map((broker) => (
                <SelectItem key={broker.id} value={broker.id}>
                  {broker.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Metrics */}
        <div className="grid gap-4 md:grid-cols-3">
          <MetricCard
            title="Balance Total"
            value={`$${totalBalance.toLocaleString()}`}
            icon={<Wallet className="h-4 w-4" />}
          />
          <MetricCard
            title="Capital Invertido"
            value={`$${investedCapital.toLocaleString()}`}
            icon={<TrendingUp className="h-4 w-4" />}
          />
          <MetricCard
            title="Capital Disponible"
            value={`$${availableCapital.toLocaleString()}`}
            icon={<DollarSign className="h-4 w-4" />}
          />
        </div>

        {/* Chart */}
        <Card>
          <CardHeader>
            <CardTitle>Distribución del Capital</CardTitle>
          </CardHeader>
          <CardContent>
            <PortfolioChart
              invested={investedCapital}
              available={availableCapital}
            />
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
