-- Modificar el trigger handle_new_user para que nuevos usuarios estén deshabilitados por defecto
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, email, full_name, is_enabled)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    -- Solo habilitar automáticamente si es el admin principal
    CASE WHEN NEW.email = 'antonifornes@gmail.com' THEN true ELSE false END
  );
  RETURN NEW;
END;
$$;