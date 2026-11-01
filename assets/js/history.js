(function () {
  'use strict';
  const content = document.getElementById('history-content');
  let creators = [];
  let historyRows = [];
  let activeCreatorId = '';

  function renderHistoryFor(creatorId) {
    activeCreatorId = creatorId;
    const creator = creators.find((item) => item.id === creatorId);
    const rows = historyRows.filter((row) => row.creator_id === creatorId);
    content.innerHTML = `
      <div class="history-tabs" role="tablist" aria-label="Creator history">
        ${creators.map((item) => `<button type="button" class="history-tab" role="tab" aria-selected="${item.id === creatorId ? 'true' : 'false'}" data-creator-tab="${QC.escapeHTML(item.id)}">${QC.escapeHTML(item.name)}</button>`).join('')}
      </div>
      <h2 class="section-heading" style="margin-top:8px">${QC.escapeHTML(creator?.name || 'Quiz')} History</h2>
      ${rows.length ? `<div class="history-list">${rows.map((row) => `
        <div class="history-row"><strong>${QC.escapeHTML(row.quiz_name)}</strong><span class="history-score">${row.score}/20</span><time class="history-date">${QC.formatDate(row.created_at)}</time></div>`).join('')}</div>` : '<div class="empty-state">No results for this creator yet.</div>'}`;
    content.querySelectorAll('[data-creator-tab]').forEach((button) => {
      button.addEventListener('click', () => renderHistoryFor(button.dataset.creatorTab));
    });
  }

  async function init() {
    try {
      creators = await QC.getCreators();
      if (!QC_SUPABASE_READY) throw new Error('Results History will be available after Supabase is configured.');
      await QC.ensureAnonymousSession();
      const data = await QC.invokeFunction('get-history', { limit: QC.config.MAX_HISTORY_ITEMS || 500 }, true);
      historyRows = data.history || [];
      if (!creators.length) {
        content.innerHTML = '<div class="empty-state">No creators are configured yet.</div>';
        return;
      }
      renderHistoryFor(creators[0].id);
    } catch (error) {
      content.innerHTML = `<div class="empty-state">${QC.escapeHTML(error.message || 'Unable to load history. Please try again later.')}<p style="margin-top:10px"><button class="button button-outline button-small" id="history-retry" type="button">Retry</button></p></div>`;
      document.getElementById('history-retry')?.addEventListener('click', () => init());
    }
  }
  init();
})();
