import { Button } from "@/components/ui/button";
import { DollarSign, Euro } from "lucide-react";

interface CurrencyToggleProps {
  currency: "USD" | "EUR";
  onCurrencyChange: (currency: "USD" | "EUR") => void;
  exchangeRate?: number;
}

export function CurrencyToggle({ currency, onCurrencyChange, exchangeRate }: CurrencyToggleProps) {
  return (
    <div className="flex items-center gap-1 border rounded-md p-0.5">
      <Button
        variant={currency === "USD" ? "default" : "ghost"}
        size="sm"
        className="h-7 px-2"
        onClick={() => onCurrencyChange("USD")}
      >
        <DollarSign className="h-3.5 w-3.5 mr-1" />
        USD
      </Button>
      <Button
        variant={currency === "EUR" ? "default" : "ghost"}
        size="sm"
        className="h-7 px-2"
        onClick={() => onCurrencyChange("EUR")}
        title={exchangeRate ? `1 USD = ${exchangeRate.toFixed(4)} EUR` : undefined}
      >
        <Euro className="h-3.5 w-3.5 mr-1" />
        EUR
      </Button>
    </div>
  );
}
