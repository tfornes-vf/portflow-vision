import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

export interface AssetAlias {
  id: string;
  symbol: string;
  alias: string;
  created_at: string | null;
  updated_at: string | null;
}

export function useAssetAliases() {
  const [aliases, setAliases] = useState<AssetAlias[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAliases = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("asset_aliases")
        .select("*")
        .order("symbol", { ascending: true });

      if (error) throw error;
      setAliases(data || []);
    } catch (error) {
      console.error("Error fetching aliases:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAliases();
  }, [fetchAliases]);

  const getAliasForSymbol = useCallback((symbol: string): string | null => {
    const found = aliases.find(a => a.symbol === symbol);
    return found?.alias || null;
  }, [aliases]);

  const upsertAlias = useCallback(async (symbol: string, alias: string) => {
    try {
      const existing = aliases.find(a => a.symbol === symbol);
      
      if (existing) {
        const { error } = await supabase
          .from("asset_aliases")
          .update({ alias, updated_at: new Date().toISOString() })
          .eq("id", existing.id);
        
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("asset_aliases")
          .insert({ symbol, alias });
        
        if (error) throw error;
      }
      
      await fetchAliases();
      toast({
        title: "Alias actualizado",
        description: `${symbol} → ${alias}`,
      });
      return true;
    } catch (error) {
      console.error("Error upserting alias:", error);
      toast({
        title: "Error",
        description: "No se pudo guardar el alias",
        variant: "destructive",
      });
      return false;
    }
  }, [aliases, fetchAliases]);

  const deleteAlias = useCallback(async (id: string) => {
    try {
      const { error } = await supabase
        .from("asset_aliases")
        .delete()
        .eq("id", id);
      
      if (error) throw error;
      
      await fetchAliases();
      toast({
        title: "Alias eliminado",
      });
      return true;
    } catch (error) {
      console.error("Error deleting alias:", error);
      toast({
        title: "Error",
        description: "No se pudo eliminar el alias",
        variant: "destructive",
      });
      return false;
    }
  }, [fetchAliases]);

  return {
    aliases,
    loading,
    getAliasForSymbol,
    upsertAlias,
    deleteAlias,
    refetch: fetchAliases,
  };
}
