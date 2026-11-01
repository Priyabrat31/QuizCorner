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
const validUuid = (value: unknown) => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !anonKey || !serviceKey) return json({ error: 'Server configuration is incomplete.' }, 500);

    const authHeader = request.headers.get('Authorization');
    const bearer = authHeader?.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!bearer) return json({ error: 'Authentication is required to submit a quiz.' }, 401);

    const authClient = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: authData, error: authError } = await authClient.auth.getUser(bearer);
    const user = authData?.user;
    if (authError || !user || user.is_anonymous !== true) {
      return json({ error: 'A valid anonymous browser session is required.' }, 401);
    }

    let body: Record<string, unknown>;
    try { body = await request.json(); } catch { return json({ error: 'Request body must be valid JSON.' }, 400); }

    const attemptId = body.attemptId;
    const quizId = body.quizId;
    const creatorId = body.creatorId;
    const studentName = typeof body.studentName === 'string' ? body.studentName.normalize('NFKC').trim().replace(/\s+/g, ' ') : '';
    const submittedAnswers = body.answers && typeof body.answers === 'object' && !Array.isArray(body.answers)
      ? body.answers as Record<string, unknown>
      : null;
    const clientTime = Number(body.timeTakenSeconds);

    if (!validUuid(attemptId)) return json({ error: 'Invalid attempt identifier. Please reload the quiz and try again.' }, 400);
    if (typeof quizId !== 'string' || !/^creator-[0-9]{2,}$/.test(quizId)) return json({ error: 'Invalid quiz identifier.' }, 400);
    if (typeof creatorId !== 'string' || creatorId !== quizId) return json({ error: 'Quiz and creator identifiers do not match.' }, 400);
    if (studentName.length < 2 || studentName.length > 60 || /[\u0000-\u001f\u007f]/.test(studentName)) {
      return json({ error: 'Student name must contain 2 to 60 valid characters.' }, 400);
    }
    if (!submittedAnswers) return json({ error: 'Submitted answers are missing or malformed.' }, 400);
    if (!Number.isInteger(clientTime) || clientTime < 1 || clientTime > 10800) {
      return json({ error: 'Completion time is invalid.' }, 400);
    }

    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const normalizedName = normalizeName(studentName);

    // Idempotency check: a network retry with the same attemptId returns the
    // already-created result rather than inserting another attempt.
    const { data: existing } = await admin.from('quiz_attempts')
      .select('*').eq('user_id', user.id).eq('idempotency_key', attemptId).maybeSingle();
    if (existing) {
      const { error: duplicateBestError } = await admin.rpc('upsert_leaderboard_best', {
        p_quiz_id: existing.quiz_id, p_creator_id: existing.creator_id,
        p_quiz_title: existing.quiz_title, p_creator_name: existing.creator_name,
        p_student_name: existing.student_name, p_normalized_name: existing.normalized_student_name,
        p_score: existing.score, p_time_taken_seconds: existing.time_taken_seconds,
      });
      if (duplicateBestError) throw duplicateBestError;
      return await makeResponse(admin, existing, existing.correct_answers, true);
    }

    // Soft anti-abuse limit per anonymous browser identity. Normal students
    // taking timed quizzes will not reach this threshold.
    const rateWindowStart = new Date(Date.now() - 60 * 1000).toISOString();
    const { count: recentSubmissions, error: rateError } = await admin.from('quiz_attempts')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .gte('created_at', rateWindowStart);
    if (rateError) throw rateError;
    if ((recentSubmissions || 0) >= 20) {
      return json({ error: 'Too many quiz submissions in a short period. Please try again in a minute.' }, 429);
    }

    const { data: quiz, error: quizError } = await admin.from('quizzes')
      .select('id,creator_id,title,duration_minutes,question_count,is_active')
      .eq('id', quizId).eq('creator_id', creatorId).eq('is_active', true).maybeSingle();
    if (quizError) throw quizError;
    if (!quiz) return json({ error: 'This quiz is not published or is no longer available.' }, 404);

    const { data: creator, error: creatorError } = await admin.from('creators')
      .select('id,name,is_active').eq('id', creatorId).eq('is_active', true).maybeSingle();
    if (creatorError) throw creatorError;
    if (!creator) return json({ error: 'This creator is not available.' }, 404);

    const { data: keyRecord, error: keyError } = await admin.from('quiz_answer_keys')
      .select('answers').eq('quiz_id', quizId).eq('creator_id', creatorId).maybeSingle();
    if (keyError) throw keyError;
    const answerKey = keyRecord?.answers;
    if (!answerKey || typeof answerKey !== 'object' || Array.isArray(answerKey)) {
      return json({ error: 'The answer key has not been configured for this quiz.' }, 409);
    }

    const questionIds = Object.keys(answerKey);
    if (questionIds.length !== 20 || questionIds.some((id) => !/^q[0-9]{1,2}$/.test(id))) {
      return json({ error: 'The private answer key must contain exactly 20 question IDs.' }, 500);
    }
    for (const answer of Object.values(answerKey)) {
      if (!['A', 'B', 'C', 'D'].includes(String(answer))) {
        return json({ error: 'The private answer key contains an invalid option.' }, 500);
      }
    }
    const validQuestionIds = new Set(questionIds);
    for (const [questionId, answer] of Object.entries(submittedAnswers)) {
      if (!validQuestionIds.has(questionId)) return json({ error: `Unknown question ID: ${questionId}.` }, 400);
      if (answer !== null && !['A', 'B', 'C', 'D'].includes(String(answer))) {
        return json({ error: `Invalid selected option for ${questionId}.` }, 400);
      }
    }

    const durationLimit = Math.max(60, Number(quiz.duration_minutes || 20) * 60);
    const timeTakenSeconds = Math.min(durationLimit, Math.max(1, clientTime));
    let correctCount = 0;
    let incorrectCount = 0;
    let unansweredCount = 0;
    const cleanAnswers: Record<string, string | null> = {};
    for (const questionId of questionIds) {
      const selected = submittedAnswers[questionId];
      if (selected === undefined || selected === null || selected === '') {
        unansweredCount += 1;
        cleanAnswers[questionId] = null;
      } else if (selected === answerKey[questionId]) {
        correctCount += 1;
        cleanAnswers[questionId] = String(selected);
      } else {
        incorrectCount += 1;
        cleanAnswers[questionId] = String(selected);
      }
    }

    const attemptToInsert = {
      user_id: user.id,
      idempotency_key: attemptId,
      quiz_id: quiz.id,
      creator_id: creator.id,
      quiz_title: quiz.title,
      creator_name: creator.name,
      student_name: studentName,
      normalized_student_name: normalizedName,
      score: correctCount,
      total_questions: 20,
      correct_count: correctCount,
      incorrect_count: incorrectCount,
      unanswered_count: unansweredCount,
      time_taken_seconds: timeTakenSeconds,
      submitted_answers: cleanAnswers,
      correct_answers: answerKey,
    };

    const { data: attempt, error: insertError } = await admin.from('quiz_attempts')
      .insert(attemptToInsert).select('*').single();

    if (insertError) {
      // Handle a race where the same idempotency key was inserted concurrently.
      if (insertError.code === '23505') {
        const { data: duplicate } = await admin.from('quiz_attempts')
          .select('*').eq('user_id', user.id).eq('idempotency_key', attemptId).maybeSingle();
        if (duplicate) {
          const { error: raceBestError } = await admin.rpc('upsert_leaderboard_best', {
            p_quiz_id: duplicate.quiz_id, p_creator_id: duplicate.creator_id,
            p_quiz_title: duplicate.quiz_title, p_creator_name: duplicate.creator_name,
            p_student_name: duplicate.student_name, p_normalized_name: duplicate.normalized_student_name,
            p_score: duplicate.score, p_time_taken_seconds: duplicate.time_taken_seconds,
          });
          if (raceBestError) throw raceBestError;
          return await makeResponse(admin, duplicate, duplicate.correct_answers, true);
        }
      }
      throw insertError;
    }

    const { error: bestError } = await admin.rpc('upsert_leaderboard_best', {
      p_quiz_id: quiz.id,
      p_creator_id: creator.id,
      p_quiz_title: quiz.title,
      p_creator_name: creator.name,
      p_student_name: studentName,
      p_normalized_name: normalizedName,
      p_score: correctCount,
      p_time_taken_seconds: timeTakenSeconds,
    });
    if (bestError) throw bestError;

    return await makeResponse(admin, attempt, answerKey, false);
  } catch (error) {
    console.error('submit-quiz error:', error);
    return json({ error: 'Unable to connect. Please try again later.' }, 500);
  }
});

async function makeResponse(admin: any, attempt: Record<string, any>, answerKey: Record<string, string>, duplicate: boolean) {
  const { data: personalBest } = await admin.from('leaderboard_best')
    .select('score')
    .eq('quiz_id', attempt.quiz_id)
    .eq('normalized_name', attempt.normalized_student_name)
    .maybeSingle();

  const { data: positions } = await admin.rpc('get_personal_leaderboard_positions', {
    p_scope: 'creator',
    p_creator_id: attempt.creator_id,
    p_normalized_name: attempt.normalized_student_name,
  });
  const creatorRank = (positions || []).find((row: Record<string, any>) => row.quiz_id === attempt.quiz_id)?.rank || null;

  return json({
    ok: true,
    duplicate,
    attemptId: attempt.id,
    quizId: attempt.quiz_id,
    creatorId: attempt.creator_id,
    quizTitle: attempt.quiz_title,
    creatorName: attempt.creator_name,
    studentName: attempt.student_name,
    score: attempt.score,
    totalQuestions: attempt.total_questions,
    correctCount: attempt.correct_count,
    incorrectCount: attempt.incorrect_count,
    unansweredCount: attempt.unanswered_count,
    timeTakenSeconds: attempt.time_taken_seconds,
    personalBestScore: personalBest?.score ?? attempt.score,
    creatorRank: creatorRank > 0 ? creatorRank : null,
    correctAnswers: answerKey,
    submittedAnswers: attempt.submitted_answers,
    completedAt: attempt.created_at,
  });
}
