import { AppLayout } from "@/components/layout/AppLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TagsManager } from "@/components/settings/TagsManager";
import { EntityTypesManager } from "@/components/settings/EntityTypesManager";

export default function Settings() {
  return (
    <AppLayout>
      <div className="container mx-auto p-6 space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            Configuración del Entorno
          </h1>
          <p className="text-muted-foreground mt-1">
            Gestiona las listas maestras y taxonomía del sistema
          </p>
        </div>

        <Tabs defaultValue="tags" className="w-full">
          <TabsList>
            <TabsTrigger value="tags">Taxonomía (Tags)</TabsTrigger>
            <TabsTrigger value="entity-types">Tipos de Entidad</TabsTrigger>
          </TabsList>

          <TabsContent value="tags" className="mt-6">
            <TagsManager />
          </TabsContent>

          <TabsContent value="entity-types" className="mt-6">
            <EntityTypesManager />
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
