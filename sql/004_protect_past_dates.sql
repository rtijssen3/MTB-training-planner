
BEGIN;

CREATE POLICY "No past date inserts"
ON public.availability_overrides
AS RESTRICTIVE
FOR INSERT
TO authenticated
WITH CHECK (
    date >=
    (now() AT TIME ZONE 'Europe/Amsterdam')::date
);

CREATE POLICY "No past date updates"
ON public.availability_overrides
AS RESTRICTIVE
FOR UPDATE
TO authenticated
USING (
    date >=
    (now() AT TIME ZONE 'Europe/Amsterdam')::date
)
WITH CHECK (
    date >=
    (now() AT TIME ZONE 'Europe/Amsterdam')::date
);

CREATE POLICY "No past date deletes"
ON public.availability_overrides
AS RESTRICTIVE
FOR DELETE
TO authenticated
USING (
    date >=
    (now() AT TIME ZONE 'Europe/Amsterdam')::date
);

COMMIT;
