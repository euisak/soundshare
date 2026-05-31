import { getConfig } from "./app.js";

const LS_TOKENS = "spotify.tokens.v2";
const LS_VERIFIER = "spotify.pkce.verifier";

export function getSpotifyConfig() {
  return getConfig().spotify;
}

// ── Token storage ─────────────────────────────────────────────────────────────

export function getTokens() {
  try { return JSON.parse(localStorage.getItem(LS_TOKENS) || "null"); }
  catch { return null; }
}

export function setTokens(data) {
  localStorage.setItem(LS_TOKENS, JSON.stringify({ ...data, acquiredAt: Date.now() }));
}

export function clearTokens() {
  localStorage.removeItem(LS_TOKENS);
  localStorage.removeItem(LS_VERIFIER);
}

export function isConnected() {
  return !!getTokens()?.accessToken;
}

function isExpired() {
  const t = getTokens();
  if (!t) return true;
  return Date.now() > t.acquiredAt + (t.expiresIn - 60) * 1000;
}

// ── PKCE helpers ──────────────────────────────────────────────────────────────

function base64url(buf) {
  return btoa(String.fromCharCode(...buf))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

async function sha256(str) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
  return new Uint8Array(buf);
}

// ── Authorization ─────────────────────────────────────────────────────────────

export async function buildSpotifyAuthorizeUrl({ state = "v2" } = {}) {
  const { clientId, redirectUri } = getSpotifyConfig();

  const verifier = base64url(crypto.getRandomValues(new Uint8Array(32)));
  localStorage.setItem(LS_VERIFIER, verifier);
  const challenge = base64url(await sha256(verifier));

  const u = new URL("https://accounts.spotify.com/authorize");
  u.searchParams.set("response_type", "code");
  u.searchParams.set("client_id", clientId);
  u.searchParams.set("redirect_uri", redirectUri);
  u.searchParams.set("scope", [
    "user-read-currently-playing",
    "playlist-read-private",
    "playlist-modify-private",
    "playlist-modify-public",
    "user-library-read",
  ].join(" "));
  u.searchParams.set("state", state);
  u.searchParams.set("code_challenge_method", "S256");
  u.searchParams.set("code_challenge", challenge);
  return u.toString();
}

export async function exchangeCodeForTokens(code) {
  const { clientId, redirectUri } = getSpotifyConfig();
  const verifier = localStorage.getItem(LS_VERIFIER);
  if (!verifier) throw new Error("PKCE verifier가 없습니다. 다시 연결해주세요.");

  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
      code_verifier: verifier,
    }),
  });
  if (!res.ok) throw new Error("토큰 교환 실패: " + (await res.text()));
  const data = await res.json();
  setTokens({
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in,
  });
  localStorage.removeItem(LS_VERIFIER);
}

async function refreshAccessToken() {
  const { clientId } = getSpotifyConfig();
  const tokens = getTokens();
  if (!tokens?.refreshToken) throw new Error("Refresh token이 없습니다. 다시 연결해주세요.");

  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: tokens.refreshToken,
      client_id: clientId,
    }),
  });
  if (!res.ok) { clearTokens(); throw new Error("토큰 갱신 실패. 다시 연결해주세요."); }
  const data = await res.json();
  setTokens({
    ...tokens,
    accessToken: data.access_token,
    expiresIn: data.expires_in,
    ...(data.refresh_token ? { refreshToken: data.refresh_token } : {}),
  });
}

// ── Spotify API fetch ─────────────────────────────────────────────────────────

export async function spotifyFetch(path, { method = "GET", body } = {}) {
  if (!isConnected()) throw new Error("Spotify가 연결되지 않았습니다.");
  if (isExpired()) await refreshAccessToken();

  const doRequest = async () => {
    const tokens = getTokens();
    return fetch(`https://api.spotify.com/v1${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${tokens.accessToken}`,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  };

  let res = await doRequest();
  if (res.status === 401) {
    await refreshAccessToken();
    res = await doRequest();
  }
  if (!res.ok) throw new Error(`Spotify API 오류 (${res.status})`);
  return res.status === 204 ? null : res.json();
}

// ── iTunes Search API — JSONP (CORS 우회) ────────────────────────────────────

let _itunesSeq = 0;
function itunesJSONP(url) {
  return new Promise((resolve, reject) => {
    const cbName = "__itunes_" + Date.now() + "_" + (++_itunesSeq);
    const script = document.createElement("script");
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("검색 요청 시간이 초과됐습니다."));
    }, 8000);

    function cleanup() {
      clearTimeout(timer);
      delete window[cbName];
      if (script.parentNode) script.parentNode.removeChild(script);
    }

    window[cbName] = (data) => { cleanup(); resolve(data); };
    script.onerror = () => { cleanup(); reject(new Error("검색에 실패했습니다.")); };
    script.src = url + "&callback=" + cbName;
    document.head.appendChild(script);
  });
}

export async function searchTracksItunes(q, limitN = 30) {
  const base = `https://itunes.apple.com/search?term=${encodeURIComponent(q)}&entity=song&limit=${limitN}`;

  // KR + US 병렬 검색
  const [krRes, usRes] = await Promise.allSettled([
    itunesJSONP(base + "&country=KR"),
    itunesJSONP(base + "&country=US"),
  ]);
  const krResults = krRes.status === "fulfilled" ? (krRes.value.results || []) : [];
  const usResults = usRes.status === "fulfilled" ? (usRes.value.results || []) : [];

  // KR 우선으로 병합 (중복 trackId 제거)
  const seen = new Set();
  const merged = [];
  for (const t of [...krResults, ...usResults]) {
    if (t.trackId && !seen.has(t.trackId)) {
      seen.add(t.trackId);
      merged.push(t);
    }
  }
  if (!merged.length) return [];

  // 관련도 점수
  const lq    = q.toLowerCase().trim();
  const words = lq.split(/\s+/).filter(Boolean);

  function relevance(t) {
    const name   = (t.trackName      || "").toLowerCase().trim();
    const artist = (t.artistName     || "").toLowerCase().trim();
    const album  = (t.collectionName || "").toLowerCase().trim();
    const nameWords = name.split(/\s+/);

    // 제목 완전 일치
    if (name === lq) return 100;
    // 쿼리 단어 전부 제목 단어에 정확히 포함 (순서 무관)
    if (words.every(w => nameWords.includes(w))) return 95;
    // 제목이 쿼리로 시작
    if (name.startsWith(lq)) return 90;
    // 제목에 쿼리 문자열 포함
    if (name.includes(lq)) return 80;
    // 쿼리 단어 전부 제목 어딘가에 포함 (substring)
    if (words.length > 1 && words.every(w => name.includes(w))) return 75;
    // 쿼리 단어 전부 제목+아티스트에 포함 (단어 기준)
    if (words.length > 1 && words.every(w => (name + " " + artist).split(/\s+/).includes(w))) return 70;
    // 제목+아티스트에 substring으로 전부 포함
    if (words.length > 1 && words.every(w => (name + " " + artist).includes(w))) return 65;
    // 아티스트 일치
    if (artist === lq) return 60;
    if (artist.startsWith(lq)) return 55;
    if (artist.includes(lq)) return 50;
    if (album.includes(lq)) return 30;
    return 0;
  }

  // 관련도순 → 원래 순서(인기순) 유지
  return merged
    .map((t, i) => ({ t, r: relevance(t), i }))
    .filter(({ r }) => r > 0)
    .sort((a, b) => b.r - a.r || a.i - b.i)
    .map(({ t }) => ({
      id: String(t.trackId),
      name: t.trackName,
      artist: t.artistName,
      album: t.collectionName || "",
      albumArt: t.artworkUrl100?.replace("100x100bb", "300x300bb") || "",
      previewUrl: t.previewUrl || null,
      appleMusicUrl: t.trackViewUrl || null,
      spotifySearchUrl: `https://open.spotify.com/search/${encodeURIComponent(t.trackName + " " + t.artistName)}`,
      genreName: t.primaryGenreName || "",
    }));
}

export async function getArtistGenres(artistId) {
  if (!artistId) return [];
  const data = await spotifyFetch(`/artists/${artistId}`);
  return data.genres || [];
}

export async function getUserPlaylists() {
  const data = await spotifyFetch("/me/playlists?limit=20");
  return data.items.map((p) => ({
    id: p.id,
    name: p.name,
    image: p.images[0]?.url || "",
    trackCount: p.tracks.total,
  }));
}

export async function addTrackToPlaylist(playlistId, trackUri) {
  return spotifyFetch(`/playlists/${playlistId}/tracks`, {
    method: "POST",
    body: { uris: [trackUri] },
  });
}

export async function getCurrentlyPlaying() {
  return spotifyFetch("/me/player/currently-playing");
}
