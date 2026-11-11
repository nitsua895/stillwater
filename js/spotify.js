// Spotify "now playing". Spotify never gives apps the audio itself, so this tells
// Stillwater WHICH song is on (to pick the world and show the title). The mic
// still provides the sound the physics reacts to.
//
// Runs entirely in the browser (Authorization Code + PKCE), no server needed.
// One-time setup: create an app at developer.spotify.com/dashboard, add this
// page's URL as a Redirect URI, and paste the app's Client ID into Stillwater.

const AUTH = 'https://accounts.spotify.com/authorize';
const TOKEN = 'https://accounts.spotify.com/api/token';
const NOW = 'https://api.spotify.com/v1/me/player/currently-playing';
const SCOPES = 'user-read-currently-playing user-read-playback-state';
const K = { id: 'sw-sp-client', verifier: 'sw-sp-verifier', tok: 'sw-sp-token' };

const store = {
  get: k => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch {} },
};
const redirectUri = () => location.origin + location.pathname;
const b64url = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export function createSpotify({ onTrack, onStatus }) {
  let token = null, timer = null, lastId = null;
  try { token = JSON.parse(store.get(K.tok) || 'null'); } catch {}

  const clientId = () => store.get(K.id);
  const setClientId = id => store.set(K.id, id.trim());

  async function login() {
    const id = clientId();
    if (!id) throw new Error('no client id');
    const verifier = b64url(crypto.getRandomValues(new Uint8Array(48)));
    const challenge = b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
    store.set(K.verifier, verifier);
    const q = new URLSearchParams({ response_type: 'code', client_id: id, scope: SCOPES, redirect_uri: redirectUri(), code_challenge_method: 'S256', code_challenge: challenge });
    location.href = `${AUTH}?${q}`;
  }

  async function tokenRequest(body) {
    const r = await fetch(TOKEN, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(body) });
    if (!r.ok) throw new Error(`token ${r.status}`);
    const j = await r.json();
    token = { access: j.access_token, refresh: j.refresh_token || token?.refresh, exp: Date.now() + (j.expires_in - 60) * 1000 };
    store.set(K.tok, JSON.stringify(token));
  }

  // called on page load: finish the login if Spotify just sent us back here
  async function handleRedirect() {
    const q = new URLSearchParams(location.search);
    const code = q.get('code'), err = q.get('error');
    if (!code && !err) return;
    history.replaceState(null, '', redirectUri());
    if (err) { onStatus?.(`Spotify said: ${err}`); return; }
    await tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: redirectUri(), client_id: clientId(), code_verifier: store.get(K.verifier) });
    store.set(K.verifier, null);
  }

  async function fresh() {
    if (!token) return null;
    if (Date.now() > token.exp) {
      try { await tokenRequest({ grant_type: 'refresh_token', refresh_token: token.refresh, client_id: clientId() }); }
      catch { token = null; store.set(K.tok, null); onStatus?.('Spotify sign-in expired. Tap Spotify to reconnect.'); return null; }
    }
    return token.access;
  }

  async function poll() {
    const at = await fresh();
    if (!at) return;
    try {
      const r = await fetch(NOW, { headers: { Authorization: `Bearer ${at}` } });
      if (r.status === 204) { onTrack?.(null); return; }
      if (r.status === 401) { token.exp = 0; return; }
      if (!r.ok) return;
      const j = await r.json();
      const it = j.item;
      if (!it) { onTrack?.(null); return; }
      const track = { id: it.id, name: it.name, artists: (it.artists || []).map(a => a.name).join(', '), album: it.album?.name, playing: j.is_playing, progress: j.progress_ms, duration: it.duration_ms };
      track.changed = it.id !== lastId; lastId = it.id;
      onTrack?.(track);
    } catch { /* offline for a moment; try again next tick */ }
  }

  function start() { if (timer) return; poll(); timer = setInterval(poll, 3000); }
  function disconnect() { clearInterval(timer); timer = null; token = null; store.set(K.tok, null); }

  return { login, handleRedirect, start, disconnect, clientId, setClientId, redirectUri, get connected() { return !!token; } };
}
