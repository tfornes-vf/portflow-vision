import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Filter, X, CalendarIcon } from "lucide-react";
import { format, parseISO, isSameDay } from "date-fns";
import { es } from "date-fns/locale";

export interface ExclusionRule {
  symbol: string;
  dates: Date[];
}

interface ExclusionFilterProps {
  exclusions: ExclusionRule[];
  onExclusionsChange: (exclusions: ExclusionRule[]) => void;
  availableSymbols: string[];
}

// Preset: MBTX5 on Nov 14-17, 2025
const PRESET_EXCLUSION: ExclusionRule = {
  symbol: "MBTX5",
  dates: [
    new Date(2025, 10, 14), // Nov 14, 2025
    new Date(2025, 10, 15), // Nov 15, 2025
    new Date(2025, 10, 16), // Nov 16, 2025
    new Date(2025, 10, 17), // Nov 17, 2025
  ],
};

export function ExclusionFilter({
  exclusions,
  onExclusionsChange,
  availableSymbols,
}: ExclusionFilterProps) {
  const [newSymbol, setNewSymbol] = useState("");
  const [selectedDates, setSelectedDates] = useState<Date[]>([]);
  const [isOpen, setIsOpen] = useState(false);

  const addExclusion = () => {
    if (!newSymbol.trim() || selectedDates.length === 0) return;
    
    const existing = exclusions.find(e => e.symbol === newSymbol.toUpperCase());
    if (existing) {
      // Merge dates
      const newDates = [...existing.dates];
      selectedDates.forEach(d => {
        if (!newDates.some(nd => isSameDay(nd, d))) {
          newDates.push(d);
        }
      });
      onExclusionsChange(
        exclusions.map(e => 
          e.symbol === newSymbol.toUpperCase() 
            ? { ...e, dates: newDates }
            : e
        )
      );
    } else {
      onExclusionsChange([
        ...exclusions,
        { symbol: newSymbol.toUpperCase(), dates: selectedDates },
      ]);
    }
    
    setNewSymbol("");
    setSelectedDates([]);
  };

  const removeExclusion = (symbol: string) => {
    onExclusionsChange(exclusions.filter(e => e.symbol !== symbol));
  };

  const applyPreset = () => {
    const existing = exclusions.find(e => e.symbol === PRESET_EXCLUSION.symbol);
    if (existing) {
      const newDates = [...existing.dates];
      PRESET_EXCLUSION.dates.forEach(d => {
        if (!newDates.some(nd => isSameDay(nd, d))) {
          newDates.push(d);
        }
      });
      onExclusionsChange(
        exclusions.map(e => 
          e.symbol === PRESET_EXCLUSION.symbol 
            ? { ...e, dates: newDates }
            : e
        )
      );
    } else {
      onExclusionsChange([...exclusions, PRESET_EXCLUSION]);
    }
  };

  const clearAll = () => {
    onExclusionsChange([]);
  };

  const hasExclusions = exclusions.length > 0;

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button 
          variant={hasExclusions ? "default" : "outline"} 
          size="sm" 
          className="gap-2"
        >
          <Filter className="h-4 w-4" />
          Excluir
          {hasExclusions && (
            <Badge variant="secondary" className="ml-1 h-5 px-1.5">
              {exclusions.length}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80" align="start">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-foreground">Excluir trades</p>
            {hasExclusions && (
              <Button variant="ghost" size="sm" onClick={clearAll}>
                Limpiar todo
              </Button>
            )}
          </div>

          {/* Preset shortcut */}
          <Button
            variant="outline"
            size="sm"
            className="w-full text-xs"
            onClick={applyPreset}
          >
            Aplicar preset: MBTX5 (14-17 Nov 2025)
          </Button>

          {/* Current exclusions */}
          {exclusions.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">Exclusiones activas:</p>
              {exclusions.map((exclusion) => (
                <div
                  key={exclusion.symbol}
                  className="flex items-center justify-between p-2 rounded-md bg-muted"
                >
                  <div>
                    <Badge variant="outline" className="font-mono">
                      {exclusion.symbol}
                    </Badge>
                    <p className="text-xs text-muted-foreground mt-1">
                      {exclusion.dates.map(d => format(d, "dd/MM")).join(", ")}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => removeExclusion(exclusion.symbol)}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          {/* Add new exclusion */}
          <div className="space-y-2 border-t pt-3">
            <p className="text-xs text-muted-foreground">Añadir exclusión:</p>
            <Input
              placeholder="Símbolo (ej: MBTX5)"
              value={newSymbol}
              onChange={(e) => setNewSymbol(e.target.value)}
              className="h-8"
              list="symbols-list"
            />
            <datalist id="symbols-list">
              {availableSymbols.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
            
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="w-full gap-2">
                  <CalendarIcon className="h-4 w-4" />
                  {selectedDates.length > 0
                    ? `${selectedDates.length} día(s) seleccionado(s)`
                    : "Seleccionar días"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="multiple"
                  selected={selectedDates}
                  onSelect={(dates) => setSelectedDates(dates || [])}
                  locale={es}
                />
              </PopoverContent>
            </Popover>

            <Button
              size="sm"
              className="w-full"
              onClick={addExclusion}
              disabled={!newSymbol.trim() || selectedDates.length === 0}
            >
              Añadir exclusión
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
