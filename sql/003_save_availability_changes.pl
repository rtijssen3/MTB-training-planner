
BEGIN;

CREATE OR REPLACE FUNCTION
public.save_availability_changes(
    p_changes JSONB
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_change JSONB;
    v_date DATE;
    v_action TEXT;
    v_minutes INTEGER;
    v_workout TEXT;
    v_count INTEGER := 0;

BEGIN

    -- 1. Controleer de gebruiker

    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- 2. Controleer de invoer

    IF p_changes IS NULL
       OR jsonb_typeof(p_changes) <> 'array'
    THEN
        RAISE EXCEPTION 'Expected a JSON array';
    END IF;

    IF jsonb_array_length(p_changes) > 14 THEN
        RAISE EXCEPTION 'Maximum 14 changes allowed';
    END IF;

    -- 3. Verwerk iedere wijziging

    FOR v_change IN
        SELECT value
        FROM jsonb_array_elements(p_changes)

    LOOP

        IF jsonb_typeof(v_change) <> 'object' THEN
            RAISE EXCEPTION 'Invalid change';
        END IF;

        v_date := (v_change->>'date')::DATE;
        v_action := v_change->>'action';

        IF v_date IS NULL THEN
            RAISE EXCEPTION 'Date is required';
        END IF;

        IF v_date <
            (now() AT TIME ZONE 'Europe/Amsterdam')::date
        THEN
            RAISE EXCEPTION
                'Past dates cannot be modified';
        END IF;

        -- 4. Afwijking toevoegen of aanpassen

        IF v_action = 'upsert' THEN

            v_minutes :=
                (v_change->>'available_minutes')::INTEGER;

            v_workout :=
                NULLIF(
                    TRIM(v_change->>'fixed_workout'),
                    ''
                );

            IF v_minutes IS NULL
               OR v_minutes < 0
               OR v_minutes > 1440
            THEN
                RAISE EXCEPTION
                    'Invalid available minutes';
            END IF;

            INSERT INTO
                public.availability_overrides (
                    user_id,
                    date,
                    available_minutes,
                    fixed_workout
                )
            VALUES (
                v_user_id,
                v_date,
                v_minutes,
                v_workout
            )
            ON CONFLICT (user_id, date)
            DO UPDATE SET
                available_minutes =
                    EXCLUDED.available_minutes,
                fixed_workout =
                    EXCLUDED.fixed_workout;

        -- 5. Standaardbeschikbaarheid herstellen

        ELSIF v_action = 'delete' THEN

            DELETE FROM
                public.availability_overrides
            WHERE user_id = v_user_id
              AND date = v_date;

        ELSE

            RAISE EXCEPTION 'Invalid action';

        END IF;

        v_count := v_count + 1;

    END LOOP;

    -- 6. Geef het aantal verwerkte wijzigingen terug

    RETURN v_count;

END;
$$;

REVOKE ALL
ON FUNCTION
public.save_availability_changes(JSONB)
FROM PUBLIC, anon;

GRANT EXECUTE
ON FUNCTION
public.save_availability_changes(JSONB)
TO authenticated;

COMMIT;
