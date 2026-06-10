-- RLS / GRANTs verification. Run with: psql -f tests/rls/check-rls.sql
\set ON_ERROR_STOP off
\pset format aligned

\echo === RLS enabled on all public tables ===
SELECT c.relname AS table,
       c.relrowsecurity AS rls_enabled,
       c.relforcerowsecurity AS rls_forced
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public' AND c.relkind = 'r'
 ORDER BY c.relname;

\echo
\echo === Tables in public with ZERO policies (suspicious) ===
SELECT t.tablename
  FROM pg_tables t
  LEFT JOIN pg_policies p ON p.schemaname=t.schemaname AND p.tablename=t.tablename
 WHERE t.schemaname='public'
 GROUP BY t.tablename
HAVING COUNT(p.policyname)=0;

\echo
\echo === GRANTs to authenticated / service_role / anon per table ===
SELECT table_name, grantee, string_agg(privilege_type, ',' ORDER BY privilege_type) AS privs
  FROM information_schema.role_table_grants
 WHERE table_schema='public' AND grantee IN ('anon','authenticated','service_role')
 GROUP BY table_name, grantee
 ORDER BY table_name, grantee;

\echo
\echo === Tables MISSING authenticated grants ===
SELECT t.table_name FROM information_schema.tables t
 WHERE t.table_schema='public' AND t.table_type='BASE TABLE'
   AND NOT EXISTS (
     SELECT 1 FROM information_schema.role_table_grants g
      WHERE g.table_schema='public' AND g.table_name=t.table_name AND g.grantee='authenticated'
   );

\echo
\echo === Tables MISSING service_role grants ===
SELECT t.table_name FROM information_schema.tables t
 WHERE t.table_schema='public' AND t.table_type='BASE TABLE'
   AND NOT EXISTS (
     SELECT 1 FROM information_schema.role_table_grants g
      WHERE g.table_schema='public' AND g.table_name=t.table_name AND g.grantee='service_role'
   );

\echo
\echo === Tables that grant SELECT to anon (verify each is intentionally public) ===
SELECT table_name FROM information_schema.role_table_grants
 WHERE table_schema='public' AND grantee='anon' AND privilege_type='SELECT';

\echo
\echo === Policy summary (table, name, command, qual) ===
SELECT tablename, policyname, cmd, COALESCE(qual,'(no USING)') AS qual
  FROM pg_policies WHERE schemaname='public'
 ORDER BY tablename, policyname;

\echo
\echo === Functions with SECURITY DEFINER (must set search_path) ===
SELECT n.nspname AS schema, p.proname AS function, p.prosecdef AS sec_def,
       array_to_string(p.proconfig,', ') AS settings
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.prosecdef=true
 ORDER BY p.proname;

\echo
\echo === RLS Simulation: as user A, can read own task? ===
DO $$
DECLARE
  user_a uuid;
  task_id uuid;
  ok boolean;
BEGIN
  SELECT id INTO user_a FROM auth.users ORDER BY created_at LIMIT 1;
  IF user_a IS NULL THEN
    RAISE NOTICE 'No users in auth.users — skipping RLS simulation';
    RETURN;
  END IF;
  RAISE NOTICE 'Simulating user_a=%', user_a;

  -- create a task as service role
  INSERT INTO public.tasks (id, user_id, title, domain, priority, status)
  VALUES (gen_random_uuid(), user_a, '__rls_test__', 'OPS', 3, 'TODO')
  RETURNING id INTO task_id;

  -- impersonate user A
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', user_a::text, 'role','authenticated')::text, true);

  SELECT EXISTS (SELECT 1 FROM public.tasks WHERE id=task_id) INTO ok;
  RAISE NOTICE 'User A can read own task: %', ok;

  -- reset and clean up
  PERFORM set_config('role', 'postgres', true);
  DELETE FROM public.tasks WHERE id=task_id;
END $$;
