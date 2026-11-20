
BEGIN;

-- 1. Revisietabel

CREATE TABLE public.availability_revision (

    user_id UUID PRIMARY KEY
        REFERENCES auth.users(id)
        ON DELETE CASCADE,

    revision BIGINT NOT NULL DEFAULT 0

);

ALTER TABLE public.availability_revision
ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Read own revision"
ON public.availability_revision
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

REVOKE ALL
ON public.availability_revision
FROM PUBLIC, anon, authenticated;

GRANT SELECT
ON public.availability_revision
TO authenticated;


-- 2. Revisienummer ophalen

CREATE OR REPLACE FUNCTION
public.get_availability_revision()

RETURNS BIGINT
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''

AS $$

    SELECT COALESCE(
        (
            SELECT revision
            FROM public.availability_revision
            WHERE user_id = auth.uid()
        ),
        0
    );

$$;


-- 3. Revisie automatisch verhogen
--    en gelijktijdige writes serialiseren

CREATE OR REPLACE FUNCTION
public.bump_availability_revision()

RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''

AS $$
DECLARE

    v_user_id UUID := auth.uid();

BEGIN

    IF v_user_id IS NULL THEN
        RETURN NULL;
    END IF;

    PERFORM pg_advisory_xact_lock(
        hashtextextended(
            v_user_id::TEXT, 0
        )
    );

    INSERT INTO public.availability_revision (
        user_id,
        revision
    )
    VALUES (
        v_user_id,
        1
    )
    ON CONFLICT (user_id)
    DO UPDATE SET revision =
        public.availability_revision.revision + 1;

    RETURN NULL;

END;
$$;


-- 4. Triggers activeren

CREATE TRIGGER aa_revision_weekly

BEFORE INSERT OR UPDATE OR DELETE
ON public.weekly_availability

FOR EACH STATEMENT

EXECUTE FUNCTION
    public.bump_availability_revision();


CREATE TRIGGER aa_revision_overrides

BEFORE INSERT OR UPDATE OR DELETE
ON public.availability_overrides

FOR EACH STATEMENT

EXECUTE FUNCTION
    public.bump_availability_revision();


-- 5. Controleren op revisieconflicten

CREATE OR REPLACE FUNCTION
public.check_availability_revision(
    p_expected_revision BIGINT
)

RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''

AS $$
DECLARE

    v_user_id UUID := auth.uid();

BEGIN

    IF v_user_id IS NULL THEN

        RAISE EXCEPTION 'Not authenticated';

    END IF;

    PERFORM pg_advisory_xact_lock(
        hashtextextended(
            v_user_id::TEXT, 0
        )
    );

    IF p_expected_revision IS DISTINCT FROM
        public.get_availability_revision()
    THEN

        RAISE EXCEPTION 'AVAILABILITY_CONFLICT';

    END IF;

END;
$$;


-- 6. Kalenderwijzigingen gecontroleerd opslaan

CREATE OR REPLACE FUNCTION
public.save_calendar_checked(
    p_changes JSONB,
    p_expected_revision BIGINT
)

RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''

AS $$
DECLARE

    v_count INTEGER;

BEGIN

    PERFORM public.check_availability_revision(
        p_expected_revision
    );

    SELECT public.save_availability_changes(
        p_changes
    )
    INTO v_count;

    RETURN jsonb_build_object(
        'saved_count', v_count,
        'revision',
        public.get_availability_revision()
    );

END;
$$;


-- 7. Standaardweek gecontroleerd opslaan

CREATE OR REPLACE FUNCTION
public.save_weekly_checked(
    p_rows JSONB,
    p_expected_revision BIGINT
)

RETURNS BIGINT
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''

AS $$
DECLARE

    v_user_id UUID := auth.uid();

BEGIN

    PERFORM public.check_availability_revision(
        p_expected_revision
    );

    IF p_rows IS NULL
       OR jsonb_typeof(p_rows) <> 'array'
    THEN

        RAISE EXCEPTION 'Expected an array';

    END IF;

    IF jsonb_array_length(p_rows) <> 7 THEN

        RAISE EXCEPTION 'Expected seven weekdays';

    END IF;

    INSERT INTO public.weekly_availability (
        user_id,
        weekday,
        available_minutes,
        fixed_workout
    )

    SELECT

        v_user_id,
        row.weekday,
        row.available_minutes,
        row.fixed_workout

    FROM jsonb_to_recordset(p_rows) AS row (
        weekday TEXT,
        available_minutes INTEGER,
        fixed_workout TEXT
    )

    ON CONFLICT (user_id, weekday)
    DO UPDATE SET

        available_minutes =
            EXCLUDED.available_minutes,

        fixed_workout =
            EXCLUDED.fixed_workout;

    RETURN public.get_availability_revision();

END;
$$;


-- 8. Functierechten

REVOKE ALL ON FUNCTION
public.bump_availability_revision()
FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION
public.get_availability_revision()
FROM PUBLIC, anon;

REVOKE ALL ON FUNCTION
public.check_availability_revision(BIGINT)
FROM PUBLIC, anon;

REVOKE ALL ON FUNCTION
public.save_calendar_checked(JSONB, BIGINT)
FROM PUBLIC, anon;

REVOKE ALL ON FUNCTION
public.save_weekly_checked(JSONB, BIGINT)
FROM PUBLIC, anon;


GRANT EXECUTE ON FUNCTION
public.get_availability_revision()
TO authenticated;

GRANT EXECUTE ON FUNCTION
public.check_availability_revision(BIGINT)
TO authenticated;

GRANT EXECUTE ON FUNCTION
public.save_calendar_checked(JSONB, BIGINT)
TO authenticated;

GRANT EXECUTE ON FUNCTION
public.save_weekly_checked(JSONB, BIGINT)
TO authenticated;

COMMIT;
