-- SplitCoach · videos y PDF privados
-- Se ejecuta en Supabase → SQL Editor, en DOS pasos y en este orden.

-- PASO 1 (antes de publicar la nueva versión de la app)
-- Permite que el coach y los nadadores registrados pidan enlaces temporales
-- de los archivos del bucket "media". No cambia nada de lo que ya funciona.
drop policy if exists media_ver on storage.objects;
create policy media_ver on storage.objects
  for select to authenticated
  using (
    bucket_id = 'media'
    and exists (select 1 from public.miembros m where m.user_id = auth.uid())
  );

-- PASO 2 (después de publicar la nueva versión y comprobar que los videos se ven)
-- Cierra el acceso público: desde aquí, un enlace a un video solo funciona
-- si lo pidió alguien del equipo con sesión iniciada, y caduca a las 6 horas.
-- update storage.buckets set public = false where id = 'media';
