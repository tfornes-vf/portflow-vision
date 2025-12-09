import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Settings, Trash2, Save, X } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AssetAlias } from "@/hooks/use-asset-aliases";

interface AliasManagerModalProps {
  aliases: AssetAlias[];
  allSymbols: string[];
  onUpdateAlias: (symbol: string, alias: string) => Promise<boolean>;
  onDeleteAlias: (id: string) => Promise<boolean>;
}

export function AliasManagerModal({
  aliases,
  allSymbols,
  onUpdateAlias,
  onDeleteAlias,
}: AliasManagerModalProps) {
  const [open, setOpen] = useState(false);
  const [editingSymbol, setEditingSymbol] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [saving, setSaving] = useState(false);

  // Combine all symbols with their aliases
  const symbolsWithAliases = allSymbols.map(symbol => {
    const aliasRecord = aliases.find(a => a.symbol === symbol);
    return {
      symbol,
      alias: aliasRecord?.alias || "",
      aliasId: aliasRecord?.id || null,
    };
  });

  const handleEdit = (symbol: string, currentAlias: string) => {
    setEditingSymbol(symbol);
    setEditValue(currentAlias);
  };

  const handleCancel = () => {
    setEditingSymbol(null);
    setEditValue("");
  };

  const handleSave = async (symbol: string) => {
    if (!editValue.trim()) {
      handleCancel();
      return;
    }
    
    setSaving(true);
    const success = await onUpdateAlias(symbol, editValue.trim());
    setSaving(false);
    
    if (success) {
      handleCancel();
    }
  };

  const handleDelete = async (id: string) => {
    setSaving(true);
    await onDeleteAlias(id);
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="h-5 w-5 p-0">
          <Settings className="h-3 w-3" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Gestionar Alias de Símbolos</DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[200px]">Símbolo</TableHead>
                <TableHead>Alias</TableHead>
                <TableHead className="w-[100px]">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {symbolsWithAliases.map(({ symbol, alias, aliasId }) => (
                <TableRow key={symbol}>
                  <TableCell className="font-mono font-medium">{symbol}</TableCell>
                  <TableCell>
                    {editingSymbol === symbol ? (
                      <Input
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        placeholder="Escribir alias..."
                        className="h-8"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleSave(symbol);
                          if (e.key === "Escape") handleCancel();
                        }}
                      />
                    ) : (
                      <span
                        className={`cursor-pointer hover:text-primary ${!alias ? "text-muted-foreground italic" : ""}`}
                        onClick={() => handleEdit(symbol, alias)}
                      >
                        {alias || "Clic para añadir alias"}
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      {editingSymbol === symbol ? (
                        <>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => handleSave(symbol)}
                            disabled={saving}
                          >
                            <Save className="h-4 w-4 text-green-500" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={handleCancel}
                            disabled={saving}
                          >
                            <X className="h-4 w-4 text-muted-foreground" />
                          </Button>
                        </>
                      ) : aliasId ? (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => handleDelete(aliasId)}
                          disabled={saving}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </DialogContent>
    </Dialog>
  );
}
