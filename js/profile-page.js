// profile.html 전용 로직
// URL hash(#uid)로 다른 유저 프로필 표시, 공개 범위 설정에 따라 게시글/댓글 탭 접근 제한

import { loadHeader, initTopbar } from "./app.js";
import { auth, onAuthStateChanged, db, getDoc, doc } from "./firebase.js";
import { getUserPosts, getCommentedPosts } from "./post.js";
import { avatarLetter, escHtml, resolveAvatars, renderFeedCard, renderPagination, renderCommentedItem } from "./ui.js";

await loadHeader();
initTopbar();

const uid = window.location.hash.slice(1); // URL #uid → 조회할 유저 ID
const tabContent = document.querySelector("#tabContent");

if (!uid || uid === "undefined" || uid === "null") {
  tabContent.innerHTML = '<div class="muted small empty-msg">사용자를 찾을 수 없습니다.</div>';
} else {
  const currentUser = await new Promise((resolve) => { // 로그인 상태 1회 확인
    const unsub = onAuthStateChanged(auth, (u) => { unsub(); resolve(u); });
  });
  const isOwn = currentUser && currentUser.uid === uid; // 본인 프로필 여부

  if (isOwn) document.querySelector("#btnSettings").hidden = false;

  const userSnap = await getDoc(doc(db, "users", uid)).catch(() => null);
  const userData       = userSnap?.exists() ? userSnap.data() : {};
  const postsPublic    = userData.postsPublic    !== false; // 기본값 true (미설정 시 공개)
  const commentsPublic = userData.commentsPublic !== false;

  let displayName = userData.nickname || userData.email?.split("@")[0] || "";
  if (!displayName) {
    const fallbackPosts = await getUserPosts(uid).catch(() => []);
    displayName = fallbackPosts[0]?.authorName || "알 수 없음";
  }

  document.title = `${displayName} — SoundShare`;
  const avatarEl = document.querySelector("#profileAvatar");
  avatarEl.textContent = avatarLetter(displayName);
  if (userData.photoURL) {
    avatarEl.innerHTML = `<img src="${userData.photoURL}" alt="프로필" class="avatar-img">`;
  }
  document.querySelector("#profileName").textContent = displayName;

  const PER_PAGE = 10;
  const cache     = {};
  const pageState = { posts: 1, comments: 1 };
  let   activeTab = "posts";

  function renderTab(tab) {
    const data = cache[tab];
    const page = pageState[tab];
    if (!data || !data.length) {
      tabContent.innerHTML = `<div class="muted small empty-msg">${tab === "posts" ? "작성한 글이 없습니다." : "작성한 댓글이 없습니다."}</div>`;
      return;
    }
    const slice = data.slice((page - 1) * PER_PAGE, page * PER_PAGE);
    const items = tab === "comments"
      ? `<div>${slice.map(renderCommentedItem).join("")}</div>`
      : slice.map(p => renderFeedCard(p)).join("");
    tabContent.innerHTML = items + renderPagination(data.length, page, PER_PAGE, tab);
    resolveAvatars(tabContent);
  }

  async function loadTab(tab) {
    activeTab = tab;
    if (tab === "posts" && !postsPublic && !isOwn) { // 비공개 설정 시 차단
      tabContent.innerHTML = '<div class="muted small empty-msg">사용자가 비공개로 설정했습니다.</div>';
      return;
    }
    if (tab === "comments" && !commentsPublic && !isOwn) {
      tabContent.innerHTML = '<div class="muted small empty-msg">사용자가 비공개로 설정했습니다.</div>';
      return;
    }
    tabContent.innerHTML = '<div class="skeleton skeleton-tab"></div>'; // 로딩 스켈레톤
    try {
      if (!(tab in cache)) {
        if (tab === "posts") {
          const posts = await getUserPosts(uid);
          cache[tab] = isOwn ? posts : posts.filter(p => p.visibility !== "private"); // 타인 비공개 글 제외
        } else {
          const commented = await getCommentedPosts(uid);
          cache[tab] = isOwn ? commented : commented.filter(({ post }) => post.visibility !== "private");
        }
      }
      renderTab(tab);
    } catch (err) {
      tabContent.innerHTML = `<div class="muted small empty-msg">${escHtml(err.message)}</div>`;
    }
  }

  document.querySelector("#tabNav").addEventListener("click", (e) => {
    const btn = e.target.closest(".tab-btn");
    if (!btn || btn.dataset.tab === activeTab) return;
    document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    loadTab(btn.dataset.tab);
  });

  tabContent.addEventListener("click", (e) => {
    const pageBtn = e.target.closest(".rd-page-btn[data-page]");
    if (pageBtn && !pageBtn.disabled) {
      pageState[pageBtn.dataset.tab] = Number(pageBtn.dataset.page);
      renderTab(activeTab);
      document.querySelector("#tabNav").scrollIntoView({ behavior: "smooth", block: "start" });
    }
  });

  await loadTab("posts");
}
