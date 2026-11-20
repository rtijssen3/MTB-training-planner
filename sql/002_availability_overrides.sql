
BEGIN;

CREATE TABLE public.availability_overrides (
    id BIGINT GENERATED ALWAYS AS IDENTITY
        PRIMARY KEY,

    user_id UUID NOT NULL
        REFERENCES auth.users(id)
        ON DELETE CASCADE,

    date DATE NOT NULL,

    available_minutes INTEGER NOT NULL
        CHECK (available_minutes BETWEEN 0 AND 1440),

    fixed_workout TEXT,

    UNIQUE (user_id, date)
);

ALTER TABLE public.availability_overrides
ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Access own overrides"
ON public.availability_overrides
FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE
ON public.availability_overrides
TO authenticated;

REVOKE ALL
ON public.availability_overrides
FROM anon;

COMMIT;
