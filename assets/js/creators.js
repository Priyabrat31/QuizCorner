(function () {
  'use strict';
  const list = document.getElementById('creator-list');
  const request = document.getElementById('creator-request-link');
  const message = encodeURIComponent(QC.config.CREATOR_REQUEST_TEXT || 'Hello! I want to become a QuizCorner creator. Please add my name to the creators list.');
  request.href = `https://wa.me/${QC.config.WHATSAPP_NUMBER || '919988776655'}?text=${message}`;

  function makeCreatorCard(creator) {
    const card = document.createElement('article');
    card.className = 'creator-list-card';
    card.tabIndex = 0;
    card.setAttribute('role', 'link');
    card.setAttribute('aria-label', `View ${creator.name} profile`);
    const image = document.createElement('img');
    image.className = 'creator-avatar';
    image.loading = 'lazy';
    image.alt = `${creator.name} profile`;
    image.src = QC.siteUrl(creator.image || 'assets/images/creators/placeholder.svg');
    image.onerror = () => { image.onerror = null; image.src = QC.siteUrl('assets/images/creators/placeholder.svg'); };
    const info = document.createElement('div');
    info.className = 'creator-list-info';
    const name = document.createElement('strong');
    name.textContent = creator.name;
    const subject = document.createElement('span');
    subject.textContent = `${creator.subject || 'Subject to be added'} · ${creator.topic || 'Quiz topic to be added'}`;
    info.append(name, subject);
    const action = document.createElement('div');
    action.className = 'creator-list-action';
    action.innerHTML = '<span class="button button-secondary button-small">View Profile</span>';
    const go = () => { window.location.href = QC.siteUrl(`creator.html?id=${encodeURIComponent(creator.id)}`); };
    card.addEventListener('click', go);
    card.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); go(); }
    });
    card.append(image, info, action);
    return card;
  }

  async function render() {
    try {
      const creators = await QC.getCreators();
      list.innerHTML = '';
      creators.forEach((creator) => list.appendChild(makeCreatorCard(creator)));
    } catch (error) {
      list.innerHTML = '<div class="empty-state">Unable to load the creators list. Please refresh the page.</div>';
      QC.toast(error.message, 'error');
    }
  }
  render();
})();
