
-- 1. Storage: restrict attachment reads to owner or admin
DROP POLICY IF EXISTS "Authenticated can read attachments objects" ON storage.objects;
CREATE POLICY "Owner or admin can read attachments objects"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'attachments'
  AND (auth.uid() = owner OR public.has_role(auth.uid(), 'admin'::public.app_role))
);

-- 2. business_context: allow users to manage their own rows
CREATE POLICY "Users manage own business context"
ON public.business_context FOR ALL TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- 3. lead_contacts: allow users to manage their own rows
CREATE POLICY "Users manage own lead contacts"
ON public.lead_contacts FOR ALL TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- 4. leads: allow users to manage their own rows
CREATE POLICY "Users manage own leads"
ON public.leads FOR ALL TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- 5. dev_items developer update: enforce role in WITH CHECK
DROP POLICY IF EXISTS "Developers update own dev items" ON public.dev_items;
CREATE POLICY "Developers update own dev items"
ON public.dev_items FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'developer'::public.app_role) AND assigned_to = auth.uid())
WITH CHECK (public.has_role(auth.uid(), 'developer'::public.app_role) AND assigned_to = auth.uid());

-- 5b. dev_items: prevent non-admins from changing created_by or reassigning
CREATE OR REPLACE FUNCTION public.prevent_dev_items_protected_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RETURN NEW;
  END IF;
  IF NEW.created_by IS DISTINCT FROM OLD.created_by THEN
    RAISE EXCEPTION 'Cannot modify created_by';
  END IF;
  IF NEW.assigned_to IS DISTINCT FROM OLD.assigned_to THEN
    RAISE EXCEPTION 'Cannot reassign dev item';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS dev_items_protect_columns ON public.dev_items;
CREATE TRIGGER dev_items_protect_columns
BEFORE UPDATE ON public.dev_items
FOR EACH ROW EXECUTE FUNCTION public.prevent_dev_items_protected_columns();
