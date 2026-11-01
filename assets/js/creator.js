(function () {
  'use strict';
  const root = document.getElementById('creator-profile-root');
  const params = new URLSearchParams(window.location.search);
  const creatorId = params.get('id');

  function imageUrl(path) { return QC.siteUrl(path || 'assets/images/creators/placeholder.svg'); }

  function renderProfile(creator, quiz) {
    const isPublished = Boolean(quiz.isPublished && creator.quizEnabled);
    root.innerHTML = `
      <section class="profile-hero">
        <img class="profile-photo" id="creator-photo" src="${imageUrl(creator.image)}" alt="${QC.escapeHTML(creator.name)} profile">
        <div>
          <p class="eyebrow">Creator profile</p>
          <h1>${QC.escapeHTML(creator.name)}</h1>
          <p>${QC.escapeHTML(creator.introduction || 'Creator introduction will be added soon.')}</p>
          <div class="profile-meta">
            <span class="pill pill-blue">${QC.escapeHTML(creator.subject || 'Subject to be added')}</span>
            <span class="pill pill-pink">${QC.escapeHTML(creator.topic || 'Quiz topic to be added')}</span>
          </div>
        </div>
      </section>
      <div class="profile-grid">
        <section class="card info-card quiz-detail-card">
          <h2>${QC.escapeHTML(quiz.title || creator.topic || 'Creator Quiz')}</h2>
          <div class="detail-row"><span>Questions</span><strong>20</strong></div>
          <div class="detail-row"><span>Estimated duration</span><strong>${Number(quiz.durationMinutes) || 20} minutes</strong></div>
          <div class="detail-row"><span>Total marks</span><strong>20</strong></div>
          <div class="detail-row"><span>Question type</span><strong>Single-correct MCQ</strong></div>
          <div class="profile-actions">
            <a class="button button-primary" id="start-quiz" href="${QC.siteUrl(`quiz.html?id=${encodeURIComponent(creator.id)}`)}" ${isPublished ? '' : 'aria-disabled="true"'}>${isPublished ? 'Start Quiz' : 'Quiz Coming Soon'}</a>
            <button class="button button-outline" id="copy-quiz-link" type="button">Copy Quiz Link</button>
          </div>
          ${isPublished ? '' : '<p class="small muted" style="margin:12px 0 0">This quiz is a placeholder and is not published yet.</p>'}
        </section>
        <section class="card info-card creator-top-card">
          <h2>Creator Top 3</h2>
          <div id="creator-top-three" class="loader-wrap"><div class="brand-loader">QuizCorner</div><p>Loading leaderboard</p></div>
          <a class="small" style="display:inline-block;margin-top:9px;color:var(--primary-dark);font-weight:700" href="${QC.siteUrl(`leaderboard.html?creator=${encodeURIComponent(creator.id)}`)}">View Full Leaderboard →</a>
        </section>
      </div>`;

    const photo = document.getElementById('creator-photo');
    photo.onerror = () => { photo.onerror = null; photo.src = imageUrl('assets/images/creators/placeholder.svg'); };
    const start = document.getElementById('start-quiz');
    if (!isPublished) {
      start.addEventListener('click', (event) => { event.preventDefault(); QC.toast('This quiz has not been published yet.', 'warning'); });
      start.classList.remove('button-primary');
      start.classList.add('button-secondary');
    }
    document.getElementById('copy-quiz-link').addEventListener('click', async () => {
      const link = `${window.location.origin}${QC.siteUrl(`creator.html?id=${encodeURIComponent(creator.id)}`)}`;
      try {
        await navigator.clipboard.writeText(link);
        QC.toast('Creator profile link copied.', 'success');
      } catch (_) {
        const field = document.createElement('textarea');
        field.value = link; document.body.appendChild(field); field.select();
        const copied = document.execCommand('copy'); field.remove();
        QC.toast(copied ? 'Creator profile link copied.' : 'Unable to copy the link on this browser.', copied ? 'success' : 'error');
      }
    });
    loadTopThree(creator);
  }

  async function loadTopThree(creator) {
    const target = document.getElementById('creator-top-three');
    try {
      if (!QC_SUPABASE_READY) throw new Error('Leaderboard will appear after Supabase is configured.');
      const data = await QC.invokeFunction('get-leaderboard', { scope: 'creator', creatorId: creator.id });
      const rows = data.leaderboard || [];
      if (!rows.length) {
        target.innerHTML = '<p class="muted small">No leaderboard entries yet.</p>';
        return;
      }
      target.innerHTML = `<ol class="top-three-list">${rows.slice(0, 3).map((row, index) => `
        <li class="top-three-item"><span class="rank-number">${index + 1}</span><span class="top-three-name">${QC.escapeHTML(row.student_name)}</span><strong class="top-three-score">${row.score}/20</strong></li>`).join('')}</ol>`;
    } catch (error) {
      target.innerHTML = `<p class="muted small">${QC.escapeHTML(error.message || 'Leaderboard unavailable.')}</p>`;
    }
  }

  async function init() {
    if (!creatorId) {
      root.innerHTML = '<div class="empty-state">Creator not found. <a href="users.html">Return to creators</a>.</div>';
      return;
    }
    try {
      const creator = await QC.getCreator(creatorId);
      if (!creator) throw new Error('Creator not found.');
      const quiz = await QC.getQuiz(creator);
      renderProfile(creator, quiz);
    } catch (error) {
      root.innerHTML = `<div class="empty-state">${QC.escapeHTML(error.message)} <p><a href="${QC.siteUrl('users.html')}">Back to creators</a></p></div>`;
    }
  }
  init();
})();
