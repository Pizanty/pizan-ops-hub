DROP POLICY IF EXISTS "Authenticated users can view attachments" ON public.attachments;

CREATE POLICY "Uploader or admin can view attachments"
ON public.attachments
FOR SELECT
TO authenticated
USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));