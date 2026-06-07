import { db, getDoc, doc } from "./firebase.js";

// ── 유저 포토 캐시 (페이지 로드당 유지) ──────────────────────────
const _userPhotoCache = new Map();

async function _fetchUserPhoto(uid) {
  if (_userPhotoCache.has(uid)) return _userPhotoCache.get(uid);
  try {
    const snap = await getDoc(doc(db, "users", uid));
    const url = snap.data()?.photoURL || null;
    _userPhotoCache.set(uid, url);
    return url;
  } catch {
    _userPhotoCache.set(uid, null);
    return null;
  }
}

/**
 * 렌더링된 컨테이너 안의 [data-uid] 아바타 요소에 프로필 사진 적용
 * renderPostCard / renderComment 호출 후 실행
 */
export async function resolveAvatars(container = document) {
  const els = [...container.querySelectorAll(".post-author-avatar[data-uid], .post-feed-avatar[data-uid]")];
  if (!els.length) return;
  const uids = [...new Set(els.map((el) => el.dataset.uid).filter(Boolean))];
  await Promise.all(uids.map(_fetchUserPhoto));
  els.forEach((el) => {
    const url = _userPhotoCache.get(el.dataset.uid);
    if (url && !el.querySelector("img")) {
      el.textContent = "";
      el.innerHTML = `<img src="${escHtml(url)}" alt="" class="avatar-img">`;
    }
  });
}

export function timeAgo(ts) {
  if (!ts) return "";
  const date = ts.toDate ? ts.toDate() : new Date(ts);
  const diff = (Date.now() - date.getTime()) / 1000;
  if (diff < 60) return "방금 전";
  if (diff < 3600) return `${Math.floor(diff / 60)}분 전`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}일 전`;
  return date.toLocaleDateString("ko-KR");
}

export function escHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function avatarLetter(name) {
  return (name || "?")[0].toUpperCase();
}

export function renderPostCard(post) {
  // 첫 번째 트랙 썸네일 (없으면 ♪ 플레이스홀더)
  const trackList = post.tracks?.length ? post.tracks : (post.track ? [post.track] : []);
  const firstTrack = trackList[0] || null;
  const thumbHtml = firstTrack?.albumArt
    ? `<img src="${escHtml(firstTrack.albumArt)}" alt="" />`
    : `<span class="feed-thumb-empty">♪</span>`;

  const displayTags = post.tags || [];
  const tagsHtml = displayTags.length
    ? `<div class="feed-tags">${displayTags.slice(0, 2).map((t) =>
        `<span class="chip feed-chip">${escHtml(t)}</span>`
      ).join("")}</div>`
    : "";

  return `
  <a class="card feed-card" href="post.html#${escHtml(post.id)}" data-id="${escHtml(post.id)}">
    <div class="feed-thumb">${thumbHtml}</div>
    <div class="feed-content">
      <div class="post-meta feed-meta">
        ${post.authorId
          ? `<button class="post-author-link" type="button" onclick="event.stopPropagation();window.location.href='profile.html#${escHtml(post.authorId)}'">
               <span class="post-author-avatar avatar-sm" data-uid="${escHtml(post.authorId)}">${avatarLetter(post.authorName)}</span>
               <span>${escHtml(post.authorName)}</span>
             </button>`
          : `<span class="post-author-link cursor-default">
               <span class="post-author-avatar avatar-sm">${avatarLetter(post.authorName)}</span>
               <span>${escHtml(post.authorName)}</span>
             </span>`}
        <span class="muted">·</span>
        <span class="muted">${timeAgo(post.createdAt)}</span>
        <div class="feed-meta-actions">
          <span class="action-btn like-count feed-action-stat">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
            ${post.likeCount || 0}
          </span>
          <span class="action-btn feed-action-stat">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            ${post.commentCount || 0}
          </span>
        </div>
      </div>
      <h2 class="post-title feed-title">${escHtml(post.title)}</h2>
      ${tagsHtml}
    </div>
  </a>`;
}

export function renderComment(c, currentUid = null) {
  const isOwner = currentUid && c.authorId === currentUid;
  const moreMenu = isOwner ? `
    <div class="post-list-more-wrap ml-auto">
      <button class="post-list-more-btn comment-more-btn"
              data-comment-id="${escHtml(c.id)}" aria-label="댓글 메뉴">⋮</button>
      <div class="post-list-dropdown" data-comment-id="${escHtml(c.id)}" hidden>
        <button class="post-list-dropdown-item"
                data-action="edit-comment" data-comment-id="${escHtml(c.id)}">수정</button>
        <button class="post-list-dropdown-item danger"
                data-action="delete-comment" data-comment-id="${escHtml(c.id)}">삭제</button>
      </div>
    </div>` : "";

  return `
  <div class="comment-item" data-id="${escHtml(c.id)}">
    <div class="comment-header">
      ${c.authorId
        ? `<a class="post-author-link" href="profile.html#${escHtml(c.authorId)}">
             <span class="post-author-avatar avatar-md" data-uid="${escHtml(c.authorId)}">${avatarLetter(c.authorName)}</span>
             <strong>${escHtml(c.authorName)}</strong>
           </a>`
        : `<span class="post-author-link cursor-default">
             <span class="post-author-avatar avatar-md">${avatarLetter(c.authorName)}</span>
             <strong>${escHtml(c.authorName)}</strong>
           </span>`}
      <span class="muted small">${timeAgo(c.createdAt)}</span>
      ${moreMenu}
    </div>
    <div class="comment-text" data-text="${escHtml(c.text)}">${escHtml(c.text)}</div>
  </div>`;
}

export function showToast(msg, kind = "ok") {
  const el = document.createElement("div");
  el.className = `toast notice ${kind}`;
  el.textContent = msg;
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add("toast-in"));
  setTimeout(() => {
    el.classList.remove("toast-in");
    el.addEventListener("transitionend", () => el.remove());
  }, 2800);
}

// ── 피드 카드 공통 헬퍼 ──────────────────────────────────────────────

const _SVG = {
  heart: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>`,
  chat:  `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`,
  eye:   `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`,
};

/**
 * 앨범아트 커버 스택 HTML (최대 5장)
 */
function buildCoverStack(tracks) {
  const items = (tracks || []).slice(0, 5);
  let html = '<div class="post-cover-stack">';
  for (let i = 0; i < 5; i++) {
    const t = items[i];
    html += t?.albumArt
      ? `<img class="post-cover-stack-img" src="${escHtml(t.albumArt)}" alt="" />`
      : `<div class="post-cover-stack-empty"></div>`;
  }
  return html + '</div>';
}

/**
 * 피드 카드 (post-feed-card) HTML
 * @param {object} post
 * @param {object} [opts]
 * @param {boolean} [opts.showAuthor=false]  작성자 아바타/이름 표시
 * @param {string}  [opts.dropdownHtml=""]   ⋮ 드롭다운 내부 버튼 HTML (없으면 미표시)
 */
export function renderFeedCard(post, { showAuthor = false, dropdownHtml = "" } = {}) {
  const pid    = escHtml(post.id);
  const tracks = Array.isArray(post.tracks) ? post.tracks : (post.track ? [post.track] : []);
  const tags   = (post.tags || []).slice(0, 3);

  const tagsHtml = tags.length
    ? `<div class="post-feed-tags">${tags.map(t => `<span class="post-feed-tag">${escHtml(t)}</span>`).join("")}</div>`
    : "";

  const rawBody = (post.body || "").replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, "").trim();
  const bodyHtml = rawBody ? `<div class="post-feed-body-text">${escHtml(rawBody)}</div>` : "";

  const authorHtml = showAuthor
    ? `<span class="post-feed-avatar" data-uid="${escHtml(post.authorId || "")}">${avatarLetter(post.authorName)}</span>
       <span class="post-feed-author">${escHtml(post.authorName || "익명")}</span>
       <span class="post-feed-time">·</span>`
    : "";

  const card = `
  <a class="post-feed-card" href="post.html#${pid}">
    ${buildCoverStack(tracks)}
    <div class="post-feed-body">
      <div class="post-feed-title">${escHtml(post.title)}</div>
      <div class="post-feed-author-row">
        ${authorHtml}
        <span class="post-feed-time">${timeAgo(post.createdAt)}</span>
        ${post.visibility === "private" ? `<span class="post-feed-time">· 비공개</span>` : ""}
      </div>
      ${bodyHtml}
      <div class="post-feed-footer">
        ${tagsHtml}
        <div class="post-feed-stats">
          <span class="post-feed-stat">${_SVG.heart} ${post.likeCount || 0}</span>
          <span class="post-feed-stat">${_SVG.chat} ${post.commentCount || 0}</span>
          <span class="post-feed-stat">${_SVG.eye} ${post.viewCount || 0}</span>
        </div>
      </div>
    </div>
  </a>`;

  if (!dropdownHtml) return card;

  return `
  <div class="feed-card-wrap">
    ${card}
    <div class="post-list-more-wrap feed-card-more">
      <button class="post-list-more-btn" data-id="${pid}" aria-label="더보기">⋮</button>
      <div class="post-list-dropdown" data-id="${pid}" hidden>${dropdownHtml}</div>
    </div>
  </div>`;
}

/**
 * 페이지네이션 버튼 HTML
 * @param {number} total    전체 항목 수
 * @param {number} page     현재 페이지 (1-based)
 * @param {number} perPage  페이지당 항목 수
 * @param {string} [tab]    data-tab 속성값 (탭 기반 페이지에서 사용)
 */
export function renderPagination(total, page, perPage, tab = null) {
  const totalPages = Math.ceil(total / perPage);
  if (totalPages <= 1) return "";
  const tabAttr = tab ? ` data-tab="${escHtml(tab)}"` : "";
  const prev = `<button class="rd-page-btn" data-page="${page - 1}"${tabAttr}${page === 1 ? " disabled" : ""}>‹</button>`;
  const next = `<button class="rd-page-btn" data-page="${page + 1}"${tabAttr}${page === totalPages ? " disabled" : ""}>›</button>`;
  let nums = "", prevN = 0;
  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || Math.abs(i - page) <= 2) {
      if (prevN && i - prevN > 1) nums += `<span class="rd-pagination-ellipsis">…</span>`;
      nums += `<button class="rd-page-btn${i === page ? " active" : ""}" data-page="${i}"${tabAttr}>${i}</button>`;
      prevN = i;
    }
  }
  return `<div class="rd-pagination">${prev}${nums}${next}</div>`;
}

/**
 * 댓글 단 글 목록 아이템 — 읽기 전용 (profile.html용)
 */
export function renderCommentedItem({ post, comment }) {
  const pid = escHtml(post.id);
  return `
  <div class="commented-item">
    <div class="commented-item-body">
      <a class="post-list-title-link commented-item-title" href="post.html#${pid}">
        ${escHtml(post.title)}
      </a>
      <div class="post-list-comment-text">
        ${escHtml(comment.text)}
      </div>
    </div>
    <span class="post-list-time">${timeAgo(comment.createdAt)}</span>
  </div>`;
}
