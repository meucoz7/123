const express = require('express');
const axios = require('axios');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const PORT = process.env.PORT || 3000;
const LUMEX_USERNAME = process.env.LUMEX_USERNAME;
const LUMEX_PASSWORD = process.env.LUMEX_PASSWORD;
const LUMEX_CLIENT_ID = process.env.LUMEX_CLIENT_ID;
const LUMEX_SERVICE_DOMAIN = process.env.LUMEX_SERVICE_DOMAIN || 'localhost';
const PORTAL_API_TOKEN = process.env.PORTAL_API_TOKEN;

// In-memory tokens (for demo). Consider secure storage/refresh queues in prod.
let accessToken = null;
let refreshToken = null;
let accessTokenExpiryMs = 0; // best-effort cache window

async function login() {
  const url = 'https://api.lumex.pw/login';
  const body = { username: LUMEX_USERNAME, password: LUMEX_PASSWORD };
  const { data } = await axios.post(url, body, { timeout: 15000 });
  accessToken = data.accessToken;
  refreshToken = data.refreshToken;
  // Access token TTL is 15min. Refresh a bit earlier.
  accessTokenExpiryMs = Date.now() + 14 * 60 * 1000;
}

async function refresh() {
  if (!refreshToken) return login();
  const url = 'https://api.lumex.pw/refresh';
  const body = { token: refreshToken };
  const { data } = await axios.post(url, body, { timeout: 15000 });
  accessToken = data.accessToken;
  accessTokenExpiryMs = Date.now() + 14 * 60 * 1000;
}

async function ensureAccessToken() {
  if (!accessToken || Date.now() > accessTokenExpiryMs) {
    if (refreshToken) {
      try {
        await refresh();
        return;
      } catch (e) {
        // fallthrough to re-login
      }
    }
    await login();
  }
}

// Static
app.use('/public', express.static(path.join(__dirname, 'public')));

// Health
app.get('/health', (_req, res) => res.json({ ok: true }));

// Search proxy -> portal.lumex.host/api/short
app.get('/api/search', async (req, res) => {
  try {
    const { title, kinopoisk_id, imdb_id, world_art_id, id, page, limit } = req.query;
    const params = new URLSearchParams();
    params.set('api_token', PORTAL_API_TOKEN);
    if (title) params.set('title', title);
    if (kinopoisk_id) params.set('kinopoisk_id', kinopoisk_id);
    if (imdb_id) params.set('imdb_id', imdb_id);
    if (world_art_id) params.set('world_art_id', world_art_id);
    if (id) params.set('id', id);
    if (page) params.set('page', page);
    if (limit) params.set('limit', limit);

    const url = `https://portal.lumex.host/api/short?${params.toString()}`;
    const { data } = await axios.get(url, { timeout: 15000 });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: true, message: err.message });
  }
});

// Stream info by kpId or contentId
app.get('/api/stream', async (req, res) => {
  try {
    const { kpId, contentId, contentType } = req.query; // contentType: short|tv-series
    if (!kpId && !contentId) {
      return res.status(400).json({ error: true, message: 'kpId or contentId required' });
    }
    await ensureAccessToken();

    const params = new URLSearchParams();
    params.set('clientId', LUMEX_CLIENT_ID);
    params.set('domain', LUMEX_SERVICE_DOMAIN);
    params.set('contentType', contentType || (kpId ? 'short' : 'tv-series'));
    if (kpId) params.set('kpId', kpId);
    if (contentId) params.set('contentId', contentId);

    const url = `https://api.lumex.pw/stream?${params.toString()}`;
    const { data } = await axios.get(url, {
      timeout: 20000,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'User-Agent': req.headers['user-agent'] || 'Mozilla/5.0',
      },
    });
    res.json(data);
  } catch (err) {
    if (err.response && err.response.status === 403) {
      try {
        await refresh();
        return res.redirect(307, req.originalUrl);
      } catch (_) {}
    }
    res.status(500).json({ error: true, message: err.message });
  }
});

// Verify playlist -> get HLS url
app.post('/api/verify', async (req, res) => {
  try {
    const { playlistPath } = req.body; // value from "playlist" field
    if (!playlistPath || typeof playlistPath !== 'string') {
      return res.status(400).json({ error: true, message: 'playlistPath required' });
    }
    await ensureAccessToken();

    const verifyUrl = `https://api.lumex.pw${playlistPath}`;
    const { data } = await axios.post(verifyUrl, {}, {
      timeout: 20000,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'User-Agent': req.headers['user-agent'] || 'Mozilla/5.0',
      },
    });
    res.json(data);
  } catch (err) {
    if (err.response && err.response.status === 403) {
      try {
        await refresh();
        return res.redirect(307, req.originalUrl);
      } catch (_) {}
    }
    res.status(500).json({ error: true, message: err.message });
  }
});

// Serve index
app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
