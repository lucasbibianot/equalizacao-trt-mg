import { createClient } from '@supabase/supabase-js';

export const supabase = createClient('https://xefqxxnuhyoghhqurkfs.supabase.co', 'sb_publishable_tHKiXljmbZzzGLABWusxtA_gaSC0gqd', {
  auth: { flowType: 'pkce' }
});
