import { useState, useEffect } from "react";

const FALLBACK_RATE = 0.92; // Fallback EUR/USD rate

export function useExchangeRate() {
  const [rate, setRate] = useState<number>(FALLBACK_RATE);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchRate = async () => {
      try {
        // Using a free exchange rate API
        const response = await fetch(
          "https://api.exchangerate-api.com/v4/latest/USD"
        );
        if (response.ok) {
          const data = await response.json();
          if (data.rates?.EUR) {
            setRate(data.rates.EUR);
          }
        }
      } catch (error) {
        console.error("Error fetching exchange rate:", error);
        // Keep fallback rate
      } finally {
        setLoading(false);
      }
    };

    fetchRate();
  }, []);

  const convertToEur = (usdAmount: number): number => {
    return usdAmount * rate;
  };

  const convertToUsd = (eurAmount: number): number => {
    return rate > 0 ? eurAmount / rate : eurAmount;
  };

  return { rate, loading, convertToEur, convertToUsd };
}
