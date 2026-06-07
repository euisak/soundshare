// search.html 전용 로직
// 키워드로 게시글 검색, 검색 조건 필터(제목/가수/노래) 칩 토글

import { loadHeader, initTopbar } from "./app.js";
import { searchPosts } from "./post.js";
import { renderFeedCard, resolveAvatars, escHtml } from "./ui.js";

await loadHeader();
initTopbar();

const input   = document.querySelector("#searchInput");
const meta    = document.querySelector("#searchMeta");
const results = document.querySelector("#results");

// 활성화된 검색 조건 칩 목록 반환
function getSearchFields() {
  return [...document.querySelectorAll("#searchFieldChips .chip.active")]
    .map((c) => c.dataset.field).filter(Boolean);
}

// 검색 실행
async function doSearch(kw) {
  const fields = getSearchFields();
  document.querySelector("#searchFieldWrap").hidden = false; // 검색 조건 칩 표시
  results.innerHTML = Array(3).fill('<div class="skeleton feed-skeleton"></div>').join(""); // 스켈레톤 로딩
  meta.textContent = "";
  try {
    const posts = await searchPosts(kw, fields);
    meta.textContent = `"${kw}" 검색 결과 ${posts.length}건`;
    if (!posts.length) {
      results.innerHTML = `<div class="card empty-state">"${escHtml(kw)}"에 대한 결과가 없습니다.</div>`;
      return;
    }
    results.innerHTML = posts.map(p => renderFeedCard(p, { showAuthor: true })).join("");
    resolveAvatars(results); // 아바타 사진 비동기 로드
  } catch (err) {
    results.innerHTML = `<div class="card empty-state">${err.message}</div>`;
  }
}

// 검색 조건 칩 토글 (마지막 하나는 해제 불가)
document.querySelector("#searchFieldChips")?.addEventListener("click", async (e) => {
  const chip = e.target.closest("[data-field]");
  if (!chip) return;
  const active = document.querySelectorAll("#searchFieldChips .chip.active");
  if (chip.classList.contains("active") && active.length <= 1) return; // 최소 1개 유지
  chip.classList.toggle("active");
  const kw = input.value.trim();
  if (kw) await doSearch(kw); // 조건 바뀌면 즉시 재검색
});

// 헤더 검색창 (search.html 위에서 검색 시 페이지 이동 없이 바로 실행)
document.querySelector(".topbar-search")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const kw = (e.currentTarget.querySelector(".topbar-search-input")?.value || "").trim();
  if (!kw) return;
  input.value = kw;
  history.replaceState({}, "", `?q=${encodeURIComponent(kw)}`); // URL 업데이트
  await doSearch(kw);
});

// 페이지 내 검색창
document.querySelector("#formSearch")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const kw = input.value.trim();
  if (!kw) return;
  history.replaceState({}, "", `?q=${encodeURIComponent(kw)}`);
  await doSearch(kw);
});

// 다른 페이지 헤더 검색바에서 이동 시 URL ?q= 자동 검색
const q = new URLSearchParams(window.location.search).get("q") || "";
if (q) { input.value = q; await doSearch(q); }
