
BEGIN;

-- 1. Historische beschikbaarheid

CREATE TABLE public.availability_history (

    user_id UUID NOT NULL
        REFERENCES auth.users(id)
        ON DELETE CASCADE,

    date DATE NOT NULL,

    available_minutes INTEGER NOT NULL
        CHECK (
            available_minutes BETWEEN 0 AND 1440
        ),

    fixed_workout TEXT,

    frozen_at TIMESTAMPTZ NOT NULL
        DEFAULT now(),

    PRIMARY KEY (user_id, date)
);


-- 2. Row Level Security

ALTER TABLE public.availability_history
ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Read own history"
ON public.availability_history
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Insert own history"
ON public.availability_history
FOR INSERT
TO authenticated
WITH CHECK (
    auth.uid() = user_id
    AND date <
        (now() AT TIME ZONE 'Europe/Amsterdam')::date
);

REVOKE ALL
ON public.availability_history
FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT
ON public.availability_history
TO authenticated;


-- 3. Functie om verstreken dagen te bevriezen

CREATE OR REPLACE FUNCTION
public.freeze_past_availability()

RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''

AS $$
DECLARE

    v_user_id UUID := auth.uid();

    v_today DATE :=
        (now() AT TIME ZONE 'Europe/Amsterdam')::date;

    v_monday DATE :=
        v_today -
        (EXTRACT(ISODOW FROM v_today)::INTEGER - 1);

BEGIN

    IF v_user_id IS NULL THEN

        RAISE EXCEPTION 'Not authenticated';

    END IF;

    INSERT INTO public.availability_history (
        user_id,
        date,
        available_minutes,
        fixed_workout
    )

    SELECT

        v_user_id,

        v_monday + g.day_offset,

        COALESCE(
            o.available_minutes,
            w.available_minutes,
            0
        ),

        CASE
            WHEN o.date IS NOT NULL
                THEN o.fixed_workout
            ELSE w.fixed_workout
        END

    FROM generate_series(
        0,
        v_today - v_monday - 1
    ) AS g(day_offset)

    LEFT JOIN public.weekly_availability w
        ON w.user_id = v_user_id

        AND w.weekday = (
            ARRAY[
                'Maandag',
                'Dinsdag',
                'Woensdag',
                'Donderdag',
                'Vrijdag',
                'Zaterdag',
                'Zondag'
            ]
        )[g.day_offset + 1]

    LEFT JOIN public.availability_overrides o
        ON o.user_id = v_user_id
        AND o.date = v_monday + g.day_offset

    ON CONFLICT (user_id, date)
    DO NOTHING;

END;
$$;

REVOKE ALL
ON FUNCTION public.freeze_past_availability()
FROM PUBLIC, anon;

GRANT EXECUTE
ON FUNCTION public.freeze_past_availability()
TO authenticated;


-- 4. Triggerfunctie voor de standaardweek

CREATE OR REPLACE FUNCTION
public.freeze_before_weekly_change()

RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''

AS $$
BEGIN

    IF auth.uid() IS NOT NULL THEN

        PERFORM
            public.freeze_past_availability();

    END IF;

    RETURN NULL;

END;
$$;


-- 5. Trigger activeren

CREATE TRIGGER freeze_before_weekly_change

BEFORE INSERT OR UPDATE OR DELETE

ON public.weekly_availability

FOR EACH STATEMENT

EXECUTE FUNCTION
    public.freeze_before_weekly_change();


COMMIT;
