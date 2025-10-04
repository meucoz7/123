/* global Hls, videojs */

const resultsEl = document.getElementById('results');
const pagersEl = document.getElementById('pagers');
const translationSelect = document.getElementById('translationSelect');
const seasonSelect = document.getElementById('seasonSelect');
const episodeSelect = document.getElementById('episodeSelect');
const seriesSelectors = document.getElementById('seriesSelectors');
const adNotice = document.getElementById('adNotice');

let player = null;
let currentStreamMeta = null; // response from /api/stream
let currentHls = null;
let adPluginReady = false;
let pendingVastTagUrl = null;

function initPlayer() {
  if (!player) {
    player = videojs('player', {
      autoplay: false,
      controls: true,
      preload: 'auto',
      fluid: true,
    });

    // Initialize ads plugin
    if (player.ads) {
      player.ads();
    }

    // Initialize IMA plugin
    if (player.ima) {
      player.ima({
        debug: false,
        timeout: 5000,
        prerollTimeout: 5000,
        requestMode: 'onload',
      });
      adPluginReady = true;
    }
  }
}

function clearResults() {
  resultsEl.innerHTML = '';
  pagersEl.innerHTML = '';
}

async function search(query, page = 1) {
  clearResults();
  const params = new URLSearchParams();
  if (/^\d+$/.test(query)) {
    params.set('kinopoisk_id', query);
  } else {
    params.set('title', query);
  }
  params.set('page', String(page));
  const res = await fetch(`/api/search?${params.toString()}`);
  const data = await res.json();
  if (!data || !data.data) return;

  data.data.forEach(item => {
    const el = document.createElement('a');
    el.className = 'list-group-item list-group-item-action';
    el.innerHTML = `<div class="d-flex w-100 justify-content-between">
      <strong>${item.title}</strong>
      <small>${item.type || ''} ${item.year ? '('+item.year+')' : ''}</small>
    </div>
    <div class="small text-secondary">KP: ${item.kp_id || item.kinopoisk_id || '-'}</div>`;
    el.addEventListener('click', () => onResultClick(item));
    resultsEl.appendChild(el);
  });

  const pager = document.createElement('div');
  pager.className = 'd-flex gap-2';
  if (data.prev_page_url) {
    const btn = document.createElement('button');
    btn.className = 'btn btn-sm btn-secondary';
    btn.textContent = 'Назад';
    btn.onclick = () => search(query, (data.current_page || 2) - 1);
    pagersEl.appendChild(btn);
  }
  if (data.next_page_url) {
    const btn = document.createElement('button');
    btn.className = 'btn btn-sm btn-secondary';
    btn.textContent = 'Вперёд';
    btn.onclick = () => search(query, (data.current_page || 0) + 1);
    pagersEl.appendChild(btn);
  }
}

async function onResultClick(item) {
  initPlayer();
  stopPlayback();
  translationSelect.innerHTML = '';
  seasonSelect.innerHTML = '';
  episodeSelect.innerHTML = '';
  seriesSelectors.style.display = 'none';

  const kpId = item.kp_id || item.kinopoisk_id;
  const contentType = (item.type === 'serial' || item.type === 'tv-series') ? 'tv-series' : 'short';

  const params = new URLSearchParams();
  if (kpId) params.set('kpId', kpId);
  params.set('contentType', contentType);
  const res = await fetch(`/api/stream?${params.toString()}`);
  const data = await res.json();
  if (!data || !data.player) return;

  currentStreamMeta = data.player;
  // Setup VAST preroll tags, if present
  try {
    const rolls = (data.ads && Array.isArray(data.ads.rolls)) ? data.ads.rolls : [];
    pendingVastTagUrl = rolls.length ? (rolls[0].tag_url || rolls[0].tagUrl) : null;
  } catch (_) {
    pendingVastTagUrl = null;
  }
  buildSelectors(currentStreamMeta);
}

function buildSelectors(meta) {
  translationSelect.innerHTML = '';
  seasonSelect.innerHTML = '';
  episodeSelect.innerHTML = '';

  if (meta.content_type === 'movie') {
    const options = meta.media || [];
    options.forEach(opt => {
      const o = document.createElement('option');
      o.value = String(opt.translation_id);
      o.textContent = `${opt.translation_name || 'Озвучка'} (${opt.max_quality || ''}p)`;
      o.dataset.playlist = opt.playlist;
      translationSelect.appendChild(o);
    });
    seriesSelectors.style.display = 'none';
    if (options.length) {
      translationSelect.onchange = () => startPlayback(options.find(x => String(x.translation_id) === translationSelect.value));
      startPlayback(options[0]);
    }
  } else {
    // tv-series
    seriesSelectors.style.display = 'block';
    const seasons = meta.media || [];
    seasons.forEach(season => {
      const o = document.createElement('option');
      o.value = String(season.season_id);
      o.textContent = season.season_name || `Сезон ${season.season_id}`;
      seasonSelect.appendChild(o);
    });

    seasonSelect.onchange = () => onSeasonChange(seasons);
    onSeasonChange(seasons);
  }
}

function onSeasonChange(seasons) {
  const season = seasons.find(s => String(s.season_id) === seasonSelect.value) || seasons[0];
  episodeSelect.innerHTML = '';
  translationSelect.innerHTML = '';
  if (!season) return;

  const episodes = season.episodes || [];
  episodes.forEach(ep => {
    const o = document.createElement('option');
    o.value = String(ep.episode_id);
    o.textContent = ep.name || `Серия ${ep.episode_id}`;
    o.dataset.episode = JSON.stringify(ep);
    episodeSelect.appendChild(o);
  });

  episodeSelect.onchange = () => onEpisodeChange();
  onEpisodeChange();
}

function onEpisodeChange() {
  translationSelect.innerHTML = '';
  const selected = episodeSelect.options[episodeSelect.selectedIndex];
  if (!selected) return;
  const ep = JSON.parse(selected.dataset.episode);
  const medias = ep.media || [];
  medias.forEach(m => {
    const o = document.createElement('option');
    o.value = String(m.translation_id);
    o.textContent = `${m.translation_name || 'Озвучка'} (${m.max_quality || ''}p)`;
    o.dataset.playlist = m.playlist;
    translationSelect.appendChild(o);
  });
  translationSelect.onchange = () => startPlayback(medias.find(x => String(x.translation_id) === translationSelect.value));
  if (medias.length) startPlayback(medias[0]);
}

async function startPlayback(mediaItem) {
  if (!mediaItem) return;
  const playlistPath = mediaItem.playlist;
  if (!playlistPath) return;

  // If VAST tag available, play preroll before content.
  if (adPluginReady && pendingVastTagUrl) {
    try {
      adNotice.style.display = 'block';
      player.ima.changeAdTag(pendingVastTagUrl);
      await new Promise((resolve) => {
        const onAdsDone = () => {
          adNotice.style.display = 'none';
          player.off('ads-ad-ended', onAdsDone);
          player.off('adserror', onAdsDone);
          player.off('adtimeout', onAdsDone);
          resolve();
        };
        player.on('ads-ad-ended', onAdsDone);
        player.on('adserror', onAdsDone);
        player.on('adtimeout', onAdsDone);
        // Start ad request
        player.ima.requestAds();
        // Some skins require a play() kick to start ad loading flow
        try { player.play(); } catch (_) {}
      });
    } catch (e) {
      adNotice.style.display = 'none';
    }
  }

  const verifyRes = await fetch('/api/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ playlistPath })
  });
  let verifyData;
  try {
    verifyData = await verifyRes.json();
  } catch (_) {
    verifyData = await verifyRes.text();
  }
  const hlsUrl = (typeof verifyData === 'string')
    ? verifyData
    : verifyData && (verifyData.url || verifyData.hls || verifyData.HLS || verifyData.playlist || verifyData.stream || verifyData.src);

  if (!hlsUrl) {
    console.warn('Не удалось получить HLS ссылку', verifyData);
    return;
  }

  playHls(hlsUrl);
}

function stopPlayback() {
  if (currentHls) {
    currentHls.destroy();
    currentHls = null;
  }
  if (player) {
    player.pause();
    player.reset();
  }
}

function playHls(hlsUrl) {
  initPlayer();

  // Prefer native HLS if supported (Safari). Otherwise use hls.js
  const videoEl = player.tech().el();

  if (videoEl.canPlayType('application/vnd.apple.mpegurl')) {
    player.src({ src: hlsUrl, type: 'application/vnd.apple.mpegurl' });
    player.play();
    return;
  }

  if (Hls.isSupported()) {
    if (currentHls) {
      currentHls.destroy();
      currentHls = null;
    }
    currentHls = new Hls({
      enableWorker: true,
      lowLatencyMode: true,
    });
    currentHls.loadSource(hlsUrl);
    currentHls.attachMedia(videoEl);
    currentHls.on(Hls.Events.MANIFEST_PARSED, () => {
      player.play();
    });
  } else {
    // Fallback to setting src
    player.src({ src: hlsUrl, type: 'application/vnd.apple.mpegurl' });
    player.play();
  }
}

// Search form
const form = document.getElementById('searchForm');
form.addEventListener('submit', (e) => {
  e.preventDefault();
  const q = document.getElementById('searchInput').value.trim();
  if (!q) return;
  search(q);
});

// Initial
initPlayer();
