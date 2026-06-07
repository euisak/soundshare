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

// 노래 검색 함수
// 사용자가 입력한 검색어를 iTunes Search API에 보내고, 게시글에 추가할 트랙 목록으로 변환한다.
// KR/US 결과를 함께 가져와 국내곡과 해외곡을 모두 검색할 수 있게 한다.
export async function searchTracksItunes(q, limitN = 25) {
  // iTunes Search API 요청 주소를 만든다.
  // term은 검색어, entity=song은 노래만 검색하겠다는 의미이다.
  // encodeURIComponent()는 한글/공백/특수문자가 URL에서 깨지지 않게 변환한다.
  const base = `https://itunes.apple.com/search?term=${encodeURIComponent(q)}&entity=song&limit=${limitN}`;

  // 한국 스토어와 미국 스토어를 동시에 검색한다.
  // Promise.allSettled()를 사용하면 둘 중 하나가 실패해도 성공한 쪽 결과는 사용할 수 있다.
  const [krRes, usRes] = await Promise.allSettled([
    itunesJSONP(base + "&country=KR"),
    itunesJSONP(base + "&country=US"),
  ]);
  // 검색 성공 시 results 배열을 사용하고, 실패한 경우 빈 배열로 처리한다.
  const krResults = krRes.status === "fulfilled" ? (krRes.value.results || []) : [];
  const usResults = usRes.status === "fulfilled" ? (usRes.value.results || []) : [];

  // KR 결과를 먼저 넣고 US 결과를 뒤에 붙인다.
  // 같은 trackId가 있으면 한 번만 추가해 중복 검색 결과를 제거한다.
  const seen = new Set();
  const merged = [];
  for (const t of [...krResults, ...usResults]) {
    if (t.trackId && !seen.has(t.trackId)) {
      seen.add(t.trackId);
      merged.push(t);
    }
  }
  if (!merged.length) return [];

  // 관련도 점수 계산
  // 곡명 일치 결과를 가장 우선하고, 그 다음 가수명/앨범명 일치 결과를 보여준다.
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

  // 관련도순으로 정렬한 뒤, 화면에서 사용할 트랙 객체 형태로 변환한다.
  // albumArt, previewUrl, appleMusicUrl 등은 상세 페이지에서 앨범아트/미리듣기/외부 링크로 사용된다.
  return merged
    .map((t, i) => ({ t, r: relevance(t), i }))
    .filter(({ r }) => r > 0)
    .sort((a, b) => b.r - a.r || a.i - b.i)
    .map(({ t }) => ({
      // iTunes 원본 데이터에서 화면 출력과 Firestore 저장에 필요한 값만 추린다.
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
