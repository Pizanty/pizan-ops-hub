DROP TABLE IF EXISTS public.briefings CASCADE;
DROP TABLE IF EXISTS public.telegram_log CASCADE;
ALTER TABLE public.users DROP COLUMN IF EXISTS telegram_chat_id;