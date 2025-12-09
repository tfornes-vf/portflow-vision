import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Check, X } from "lucide-react";

interface InlineAliasEditorProps {
  symbol: string;
  currentAlias: string | null;
  onSave: (symbol: string, alias: string) => Promise<boolean>;
}

export function InlineAliasEditor({ symbol, currentAlias, onSave }: InlineAliasEditorProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [value, setValue] = useState(currentAlias || "");
  const [saving, setSaving] = useState(false);

  const handleClick = () => {
    setValue(currentAlias || "");
    setIsEditing(true);
  };

  const handleSave = async () => {
    if (!value.trim()) {
      setIsEditing(false);
      return;
    }
    
    setSaving(true);
    const success = await onSave(symbol, value.trim());
    setSaving(false);
    
    if (success) {
      setIsEditing(false);
    }
  };

  const handleCancel = () => {
    setValue(currentAlias || "");
    setIsEditing(false);
  };

  if (isEditing) {
    return (
      <div className="flex items-center gap-1">
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="h-6 w-24 text-xs"
          autoFocus
          disabled={saving}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSave();
            if (e.key === "Escape") handleCancel();
          }}
        />
        <Button
          variant="ghost"
          size="icon"
          className="h-5 w-5 p-0"
          onClick={handleSave}
          disabled={saving}
        >
          <Check className="h-3 w-3 text-green-500" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-5 w-5 p-0"
          onClick={handleCancel}
          disabled={saving}
        >
          <X className="h-3 w-3 text-muted-foreground" />
        </Button>
      </div>
    );
  }

  return (
    <span
      className={`cursor-pointer hover:text-primary text-sm ${!currentAlias ? "text-muted-foreground" : ""}`}
      onClick={handleClick}
    >
      {currentAlias || "-"}
    </span>
  );
}
