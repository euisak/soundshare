import { loadHeader, initTopbar } from "./app.js";
import { searchPosts } from "./post.js";
import { renderPostCard, resolveAvatars, escHtml } from "./ui.js";

await loadHeader();
initTopbar();

const input   = document.querySelector("#searchInput");
const meta    = document.querySelector("#searchMeta");
const results = document.querySelector("#results");

// ── 선택된 검색 조건 가져오기 ──────────────────────────────────────
function getSearchFields() {
  return [...document.querySelectorAll("#searchFieldChips .chip.active")]
    .map((c) => c.dataset.field).filter(Boolean);
}

// ── 검색 실행 ─────────────────────────────────────────────────────
async function doSearch(kw) {
  const fields = getSearchFields();
  document.querySelector("#searchFieldWrap").hidden = false;
  results.innerHTML = Array(3).fill('<div class="skeleton feed-skeleton"></div>').join("");
  meta.textContent = "";
  try {
    const posts = await searchPosts(kw, fields);
    meta.textContent = `"${kw}" 검색 결과 ${posts.length}건`;
    if (!posts.length) {
      results.innerHTML = `<div class="card empty-state">"${escHtml(kw)}"에 대한 결과가 없습니다.</div>`;
      return;
    }
    results.innerHTML = posts.map(renderPostCard).join("");
    resolveAvatars(results);
  } catch (err) {
    results.innerHTML = `<div class="card empty-state">${err.message}</div>`;
  }
}

// ── 검색 조건 칩 토글 ─────────────────────────────────────────────
document.querySelector("#searchFieldChips")?.addEventListener("click", async (e) => {
  const chip = e.target.closest("[data-field]");
  if (!chip) return;
  const active = document.querySelectorAll("#searchFieldChips .chip.active");
  // 마지막 하나는 해제 불가
  if (chip.classList.contains("active") && active.length <= 1) return;
  chip.classList.toggle("active");
  // 현재 검색어가 있으면 즉시 재검색
  const kw = input.value.trim();
  if (kw) await doSearch(kw);
});

// ── 헤더 검색창 (search.html 위에서 검색 시 in-place 실행) ──────────
document.querySelector(".topbar-search")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const kw = (e.currentTarget.querySelector(".topbar-search-input")?.value || "").trim();
  if (!kw) return;
  input.value = kw;
  history.replaceState({}, "", `?q=${encodeURIComponent(kw)}`);
  await doSearch(kw);
});

// ── 페이지 내 검색창 ────────────────────────────────────────────
document.querySelector("#formSearch")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const kw = input.value.trim();
  if (!kw) return;
  history.replaceState({}, "", `?q=${encodeURIComponent(kw)}`);
  await doSearch(kw);
});

// ── 다른 페이지 헤더 검색바에서 이동 시 URL ?q= 자동 검색 ──────────
const q = new URLSearchParams(window.location.search).get("q") || "";
if (q) { input.value = q; await doSearch(q); }
