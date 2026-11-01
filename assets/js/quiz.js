(function () {
  'use strict';

  const root = document.getElementById('quiz-root');
  const creatorId = new URLSearchParams(window.location.search).get('id');
  const privacyKey = 'qc_privacy_notice_v1';
  let creator = null;
  let quiz = null;
  let state = null;
  let timerHandle = null;
  let activeGuard = false;
  let allowingNavigation = false;

  const stateKey = () => `qc_active_attempt_${creatorId}`;
  const answerLetters = ['A', 'B', 'C', 'D'];
  const shuffle = (items) => {
    const result = [...items];
    for (let i = result.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  };

  function getStoredAttempt() {
    try {
      const raw = localStorage.getItem(stateKey());
      return raw ? JSON.parse(raw) : null;
    } catch (_) { return null; }
  }

  function saveState() {
    if (!state) return;
    state.remainingAtSave = Math.max(0, Math.ceil((state.endsAt - Date.now()) / 1000));
    state.savedAt = Date.now();
    localStorage.setItem(stateKey(), JSON.stringify(state));
  }

  function answeredCount() {
    return Object.values(state.answers || {}).filter((answer) => answer && answerLetters.includes(answer)).length;
  }

  function isMarked(questionId) { return (state.markedForReview || []).includes(questionId); }

  function questionForCurrent() {
    const id = state.questionOrder[state.currentIndex];
    return quiz.questions.find((question) => question.id === id);
  }

  function showPrivacyThenInstructions() {
    if (localStorage.getItem(privacyKey) === 'shown') {
      renderInstructions();
      return;
    }
    QC.showDialog({
      title: 'QuizCorner privacy notice',
      message: 'QuizCorner stores your student name, a browser-specific anonymous identity, the answers needed to evaluate your quiz, your score, completion time and results history. This information is used to calculate results, show public leaderboard entries and keep your private history in this browser. Your browser identity is not strong identity verification. Clearing browser data or losing the anonymous session may make earlier history unavailable on this device.',
      actions: [{ label: 'Continue', primary: true, onClick: () => {
        localStorage.setItem(privacyKey, 'shown');
        renderInstructions();
      } }]
    });
  }

  function renderInstructions(resumeAttempt = null) {
    const published = Boolean(quiz.isPublished && creator.quizEnabled);
    if (!published) {
      root.innerHTML = `
        <section class="quiz-intro"><div class="card quiz-intro-card">
          <p class="eyebrow">Quiz not published</p><h1>${QC.escapeHTML(quiz.title || creator.topic || 'Creator Quiz')}</h1>
          <p class="muted">This is a placeholder quiz. The creator's real 20 questions and private answer key must be added before students can start.</p>
          <div class="notice notice-warning" style="margin:18px 0">The quiz is currently unavailable. Please check back after it has been published.</div>
          <a class="button button-secondary" href="${QC.siteUrl(`creator.html?id=${encodeURIComponent(creator.id)}`)}">Back to Creator</a>
        </div></section>`;
      return;
    }

    const savedName = resumeAttempt?.studentName || QC.getLastStudentName();
    root.innerHTML = `
      <section class="quiz-intro">
        ${resumeAttempt ? '<div class="notice resume-banner">An unfinished attempt was found. Your previous answers and remaining time have been restored.</div>' : ''}
        <div class="card quiz-intro-card">
          <p class="eyebrow">Quiz instructions</p>
          <h1>${QC.escapeHTML(quiz.title)}</h1>
          <p class="muted">Created by ${QC.escapeHTML(creator.name)}</p>
          <div class="profile-meta">
            <span class="pill pill-blue">20 questions</span>
            <span class="pill pill-pink">${Number(quiz.durationMinutes) || 20} minutes</span>
            <span class="pill pill-mint">20 marks</span>
          </div>
          <ul class="quiz-instruction-list">
            <li>Each correct answer carries 1 mark. Incorrect and unanswered questions carry 0 marks.</li>
            <li>Use Previous and Next to move between questions. You can change an answer any time before submitting.</li>
            <li>Use Mark for Review to flag a question you want to revisit. Review-marked questions are shown in the final review.</li>
            <li>The numbered palette shows current, answered, unanswered and review-marked questions.</li>
            <li>Your answers and timer are saved in this browser. Refreshing the page will resume the same attempt.</li>
            <li>The test submits automatically when the timer reaches zero. A working internet connection is required to confirm your result.</li>
          </ul>
          <div class="name-entry">
            <label class="form-label" for="student-name">Student name</label>
            <input class="text-input" id="student-name" maxlength="60" autocomplete="name" placeholder="Enter your full name" value="${QC.escapeHTML(savedName)}" ${resumeAttempt ? 'disabled' : ''}>
            <p class="small muted" style="margin:7px 0 15px">Your name is used for the public leaderboard. No email or password is required.</p>
            <button class="button button-primary button-block" id="start-test" type="button">${resumeAttempt ? 'Resume Test' : 'Continue'}</button>
          </div>
        </div>
      </section>`;

    document.getElementById('start-test').addEventListener('click', async () => {
      if (resumeAttempt) {
        state = resumeAttempt;
        enterWorkspace();
        if (state.endsAt <= Date.now() || state.pendingSubmit) await submitAttempt(true);
        return;
      }
      const field = document.getElementById('student-name');
      const studentName = field.value.normalize('NFKC').trim().replace(/\s+/g, ' ');
      if (!studentName || studentName.length < 2) {
        QC.toast('Please enter a name with at least 2 characters.', 'warning');
        field.focus();
        return;
      }
      if (/[\u0000-\u001f\u007f]/.test(studentName)) {
        QC.toast('Please enter a valid name.', 'warning');
        field.focus();
        return;
      }
      try {
        await QC.ensureAnonymousSession();
      } catch (error) {
        QC.toast(error.message || 'Unable to connect. Please try again later.', 'error', 5000);
        return;
      }
      QC.saveLastStudentName(studentName);
      const durationSeconds = Math.max(60, Number(quiz.durationMinutes || 20) * 60);
      const makeUuid = () => {
        if (crypto.randomUUID) return crypto.randomUUID();
        const bytes = new Uint8Array(16); crypto.getRandomValues(bytes);
        bytes[6] = (bytes[6] & 0x0f) | 0x40; bytes[8] = (bytes[8] & 0x3f) | 0x80;
        const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
        return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
      };
      state = {
        attemptId: makeUuid(),
        quizId: quiz.quizId || creator.id,
        creatorId: creator.id,
        studentName,
        questionOrder: shuffle(quiz.questions.map((question) => question.id)),
        answers: {},
        markedForReview: [],
        currentIndex: 0,
        startedAt: Date.now(),
        endsAt: Date.now() + durationSeconds * 1000,
        durationSeconds,
        remainingAtSave: durationSeconds,
        pendingSubmit: false,
        isSubmitting: false
      };
      saveState();
      enterWorkspace();
    });
  }

  function enterWorkspace() {
    root.innerHTML = `
      <section id="quiz-workspace">
        <div class="quiz-topbar">
          <div><p class="eyebrow" style="margin:0">${QC.escapeHTML(creator.name)}</p><h1>${QC.escapeHTML(quiz.title)}</h1><div class="quiz-top-meta">Student: ${QC.escapeHTML(state.studentName)}</div></div>
          <div class="quiz-timer" id="quiz-timer" aria-live="off">20:00</div>
        </div>
        <div class="quiz-progress-wrap">
          <div class="quiz-progress-label"><span id="progress-count">0 of 20 questions answered</span><span id="progress-number">Question 1 / 20</span></div>
          <div class="quiz-progress"><div class="quiz-progress-bar" id="quiz-progress-bar"></div></div>
        </div>
        <div class="quiz-layout">
          <section id="question-stage" aria-live="polite"></section>
          <aside class="card quiz-sidebar">
            <h2>Question Palette</h2>
            <div class="palette-grid" id="question-palette"></div>
            <div class="palette-legend">
              <span><i class="legend-square current"></i> Current</span>
              <span><i class="legend-square answered"></i> Answered</span>
              <span><i class="legend-square"></i> Unanswered</span>
              <span><i class="legend-square review"></i> Mark for review</span>
            </div>
          </aside>
        </div>
        <div id="submission-pending-host"></div>
      </section>`;
    activeGuard = true;
    installNavigationGuard();
    renderQuestion();
    renderPalette();
    updateProgress();
    startTimer();
    if (state.pendingSubmit) {
      showPendingSubmission('Your submission is waiting for a connection. Your answers are saved on this device.');
      if (navigator.onLine) submitAttempt(true);
    }
  }

  function renderPalette() {
    const palette = document.getElementById('question-palette');
    if (!palette) return;
    palette.innerHTML = '';
    state.questionOrder.forEach((questionId, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'palette-button';
      button.textContent = String(index + 1);
      button.setAttribute('aria-label', `Go to question ${index + 1}`);
      if (state.answers[questionId]) button.classList.add('is-answered');
      if (isMarked(questionId)) button.classList.add('is-review');
      if (index === state.currentIndex) button.classList.add('is-current');
      button.addEventListener('click', () => { state.currentIndex = index; saveState(); renderQuestion(); renderPalette(); updateProgress(); });
      palette.appendChild(button);
    });
  }

  function renderQuestion() {
    const stage = document.getElementById('question-stage');
    if (!stage) return;
    const question = questionForCurrent();
    if (!question) {
      stage.innerHTML = '<div class="empty-state">This question could not be loaded.</div>';
      return;
    }
    const selected = state.answers[question.id] || '';
    const marked = isMarked(question.id);
    stage.innerHTML = `
      <article class="card question-card">
        <div class="question-label">QUESTION ${state.currentIndex + 1} OF 20 ${marked ? '· MARKED FOR REVIEW' : ''}</div>
        <h2 class="question-text">${QC.escapeHTML(question.question)}</h2>
        <div class="options-list" id="options-list"></div>
        <div class="question-actions">
          <div class="question-actions-group">
            <button class="button button-outline button-small" id="previous-question" type="button" ${state.currentIndex === 0 ? 'disabled' : ''}>Previous</button>
            <button class="button button-outline button-small" id="next-question" type="button" ${state.currentIndex === 19 ? 'disabled' : ''}>Next</button>
          </div>
          <div class="question-actions-group">
            <button class="button button-secondary button-small" id="mark-review" type="button">${marked ? 'Unmark Review' : 'Mark for Review'}</button>
            <button class="button button-quiet button-small" id="review-answers" type="button">Review Answers</button>
          </div>
        </div>
      </article>`;

    const options = document.getElementById('options-list');
    answerLetters.forEach((letter) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'option-button';
      button.setAttribute('aria-pressed', selected === letter ? 'true' : 'false');
      button.disabled = Boolean(state.pendingSubmit);
      const letterSpan = document.createElement('span');
      letterSpan.className = 'option-letter';
      letterSpan.textContent = letter;
      const textSpan = document.createElement('span');
      textSpan.textContent = question.options[letter];
      button.append(letterSpan, textSpan);
      button.addEventListener('click', () => {
        state.answers[question.id] = letter;
        saveState(); renderQuestion(); renderPalette(); updateProgress();
      });
      options.appendChild(button);
    });

    document.getElementById('previous-question').disabled = state.currentIndex === 0 || Boolean(state.pendingSubmit);
    document.getElementById('next-question').disabled = state.currentIndex === 19 || Boolean(state.pendingSubmit);
    document.getElementById('previous-question').addEventListener('click', () => navigateQuestion(-1));
    document.getElementById('next-question').addEventListener('click', () => navigateQuestion(1));
    document.getElementById('mark-review').disabled = Boolean(state.pendingSubmit);
    document.getElementById('mark-review').addEventListener('click', () => {
      if (state.pendingSubmit) return;
      if (marked) state.markedForReview = state.markedForReview.filter((id) => id !== question.id);
      else state.markedForReview.push(question.id);
      saveState(); renderQuestion(); renderPalette();
    });
    document.getElementById('review-answers').addEventListener('click', renderReview);
  }

  function navigateQuestion(delta) {
    state.currentIndex = Math.min(19, Math.max(0, state.currentIndex + delta));
    saveState(); renderQuestion(); renderPalette(); updateProgress();
  }

  function updateProgress() {
    const count = answeredCount();
    const countNode = document.getElementById('progress-count');
    const numberNode = document.getElementById('progress-number');
    const bar = document.getElementById('quiz-progress-bar');
    if (countNode) countNode.textContent = `${count} of 20 questions answered`;
    if (numberNode) numberNode.textContent = `Question ${state.currentIndex + 1} / 20`;
    if (bar) bar.style.width = `${(count / 20) * 100}%`;
  }

  function renderReview() {
    const stage = document.getElementById('question-stage');
    if (!stage) return;
    const rows = state.questionOrder.map((id, index) => {
      const question = quiz.questions.find((item) => item.id === id);
      const answer = state.answers[id];
      const marked = isMarked(id);
      return `
        <div class="review-question-row">
          <span class="rank-number">${index + 1}</span>
          <button class="button-quiet" type="button" data-review-index="${index}">
            <span class="review-q-title">${QC.escapeHTML(question.question)}</span><br>
            <span class="review-q-meta">${answer ? `Selected: ${answer}` : 'Unanswered'}</span>
          </button>
          <span class="review-status">${marked ? 'Marked for review' : ''}</span>
        </div>`;
    }).join('');
    stage.innerHTML = `
      <section class="card info-card">
        <p class="eyebrow">Before submission</p><h2 style="margin:4px 0 7px">Review your answers</h2>
        <p class="muted small" style="margin:0 0 15px">Select any question to return to it. Correct answers are shown only after your quiz is submitted.</p>
        <div class="quiz-review">${rows}</div>
        <div class="question-actions" style="margin-top:18px">
          <button class="button button-outline" id="back-to-questions" type="button">Back to Questions</button>
          <button class="button button-primary" id="open-submit-confirm" type="button">Submit Quiz</button>
        </div>
      </section>`;
    stage.querySelectorAll('[data-review-index]').forEach((button) => {
      button.addEventListener('click', () => {
        state.currentIndex = Number(button.dataset.reviewIndex);
        saveState(); renderQuestion(); renderPalette(); updateProgress();
      });
    });
    document.getElementById('back-to-questions').addEventListener('click', () => {
      renderQuestion(); renderPalette(); updateProgress();
    });
    document.getElementById('open-submit-confirm').addEventListener('click', showSubmitConfirmation);
  }

  function showSubmitConfirmation() {
    const answered = answeredCount();
    const unanswered = 20 - answered;
    QC.showDialog({
      title: 'Submit your quiz?',
      message: `Answered questions: ${answered}. Unanswered questions: ${unanswered}. Once submitted, your answers cannot be changed.`,
      actions: [
        { label: 'Go Back', primary: false, onClick: () => renderQuestion() },
        { label: 'Submit Quiz', primary: true, onClick: () => submitAttempt(false) }
      ]
    });
  }

  function startTimer() {
    if (timerHandle) clearInterval(timerHandle);
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((state.endsAt - Date.now()) / 1000));
      const timer = document.getElementById('quiz-timer');
      if (timer) {
        timer.textContent = QC.formatDuration(remaining);
        timer.classList.toggle('timer-warning', remaining <= 300 && remaining > 60);
        timer.classList.toggle('timer-danger', remaining <= 60);
      }
      saveState();
      if (remaining <= 0) {
        clearInterval(timerHandle);
        timerHandle = null;
        submitAttempt(true);
      }
    };
    tick();
    timerHandle = window.setInterval(tick, 1000);
  }

  function showPendingSubmission(message) {
    const host = document.getElementById('submission-pending-host');
    if (!host) return;
    host.innerHTML = `
      <div class="submission-pending" role="status">
        <h2>Submission not confirmed</h2><p>${QC.escapeHTML(message)}</p>
        <button class="button button-primary button-small" id="retry-submission" type="button">Retry submission</button>
      </div>`;
    document.getElementById('retry-submission').addEventListener('click', () => submitAttempt(true));
  }

  async function submitAttempt(isAutomaticOrRetry) {
    if (!state || state.isSubmitting) return;
    state.isSubmitting = true;
    state.pendingSubmit = true;
    saveState();
    if (timerHandle) { clearInterval(timerHandle); timerHandle = null; }
    const host = document.getElementById('submission-pending-host');
    if (host) host.innerHTML = '<div class="notice" role="status">Submitting your answers securely. Please keep this page open.</div>';
    renderQuestion(); renderPalette();

    const elapsed = Math.min(state.durationSeconds, Math.max(1, Math.floor((Date.now() - state.startedAt) / 1000)));
    const payload = {
      attemptId: state.attemptId,
      quizId: state.quizId,
      creatorId: state.creatorId,
      studentName: state.studentName,
      answers: state.answers,
      timeTakenSeconds: elapsed
    };

    if (!navigator.onLine) {
      state.isSubmitting = false;
      saveState();
      renderQuestion();
      showPendingSubmission('You are offline. Your answers are safely saved on this device and will be submitted when the connection returns. Your leaderboard result is not confirmed yet.');
      return;
    }

    try {
      await QC.ensureAnonymousSession();
      const result = await QC.invokeFunction('submit-quiz', payload, true);
      if (!result || result.ok !== true) throw new Error(result?.error || 'The server did not confirm this submission.');
      const finalResult = {
        ...result,
        quizId: state.quizId,
        creatorId: state.creatorId,
        studentName: state.studentName,
        questionOrder: state.questionOrder,
        submittedAnswers: state.answers,
        markedForReview: state.markedForReview,
        clientStartedAt: state.startedAt,
        localCompletedAt: new Date().toISOString()
      };
      localStorage.setItem(`qc_result_${creatorId}`, JSON.stringify(finalResult));
      localStorage.setItem('qc_last_result', JSON.stringify(finalResult));
      localStorage.removeItem(stateKey());
      activeGuard = false;
      allowingNavigation = true;
      window.location.href = QC.siteUrl(`results.html?id=${encodeURIComponent(creatorId)}`);
    } catch (error) {
      state.isSubmitting = false;
      state.pendingSubmit = true;
      saveState();
      const detail = error.message || 'Unable to connect. Please try again later.';
      renderQuestion();
      showPendingSubmission(`${detail} Your answers remain saved on this device. Do not clear browser data before the server confirms your submission.`);
      if (!navigator.onLine) QC.toast('Connection lost. Submission is waiting.', 'warning');
      else QC.toast('Submission was not confirmed. Please retry.', 'error', 5000);
    }
  }

  function installNavigationGuard() {
    if (window.__qcQuizGuardInstalled) return;
    window.__qcQuizGuardInstalled = true;
    history.pushState({ qcQuizGuard: true }, '', window.location.href);
    window.addEventListener('popstate', () => {
      if (!activeGuard || allowingNavigation) return;
      history.pushState({ qcQuizGuard: true }, '', window.location.href);
      askToLeave();
    });
    window.addEventListener('beforeunload', (event) => {
      if (!activeGuard || allowingNavigation) return;
      event.preventDefault();
      event.returnValue = '';
    });
    document.addEventListener('click', (event) => {
      const link = event.target.closest('a[href]');
      if (!link || !activeGuard || allowingNavigation) return;
      const href = link.href;
      if (!href || href.startsWith('javascript:')) return;
      event.preventDefault();
      askToLeave(href);
    }, true);
  }

  function askToLeave(destination = '') {
    QC.showDialog({
      title: 'Leave this quiz?',
      message: 'Your quiz is still in progress. Are you sure you want to leave? Your progress will be saved on this device.',
      actions: [
        { label: 'Stay in Quiz', primary: true, onClick: () => {} },
        { label: 'Leave Quiz', primary: false, onClick: () => {
          allowingNavigation = true;
          activeGuard = false;
          if (destination) window.location.href = destination;
          else {
            const previous = document.referrer && new URL(document.referrer).origin === window.location.origin
              ? document.referrer
              : QC.siteUrl(`creator.html?id=${encodeURIComponent(creatorId)}`);
            window.location.href = previous;
          }
        } }
      ]
    });
  }

  window.addEventListener('online', () => {
    if (state?.pendingSubmit && !state.isSubmitting) {
      QC.toast('Connection restored. Retrying your submission.', 'success');
      submitAttempt(true);
    }
  });

  document.addEventListener('keydown', (event) => {
    if (!state || !activeGuard || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === 'ArrowLeft') { event.preventDefault(); navigateQuestion(-1); }
    if (event.key === 'ArrowRight') { event.preventDefault(); navigateQuestion(1); }
  });

  async function init() {
    if (!creatorId) {
      root.innerHTML = `<div class="empty-state">Quiz not found. <a href="${QC.siteUrl('users.html')}">Return to creators</a>.</div>`;
      return;
    }
    try {
      creator = await QC.getCreator(creatorId);
      if (!creator) throw new Error('Creator not found.');
      quiz = await QC.getQuiz(creator);
      const saved = getStoredAttempt();
      const validSaved = saved && saved.creatorId === creatorId && Array.isArray(saved.questionOrder) && saved.questionOrder.length === 20;
      if (validSaved && quiz.isPublished && creator.quizEnabled) {
        state = saved;
        if (!state.pendingSubmit && state.endsAt <= Date.now()) state.pendingSubmit = true;
        if (state.pendingSubmit) {
          renderInstructions(state);
          document.getElementById('start-test')?.click();
        } else {
          renderInstructions(state);
        }
      } else if (quiz.isPublished && creator.quizEnabled) {
        showPrivacyThenInstructions();
      } else {
        renderInstructions();
      }
    } catch (error) {
      root.innerHTML = `<div class="empty-state">${QC.escapeHTML(error.message)}<p><a href="${QC.siteUrl('users.html')}">Back to creators</a></p></div>`;
    }
  }
  init();
})();
