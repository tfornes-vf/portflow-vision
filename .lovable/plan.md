

# Plan: Filtro por Account ID en Trading

## Resumen
Implementar la capacidad de filtrar trades por cuenta (account_id) en la pantalla de Trading, añadiendo soporte para una segunda cuenta IBKR con ID `138538827070437630935960`.

## Decisiones de Diseño

**Usar la misma tabla `ib_trades`**: Es la mejor opción porque:
- Ya tiene la columna `account_id`
- Permite consultas unificadas cuando se quiera ver todo
- No duplica estructura ni código

## Pasos de Implementación

### 1. Añadir Nuevos Secrets
Se necesitan los Flex Query IDs para la nueva cuenta:
- `IBKR_ID_HISTORIA_2` - ID del reporte histórico de la segunda cuenta
- `IBKR_ID_HOY_2` - ID del reporte del día de la segunda cuenta
- `IBKR_INITIAL_BALANCE_2` - Balance inicial de la segunda cuenta (si es diferente)

### 2. Actualizar Edge Function `sync-ibkr-trades`

**Cambios:**
- Recibir parámetro `accountId` en el body de la request
- Mapear el accountId a los secrets correspondientes:
  ```
  U22563190 → IBKR_ID_HISTORIA, IBKR_ID_HOY, INITIAL_BALANCE = 524711.04
  138538827070437630935960 → IBKR_ID_HISTORIA_2, IBKR_ID_HOY_2, INITIAL_BALANCE_2
  ```
- Calcular el `saldo_actual` de forma independiente por cuenta
- Usar el mismo IBKR_TOKEN (asumiendo que es compartido)

### 3. Actualizar UI de Trading (`src/pages/Trading.tsx`)

**Nuevo estado:**
```typescript
const [selectedAccount, setSelectedAccount] = useState<string>("ALL");
```

**Nuevo selector** (al lado del botón Refresh):
- Dropdown con opciones:
  - "Todas las cuentas" (ALL)
  - "U22563190" (cuenta 1)
  - "138538827070437630935960" (cuenta 2)

**Filtrado de datos:**
- `filteredByAccount` que filtra `rawTrades` por `account_id` cuando no es "ALL"
- Este filtro se aplica antes de los demás filtros (periodo, exclusiones)

**Sincronización:**
- Cuando se hace refresh, sincronizar solo la cuenta seleccionada (si hay una específica)
- Si está en "ALL", sincronizar ambas cuentas secuencialmente

**Recálculo de KPIs:**
- Los KPIs se calculan solo sobre los trades de la cuenta seleccionada
- El `saldo_actual` ya viene calculado por cuenta desde el edge function

### 4. Configuración de Cuentas

Crear un objeto de configuración para las cuentas:
```typescript
const ACCOUNT_CONFIG = {
  "U22563190": {
    name: "Cuenta Principal",
    initialBalance: 524711.04,
  },
  "138538827070437630935960": {
    name: "Cuenta Secundaria", 
    initialBalance: 0, // Se definirá cuando se añadan los secrets
  },
};
```

## Flujo de Usuario

1. Usuario entra a Trading → ve todas las cuentas por defecto
2. Selecciona una cuenta específica en el dropdown
3. Los datos se filtran automáticamente
4. Al hacer "Refresh Trades", solo sincroniza esa cuenta
5. Los KPIs muestran métricas de la cuenta seleccionada

## Dependencias

Antes de implementar necesito que proporciones:
1. Los IDs de Flex Query para la segunda cuenta (IBKR_ID_HISTORIA_2 y IBKR_ID_HOY_2)
2. El balance inicial de la segunda cuenta
3. Confirmar si el IBKR_TOKEN es el mismo para ambas cuentas

## Archivos a Modificar

| Archivo | Cambios |
|---------|---------|
| `supabase/functions/sync-ibkr-trades/index.ts` | Soporte multi-cuenta |
| `src/pages/Trading.tsx` | Selector de cuenta + filtrado |

