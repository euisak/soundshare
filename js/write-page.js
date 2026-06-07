import { requireAuth } from "./app.js";
import { createPost, updatePost, getPost } from "./post.js";
import { searchTracksItunes }              from "./music.js";
import { escHtml, showToast }              from "./ui.js";

await requireAuth();

const editId = window.location.hash.slice(1) || null;
if (editId) {
  document.getElementById("pageHeading").textContent = "게시글 수정";
  document.getElementById("btnPublish").textContent  = "수정하기";
  document.title = "SoundShare — 게시글 수정";
  // 수정 모드: 취소 버튼 → 원본 게시글로 이동
  document.getElementById("cancelBtn").href = `post.html#${editId}`;
}

// ── 제목 카운터 ──────────────────────────────────────
const titleInput  = document.getElementById("postTitle");
const titleCount  = document.getElementById("titleCount");
titleInput.addEventListener("input", () => {
  titleCount.textContent = titleInput.value.length;
  titleInput.classList.remove("le-input--error");
});

// ── 태그 ─────────────────────────────────────────────
const MAX_TAGS = 5;
const tags = [];
const tagsWrapEl = document.getElementById("tagsWrap");

function renderTags() {
  const atLimit = tags.length >= MAX_TAGS;
  const chips = tags.map((t) => `
    <span class="le-tag-chip">
      ${escHtml(t)}
      <button type="button" class="le-tag-remove" data-tag="${escHtml(t)}">×</button>
    </span>`).join("");
  tagsWrapEl.innerHTML = chips + (atLimit ? "" :
    `<input class="le-tags-input" id="tagsInput" type="text"
            placeholder="태그 추가 (Enter)..." autocomplete="off" maxlength="10" />`);
  if (!atLimit) {
    document.getElementById("tagsInput").addEventListener("keydown", onTagKey);
  }
  document.getElementById("tagsCount").textContent = `(${tags.length}/5)`;
  document.getElementById("tagsCount").className = atLimit ? "at-limit" : "";
}

function addTag(val) {
  const tag = val.trim().slice(0, 10);
  if (!tag || tags.includes(tag) || tags.length >= MAX_TAGS) return;
  tags.push(tag);
  renderTags();
}

function onTagKey(e) {
  if (e.key === "Enter" || e.key === ",") {
    e.preventDefault();
    addTag(e.target.value);
    e.target.value = "";
  } else if (e.key === "Backspace" && !e.target.value && tags.length) {
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
const tracks = [];
const releasesListEl  = document.getElementById("releasesList");
const releasesCountEl = document.getElementById("releasesCount");
const emptyStateEl    = document.getElementById("emptyState");

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
let dragIdx = null;

function setupDnd() {
  releasesListEl.querySelectorAll(".le-release-item").forEach((item) => {
    item.addEventListener("dragstart", (e) => {
      dragIdx = Number(item.dataset.idx);
      item.classList.add("le-dragging");
      e.dataTransfer.effectAllowed = "move";
    });
    item.addEventListener("dragend",  () => item.classList.remove("le-dragging"));
    item.addEventListener("dragover", (e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; });
    item.addEventListener("drop", (e) => {
      e.preventDefault();
      const to = Number(item.dataset.idx);
      if (dragIdx === null || dragIdx === to) return;
      const [moved] = tracks.splice(dragIdx, 1);
      tracks.splice(to, 0, moved);
      renderTracks();
      dragIdx = null;
    });
  });
}

// ── 검색 ─────────────────────────────────────────────
const searchInputEl   = document.getElementById("searchInput");
const searchResultsEl = document.getElementById("searchResults");
let searchTimer = null;
let searchSeq = 0;

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
  searchTimer = setTimeout(() => doSearch(q, ++searchSeq), 350);
});

async function doSearch(q, seq) {
  try {
    const results = await searchTracksItunes(q, 25);
    if (seq !== searchSeq) return; // 오래된 응답 무시
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
        const r = results[Number(el.dataset.idx)];
        if (!tracks.find((x) => x.id === r.id)) {
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
  if (!title) {
    titleInput.classList.add("le-input--error");
    titleInput.focus();
    return;
  }
  const btn = document.getElementById("btnPublish");
  btn.disabled = true;
  btn.textContent = editId ? "수정 중…" : "게시 중…";

  try {
    const payload = {
      title,
      body:       document.getElementById("postBody").value,
      tags:       [...tags],
      tracks,
      visibility: document.getElementById("settingVisibility").value,
    };

    let targetId;
    if (editId) {
      await updatePost(editId, payload);
      targetId = editId;
      showToast("수정되었습니다!");
    } else {
      targetId = await createPost(payload);
      showToast("게시글이 등록되었습니다! 🎵");
    }
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
