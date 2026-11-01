/* Supabase browser client. The public key is safe to expose only with RLS enabled. */
(function () {
  const cfg = window.QC_CONFIG || {};
  const looksConfigured =
    typeof cfg.SUPABASE_URL === 'string' &&
    cfg.SUPABASE_URL.startsWith('https://') &&
    !cfg.SUPABASE_URL.includes('YOUR_PROJECT_REF') &&
    typeof cfg.SUPABASE_PUBLIC_KEY === 'string' &&
    cfg.SUPABASE_PUBLIC_KEY.length > 20 &&
    !cfg.SUPABASE_PUBLIC_KEY.includes('YOUR_SUPABASE_');

  window.QC_SUPABASE_READY = Boolean(looksConfigured && window.supabase && window.supabase.createClient);
  window.QC_SUPABASE = window.QC_SUPABASE_READY
    ? window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_PUBLIC_KEY, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: false,
          storage: window.localStorage
        },
        global: { headers: { 'X-Client-Info': 'quizcorner-static-web/1.0.0' } }
      })
    : null;
})();
