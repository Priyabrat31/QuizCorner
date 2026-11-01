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
const normalizeName = (name: string) => name.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
  try {
    const url = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!url || !serviceKey) return json({ error: 'Server configuration is incomplete.' }, 500);
    const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    let body: Record<string, unknown>;
    try { body = await request.json(); } catch { return json({ error: 'Request body must be valid JSON.' }, 400); }

    const scope = body.scope === 'creator' ? 'creator' : body.scope === 'overall' ? 'overall' : null;
    if (!scope) return json({ error: 'Choose a valid leaderboard.' }, 400);
    const studentName = typeof body.studentName === 'string' ? body.studentName.slice(0, 60) : '';
    const normalized = studentName ? normalizeName(studentName) : '';

    let query = admin.from('leaderboard_best').select(
      'quiz_id,creator_id,quiz_title,creator_name,student_name,normalized_name,score,total_questions,time_taken_seconds'
    );
    if (scope === 'creator') {
      const creatorId = body.creatorId;
      if (typeof creatorId !== 'string' || !/^creator-[0-9]{2,}$/.test(creatorId)) {
        return json({ error: 'Invalid creator selection.' }, 400);
      }
      query = query.eq('creator_id', creatorId);
    }
    const { data, error } = await query
      .order('score', { ascending: false })
      .order('time_taken_seconds', { ascending: true })
      .order('normalized_name', { ascending: true })
      .limit(10);
    if (error) throw error;
    const rows = data || [];
    let personalPositions: Record<string, unknown>[] = [];
    if (normalized) {
      const { data: positions, error: positionError } = await admin.rpc('get_personal_leaderboard_positions', {
        p_scope: scope,
        p_creator_id: scope === 'creator' ? body.creatorId : null,
        p_normalized_name: normalized,
      });
      if (positionError) throw positionError;
      personalPositions = (positions || []).filter((row: Record<string, any>) => Number(row.rank) > 10);
    }

    return json({ ok: true, leaderboard: rows, personalPositions });
  } catch (error) {
    console.error('get-leaderboard error:', error);
    return json({ error: 'Unable to load the leaderboard. Please try again later.' }, 500);
  }
});
