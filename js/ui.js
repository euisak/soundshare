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
      el.innerHTML = `<img src="${escHtml(url)}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%;display:block">`;
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

export function renderChips(items, color = "default") {
  if (!items?.length) return "";
  return `<div class="chips">${items.map((t) => `<span class="chip ${color}">${escHtml(t)}</span>`).join("")}</div>`;
}

export function renderPostCard(post) {
  // 첫 번째 트랙 썸네일 (없으면 ♪ 플레이스홀더)
  const trackList = post.tracks?.length ? post.tracks : (post.track ? [post.track] : []);
  const firstTrack = trackList[0] || null;
  const thumbHtml = firstTrack?.albumArt
    ? `<img src="${escHtml(firstTrack.albumArt)}" alt="" />`
    : `<span style="font-size:22px;opacity:.45">♪</span>`;

  // 감성 태그 우선, 없으면 장르 태그 — 최대 2개, 단일 행
  const moodTags = post.tags || [];
  const genreTags = post.genre || [];
  const displayTags = moodTags.length ? moodTags : genreTags;
  const tagsHtml = displayTags.length
    ? `<div class="feed-tags">${displayTags.slice(0, 2).map((t) =>
        `<span class="chip" style="font-size:11px;padding:2px 8px;line-height:1.3">${escHtml(t)}</span>`
      ).join("")}</div>`
    : "";

  return `
  <a class="card feed-card" href="post.html#${escHtml(post.id)}" data-id="${escHtml(post.id)}">
    <div class="feed-thumb">${thumbHtml}</div>
    <div class="feed-content">
      <div class="post-meta" style="font-size:12px">
        ${post.authorId
          ? `<button class="post-author-link" type="button" onclick="event.stopPropagation();window.location.href='profile.html#${escHtml(post.authorId)}'">
               <span class="post-author-avatar" data-uid="${escHtml(post.authorId)}" style="width:18px;height:18px;font-size:8px">${avatarLetter(post.authorName)}</span>
               <span>${escHtml(post.authorName)}</span>
             </button>`
          : `<span class="post-author-link" style="cursor:default">
               <span class="post-author-avatar" style="width:18px;height:18px;font-size:8px">${avatarLetter(post.authorName)}</span>
               <span>${escHtml(post.authorName)}</span>
             </span>`}
        <span class="muted">·</span>
        <span class="muted">${timeAgo(post.createdAt)}</span>
        <div style="margin-left:auto;display:flex;align-items:center;gap:5px;flex-shrink:0">
          <span class="action-btn like-count" style="font-size:11px;padding:2px 5px;gap:3px">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
            ${post.likeCount || 0}
          </span>
          <span class="action-btn" style="font-size:11px;padding:2px 5px;gap:3px">
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
    <div class="post-list-more-wrap" style="margin-left:auto">
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
             <span class="post-author-avatar" data-uid="${escHtml(c.authorId)}" style="width:20px;height:20px;font-size:9px">${avatarLetter(c.authorName)}</span>
             <strong>${escHtml(c.authorName)}</strong>
           </a>`
        : `<span class="post-author-link" style="cursor:default">
             <span class="post-author-avatar" style="width:20px;height:20px;font-size:9px">${avatarLetter(c.authorName)}</span>
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
