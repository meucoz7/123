require('dotenv').config();
const express = require('express');
const morgan = require('morgan');
const cors = require('cors');
const fetch = require('node-fetch');
const { XMLParser } = require('fast-xml-parser');

const app = express();
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

const PORT = process.env.PORT || 3000;
const LUMEX_LOGIN = process.env.LUMEX_LOGIN;
const LUMEX_PASSWORD = process.env.LUMEX_PASSWORD;
const LUMEX_CLIENT_ID = process.env.LUMEX_CLIENT_ID;
const LUMEX_API_TOKEN = process.env.LUMEX_API_TOKEN;
const SERVICE_DOMAIN = process.env.SERVICE_DOMAIN || 'localhost';

let authState = {
  accessToken: null,
  refreshToken: null,
  accessTokenExpiresAt: 0,
};

async function login() {
  const res = await fetch('https://api.lumex.pw/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: LUMEX_LOGIN, password: LUMEX_PASSWORD }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Login failed: ${res.status} ${text}`);
  }
  const data = await res.json();
  authState.accessToken = data.accessToken;
  authState.refreshToken = data.refreshToken;
  // 14 minutes from now to be safe
  authState.accessTokenExpiresAt = Date.now() + (14 * 60 * 1000);
}

async function refresh() {
  if (!authState.refreshToken) return login();
  const res = await fetch('https://api.lumex.pw/refresh', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: authState.refreshToken }),
  });
  if (!res.ok) {
    // fallback to full login
    return login();
  }
  const data = await res.json();
  authState.accessToken = data.accessToken;
  authState.accessTokenExpiresAt = Date.now() + (14 * 60 * 1000);
}

async function ensureAccessToken() {
  if (!authState.accessToken || Date.now() > authState.accessTokenExpiresAt) {
    if (authState.refreshToken) {
      await refresh();
    } else {
      await login();
    }
  }
}

// Static files
app.use('/', express.static('public'));

// Proxy: search via lumex short API (API token based)
app.get('/api/search', async (req, res) => {
  try {
    const { title, kp, imdb, world, id, page } = req.query;
    const base = new URL('https://portal.lumex.host/api/short');
    base.searchParams.set('api_token', LUMEX_API_TOKEN);
    if (title) base.searchParams.set('title', title);
    if (id) base.searchParams.set('id', id);
    if (kp) base.searchParams.set('kinopoisk_id', kp);
    if (imdb) base.searchParams.set('imdb_id', imdb);
    if (world) base.searchParams.set('world_art_id', world);
    if (page) base.searchParams.set('page', page);

    const r = await fetch(base.toString());
    const data = await r.json();
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Proxy: stream manifest meta (needs OAuth access token)
app.get('/api/stream', async (req, res) => {
  try {
    await ensureAccessToken();
    const { kpId, contentId, contentType } = req.query;
    if (!kpId && !contentId) return res.status(400).json({ error: 'kpId or contentId required' });

    const base = new URL('https://api.lumex.pw/stream');
    base.searchParams.set('clientId', LUMEX_CLIENT_ID);
    base.searchParams.set('domain', SERVICE_DOMAIN);
    if (kpId) base.searchParams.set('kpId', kpId);
    if (contentId) base.searchParams.set('contentId', contentId);
    if (contentType) base.searchParams.set('contentType', contentType);

    let r = await fetch(base.toString(), {
      headers: {
        Authorization: `Bearer ${authState.accessToken}`,
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131 Safari/537.36',
      },
    });

    if (r.status === 403) {
      await refresh();
      r = await fetch(base.toString(), {
        headers: {
          Authorization: `Bearer ${authState.accessToken}`,
          'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131 Safari/537.36',
        },
      });
    }

    const text = await r.text();
    // Try JSON parse, else forward text
    try {
      const data = JSON.parse(text);
      return res.status(r.status).json(data);
    } catch {
      return res.status(r.status).send(text);
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Proxy: verify playlist to HLS URL
app.post('/api/verify', async (req, res) => {
  try {
    await ensureAccessToken();
    let { playlistPath } = req.query;
    if (!playlistPath) {
      // allow body too
      playlistPath = req.body.playlistPath;
    }
    if (!playlistPath) return res.status(400).json({ error: 'playlistPath required' });
    // Playlist path already starts with /verify/...
    const url = `https://api.lumex.pw${playlistPath}`;
    const r = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${authState.accessToken}`,
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131 Safari/537.36',
      },
    });

    if (r.status === 403) {
      await refresh();
      // retry once
      const r2 = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${authState.accessToken}`,
          'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131 Safari/537.36',
        },
      });
      const text2 = await r2.text();
      return res.status(r2.status).send(text2);
    }

    const text = await r.text();
    res.status(r.status).send(text);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Proxy: fetch VAST and return parsed JSON
app.get('/api/vast', async (req, res) => {
  try {
    const { tag } = req.query;
    if (!tag) return res.status(400).json({ error: 'tag is required' });
    const r = await fetch(tag, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131 Safari/537.36',
        Accept: 'application/xml,text/xml;q=0.9,*/*;q=0.8',
      },
    });
    const xml = await r.text();
    const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });
    let json;
    try {
      json = parser.parse(xml);
    } catch (err) {
      return res.status(502).json({ error: 'Failed to parse VAST', detail: err.message, xmlSnippet: xml.slice(0, 5000) });
    }
    res.json({ ok: true, vast: json });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
