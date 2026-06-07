// write.html 전용 로직
// 게시글 작성 / 수정 (URL hash에 id 있으면 수정 모드)
// 음악 검색(iTunes), 태그 관리, 트랙 드래그앤드롭 순서 변경

import { requireAuth } from "./app.js";
import { createPost, updatePost, getPost } from "./post.js";
import { searchTracksItunes }              from "./music.js";
import { escHtml, showToast }              from "./ui.js";

await requireAuth(); // 비로그인 시 index.html?openAuth=login 으로 리다이렉트

const editId = window.location.hash.slice(1) || null; // URL hash = 수정할 게시글 id
if (editId) {
  document.getElementById("pageHeading").textContent = "게시글 수정";
  document.getElementById("btnPublish").textContent  = "수정하기";
  document.title = "SoundShare — 게시글 수정";
  // 수정 모드: 취소 버튼 → 원본 게시글로 이동
  document.getElementById("cancelBtn").href = `post.html#${editId}`;
}

// ── 제목 카운터 ──────────────────────────────────────
const titleInput  = document.getElementById("postTitle");
const titleCount  = document.getElementById("titleCount"); // 글자 수 표시 span
titleInput.addEventListener("input", () => {
  titleCount.textContent = titleInput.value.length; // 실시간 글자 수 갱신
  titleInput.classList.remove("le-input--error");   // 에러 테두리 해제
});

// ── 태그 ─────────────────────────────────────────────
const MAX_TAGS = 5;    // 최대 태그 수
const tags = [];       // 현재 태그 배열
const tagsWrapEl = document.getElementById("tagsWrap");

function renderTags() {
  const atLimit = tags.length >= MAX_TAGS;
  const chips = tags.map((t) => `
    <span class="le-tag-chip">
      ${escHtml(t)}
      <button type="button" class="le-tag-remove" data-tag="${escHtml(t)}">×</button>
    </span>`).join("");
  tagsWrapEl.innerHTML = chips + (atLimit ? "" : // 5개 도달 시 입력창 숨김
    `<input class="le-tags-input" id="tagsInput" type="text"
            placeholder="태그 추가 (Enter)..." autocomplete="off" maxlength="10" />`);
  if (!atLimit) {
    document.getElementById("tagsInput").addEventListener("keydown", onTagKey);
  }
  document.getElementById("tagsCount").textContent = `(${tags.length}/5)`; // (n/5) 카운터
  document.getElementById("tagsCount").className = atLimit ? "at-limit" : "";
}

function addTag(val) {
  const tag = val.trim().slice(0, 10);
  if (!tag || tags.includes(tag) || tags.length >= MAX_TAGS) return;
  tags.push(tag);
  renderTags();
}

function onTagKey(e) {
  if (e.key === "Enter" || e.key === ",") { // Enter 또는 쉼표 → 태그 추가
    e.preventDefault();
    addTag(e.target.value);
    e.target.value = "";
  } else if (e.key === "Backspace" && !e.target.value && tags.length) { // 빈 칸에서 백스페이스 → 마지막 태그 삭제
    tags.pop();
    renderTags();
  }
}

document.getElementById("tagsInput").addEventListener("keydown", onTagKey);
tagsWrapEl.addEventListener("click", (e) => {
  const btn = e.target.closest(".le-tag-remove");
  if (!btn) return;
  const i = tags.indexOf(btn.dataset.tag);
  if (i > -1) { tags.splice(i, 1); renderTags(); }
});

// ── 장르 (저장용으로만 유지) ─────────────────────────

// ── 트랙 목록 ────────────────────────────────────────
// 검색 결과에서 선택한 곡들을 tracks 배열에 저장한다.
// 이 배열이 게시글 저장 시 Firestore posts 문서의 tracks 필드로 들어간다.
const tracks = [];                                                   // 추가된 트랙 배열
const releasesListEl  = document.getElementById("releasesList");    // 트랙 목록 컨테이너
const releasesCountEl = document.getElementById("releasesCount");   // 트랙 수 표시
const emptyStateEl    = document.getElementById("emptyState");      // 빈 상태 안내

function renderTracks() {
  releasesCountEl.textContent = tracks.length;
  emptyStateEl.hidden = tracks.length > 0;

  const items = tracks.map((t, i) => `
    <div class="le-release-item" draggable="true" data-idx="${i}">
      <span class="le-release-num">${i + 1}</span>
      ${t.albumArt
        ? `<img class="le-release-thumb cursor-default" src="${escHtml(t.albumArt)}" alt="" />`
        : `<div class="le-release-thumb le-thumb-empty">♪</div>`}
      <div class="le-release-info">
        <span class="le-release-name cursor-default">${escHtml(t.name)}</span>
        <div class="le-release-meta">${escHtml(t.artist)}${t.album ? " · " + escHtml(t.album) : ""}</div>
        <div class="le-release-note" contenteditable="true" data-idx="${i}"
             data-placeholder="이 곡에 대한 메모...">${escHtml(t.note || "")}</div>
      </div>
      <div class="le-release-actions">
        <button class="le-release-btn" type="button" data-remove="${i}" aria-label="제거"
                title="제거">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               stroke-width="2.5" stroke-linecap="round">
            <path d="M18 6L6 18M6 6l12 12"/>
          </svg>
        </button>
        <button class="le-release-btn le-release-drag" type="button" aria-label="순서 변경">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M9 5h2M9 12h2M9 19h2M13 5h2M13 12h2M13 19h2"/>
          </svg>
        </button>
      </div>
    </div>`).join("");

  releasesListEl.innerHTML = items;
  if (!tracks.length) releasesListEl.appendChild(emptyStateEl);
  emptyStateEl.hidden = tracks.length > 0;
  setupDnd();
}

releasesListEl.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-remove]");
  if (!btn) return;
  tracks.splice(Number(btn.dataset.remove), 1);
  renderTracks();
});

releasesListEl.addEventListener("input", (e) => {
  const el = e.target.closest(".le-release-note");
  if (el) tracks[Number(el.dataset.idx)].note = el.innerText.trim();
});

// ── Drag & Drop ──────────────────────────────────────
let dragIdx = null; // 드래그 시작한 트랙 인덱스

function setupDnd() {
  releasesListEl.querySelectorAll(".le-release-item").forEach((item) => {
    item.addEventListener("dragstart", (e) => {
      dragIdx = Number(item.dataset.idx); // 드래그 시작 위치 기억
      item.classList.add("le-dragging");
      e.dataTransfer.effectAllowed = "move";
    });
    item.addEventListener("dragend",  () => item.classList.remove("le-dragging"));
    item.addEventListener("dragover", (e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; });
    item.addEventListener("drop", (e) => {
      e.preventDefault();
      const to = Number(item.dataset.idx);
      if (dragIdx === null || dragIdx === to) return;
      const [moved] = tracks.splice(dragIdx, 1); // 원래 위치에서 제거
      tracks.splice(to, 0, moved);               // 드롭 위치에 삽입
      renderTracks();
      dragIdx = null;
    });
  });
}

// ── 검색 ─────────────────────────────────────────────
const searchInputEl   = document.getElementById("searchInput");
const searchResultsEl = document.getElementById("searchResults");
let searchTimer = null; // 디바운스 타이머
let searchSeq = 0;      // 응답 순서 추적 (오래된 응답 무시용)

searchInputEl.addEventListener("input", (e) => {
  clearTimeout(searchTimer);
  const q = e.target.value.trim();
  if (!q) { searchResultsEl.hidden = true; return; }
  if (q.length < 2) {
    searchResultsEl.hidden = false;
    searchResultsEl.innerHTML = '<div class="le-search-msg">두 글자 이상 입력하세요.</div>';
    return;
  }
  searchResultsEl.hidden = false;
  searchResultsEl.innerHTML = '<div class="le-search-msg">검색 중...</div>';
  searchTimer = setTimeout(() => doSearch(q, ++searchSeq), 350); // 350ms 디바운스
});

async function doSearch(q, seq) {
  try {
    // iTunes API에서 검색어에 맞는 트랙 목록을 가져온다.
    // seq 값으로 오래된 검색 응답이 뒤늦게 도착해도 화면을 덮어쓰지 않게 한다.
    const results = await searchTracksItunes(q, 25);  // iTunes API로 검색
    if (seq !== searchSeq) return; // 오래된 응답 무시 (새 검색어가 들어온 경우)
    if (!results.length) {
      searchResultsEl.innerHTML = '<div class="le-search-msg">결과가 없습니다.</div>';
      return;
    }
    searchResultsEl.innerHTML = results.map((r, i) => `
      <div class="le-search-result" data-idx="${i}">
        ${r.albumArt
          ? `<img class="le-search-thumb" src="${escHtml(r.albumArt)}" alt="" />`
          : '<div class="le-search-thumb le-thumb-empty">♪</div>'}
        <div class="le-search-info">
          <div class="le-search-name">${escHtml(r.name)}</div>
          <div class="le-search-meta">${escHtml(r.artist)}${r.album ? " · " + escHtml(r.album) : ""}</div>
        </div>
      </div>`).join("");

    searchResultsEl.querySelectorAll(".le-search-result").forEach((el) => {
      el.addEventListener("click", () => {
        // 검색 결과 HTML의 data-idx 값으로 results 배열에서 실제 트랙 데이터를 찾는다.
        // dataset 값은 문자열이므로 Number()로 숫자 인덱스로 변환한다.
        const r = results[Number(el.dataset.idx)];
        // 검색 결과를 클릭하면 tracks 배열에 추가한다.
        // 같은 id의 곡이 이미 있으면 중복으로 추가하지 않는다.
        if (!tracks.find((x) => x.id === r.id)) { // 중복 추가 방지
          tracks.push(r);
          renderTracks();
        }
        searchInputEl.value = "";
        searchResultsEl.hidden = true;
      });
    });
  } catch (err) {
    if (seq !== searchSeq) return;
    searchResultsEl.innerHTML = `<div class="le-search-msg le-search-error">검색 중 오류가 발생했습니다.</div>`;
    console.error(err);
  }
}

// 검색창 포커스 시 기존 검색어 있으면 결과 다시 표시
searchInputEl.addEventListener("focus", () => {
  const q = searchInputEl.value.trim();
  if (q.length >= 2 && searchResultsEl.innerHTML) {
    searchResultsEl.hidden = false;
  }
});

document.addEventListener("click", (e) => {
  if (!e.target.closest(".le-search-bar")) searchResultsEl.hidden = true;
});

// ── 게시 / 수정 ───────────────────────────────────────
document.getElementById("btnPublish").addEventListener("click", async () => {
  const title = titleInput.value.trim();
  if (!title) { // 제목 필수 검증
    titleInput.classList.add("le-input--error");
    titleInput.focus();
    return;
  }
  const btn = document.getElementById("btnPublish");
  btn.disabled = true;
  btn.textContent = editId ? "수정 중…" : "게시 중…"; // 중복 제출 방지

  try {
    // 게시글 저장에 필요한 데이터를 하나의 payload로 묶는다.
    // tracks 배열에는 사용자가 검색해서 추가한 곡 정보와 곡별 메모가 포함된다.
    // 이 payload는 createPost()/updatePost()로 전달되어 Firestore에 저장된다.
    const payload = {
      title,
      body:       document.getElementById("postBody").value,
      tags:       [...tags],
      tracks,
      visibility: document.getElementById("settingVisibility").value,
    };

    let targetId;
    if (editId) {
      // URL hash에 게시글 id가 있으면 수정 모드로 처리한다.
      await updatePost(editId, payload);
      targetId = editId;
      showToast("수정되었습니다!");
    } else {
      // 새 게시글이면 createPost()가 Firestore posts 컬렉션에 문서를 생성하고 id를 반환한다.
      targetId = await createPost(payload);
      showToast("게시글이 등록되었습니다! 🎵");
    }
    // 저장이 끝나면 생성/수정된 게시글 상세 페이지로 이동한다.
    window.location.replace(`post.html?edited=1#${targetId}`);
  } catch (err) {
    const noticeEl = document.getElementById("notice");
    noticeEl.hidden = false;
    noticeEl.className = "notice danger";
    noticeEl.textContent = err.message;
    btn.disabled = false;
    btn.textContent = editId ? "수정하기" : "게시하기";
  }
});

// ── 수정 모드 초기화 ─────────────────────────────────
if (editId) {
  try {
    const post = await getPost(editId);
    if (post) {
      titleInput.value = post.title || "";
      titleCount.textContent = titleInput.value.length;
      document.getElementById("postBody").value = post.body || "";
      (post.tags || []).forEach((t) => { tags.push(t); });
      renderTags();
      if (Array.isArray(post.tracks)) tracks.push(...post.tracks);
      document.getElementById("settingVisibility").value = post.visibility || "public";
    }
  } catch {
    const noticeEl = document.getElementById("notice");
    noticeEl.hidden = false;
    noticeEl.className = "notice danger";
    noticeEl.textContent = "게시글을 불러오지 못했습니다.";
  }
}

renderTracks();
