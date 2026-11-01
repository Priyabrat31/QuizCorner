import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json' },
});

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
  try {
    const url = Deno.env.get('SUPABASE_URL');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!url || !anonKey || !serviceKey) return json({ error: 'Server configuration is incomplete.' }, 500);

    const bearer = request.headers.get('Authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!bearer) return json({ error: 'Your browser history session is unavailable.' }, 401);
    const authClient = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: authData, error: authError } = await authClient.auth.getUser(bearer);
    const user = authData?.user;
    if (authError || !user || user.is_anonymous !== true) {
      return json({ error: 'A valid anonymous browser session is required.' }, 401);
    }

    let body: Record<string, unknown> = {};
    try { body = await request.json(); } catch { /* An empty body is acceptable. */ }
    const requestedLimit = Number(body.limit || 500);
    const limit = Math.max(1, Math.min(1000, Number.isFinite(requestedLimit) ? Math.floor(requestedLimit) : 500));

    const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await admin.from('quiz_attempts')
      .select('creator_id,quiz_title,score,created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;

    const history = (data || []).map((row) => ({
      creator_id: row.creator_id,
      quiz_name: row.quiz_title,
      score: row.score,
      created_at: row.created_at,
    }));
    return json({ ok: true, history });
  } catch (error) {
    console.error('get-history error:', error);
    return json({ error: 'Unable to load your history. Please try again later.' }, 500);
  }
});
