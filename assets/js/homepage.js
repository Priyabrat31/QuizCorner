(function () {
  'use strict';
  const host = document.getElementById('featured-creator');

  function imageOrFallback(url, name) {
    const image = document.createElement('img');
    image.className = 'creator-avatar';
    image.alt = `${name} profile`;
    image.loading = 'lazy';
    image.src = QC.siteUrl(url || 'assets/images/creators/placeholder.svg');
    image.onerror = () => { image.onerror = null; image.src = QC.siteUrl('assets/images/creators/placeholder.svg'); };
    return image;
  }

  async function renderFeatured() {
    try {
      const creators = await QC.getCreators();
      if (!creators.length) throw new Error('No creators configured.');
      const creator = creators[Math.floor(Math.random() * creators.length)];
      host.innerHTML = '';
      host.appendChild(imageOrFallback(creator.image, creator.name));
      const info = document.createElement('div');
      info.className = 'featured-details';
      const name = document.createElement('strong');
      name.textContent = creator.name;
      const topic = document.createElement('span');
      topic.textContent = creator.topic || creator.subject || 'Quiz topic to be added';
      info.append(name, topic);
      const link = document.createElement('a');
      link.className = 'button button-secondary';
      link.href = QC.siteUrl(`creator.html?id=${encodeURIComponent(creator.id)}`);
      link.textContent = 'View Profile';
      host.append(info, link);
    } catch (error) {
      host.innerHTML = `<div class="empty-state">Featured creator is unavailable right now.</div>`;
    }
  }
  renderFeatured();
})();
