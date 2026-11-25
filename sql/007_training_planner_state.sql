-- 007: one versioned planner snapshot per authenticated user. Existing tables untouched.
BEGIN;
CREATE TABLE IF NOT EXISTS public.training_planner_state (
 user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
 revision bigint NOT NULL CHECK (revision > 0),
 snapshot jsonb NOT NULL CHECK (jsonb_typeof(snapshot)='object' AND octet_length(snapshot::text)<=2000000),
 updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.training_planner_state ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.training_planner_state FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.training_planner_state TO authenticated;
DROP POLICY IF EXISTS planner_read_own ON public.training_planner_state;
CREATE POLICY planner_read_own ON public.training_planner_state FOR SELECT TO authenticated USING (user_id=auth.uid());
CREATE OR REPLACE FUNCTION public.save_training_planner_state(p_snapshot jsonb,p_expected_revision bigint)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE uid uuid:=auth.uid(); current_rev bigint; next_rev bigint;
BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
 IF p_snapshot IS NULL OR jsonb_typeof(p_snapshot) IS DISTINCT FROM 'object' OR p_snapshot->>'version' IS DISTINCT FROM '1'
 OR NOT (p_snapshot ? 'plan') OR jsonb_typeof(p_snapshot->'plan') NOT IN ('object','null')
 OR jsonb_typeof(p_snapshot->'weeks') IS DISTINCT FROM 'object' OR octet_length(p_snapshot::text)>2000000 THEN RAISE EXCEPTION 'INVALID_PLANNER_STATE'; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('training-planner:'||uid::text,0));
 SELECT revision INTO current_rev FROM public.training_planner_state WHERE user_id=uid;
 IF coalesce(current_rev,0) IS DISTINCT FROM p_expected_revision THEN RAISE EXCEPTION 'PLANNER_CONFLICT'; END IF;
 next_rev:=coalesce(current_rev,0)+1;
 INSERT INTO public.training_planner_state(user_id,revision,snapshot,updated_at) VALUES(uid,next_rev,p_snapshot,now())
 ON CONFLICT(user_id) DO UPDATE SET revision=EXCLUDED.revision,snapshot=EXCLUDED.snapshot,updated_at=EXCLUDED.updated_at;
 RETURN next_rev;
END; $$;
REVOKE ALL ON FUNCTION public.save_training_planner_state(jsonb,bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_training_planner_state(jsonb,bigint) TO authenticated;
COMMIT;
