
-- Attachments table for tasks and dev_items
CREATE TABLE public.attachments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('task','dev_item')),
  entity_id UUID NOT NULL,
  bucket TEXT NOT NULL DEFAULT 'attachments',
  storage_path TEXT NOT NULL,
  filename TEXT NOT NULL,
  mime_type TEXT,
  size_bytes BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.attachments TO authenticated;
GRANT ALL ON public.attachments TO service_role;

ALTER TABLE public.attachments ENABLE ROW LEVEL SECURITY;

-- Both admins and developers in this workspace can read/write attachments.
-- Mirrors the existing tasks/dev_items access pattern (single-workspace app).
CREATE POLICY "Authenticated users can view attachments"
  ON public.attachments FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert attachments"
  ON public.attachments FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Uploader or admin can delete attachments"
  ON public.attachments FOR DELETE TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE INDEX attachments_entity_idx ON public.attachments (entity_type, entity_id);
CREATE INDEX attachments_user_idx ON public.attachments (user_id);

-- Storage policies on the private 'attachments' bucket
CREATE POLICY "Authenticated can read attachments objects"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'attachments');

CREATE POLICY "Authenticated can upload attachments objects"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'attachments' AND auth.uid() = owner);

CREATE POLICY "Owner or admin can delete attachments objects"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'attachments' AND (auth.uid() = owner OR public.has_role(auth.uid(), 'admin')));
