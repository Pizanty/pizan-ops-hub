
-- Trigger-only functions: revoke all client EXECUTE; triggers still fire.
REVOKE EXECUTE ON FUNCTION public.handle_task_completion() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_dev_item_resolution() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_dev_item_changes() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_task_stage_insert() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_task_stage_done() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.prevent_dev_items_protected_columns() FROM PUBLIC, anon, authenticated;

-- has_role: revoke from anon (used only by authenticated RLS evaluation)
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;
