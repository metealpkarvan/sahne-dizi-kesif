(() => {
  'use strict';

  const shows = new Map();
  let viewer = null;
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const icons = {
    play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 11 7-11 7Z"/></svg>',
    expand: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/></svg>',
    close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M6 18 18 6"/></svg>',
    left: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14 5-7 7 7 7"/></svg>',
    right: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m10 5 7 7-7 7"/></svg>',
    sound: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m11 4-6 5H2v6h3l6 5Zm4 4a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/></svg>'
  };

  function imageUrl(value) {
    if (typeof value !== 'string' || value.length > 2000) return '';
    try {
      const url = new URL(value, location.href);
      if (url.username || url.password) return '';
      if (url.protocol !== 'https:' && !(url.origin === location.origin && url.protocol === 'http:')) return '';
      return url.href;
    } catch { return ''; }
  }

  function identity(url) {
    const parsed = new URL(url);
    const tvmaze = parsed.hostname === 'static.tvmaze.com' && parsed.pathname.match(/\/images\/[^/]+\/(\d+\/\d+\.\w+)$/);
    return tvmaze ? 'tvmaze:' + tvmaze[1] : parsed.origin + parsed.pathname;
  }

  function details(show) {
    return typeof DETAILS !== 'undefined' ? DETAILS[String(show.id)] || {} : {};
  }

  function imageList(show, record) {
    const d = details(show);
    const fallback = [
      ...(d.backdrops || []).map((url, index) => ({ url, type: 'backdrop', caption: `${show.name} · Dizi görseli ${index + 1}` })),
      ...(show.backdrop ? [{ url: show.backdrop, type: 'backdrop', caption: `${show.name} · Dizi görseli` }] : []),
      ...(d.episodes || []).filter(episode => episode.image).slice(0, 20).map(episode => ({
        url: typeof episode.image === 'string' ? episode.image : episode.image.original || episode.image.medium,
        type: 'episode',
        caption: `${show.name} · ${episode.season ? `${episode.season}. sezon` : 'Özel bölüm'}${episode.number ? ` / ${episode.number}. bölüm` : ''}${episode.name ? ` · ${episode.name}` : ''}`
      })),
      { url: show.image?.original || show.image?.medium, type: 'poster', caption: `${show.name} · Dizi afişi` }
    ];
    const merged = [...(Array.isArray(record?.images) ? record.images : []), ...fallback];
    const seen = new Set();
    return merged.map(item => {
      const url = imageUrl(item?.url);
      if (!url || seen.has(identity(url))) return null;
      seen.add(identity(url));
      return { url, thumbnail: imageUrl(item.thumbnail) || url, type: String(item.type || 'image'), caption: String(item.caption || `${show.name} · Dizi görseli`).slice(0, 250) };
    }).filter(Boolean).sort((a, b) => rank(a.type) - rank(b.type)).slice(0, 40);
  }

  function rank(type) {
    return type === 'episode' ? 0 : /poster|cover/.test(type) ? 2 : 1;
  }

  function trailer(record) {
    const item = record?.trailer;
    return item && /^[A-Za-z0-9_-]{11}$/.test(item.videoId || '') ? item : null;
  }

  function remember(show) {
    shows.set(Number(show.id), show);
    if (shows.size > 100) shows.delete(shows.keys().next().value);
  }

  function render(show) {
    remember(show);
    const record = window.SahneMedia?.get(Number(show.id));
    const images = imageList(show, record);
    const video = trailer(record);
    const tiles = images.slice(0, 5).map((item, index) => `<button type="button" class="sg-image sg-image-${index + 1}${rank(item.type) === 2 ? ' sg-poster' : ''}" data-sg-image="${index}" data-sg-id="${Number(show.id)}" aria-label="${index + 1}. görsel: ${escape(item.caption)} — büyüt"><img src="${escape(item.url)}" alt="${escape(item.caption)}" loading="lazy" decoding="async"><span class="sg-image-fallback" hidden>Görsel yüklenemedi</span><span class="sg-image-shade" aria-hidden="true"></span><span class="sg-expand" aria-hidden="true">${icons.expand}</span>${index === 0 ? `<span class="sg-image-caption"><small>DİZİNİN İÇİNDEN</small><strong>${escape(show.name)}</strong></span>` : index === 4 && images.length > 5 ? `<span class="sg-more" aria-hidden="true">+${images.length - 5} görsel</span>` : ''}</button>`).join('');
    return `<section class="sg-gallery" data-sg-show="${Number(show.id)}" aria-labelledby="sg-title-${Number(show.id)}"><div class="sg-heading"><div><span class="sg-eyebrow">SAHNE / GÖRSEL ARŞİV</span><h3 id="sg-title-${Number(show.id)}">Hikâyenin içine bak.</h3><p>${images.length ? `${images.length} görsel${video ? ' · Fragman' : ''}` : 'Dizi görselleri ve fragman'}<span class="sg-loading-label"${record ? ' hidden' : ''}> · Arşiv taranıyor</span></p></div>${video ? `<button type="button" class="sg-trailer-button" data-sg-trailer="${Number(show.id)}">${icons.play}<span>Fragmanı izle</span></button>` : ''}</div>${images.length ? `<div class="sg-mosaic sg-mosaic-${Math.min(images.length, 5)}">${tiles}</div><button type="button" class="sg-all-button" data-sg-image="0" data-sg-id="${Number(show.id)}">${icons.expand}<span>${images.length > 1 ? 'Tüm görselleri keşfet' : 'Görseli büyüt'}</span><span aria-hidden="true">${String(images.length).padStart(2, '0')}</span></button>` : `<div class="sg-empty">Bu diziye ait görsel arşivi hazırlanıyor.</div>`}${video ? `<p class="sg-video-note">${escape(video.title || `${show.name} fragmanı`)} · Galeriden ayrılmadan izle.</p>` : ''}</section>`;
  }

  async function load(show) {
    remember(show);
    const section = document.querySelector(`[data-sg-show="${Number(show.id)}"]`);
    if (!section) return;
    try {
      await window.SahneMedia?.lookup(Number(show.id));
      if (!section.isConnected || !section.closest('dialog')?.open) return;
      const active = document.activeElement;
      const focusIndex = section.contains(active) && active.hasAttribute('data-sg-image') ? active.dataset.sgImage : null;
      const focusTrailer = section.contains(active) && active.hasAttribute('data-sg-trailer');
      const viewerIndex = viewer && section.contains(viewer.trigger) && viewer.trigger.hasAttribute('data-sg-image') ? viewer.trigger.dataset.sgImage : null;
      const viewerTrailer = viewer && section.contains(viewer.trigger) && viewer.trigger.hasAttribute('data-sg-trailer');
      section.outerHTML = render(show);
      const replacement = document.querySelector(`[data-sg-show="${Number(show.id)}"]`);
      if (viewerIndex !== null) viewer.trigger = replacement?.querySelector(`[data-sg-image="${Number(viewerIndex)}"]`) || replacement;
      if (viewerTrailer) viewer.trigger = replacement?.querySelector('[data-sg-trailer]') || replacement;
      if (focusIndex !== null && !viewer) replacement?.querySelector(`[data-sg-image="${Number(focusIndex)}"]`)?.focus({ preventScroll: true });
      if (focusTrailer && !viewer) replacement?.querySelector('[data-sg-trailer]')?.focus({ preventScroll: true });
    } catch {
      if (!section.isConnected) return;
      const label = section.querySelector('.sg-loading-label');
      if (label) label.hidden = true;
      const empty = section.querySelector('.sg-empty');
      if (empty) empty.textContent = 'Bu dizi için şu an görsel bulunamadı.';
    }
  }

  function stop() {
    if (!viewer) return;
    const current = viewer;
    viewer = null;
    current.dialog.querySelector('iframe')?.remove();
    if (current.dialog.open) current.dialog.close();
    current.dialog.remove();
    if (current.trigger?.isConnected && current.trigger.closest('dialog')?.open) current.trigger.focus({ preventScroll: true });
    window.dispatchEvent(new CustomEvent('sahne:gallery-close', { detail: { showId: Number(current.show.id) } }));
  }

  function createViewer(show, trigger, mode) {
    stop();
    window.SahneMedia?.stopPreview?.();
    const dialog = document.createElement('dialog');
    dialog.className = 'sg-viewer';
    dialog.setAttribute('aria-labelledby', 'sg-viewer-title');
    dialog.innerHTML = `<div class="sg-viewer-inner"><header class="sg-viewer-top"><div><span class="sg-eyebrow">SAHNE / ${mode === 'video' ? 'FRAGMAN' : 'GÖRSEL ARŞİV'}</span><h2 id="sg-viewer-title">${escape(show.name)}</h2></div><button type="button" class="sg-icon-button" data-sg-close aria-label="${mode === 'video' ? 'Fragmanı' : 'Galeriyi'} kapat">${icons.close}</button></header><div class="sg-viewer-content"></div></div>`;
    dialog.addEventListener('cancel', event => { event.preventDefault(); event.stopPropagation(); stop(); });
    dialog.addEventListener('close', () => { if (viewer?.dialog === dialog) stop(); });
    dialog.addEventListener('click', event => { if (event.target === dialog) stop(); });
    dialog.addEventListener('keydown', event => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); stop(); }
      if (mode === 'images' && ['ArrowLeft', 'ArrowRight'].includes(event.key)) {
        event.preventDefault(); event.stopPropagation(); moveImage(event.key === 'ArrowLeft' ? -1 : 1);
      }
    });
    document.body.append(dialog);
    viewer = { dialog, show, trigger, mode, images: [], index: 0, muted: true };
    dialog.showModal();
    dialog.querySelector('[data-sg-close]').focus({ preventScroll: true });
    return viewer;
  }

  function openImages(show, index, trigger) {
    const images = imageList(show, window.SahneMedia?.get(Number(show.id)));
    if (!images.length) return;
    const current = createViewer(show, trigger, 'images');
    current.images = images;
    current.index = Math.max(0, Math.min(images.length - 1, index));
    current.dialog.querySelector('.sg-viewer-content').innerHTML = `<div class="sg-viewer-stage" aria-live="polite"></div><div class="sg-viewer-caption"><p class="sg-current-caption"></p><span class="sg-current-count"></span></div><nav class="sg-filmstrip" aria-label="Dizi görselleri">${images.map((item, position) => `<button type="button" data-sg-select="${position}" aria-label="${position + 1}. görsel: ${escape(item.caption)}"><img src="${escape(item.thumbnail)}" alt="" loading="lazy" decoding="async"><span class="sg-image-fallback" hidden>Görsel</span></button>`).join('')}</nav>`;
    drawImage();
  }

  function drawImage() {
    const current = viewer;
    if (!current || current.mode !== 'images') return;
    const item = current.images[current.index];
    const navigationFocus = document.activeElement?.hasAttribute('data-sg-prev') ? '[data-sg-prev]' : document.activeElement?.hasAttribute('data-sg-next') ? '[data-sg-next]' : null;
    current.dialog.querySelector('.sg-viewer-stage').innerHTML = `<img src="${escape(item.url)}" alt="${escape(item.caption)}" decoding="async"><span class="sg-image-fallback" hidden>Görsel şu an yüklenemedi. Diğer görselleri deneyebilirsin.</span><button type="button" class="sg-icon-button sg-image-prev" data-sg-prev aria-label="Önceki görsel"${current.images.length < 2 ? ' hidden' : ''}>${icons.left}</button><button type="button" class="sg-icon-button sg-image-next" data-sg-next aria-label="Sonraki görsel"${current.images.length < 2 ? ' hidden' : ''}>${icons.right}</button>`;
    current.dialog.querySelector('.sg-current-caption').textContent = item.caption;
    current.dialog.querySelector('.sg-current-count').textContent = `${String(current.index + 1).padStart(2, '0')} / ${String(current.images.length).padStart(2, '0')}`;
    for (const button of current.dialog.querySelectorAll('[data-sg-select]')) {
      const selected = Number(button.dataset.sgSelect) === current.index;
      button.setAttribute('aria-current', selected ? 'true' : 'false');
      if (selected) button.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' });
    }
    if (navigationFocus) current.dialog.querySelector(navigationFocus)?.focus({ preventScroll: true });
  }

  function moveImage(direction) {
    if (viewer?.mode !== 'images') return;
    viewer.index = (viewer.index + direction + viewer.images.length) % viewer.images.length;
    drawImage();
  }

  function openVideo(show, trigger) {
    const video = trailer(window.SahneMedia?.get(Number(show.id)));
    if (!video) return;
    const current = createViewer(show, trigger, 'video');
    window.dispatchEvent(new CustomEvent('sahne:deliberate-video', { detail: { showId: Number(show.id) } }));
    const src = new URL(`https://www.youtube-nocookie.com/embed/${video.videoId}`);
    for (const [key, value] of Object.entries({ autoplay: '1', mute: '1', playsinline: '1', rel: '0', enablejsapi: '1', origin: location.origin })) src.searchParams.set(key, value);
    current.dialog.querySelector('.sg-viewer-content').innerHTML = `<div class="sg-video-stage"><iframe src="${escape(src.href)}" title="${escape(video.title || `${show.name} fragmanı`)}" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe></div><div class="sg-video-footer"><button type="button" class="sg-sound-button" data-sg-sound aria-pressed="false">${icons.sound}<span>Sesi aç</span></button><p>${escape(video.title || 'Dizi fragmanı')}</p><a href="https://www.youtube.com/watch?v=${escape(video.videoId)}" target="_blank" rel="noopener noreferrer">YouTube'da aç</a></div>`;
  }

  document.addEventListener('click', event => {
    const button = event.target.closest('[data-sg-image], [data-sg-trailer], [data-sg-close], [data-sg-prev], [data-sg-next], [data-sg-select], [data-sg-sound]');
    if (!button) return;
    if (button.hasAttribute('data-sg-close')) { stop(); return; }
    if (button.hasAttribute('data-sg-prev')) { moveImage(-1); return; }
    if (button.hasAttribute('data-sg-next')) { moveImage(1); return; }
    if (button.hasAttribute('data-sg-select') && viewer?.mode === 'images') { viewer.index = Number(button.dataset.sgSelect); drawImage(); return; }
    if (button.hasAttribute('data-sg-sound') && viewer?.mode === 'video') {
      viewer.muted = !viewer.muted;
      viewer.dialog.querySelector('iframe')?.contentWindow?.postMessage(JSON.stringify({ event: 'command', func: viewer.muted ? 'mute' : 'unMute', args: [] }), 'https://www.youtube-nocookie.com');
      button.setAttribute('aria-pressed', String(!viewer.muted));
      button.querySelector('span').textContent = viewer.muted ? 'Sesi aç' : 'Sesi kapat';
      return;
    }
    const show = shows.get(Number(button.dataset.sgId || button.dataset.sgTrailer));
    if (!show) return;
    if (button.hasAttribute('data-sg-trailer')) openVideo(show, button);
    else openImages(show, Number(button.dataset.sgImage) || 0, button);
  });

  document.addEventListener('error', event => {
    const image = event.target;
    if (!(image instanceof HTMLImageElement) || !image.closest('.sg-gallery, .sg-viewer')) return;
    image.hidden = true;
    const placeholder = image.parentElement.querySelector('.sg-image-fallback');
    if (placeholder) placeholder.hidden = false;
  }, true);
  document.addEventListener('visibilitychange', () => { if (document.hidden && viewer?.mode === 'video') stop(); });
  window.addEventListener('pagehide', stop);
  window.addEventListener('popstate', stop);
  window.addEventListener('hashchange', stop);
  document.addEventListener('close', event => { if (event.target.id === 'detail') stop(); }, true);
  new MutationObserver(() => {
    if (viewer && (!viewer.trigger?.isConnected || !viewer.trigger.closest('dialog')?.open)) stop();
  }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['open'] });

  window.SahneGallery = { render, load, stop, isPlaying: () => viewer?.mode === 'video', isOpen: () => !!viewer };
})();
