ALTER TABLE public.dev_items ADD COLUMN IF NOT EXISTS priority text;
ALTER TABLE public.dev_items DROP CONSTRAINT IF EXISTS dev_items_priority_check;
ALTER TABLE public.dev_items ADD CONSTRAINT dev_items_priority_check CHECK (priority IS NULL OR priority IN ('P1','P2','P3'));
UPDATE public.dev_items SET priority = REPLACE(severity, 'S', 'P') WHERE priority IS NULL AND severity IS NOT NULL;

ALTER TABLE public.dev_items ADD COLUMN IF NOT EXISTS blocked_by uuid[] NOT NULL DEFAULT '{}';
CREATE INDEX IF NOT EXISTS dev_items_blocked_by_idx ON public.dev_items USING GIN (blocked_by);