
CREATE TABLE public.task_stages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  label text NOT NULL,
  position integer NOT NULL DEFAULT 0,
  done boolean NOT NULL DEFAULT false,
  done_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX task_stages_task_id_idx ON public.task_stages(task_id, position);
CREATE INDEX task_stages_user_id_idx ON public.task_stages(user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.task_stages TO authenticated;
GRANT ALL ON public.task_stages TO service_role;

ALTER TABLE public.task_stages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own task stages"
  ON public.task_stages FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.handle_task_stage_done()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.done = true AND (OLD.done IS DISTINCT FROM true) THEN
    NEW.done_at := now();
  ELSIF NEW.done = false THEN
    NEW.done_at := NULL;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER task_stages_done_at
  BEFORE UPDATE ON public.task_stages
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_task_stage_done();

CREATE OR REPLACE FUNCTION public.handle_task_stage_insert()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.done = true AND NEW.done_at IS NULL THEN
    NEW.done_at := now();
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER task_stages_done_at_insert
  BEFORE INSERT ON public.task_stages
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_task_stage_insert();
