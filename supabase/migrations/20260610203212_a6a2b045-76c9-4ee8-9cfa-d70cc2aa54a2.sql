
-- Allow developers to read all dev items
DROP POLICY IF EXISTS "Developers read own dev items" ON public.dev_items;
CREATE POLICY "Developers read all dev items"
  ON public.dev_items FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'developer'::public.app_role));

-- Bulk-assign all unassigned dev items to Idan (bypass protective trigger)
ALTER TABLE public.dev_items DISABLE TRIGGER USER;
UPDATE public.dev_items
  SET assigned_to = '13c6a9f6-ffb0-49ab-ab77-952f60004b3f'
  WHERE assigned_to IS NULL;
ALTER TABLE public.dev_items ENABLE TRIGGER USER;
