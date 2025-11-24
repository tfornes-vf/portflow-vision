-- Create tag_categories table
CREATE TABLE public.tag_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create entity_types table
CREATE TABLE public.entity_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Modify tags table to reference tag_categories and add color
ALTER TABLE public.tags 
  ADD COLUMN category_id UUID REFERENCES public.tag_categories(id) ON DELETE CASCADE,
  ADD COLUMN color_hex TEXT DEFAULT '#3B82F6';

-- Update tags to set category_id based on existing category text
-- First, insert existing categories
INSERT INTO public.tag_categories (name)
SELECT DISTINCT category FROM public.tags
WHERE category IS NOT NULL
ON CONFLICT (name) DO NOTHING;

-- Then update tags with the category_id
UPDATE public.tags t
SET category_id = tc.id
FROM public.tag_categories tc
WHERE t.category = tc.name;

-- Now we can drop the old category column
ALTER TABLE public.tags DROP COLUMN category;

-- Modify entities table to reference entity_types
ALTER TABLE public.entities 
  ADD COLUMN type_id UUID REFERENCES public.entity_types(id) ON DELETE RESTRICT;

-- Insert existing entity types
INSERT INTO public.entity_types (name)
SELECT DISTINCT type FROM public.entities
WHERE type IS NOT NULL
ON CONFLICT (name) DO NOTHING;

-- Update entities with the type_id
UPDATE public.entities e
SET type_id = et.id
FROM public.entity_types et
WHERE e.type = et.name;

-- Drop old type column
ALTER TABLE public.entities DROP COLUMN type;

-- Enable RLS on new tables
ALTER TABLE public.tag_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entity_types ENABLE ROW LEVEL SECURITY;

-- RLS Policies for tag_categories
CREATE POLICY "Admins can manage tag categories"
ON public.tag_categories
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Enabled users can view tag categories"
ON public.tag_categories
FOR SELECT
TO authenticated
USING (EXISTS (
  SELECT 1 FROM profiles
  WHERE profiles.user_id = auth.uid() 
  AND profiles.is_enabled = true
));

-- RLS Policies for entity_types
CREATE POLICY "Admins can manage entity types"
ON public.entity_types
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Enabled users can view entity types"
ON public.entity_types
FOR SELECT
TO authenticated
USING (EXISTS (
  SELECT 1 FROM profiles
  WHERE profiles.user_id = auth.uid() 
  AND profiles.is_enabled = true
));

-- Create triggers for updated_at
CREATE TRIGGER update_tag_categories_updated_at
BEFORE UPDATE ON public.tag_categories
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_entity_types_updated_at
BEFORE UPDATE ON public.entity_types
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();