// index.html 전용 로직
// 게시글 피드 목록, 정렬(최신/인기/오래된), 헤더 검색, 페이지네이션

import { loadHeader, initTopbar } from "./app.js";
import { getPosts, searchPosts }  from "./post.js";
import { escHtml, resolveAvatars, renderFeedCard, renderPagination } from "./ui.js";
import { auth, onAuthStateChanged } from "./firebase.js";

await loadHeader();
initTopbar();

// 로그인 상태 확인 (비공개 글 필터링에 사용)
const currentUser = await new Promise((resolve) => {
  const unsub = onAuthStateChanged(auth, (u) => { unsub(); resolve(u); });
});

const PER_PAGE = 10;
let currentSort   = "recent";
let currentPage   = 1;
let filteredPosts = [];

const listEl   = document.getElementById("postList");
const pgEl     = document.getElementById("feedPagination");
const headerEl = document.getElementById("feedHeader");    // 피드 헤더 (정렬 드롭다운 포함)
const barEl    = document.getElementById("searchBar");     // 검색 메타 영역
const metaEl   = document.getElementById("searchMeta");   // 검색 결과 건수 표시

const sortLabels = { recent: "최신순", popular: "인기순", oldest: "오래된순" };

// 현재 페이지 렌더
function renderPage() {
  const slice = filteredPosts.slice((currentPage - 1) * PER_PAGE, currentPage * PER_PAGE);
  if (!slice.length) {
    listEl.innerHTML = '<div class="empty-state card">게시글이 없습니다.<br>첫 번째 추천을 올려보세요!</div>';
    pgEl.innerHTML = "";
    return;
  }
  listEl.innerHTML = slice.map(p => renderFeedCard(p, { showAuthor: true })).join("");
  pgEl.innerHTML   = renderPagination(filteredPosts.length, currentPage, PER_PAGE);
  resolveAvatars(listEl); // 아바타 사진 비동기 로드
}

// 게시글 목록 로드
// post.js의 getPosts()로 Firestore posts 컬렉션 조회
// currentSort 값에 따라 최신순/인기순 기준 적용
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
    // 비공개 게시글 필터링
    // private 글은 작성자 본인에게만 표시
    filteredPosts = allPosts.filter(p => p.visibility !== "private" || p.authorId === currentUser?.uid); // 비공개 글 필터
    currentPage = 1;
    renderPage();
  } catch (err) {
    listEl.innerHTML = `<div class="card empty-state">${escHtml(err.message)}</div>`;
  }
}

// 헤더 검색 실행
// 검색어를 post.js의 searchPosts()로 전달
// 제목, 아티스트, 곡명, 앨범명 기준으로 결과 필터링
async function doSearch(kw) {
  headerEl.hidden = true;  // 정렬 드롭다운 숨김
  barEl.hidden    = false; // 검색 메타 표시
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
    // kw: 헤더 검색창에서 사용자가 입력한 검색어
    // searchPosts() 기본 검색 대상: 제목, 아티스트, 곡명, 앨범명
    const searchResult = await searchPosts(kw);
    // 검색 결과에서도 비공개 게시글 제외
    // 단, 현재 사용자가 작성자인 경우 표시
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

// 검색 초기화 → 피드로 복귀
function exitSearch() {
  const inp = document.querySelector(".topbar-search-input");
  if (inp) inp.value = "";
  loadPosts();
}

// 헤더 검색창 이벤트
document.querySelector(".topbar-search")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const kw = (e.currentTarget.querySelector(".topbar-search-input")?.value || "").trim();
  if (!kw) { exitSearch(); return; }
  await doSearch(kw);
});
document.querySelector(".topbar-search-input")?.addEventListener("search", (e) => {
  if (!e.target.value) exitSearch(); // X 버튼 클릭 시 피드 복귀
});

// 정렬 드롭다운
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
  // 정렬 메뉴에서 선택한 data-sort 값을 currentSort에 저장
  // 이후 loadPosts() 재실행으로 정렬된 게시글 목록 다시 조회
  currentSort = btn.dataset.sort;
  sortLbl.textContent = sortLabels[currentSort];
  sortMenu.hidden = true;
  currentPage = 1;
  loadPosts(); // 정렬 바뀌면 재로드
});
document.addEventListener("click", (e) => {
  if (!e.target.closest(".feed-sort-wrap")) sortMenu.hidden = true; // 외부 클릭 시 닫기
});

// 페이지네이션 클릭
pgEl.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-page]");
  if (!btn || btn.disabled) return;
  currentPage = Number(btn.dataset.page);
  renderPage();
  window.scrollTo({ top: 0, behavior: "smooth" });
});

await loadPosts();

// 다른 페이지 헤더 검색바에서 ?q= 로 넘어왔을 때 자동 검색
const initialQuery = new URLSearchParams(location.search).get("q");
if (initialQuery) {
  const inp = document.querySelector(".topbar-search-input");
  if (inp) inp.value = initialQuery;
  await doSearch(initialQuery);
}
