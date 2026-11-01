(function () {
  'use strict';
  const select = document.getElementById('leaderboard-select');
  const refreshButton = document.getElementById('leaderboard-refresh');
  const content = document.getElementById('leaderboard-content');
  const params = new URLSearchParams(window.location.search);
  let creators = [];
  let channel = null;
  let loading = false;

  function renderOptions() {
    select.innerHTML = '<option value="overall">Overall</option>' + creators.map((creator, index) =>
      `<option value="${QC.escapeHTML(creator.id)}">${QC.escapeHTML(creator.name || `Creator ${index + 1}`)}</option>`
    ).join('');
    const preset = params.get('creator');
    if (preset && creators.some((item) => item.id === preset)) select.value = preset;
  }

  function renderTable(rows) {
    if (!rows.length) return '<div class="table-empty">No leaderboard entries yet.</div>';
    return `
      <div class="table-scroll"><table class="data-table">
        <thead><tr><th>Rank</th><th>Full Name</th><th>Creator / Quiz</th><th>Best Score</th><th>Percentage</th><th>Completion Time</th></tr></thead>
        <tbody>${rows.map((row, index) => `
          <tr><td>${index + 1}</td><td>${QC.escapeHTML(row.student_name)}</td><td>${QC.escapeHTML([row.creator_name, row.quiz_title].filter(Boolean).join(' · ') || 'Quiz')}</td>
          <td>${row.score}/20</td><td>${Math.round((Number(row.score) / 20) * 100)}%</td><td>${QC.formatDuration(row.time_taken_seconds)}</td></tr>`).join('')}</tbody>
      </table></div>`;
  }

  async function loadLeaderboard(showLoading = true) {
    if (loading) return;
    loading = true;
    if (showLoading) content.innerHTML = '<div class="loader-wrap"><div class="brand-loader">QuizCorner</div><p>Loading leaderboard</p></div>';
    try {
      if (!QC_SUPABASE_READY) throw new Error('Leaderboard will be available after Supabase is configured.');
      const value = select.value;
      const body = value === 'overall'
        ? { scope: 'overall', studentName: QC.getLastStudentName() }
        : { scope: 'creator', creatorId: value, studentName: QC.getLastStudentName() };
      const data = await QC.invokeFunction('get-leaderboard', body);
      let html = renderTable(data.leaderboard || []);
      const positions = data.personalPositions || [];
      if (positions.length) {
        html += `<section class="personal-position"><h3>Your Position</h3>${positions.map((row) => `
          <div class="position-row"><strong>#${row.rank} · ${QC.escapeHTML([row.creator_name, row.quiz_title].filter(Boolean).join(' · ') || 'Quiz')}</strong><span>Score: ${row.score}/20</span></div>`).join('')}</section>`;
      }
      content.innerHTML = html;
    } catch (error) {
      content.innerHTML = `<div class="empty-state">${QC.escapeHTML(error.message || 'Unable to connect. Please try again later.')}</div>`;
    } finally {
      loading = false;
    }
  }

  async function init() {
    try {
      creators = await QC.getCreators();
      renderOptions();
      await loadLeaderboard();
      select.addEventListener('change', () => loadLeaderboard());
      refreshButton.addEventListener('click', () => loadLeaderboard());
      if (QC_SUPABASE_READY) {
        channel = QC_SUPABASE.channel('quizcorner-leaderboard-live')
          .on('postgres_changes', { event: '*', schema: 'public', table: 'leaderboard_best' }, () => loadLeaderboard(false))
          .subscribe();
      }
    } catch (error) {
      content.innerHTML = `<div class="empty-state">Unable to load creators: ${QC.escapeHTML(error.message)}</div>`;
    }
  }
  window.addEventListener('beforeunload', () => {
    if (channel && QC_SUPABASE) QC_SUPABASE.removeChannel(channel);
  });
  init();
})();
