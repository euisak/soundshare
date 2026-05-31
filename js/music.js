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

    if (name === lq) return 100;
    if (words.every(w => nameWords.includes(w))) return 95;
    if (name.startsWith(lq)) return 90;
    if (name.includes(lq)) return 80;
    if (words.length > 1 && words.every(w => name.includes(w))) return 75;
    if (words.length > 1 && words.every(w => (name + " " + artist).split(/\s+/).includes(w))) return 70;
    if (words.length > 1 && words.every(w => (name + " " + artist).includes(w))) return 65;
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
