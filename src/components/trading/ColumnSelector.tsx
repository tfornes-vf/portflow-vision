import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Settings2 } from "lucide-react";

export interface ColumnConfig {
  key: string;
  label: string;
  visible: boolean;
  defaultHidden?: boolean;
}

interface ColumnSelectorProps {
  columns: ColumnConfig[];
  onColumnChange: (key: string, visible: boolean) => void;
}

export function ColumnSelector({ columns, onColumnChange }: ColumnSelectorProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Settings2 className="h-4 w-4" />
          Columnas
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56" align="end">
        <div className="space-y-2">
          <p className="text-sm font-medium text-foreground mb-3">Mostrar columnas</p>
          {columns.map((column) => (
            <div key={column.key} className="flex items-center space-x-2">
              <Checkbox
                id={column.key}
                checked={column.visible}
                onCheckedChange={(checked) => onColumnChange(column.key, !!checked)}
              />
              <label
                htmlFor={column.key}
                className="text-sm text-muted-foreground cursor-pointer"
              >
                {column.label}
              </label>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
