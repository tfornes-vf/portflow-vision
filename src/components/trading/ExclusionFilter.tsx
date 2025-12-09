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

export interface ExclusionRule {
  symbol: string;
  dates: Date[];
}

interface ExclusionFilterProps {
  exclusions: ExclusionRule[];
  onExclusionsChange: (exclusions: ExclusionRule[]) => void;
  availableSymbols: string[];
}

// Preset: MBTX5 on Nov 12-17, 2025
const PRESET_EXCLUSION: ExclusionRule = {
  symbol: "MBTX5",
  dates: eachDayOfInterval({
    start: new Date(2025, 10, 12), // Nov 12, 2025
    end: new Date(2025, 10, 17),   // Nov 17, 2025
  }),
};

export function ExclusionFilter({
  exclusions,
  onExclusionsChange,
  availableSymbols,
}: ExclusionFilterProps) {
  const [newSymbol, setNewSymbol] = useState("");
  const [selectedRange, setSelectedRange] = useState<DateRange | undefined>(undefined);
  const [isOpen, setIsOpen] = useState(false);

  const addExclusion = () => {
    if (!newSymbol.trim() || !selectedRange?.from) return;
    
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
            ? { ...e, dates: newDates.sort((a, b) => a.getTime() - b.getTime()) }
            : e
        )
      );
    } else {
      onExclusionsChange([
        ...exclusions,
        { symbol: newSymbol.toUpperCase(), dates: datesToAdd },
      ]);
    }
    
    setNewSymbol("");
    setSelectedRange(undefined);
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
            ? { ...e, dates: newDates.sort((a, b) => a.getTime() - b.getTime()) }
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

  // Format date range for display
  const formatDateRange = (dates: Date[]) => {
    if (dates.length === 0) return "";
    if (dates.length === 1) return format(dates[0], "dd/MM");
    
    const sorted = [...dates].sort((a, b) => a.getTime() - b.getTime());
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    return `${format(first, "dd/MM")} - ${format(last, "dd/MM")}`;
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
            Aplicar preset: MBTX5 (12-17 Nov 2025)
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
                      {formatDateRange(exclusion.dates)} ({exclusion.dates.length} días)
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

            <Button
              size="sm"
              className="w-full"
              onClick={addExclusion}
              disabled={!newSymbol.trim() || !selectedRange?.from}
            >
              Añadir exclusión
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
