-- ============================================
-- FAMILY OFFICE MVP - SCHEMA COMPLETO
-- ============================================

-- 2. TABLA DE TENANTS (Multi-tenancy)
CREATE TABLE public.tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;

-- 3. TABLA DE ENTITIES (Árbol Jerárquico)
CREATE TABLE public.entities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES public.entities(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('Holding', 'Trust', 'Company', 'Other')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.entities ENABLE ROW LEVEL SECURITY;

-- 4. TABLA DE ASSETS (Inventario)
CREATE TABLE public.assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id UUID NOT NULL REFERENCES public.entities(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  asset_class_hard TEXT NOT NULL CHECK (asset_class_hard IN ('Liquid', 'Illiquid')),
  currency_local TEXT NOT NULL DEFAULT 'EUR',
  cost_basis NUMERIC(15, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.assets ENABLE ROW LEVEL SECURITY;

-- 5. TABLA DE MARKET VALUES (Histórico de valoraciones)
CREATE TABLE public.market_values (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id UUID NOT NULL REFERENCES public.assets(id) ON DELETE CASCADE,
  valuation_date DATE NOT NULL DEFAULT CURRENT_DATE,
  value_local NUMERIC(15, 2) NOT NULL,
  value_base NUMERIC(15, 2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(asset_id, valuation_date)
);

ALTER TABLE public.market_values ENABLE ROW LEVEL SECURITY;

-- 6. TABLA DE TAGS (Sistema de etiquetado flexible)
CREATE TABLE public.tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tenant_id, category, name)
);

ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;

-- 7. TABLA PIVOTE ASSET_TAGS
CREATE TABLE public.asset_tags (
  asset_id UUID NOT NULL REFERENCES public.assets(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (asset_id, tag_id)
);

ALTER TABLE public.asset_tags ENABLE ROW LEVEL SECURITY;

-- ============================================
-- TRIGGERS PARA UPDATED_AT
-- ============================================

CREATE TRIGGER update_entities_updated_at
  BEFORE UPDATE ON public.entities
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_assets_updated_at
  BEFORE UPDATE ON public.assets
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- ROW LEVEL SECURITY POLICIES
-- ============================================

-- TENANTS: Solo admins pueden ver/gestionar tenants
CREATE POLICY "Admins can manage tenants"
  ON public.tenants
  FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Enabled users can view tenants"
  ON public.tenants
  FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE user_id = auth.uid() AND is_enabled = true
  ));

-- ENTITIES: Filtrado por tenant_id
CREATE POLICY "Admins can manage entities"
  ON public.entities
  FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Enabled users can view entities"
  ON public.entities
  FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE user_id = auth.uid() AND is_enabled = true
  ));

-- ASSETS: Filtrado por tenant_id a través de entities
CREATE POLICY "Admins can manage assets"
  ON public.assets
  FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Enabled users can view assets"
  ON public.assets
  FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE user_id = auth.uid() AND is_enabled = true
  ));

-- MARKET_VALUES: Heredan permisos de assets
CREATE POLICY "Admins can manage market values"
  ON public.market_values
  FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Enabled users can view market values"
  ON public.market_values
  FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE user_id = auth.uid() AND is_enabled = true
  ));

-- TAGS: Filtrado por tenant_id
CREATE POLICY "Admins can manage tags"
  ON public.tags
  FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Enabled users can view tags"
  ON public.tags
  FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE user_id = auth.uid() AND is_enabled = true
  ));

-- ASSET_TAGS: Heredan permisos de assets
CREATE POLICY "Admins can manage asset tags"
  ON public.asset_tags
  FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Enabled users can view asset tags"
  ON public.asset_tags
  FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE user_id = auth.uid() AND is_enabled = true
  ));

-- ============================================
-- DATOS SEMILLA (SEED DATA)
-- ============================================

-- Crear tenant principal
INSERT INTO public.tenants (id, name) 
VALUES ('00000000-0000-0000-0000-000000000001', 'Family Office Principal');

-- Crear TAGS para el sistema de filtrado
INSERT INTO public.tags (tenant_id, category, name) VALUES
  ('00000000-0000-0000-0000-000000000001', 'Status', 'Afecto'),
  ('00000000-0000-0000-0000-000000000001', 'Status', 'No Afecto'),
  ('00000000-0000-0000-0000-000000000001', 'Type', 'Private Equity'),
  ('00000000-0000-0000-0000-000000000001', 'Type', 'Stocks'),
  ('00000000-0000-0000-0000-000000000001', 'Type', 'Real Estate'),
  ('00000000-0000-0000-0000-000000000001', 'Type', 'Bonds'),
  ('00000000-0000-0000-0000-000000000001', 'Bank', 'Andbank'),
  ('00000000-0000-0000-0000-000000000001', 'Bank', 'Santander'),
  ('00000000-0000-0000-0000-000000000001', 'Bank', 'CaixaBank'),
  ('00000000-0000-0000-0000-000000000001', 'Bank', 'Creand'),
  ('00000000-0000-0000-0000-000000000001', 'Country', 'ES'),
  ('00000000-0000-0000-0000-000000000001', 'Country', 'AD');

-- Crear estructura de ENTITIES (árbol jerárquico)
-- Nivel 1: Holding Principal
INSERT INTO public.entities (id, tenant_id, parent_id, name, type) VALUES
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', NULL, 'Y Capital Holding', 'Holding');

-- Nivel 2: Empresas bajo el Holding
INSERT INTO public.entities (id, tenant_id, parent_id, name, type) VALUES
  ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Finca Manzanares SL', 'Company'),
  ('20000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Tech Ventures SA', 'Company'),
  ('20000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Family Trust 2024', 'Trust');

-- Crear ASSETS de ejemplo
INSERT INTO public.assets (id, entity_id, name, asset_class_hard, currency_local, cost_basis) VALUES
  -- Assets de Finca Manzanares
  ('a0000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'Edificio Oficinas Madrid', 'Illiquid', 'EUR', 2500000),
  ('a0000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', 'Acciones Telefónica', 'Liquid', 'EUR', 150000),
  -- Assets de Tech Ventures
  ('a0000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000002', 'Participación Startup AI', 'Illiquid', 'USD', 500000),
  ('a0000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-000000000002', 'Portfolio ETFs Tech', 'Liquid', 'USD', 300000),
  -- Assets del Trust
  ('a0000000-0000-0000-0000-000000000005', '20000000-0000-0000-0000-000000000003', 'Bonos Estado Español', 'Liquid', 'EUR', 800000),
  ('a0000000-0000-0000-0000-000000000006', '20000000-0000-0000-0000-000000000003', 'Finca Rural Andalucía', 'Illiquid', 'EUR', 1200000);

-- Crear MARKET_VALUES (valoraciones actuales)
INSERT INTO public.market_values (asset_id, valuation_date, value_local, value_base) VALUES
  ('a0000000-0000-0000-0000-000000000001', CURRENT_DATE, 2800000, 2800000),
  ('a0000000-0000-0000-0000-000000000002', CURRENT_DATE, 165000, 165000),
  ('a0000000-0000-0000-0000-000000000003', CURRENT_DATE, 650000, 585000),
  ('a0000000-0000-0000-0000-000000000004', CURRENT_DATE, 320000, 288000),
  ('a0000000-0000-0000-0000-000000000005', CURRENT_DATE, 795000, 795000),
  ('a0000000-0000-0000-0000-000000000006', CURRENT_DATE, 1350000, 1350000);

-- Asignar TAGS a los assets
INSERT INTO public.asset_tags (asset_id, tag_id) 
SELECT 
  a.id,
  t.id
FROM public.assets a
CROSS JOIN public.tags t
WHERE 
  -- Edificio Oficinas: Real Estate, Afecto, España, Andbank
  (a.id = 'a0000000-0000-0000-0000-000000000001' AND t.name IN ('Real Estate', 'Afecto', 'ES', 'Andbank'))
  OR
  -- Acciones Telefónica: Stocks, No Afecto, España, Santander
  (a.id = 'a0000000-0000-0000-0000-000000000002' AND t.name IN ('Stocks', 'No Afecto', 'ES', 'Santander'))
  OR
  -- Startup AI: Private Equity, Afecto, Andorra
  (a.id = 'a0000000-0000-0000-0000-000000000003' AND t.name IN ('Private Equity', 'Afecto', 'AD'))
  OR
  -- ETFs Tech: Stocks, No Afecto, CaixaBank
  (a.id = 'a0000000-0000-0000-0000-000000000004' AND t.name IN ('Stocks', 'No Afecto', 'CaixaBank'))
  OR
  -- Bonos Estado: Bonds, Afecto, España, Creand
  (a.id = 'a0000000-0000-0000-0000-000000000005' AND t.name IN ('Bonds', 'Afecto', 'ES', 'Creand'))
  OR
  -- Finca Rural: Real Estate, Afecto, España, Andbank
  (a.id = 'a0000000-0000-0000-0000-000000000006' AND t.name IN ('Real Estate', 'Afecto', 'ES', 'Andbank'));
