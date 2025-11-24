-- Add entity_id to tags for hybrid global/local tags
ALTER TABLE public.tags 
ADD COLUMN entity_id uuid REFERENCES public.entities(id) ON DELETE CASCADE;

-- Add index for faster queries on entity-specific tags
CREATE INDEX idx_tags_entity_id ON public.tags(entity_id);

-- Add comment explaining the hybrid system
COMMENT ON COLUMN public.tags.entity_id IS 
'NULL = Global tag (visible to all entities). Non-NULL = Local tag (specific to one entity).';