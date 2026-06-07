// iTunes Search API로 노래 검색
// CORS 우회를 위해 JSONP 방식 사용 (fetch 불가)
// KR + US 병렬 검색 후 관련도 순으로 정렬하여 반환

let _itunesSeq = 0;

// JSONP 요청 (script 태그로 API 호출, 응답을 콜백 함수로 받음)
function itunesJSONP(url) {
  return new Promise((resolve, reject) => {
    const cbName = "__itunes_" + Date.now() + "_" + (++_itunesSeq); // 충돌 방지용 고유 콜백 이름
    const script = document.createElement("script");
    const timer = setTimeout(() => { // 8초 내 응답 없으면 타임아웃
      cleanup();
      reject(new Error("검색 요청 시간이 초과됐습니다."));
    }, 8000);

    function cleanup() { // script 태그 및 콜백 정리
      clearTimeout(timer);
      delete window[cbName];
      if (script.parentNode) script.parentNode.removeChild(script);
    }

    window[cbName] = (data) => { cleanup(); resolve(data); }; // API 응답 수신
    script.onerror = () => { cleanup(); reject(new Error("검색에 실패했습니다.")); };
    script.src = url + "&callback=" + cbName; // 콜백 이름을 URL에 붙여서 요청
    document.head.appendChild(script);
  });
}

// 노래 검색 (KR + US 병렬 요청 후 중복 제거 및 관련도 정렬)
export async function searchTracksItunes(q, limitN = 30) {
  const base = `https://itunes.apple.com/search?term=${encodeURIComponent(q)}&entity=song&limit=${limitN}`;

  // KR + US 병렬 검색 (한국 음악 + 해외 음악 모두 커버)
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

  // 관련도 점수 계산 (곡명 일치 > 가수 일치 > 앨범 일치 순)
  const lq    = q.toLowerCase().trim();
  const words = lq.split(/\s+/).filter(Boolean);

  function relevance(t) {
    const name   = (t.trackName      || "").toLowerCase().trim();
    const artist = (t.artistName     || "").toLowerCase().trim();
    const album  = (t.collectionName || "").toLowerCase().trim();
    const nameWords = name.split(/\s+/);

    if (name === lq) return 100;                                                                    // 곡명 완전 일치
    if (words.every(w => nameWords.includes(w))) return 95;                                         // 곡명 단어 모두 포함
    if (name.startsWith(lq)) return 90;                                                             // 곡명 시작 일치
    if (name.includes(lq)) return 80;                                                               // 곡명 부분 일치
    if (words.length > 1 && words.every(w => name.includes(w))) return 75;
    if (words.length > 1 && words.every(w => (name + " " + artist).split(/\s+/).includes(w))) return 70;
    if (words.length > 1 && words.every(w => (name + " " + artist).includes(w))) return 65;
    if (artist === lq) return 60;                                                                   // 가수 완전 일치
    if (artist.startsWith(lq)) return 55;
    if (artist.includes(lq)) return 50;                                                             // 가수 부분 일치
    if (album.includes(lq)) return 30;                                                              // 앨범 부분 일치
    return 0;
  }

  // 관련도순 정렬 → 관련도 같으면 원래 순서(인기순) 유지
  return merged
    .map((t, i) => ({ t, r: relevance(t), i }))
    .filter(({ r }) => r > 0)
    .sort((a, b) => b.r - a.r || a.i - b.i)
    .map(({ t }) => ({
      id: String(t.trackId),
      name: t.trackName,
      artist: t.artistName,
      album: t.collectionName || "",
      albumArt: t.artworkUrl100?.replace("100x100bb", "300x300bb") || "", // 고화질 앨범아트
      previewUrl: t.previewUrl || null,                                    // 30초 미리듣기 URL
      appleMusicUrl: t.trackViewUrl || null,
      spotifySearchUrl: `https://open.spotify.com/search/${encodeURIComponent(t.trackName + " " + t.artistName)}`,
    }));
}
