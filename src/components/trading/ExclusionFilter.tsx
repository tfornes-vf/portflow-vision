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
import { format, eachDayOfInterval, isSameDay } from "date-fns";
import { es } from "date-fns/locale";
import { DateRange } from "react-day-picker";
import { Checkbox } from "@/components/ui/checkbox";

export interface ExclusionRule {
  symbol: string;
  dates: Date[]; // Empty array means exclude ALL dates for this symbol
  allDates?: boolean; // Flag to indicate excluding all dates
}

export interface PresetConfig {
  label: string;
  exclusions: ExclusionRule[];
}

interface ExclusionFilterProps {
  exclusions: ExclusionRule[];
  onExclusionsChange: (exclusions: ExclusionRule[]) => void;
  availableSymbols: string[];
  preset?: PresetConfig;
}

// Default preset: MBTX5 on Nov 12-17, 2025
const DEFAULT_PRESET: PresetConfig = {
  label: "MBTX5 (12-17 Nov 2025)",
  exclusions: [{
    symbol: "MBTX5",
    dates: eachDayOfInterval({
      start: new Date(2025, 10, 12), // Nov 12, 2025
      end: new Date(2025, 10, 17),   // Nov 17, 2025
    }),
  }],
};

export function ExclusionFilter({
  exclusions,
  onExclusionsChange,
  availableSymbols,
  preset,
}: ExclusionFilterProps) {
  const [newSymbol, setNewSymbol] = useState("");
  const [selectedRange, setSelectedRange] = useState<DateRange | undefined>(undefined);
  const [excludeAllDates, setExcludeAllDates] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  const activePreset = preset || DEFAULT_PRESET;

  const addExclusion = () => {
    if (!newSymbol.trim()) return;
    
    // If excluding all dates, we don't need a date range
    if (excludeAllDates) {
      const existing = exclusions.find(e => e.symbol === newSymbol.toUpperCase());
      if (existing) {
        // Update to all dates
        onExclusionsChange(
          exclusions.map(e => 
            e.symbol === newSymbol.toUpperCase() 
              ? { ...e, dates: [], allDates: true }
              : e
          )
        );
      } else {
        onExclusionsChange([
          ...exclusions,
          { symbol: newSymbol.toUpperCase(), dates: [], allDates: true },
        ]);
      }
      setNewSymbol("");
      setExcludeAllDates(false);
      return;
    }
    
    if (!selectedRange?.from) return;
    
    // Generate all dates in the range
    const datesToAdd = selectedRange.to 
      ? eachDayOfInterval({ start: selectedRange.from, end: selectedRange.to })
      : [selectedRange.from];
    
    const existing = exclusions.find(e => e.symbol === newSymbol.toUpperCase());
    if (existing) {
      // Merge dates
      const newDates = [...existing.dates];
      datesToAdd.forEach(d => {
        if (!newDates.some(nd => isSameDay(nd, d))) {
          newDates.push(d);
        }
      });
      onExclusionsChange(
        exclusions.map(e => 
          e.symbol === newSymbol.toUpperCase() 
            ? { ...e, dates: newDates.sort((a, b) => a.getTime() - b.getTime()), allDates: false }
            : e
        )
      );
    } else {
      onExclusionsChange([
        ...exclusions,
        { symbol: newSymbol.toUpperCase(), dates: datesToAdd, allDates: false },
      ]);
    }
    
    setNewSymbol("");
    setSelectedRange(undefined);
  };

  const removeExclusion = (symbol: string) => {
    onExclusionsChange(exclusions.filter(e => e.symbol !== symbol));
  };

  const applyPreset = () => {
    const newExclusions = [...exclusions];
    
    activePreset.exclusions.forEach(presetExclusion => {
      const existing = newExclusions.find(e => e.symbol === presetExclusion.symbol);
      if (existing) {
        if (presetExclusion.allDates) {
          // Replace with all dates exclusion
          const idx = newExclusions.indexOf(existing);
          newExclusions[idx] = { ...presetExclusion };
        } else {
          // Merge dates
          const newDates = [...existing.dates];
          presetExclusion.dates.forEach(d => {
            if (!newDates.some(nd => isSameDay(nd, d))) {
              newDates.push(d);
            }
          });
          existing.dates = newDates.sort((a, b) => a.getTime() - b.getTime());
        }
      } else {
        newExclusions.push({ ...presetExclusion });
      }
    });
    
    onExclusionsChange(newExclusions);
  };

  const clearAll = () => {
    onExclusionsChange([]);
  };

  const hasExclusions = exclusions.length > 0;

  // Format date range for display
  const formatDateRange = (exclusion: ExclusionRule) => {
    if (exclusion.allDates || exclusion.dates.length === 0) {
      return "Todas las fechas";
    }
    if (exclusion.dates.length === 1) {
      return format(exclusion.dates[0], "dd/MM");
    }
    
    const sorted = [...exclusion.dates].sort((a, b) => a.getTime() - b.getTime());
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    return `${format(first, "dd/MM")} - ${format(last, "dd/MM")} (${exclusion.dates.length} días)`;
  };

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
      <PopoverContent className="w-80 bg-popover" align="start">
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
            Aplicar preset: {activePreset.label}
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
                      {formatDateRange(exclusion)}
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
            
            {/* Exclude all dates checkbox */}
            <div className="flex items-center space-x-2">
              <Checkbox 
                id="exclude-all" 
                checked={excludeAllDates}
                onCheckedChange={(checked) => setExcludeAllDates(checked === true)}
              />
              <label 
                htmlFor="exclude-all" 
                className="text-xs text-muted-foreground cursor-pointer"
              >
                Excluir todas las fechas de este símbolo
              </label>
            </div>
            
            {!excludeAllDates && (
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="w-full gap-2">
                    <CalendarIcon className="h-4 w-4" />
                    {selectedRange?.from ? (
                      selectedRange.to ? (
                        `${format(selectedRange.from, "dd/MM")} - ${format(selectedRange.to, "dd/MM")}`
                      ) : (
                        format(selectedRange.from, "dd/MM/yy")
                      )
                    ) : (
                      "Seleccionar rango de fechas"
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 bg-popover" align="start">
                  <Calendar
                    mode="range"
                    selected={selectedRange}
                    onSelect={setSelectedRange}
                    locale={es}
                    className="pointer-events-auto"
                    numberOfMonths={1}
                  />
                </PopoverContent>
              </Popover>
            )}

            <Button
              size="sm"
              className="w-full"
              onClick={addExclusion}
              disabled={!newSymbol.trim() || (!excludeAllDates && !selectedRange?.from)}
            >
              Añadir exclusión
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
