
# Plan: Filtro por Account ID en Trading

## Resumen
Implementar selector de cuenta en la pantalla de Trading para filtrar trades, estadisticas y saldo por cuenta IBKR. Se añadira soporte para la segunda cuenta con ID `138538827070437630935960`.

## Configuracion de Cuentas

| Account ID | Nombre | Balance Inicial | Flex Query ID | Exclusiones |
|------------|--------|-----------------|---------------|-------------|
| U22563190 | Cuenta Principal | $524,711.04 | IBKR_ID_HISTORIA / IBKR_ID_HOY | Ninguna |
| 138538827070437630935960 | TSC | $430,702 | 1380264 | Antes del 15 Ene 2025 |

## Pasos de Implementacion

### Paso 1: Configurar Secrets
Añadir los secrets necesarios para la segunda cuenta:
- `IBKR_ID_HISTORIA_2` = `1380264`
- `IBKR_INITIAL_BALANCE_2` = `430702`

### Paso 2: Actualizar Edge Function `sync-ibkr-trades`

Modificar para soportar sincronizacion multi-cuenta:

1. **Recibir parametro `accountId`** en el body de la request
2. **Mapear cuenta a configuracion**:
   - Si `accountId` es `U22563190` o no especificado: usar secrets actuales
   - Si `accountId` es `138538827070437630935960`: usar `IBKR_ID_HISTORIA_2`
3. **Balance inicial por cuenta**: Usar el balance inicial correspondiente segun la cuenta
4. **Calcular `saldo_actual` independientemente** por cuenta

### Paso 3: Actualizar UI de Trading

**Nuevos elementos:**

1. **Selector de Cuenta** (dropdown al lado del boton Refresh):
   - "U22563190 (Principal)" - seleccionada por defecto
   - "TSC (138538...)" 
   - "Todas las cuentas"

2. **Nuevo estado**:
```typescript
const [selectedAccount, setSelectedAccount] = useState<string>("U22563190");
```

3. **Configuracion de cuentas** (constante):
```typescript
const ACCOUNT_CONFIG = {
  "U22563190": {
    name: "Principal",
    initialBalance: 524711.04,
  },
  "138538827070437630935960": {
    name: "TSC",
    initialBalance: 430702,
    excludeBefore: new Date("2025-01-15"),
  },
};
```

**Logica de filtrado:**

1. Filtrar `rawTrades` por `account_id` cuando hay cuenta seleccionada
2. Para cuenta TSC: excluir trades anteriores al 15 de enero 2025
3. Este filtro se aplica ANTES de los demas filtros (periodo, exclusiones)

**Recalculo de KPIs:**

- Usar el `initialBalance` de la cuenta seleccionada para calculos de retorno
- El `saldo_actual` se filtra por cuenta
- Los KPIs (Win Rate, P&L, etc.) solo consideran trades de la cuenta seleccionada

**Sincronizacion:**

- Al hacer "Refresh Trades", sincronizar la cuenta seleccionada
- Si esta en "Todas", sincronizar ambas secuencialmente

## Archivos a Modificar

| Archivo | Cambios |
|---------|---------|
| `supabase/functions/sync-ibkr-trades/index.ts` | Soporte multi-cuenta con parametro accountId |
| `src/pages/Trading.tsx` | Selector de cuenta, filtrado por account_id, logica de exclusion por fecha |

## Flujo de Usuario

1. Usuario abre Trading → ve trades de cuenta Principal (U22563190) por defecto
2. Selecciona "TSC" en el dropdown → ve solo trades de esa cuenta (post 15 Ene 2025)
3. Los KPIs y graficos se recalculan para esa cuenta
4. Al hacer "Refresh Trades" → sincroniza solo la cuenta seleccionada
5. Puede seleccionar "Todas las cuentas" para ver todo combinado

## Consideraciones Tecnicas

- El filtro de fecha (15 Ene 2025) para TSC se aplica en el frontend, no en la BD
- Cada cuenta tiene su propio calculo de `saldo_actual` basado en su balance inicial
- Los secrets IBKR_TOKEN se comparten entre cuentas (segun mencionaste es el mismo token)
