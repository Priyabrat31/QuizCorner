(function () {
  'use strict';
  const root = document.getElementById('results-root');
  const creatorId = new URLSearchParams(window.location.search).get('id');

  function performance(score) {
    if (score >= 18) return 'Excellent';
    if (score >= 15) return 'Very Good';
    if (score >= 11) return 'Good';
    return 'Needs Improvement';
  }

  function renderAnswerReview(quiz, result) {
    const submitted = result.submittedAnswers || {};
    const correctAnswers = result.correctAnswers || {};
    const order = Array.isArray(result.questionOrder) ? result.questionOrder : quiz.questions.map((q) => q.id);
    return order.map((questionId, index) => {
      const question = quiz.questions.find((q) => q.id === questionId);
      if (!question) return '';
      const selected = submitted[questionId] || null;
      const correct = correctAnswers[questionId] || null;
      const selectedText = selected ? `${selected} — ${question.options[selected]}` : 'Unanswered';
      const correctText = correct ? `${correct} — ${question.options[correct]}` : 'Not available';
      const isRight = selected && selected === correct;
      const marked = (result.markedForReview || []).includes(questionId);
      return `
        <article class="answer-review-card">
          <h3>Q${index + 1}. ${QC.escapeHTML(question.question)}</h3>
          <p class="answer-review-line ${isRight ? 'is-correct' : selected ? 'is-wrong' : ''}"><strong>Your answer:</strong> ${QC.escapeHTML(selectedText)}</p>
          <p class="answer-review-line is-correct"><strong>Correct answer:</strong> ${QC.escapeHTML(correctText)}</p>
          ${marked ? '<p class="answer-review-line"><strong>Marked for review:</strong> Yes</p>' : ''}
        </article>`;
    }).join('');
  }

  async function init() {
    if (!creatorId) {
      root.innerHTML = `<div class="empty-state">Result not found. <a href="${QC.siteUrl('users.html')}">Browse creators</a>.</div>`;
      return;
    }
    let result;
    try { result = JSON.parse(localStorage.getItem(`qc_result_${creatorId}`) || 'null'); } catch (_) { result = null; }
    if (!result || result.quizId !== creatorId) {
      root.innerHTML = `<div class="empty-state">This result is not available in this browser. Your saved history may still be available on the <a href="${QC.siteUrl('history.html')}">Results History</a> page.</div>`;
      return;
    }
    try {
      const creator = await QC.getCreator(creatorId);
      const quiz = await QC.getQuiz(creator);
      const score = Number(result.score) || 0;
      const correct = Number(result.correctCount) || 0;
      const incorrect = Number(result.incorrectCount) || 0;
      const unanswered = Number(result.unansweredCount) || 0;
      const percent = Math.round((score / 20) * 100);
      const totalSeconds = Number(result.timeTakenSeconds) || 0;
      const correctAngle = (correct / 20) * 360;
      const incorrectAngle = ((correct + incorrect) / 20) * 360;
      const best = Math.max(score, Number(result.personalBestScore) || score);
      const rank = result.creatorRank ? `#${result.creatorRank}` : '—';

      root.innerHTML = `
        <p class="eyebrow">Quiz completed</p>
        <section class="result-hero">
          ${score === 20 ? '<span class="perfect-score">Perfect Score!</span>' : ''}
          <p class="result-score">${score}<span style="font-size:.42em;color:var(--muted)"> / 20</span></p>
          <p class="result-category">${performance(score)}</p>
          <p class="result-subtitle">${percent}% · ${QC.escapeHTML(creator.name)}</p>
        </section>
        <section class="result-metrics" aria-label="Result details">
          <div class="metric-card"><strong>${correct}</strong><span>Correct</span></div>
          <div class="metric-card"><strong>${incorrect}</strong><span>Incorrect</span></div>
          <div class="metric-card"><strong>${unanswered}</strong><span>Unanswered</span></div>
          <div class="metric-card"><strong>${QC.formatDuration(totalSeconds)}</strong><span>Completion time</span></div>
        </section>
        <section class="card info-card">
          <div class="result-grid">
            <div class="donut-chart" role="img" aria-label="${correct} correct, ${incorrect} incorrect, ${unanswered} unanswered" style="--correct-angle:${correctAngle}deg;--incorrect-angle:${incorrectAngle}deg"><span>${percent}%</span></div>
            <div class="chart-legend">
              <div class="legend-row"><span class="legend-label"><i class="legend-dot legend-correct"></i>Correct</span><strong>${correct}</strong></div>
              <div class="legend-row"><span class="legend-label"><i class="legend-dot legend-incorrect"></i>Incorrect</span><strong>${incorrect}</strong></div>
              <div class="legend-row"><span class="legend-label"><i class="legend-dot legend-unanswered"></i>Unanswered</span><strong>${unanswered}</strong></div>
              <div class="detail-row"><span>Personal best score</span><strong>${best}/20</strong></div>
              <div class="detail-row"><span>Current attempt</span><strong>${score}/20</strong></div>
              <div class="detail-row"><span>Your creator rank</span><strong>${rank}</strong></div>
            </div>
          </div>
        </section>
        <div class="result-actions">
          <button class="button button-primary" id="retake-quiz" type="button">Retake Quiz</button>
          <a class="button button-secondary" href="${QC.siteUrl('users.html')}">Back to Creators</a>
        </div>
        <section>
          <h2 class="section-heading">Answer Review</h2>
          <div class="review-list">${renderAnswerReview(quiz, result)}</div>
        </section>`;

      document.getElementById('retake-quiz').addEventListener('click', () => {
        QC.showDialog({
          title: 'Retake this quiz?',
          message: 'Your current result will remain in your history. A new attempt will start with a fresh question order.',
          actions: [
            { label: 'Cancel', primary: false },
            { label: 'Retake Quiz', primary: true, onClick: () => {
              window.location.href = QC.siteUrl(`quiz.html?id=${encodeURIComponent(creatorId)}`);
            } }
          ]
        });
      });
    } catch (error) {
      root.innerHTML = `<div class="empty-state">Unable to load the result details: ${QC.escapeHTML(error.message)} <p><a href="${QC.siteUrl('users.html')}">Back to creators</a></p></div>`;
    }
  }
  init();
})();
