import { Button } from "@/components/ui/button";
import { DollarSign, Euro } from "lucide-react";

interface CurrencyToggleProps {
  currency: "USD" | "EUR";
  onCurrencyChange: (currency: "USD" | "EUR") => void;
  exchangeRate?: number;
}

export function CurrencyToggle({ currency, onCurrencyChange, exchangeRate }: CurrencyToggleProps) {
  return (
    <div className="flex items-center gap-0.5 border rounded-md p-0.5">
      <Button
        variant={currency === "USD" ? "default" : "ghost"}
        size="sm"
        className="h-6 sm:h-7 px-1.5 sm:px-2 text-[10px] sm:text-sm"
        onClick={() => onCurrencyChange("USD")}
      >
        <DollarSign className="h-3 w-3 sm:h-3.5 sm:w-3.5 mr-0.5 sm:mr-1" />
        <span className="hidden sm:inline">USD</span>
        <span className="sm:hidden">$</span>
      </Button>
      <Button
        variant={currency === "EUR" ? "default" : "ghost"}
        size="sm"
        className="h-6 sm:h-7 px-1.5 sm:px-2 text-[10px] sm:text-sm"
        onClick={() => onCurrencyChange("EUR")}
        title={exchangeRate ? `1 USD = ${exchangeRate.toFixed(4)} EUR` : undefined}
      >
        <Euro className="h-3 w-3 sm:h-3.5 sm:w-3.5 mr-0.5 sm:mr-1" />
        <span className="hidden sm:inline">EUR</span>
        <span className="sm:hidden">€</span>
      </Button>
    </div>
  );
}
