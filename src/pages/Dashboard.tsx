import { AppLayout } from "@/components/layout/AppLayout";
import { AllocationWidgets } from "@/components/dashboard/AllocationWidgets";
import { StrategiesHeatmap } from "@/components/dashboard/StrategiesHeatmap";
import { MaptreeSection } from "@/components/dashboard/MaptreeSection";

export default function Dashboard() {
  return (
    <AppLayout>
      <div className="container mx-auto p-3 sm:p-6 space-y-4 sm:space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            Daily Dashboard
          </h1>
          <p className="text-muted-foreground mt-1">
            Vista general del patrimonio y rendimiento
          </p>
        </div>

        <AllocationWidgets />
        <StrategiesHeatmap />
        <MaptreeSection />
      </div>
    </AppLayout>
  );
}
