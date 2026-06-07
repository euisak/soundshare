import { loadHeader, initTopbar } from "./app.js";
import { getPosts, searchPosts }  from "./post.js";
import { escHtml, resolveAvatars, renderFeedCard, renderPagination } from "./ui.js";
import { auth, onAuthStateChanged } from "./firebase.js";

await loadHeader();
initTopbar();

const currentUser = await new Promise((resolve) => {
  const unsub = onAuthStateChanged(auth, (u) => { unsub(); resolve(u); });
});

const PER_PAGE = 10;
let currentSort   = "recent";
let currentPage   = 1;
let filteredPosts = [];

const listEl   = document.getElementById("postList");
const pgEl     = document.getElementById("feedPagination");
const headerEl = document.getElementById("feedHeader");
const barEl    = document.getElementById("searchBar");
const metaEl   = document.getElementById("searchMeta");

const sortLabels = { recent: "최신순", popular: "인기순", oldest: "오래된순" };

// ── 현재 페이지 렌더 ──────────────────────────────────
function renderPage() {
  const slice = filteredPosts.slice((currentPage - 1) * PER_PAGE, currentPage * PER_PAGE);
  if (!slice.length) {
    listEl.innerHTML = '<div class="empty-state card">게시글이 없습니다.<br>첫 번째 추천을 올려보세요!</div>';
    pgEl.innerHTML = "";
    return;
  }
  listEl.innerHTML = slice.map(p => renderFeedCard(p, { showAuthor: true })).join("");
  pgEl.innerHTML   = renderPagination(filteredPosts.length, currentPage, PER_PAGE);
  resolveAvatars(listEl);
}

// ── 데이터 로드 ───────────────────────────────────────
async function loadPosts() {
  headerEl.hidden = false;
  barEl.hidden    = true;
  listEl.innerHTML = Array(6).fill(`
    <div class="post-feed-skeleton">
      <div class="post-feed-skeleton-cover"></div>
      <div class="post-feed-skeleton-body">
        <div class="post-feed-skeleton-line post-feed-skeleton-line--title"></div>
        <div class="post-feed-skeleton-line post-feed-skeleton-line--meta"></div>
        <div class="post-feed-skeleton-line post-feed-skeleton-line--tag"></div>
      </div>
    </div>`).join("");
  pgEl.innerHTML = "";
  try {
    const allPosts = await getPosts({ sort: currentSort });
    filteredPosts = allPosts.filter(p => p.visibility !== "private" || p.authorId === currentUser?.uid);
    currentPage = 1;
    renderPage();
  } catch (err) {
    listEl.innerHTML = `<div class="card empty-state">${escHtml(err.message)}</div>`;
  }
}

// ── 헤더 검색 ─────────────────────────────────────────
async function doSearch(kw) {
  headerEl.hidden = true;
  barEl.hidden    = false;
  pgEl.innerHTML  = "";
  listEl.innerHTML = Array(3).fill(`
    <div class="post-feed-skeleton">
      <div class="post-feed-skeleton-cover"></div>
      <div class="post-feed-skeleton-body">
        <div class="post-feed-skeleton-line post-feed-skeleton-line--title"></div>
        <div class="post-feed-skeleton-line post-feed-skeleton-line--meta"></div>
        <div class="post-feed-skeleton-line post-feed-skeleton-line--tag"></div>
      </div>
    </div>`).join("");
  metaEl.textContent = "";
  try {
    const searchResult = await searchPosts(kw, ["title", "artist", "song", "album"]);
    filteredPosts = searchResult.filter(p => p.visibility !== "private" || p.authorId === currentUser?.uid);
    metaEl.textContent = `"${kw}" 검색 결과 ${filteredPosts.length}건`;
    currentPage = 1;
    if (!filteredPosts.length) {
      listEl.innerHTML = `<div class="card empty-state">"${escHtml(kw)}"에 대한 결과가 없습니다.</div>`;
    } else {
      renderPage();
    }
  } catch (err) {
    listEl.innerHTML = `<div class="card empty-state">${escHtml(err.message)}</div>`;
  }
}

function exitSearch() {
  const inp = document.querySelector(".topbar-search-input");
  if (inp) inp.value = "";
  loadPosts();
}

// ── 헤더 검색창 이벤트 ────────────────────────────────
document.querySelector(".topbar-search")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const kw = (e.currentTarget.querySelector(".topbar-search-input")?.value || "").trim();
  if (!kw) { exitSearch(); return; }
  await doSearch(kw);
});
document.querySelector(".topbar-search-input")?.addEventListener("search", (e) => {
  if (!e.target.value) exitSearch();
});

// ── 정렬 드롭다운 ────────────────────────────────────
const sortBtn  = document.getElementById("sortBtn");
const sortMenu = document.getElementById("sortMenu");
const sortLbl  = document.getElementById("sortLabel");

sortBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  sortMenu.hidden = !sortMenu.hidden;
});
sortMenu.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-sort]");
  if (!btn) return;
  currentSort = btn.dataset.sort;
  sortLbl.textContent = sortLabels[currentSort];
  sortMenu.hidden = true;
  currentPage = 1;
  loadPosts();
});
document.addEventListener("click", (e) => {
  if (!e.target.closest(".feed-sort-wrap")) sortMenu.hidden = true;
});

// ── 페이지네이션 클릭 ────────────────────────────────
pgEl.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-page]");
  if (!btn || btn.disabled) return;
  currentPage = Number(btn.dataset.page);
  renderPage();
  window.scrollTo({ top: 0, behavior: "smooth" });
});

await loadPosts();

// ── 헤더 검색으로 넘어왔을 때 ?q= 자동 실행 ──────────
const initialQuery = new URLSearchParams(location.search).get("q");
if (initialQuery) {
  const inp = document.querySelector(".topbar-search-input");
  if (inp) inp.value = initialQuery;
  await doSearch(initialQuery);
}
