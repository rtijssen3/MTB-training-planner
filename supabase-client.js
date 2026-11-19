
import { createClient } from
    'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL = 'https://nsrmtnaifvilicrlzmqi.supabase.co';
const SUPABASE_KEY = 'sb_publishable_drq4lJvBdTasx9MLFWPiXA_6-NuBbQY';

export const supabase = createClient(
    SUPABASE_URL,
    SUPABASE_KEY
);
