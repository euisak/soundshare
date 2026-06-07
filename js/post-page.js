import { loadHeader, initTopbar, getUrlParam } from "./app.js";
import { auth, onAuthStateChanged } from "./firebase.js";
import { getPost, toggleLike, addComment, listenComments, deletePost, incrementViewCount, updateComment, deleteComment } from "./post.js";
import { renderComment, timeAgo, escHtml, avatarLetter, showToast, resolveAvatars } from "./ui.js";

await loadHeader();
initTopbar();

// ── 뒤로가기 ──────────────────────────────────────────────────────────────
const fromEdit = new URLSearchParams(location.search).has("edited");
document.querySelector("#btnBack").addEventListener("click", () => {
  if (fromEdit) {
    history.length > 2 ? history.go(-2) : location.replace("index.html");
  } else {
    history.length > 1 ? history.back() : location.replace("index.html");
  }
});

const postId = getUrlParam("id") || window.location.hash.slice(1);
if (!postId) {
  document.querySelector("#postArea").innerHTML = '<div class="card empty-state">게시글 ID가 없습니다.</div>';
  throw new Error("no postId");
}

const post = await getPost(postId).catch((err) => { console.error(err); return null; });
if (!post) {
  document.querySelector("#postArea").innerHTML = '<div class="card empty-state">게시글을 찾을 수 없습니다.</div>';
  throw new Error("post not found");
}

const user = await new Promise((resolve) => {
  const unsub = onAuthStateChanged(auth, (u) => { unsub(); resolve(u); });
});

const isOwner = user?.uid === post.authorId;
const liked   = user ? (post.likedBy || []).includes(user.uid) : false;

// ── 비공개 글 접근 차단 ───────────────────────────────────────────────────
if (post.visibility === "private" && !isOwner) {
  document.querySelector("#postArea").innerHTML = '<div class="card empty-state">비공개 게시글입니다.</div>';
  throw new Error("private post");
}

incrementViewCount(postId);
document.title = `${post.title} — SoundShare`;

// ── 아이콘 ────────────────────────────────────────────────────────────────
const playIcon  = `<svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>`;
const pauseIcon = `<svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>`;
const spotifyIcon = `<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/></svg>`;
const appleIcon  = `<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/></svg>`;

// ── 트랙 렌더 ─────────────────────────────────────────────────────────────
function renderTracks(tracks) {
  if (!tracks?.length) return "";
  return `<div class="pd-track-list">${tracks.map((t, i) => `
    <div class="pd-track-item">
      <span class="pd-track-num">${i + 1}</span>
      <div class="pd-track-art">
        ${t.albumArt ? `<img src="${escHtml(t.albumArt)}" alt="" />` : "♪"}
      </div>
      <div class="pd-track-body">
        <span class="pd-track-name">${escHtml(t.name)}</span>
        <div class="pd-track-meta">${escHtml(t.artist)}${t.album ? ` · ${escHtml(t.album)}` : ""}</div>
        ${(t.appleMusicUrl || t.spotifySearchUrl) ? `
        <div class="pd-track-ext">
          ${t.appleMusicUrl ? `<a href="${escHtml(t.appleMusicUrl)}" target="_blank" rel="noopener" class="link-apple">${appleIcon} Apple Music</a>` : ""}
          ${t.spotifySearchUrl ? `<a href="${escHtml(t.spotifySearchUrl)}" target="_blank" rel="noopener" class="link-spotify">${spotifyIcon} Spotify</a>` : ""}
        </div>` : ""}
        ${t.note ? `<button class="pd-note-btn">메모 보기 ∨</button><div class="pd-note-body" hidden>${escHtml(t.note)}</div>` : ""}
      </div>
      ${t.previewUrl ? `<button class="pd-play-btn" data-preview="${escHtml(t.previewUrl)}" title="미리듣기">${playIcon}</button>` : ""}
    </div>`).join("")}</div>`;
}

function renderTags(tags) {
  if (!tags?.length) return "";
  return `<div class="pd-tags-row">${tags.map(t =>
    `<span class="pd-tag">${escHtml(t)}</span>`).join("")}</div>`;
}

function renderBody(raw) {
  if (!raw) return "";
  // 구버전 HTML(contenteditable) → 줄바꿈으로 변환 후 태그 제거
  const text = raw
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (!text) return "";
  // pre-wrap CSS로 \n을 줄바꿈으로 렌더링
  const el = document.createElement("p");
  el.className = "pd-body";
  el.textContent = text;
  return el.outerHTML;
}

// ── 렌더 ──────────────────────────────────────────────────────────────────
const tracks = Array.isArray(post.tracks) ? post.tracks : (post.track ? [post.track] : []);

document.querySelector("#postArea").innerHTML = `
  <article class="pd-article">
    <div class="post-meta pd-meta-row">
      ${post.authorId
        ? `<a class="post-author-link" href="profile.html#${escHtml(post.authorId)}">
             <span class="post-author-avatar" data-uid="${escHtml(post.authorId)}">${avatarLetter(post.authorName)}</span>
             <strong class="pd-author-name">${escHtml(post.authorName || "익명")}</strong>
           </a>`
        : `<span class="post-author-link cursor-default">
             <span class="post-author-avatar">${avatarLetter(post.authorName)}</span>
             <strong class="pd-author-name">${escHtml(post.authorName || "익명")}</strong>
           </span>`}
      <span>·</span>
      <span>${timeAgo(post.createdAt)}</span>
      ${post.visibility === "private" ? `<span>·</span><span class="pd-private-badge">비공개</span>` : ""}
      <span>·</span>
      <span>조회 ${(post.viewCount || 0) + 1}</span>
      <div class="pd-meta-actions">
        ${isOwner ? `
        <div class="post-list-more-wrap">
          <button class="post-list-more-btn" id="btnPostMore" aria-label="게시글 메뉴">⋮</button>
          <div class="post-list-dropdown" id="postMoreDropdown" hidden>
            <a class="post-list-dropdown-item" href="write.html#${escHtml(post.id)}">수정</a>
            <button class="post-list-dropdown-item danger" id="btnDelete">삭제</button>
          </div>
        </div>` : ""}
      </div>
    </div>

    <h1 class="pd-post-title">${escHtml(post.title)}</h1>
    ${renderBody(post.body)}
    ${renderTracks(tracks)}
    ${renderTags(post.tags)}

    <button id="btnLike" class="pd-like-btn" style="color:${liked ? "#e74c3c" : "var(--muted)"}">
      <svg width="16" height="16" viewBox="0 0 24 24"
        fill="${liked ? "currentColor" : "none"}" stroke="${liked ? "#e74c3c" : "currentColor"}" stroke-width="2">
        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
      </svg>
      <span id="likeCount">${post.likeCount || 0}</span> Likes
    </button>
  </article>

  <div>
    <div class="pd-comments-header">
      <span class="section-title pd-comments-title">
        댓글
        <span class="muted small" id="commentCount">${post.commentCount || 0}</span>
      </span>
    </div>
    <div class="comment-list pd-comment-list" id="commentList">
      <div class="muted small">댓글을 불러오는 중…</div>
    </div>
    ${user ? `
    <form id="formComment" class="pd-comment-form">
      <div class="pd-comment-form-user">
        <span class="post-author-avatar avatar-lg" data-uid="${escHtml(user.uid)}">
          ${avatarLetter(user.displayName || user.email)}
        </span>
        <strong class="pd-comment-form-name">${escHtml(user.displayName || user.email?.split("@")[0] || "")}</strong>
      </div>
      <div class="pd-comment-form-input-row">
        <div class="pd-comment-form-spacer"></div>
        <div class="pd-comment-form-fields">
          <textarea id="commentInput" class="pd-comment-textarea" placeholder="댓글을 작성하세요..."></textarea>
          <button type="submit" class="pd-comment-submit">댓글 등록</button>
        </div>
      </div>
    </form>` : ""}
  </div>`;

resolveAvatars(document.querySelector("#postArea"));

// ── 오디오 미리듣기 ───────────────────────────────────────────────────────
const sharedAudio = new Audio();
let activePlayBtn = null;

document.querySelector("#postArea").addEventListener("click", (e) => {
  const noteBtn = e.target.closest(".pd-note-btn");
  if (noteBtn) {
    const body = noteBtn.nextElementSibling;
    const anchor = noteBtn.closest(".pd-track-item") || noteBtn.parentElement;
    const before = anchor.getBoundingClientRect().top;
    body.hidden = !body.hidden;
    noteBtn.textContent = body.hidden ? "메모 보기 ∨" : "메모 닫기 ∧";
    const after = anchor.getBoundingClientRect().top;
    window.scrollBy({ top: after - before, behavior: "instant" });
    return;
  }
  const btn = e.target.closest(".pd-play-btn[data-preview]");
  if (!btn) return;
  const url = btn.dataset.preview;
  if (activePlayBtn === btn && !sharedAudio.paused) {
    sharedAudio.pause();
    btn.classList.remove("is-playing");
    btn.innerHTML = playIcon;
    activePlayBtn = null;
  } else {
    if (activePlayBtn) { activePlayBtn.classList.remove("is-playing"); activePlayBtn.innerHTML = playIcon; }
    sharedAudio.src = url;
    sharedAudio.play();
    btn.classList.add("is-playing");
    btn.innerHTML = pauseIcon;
    activePlayBtn = btn;
  }
});
sharedAudio.addEventListener("ended", () => {
  if (activePlayBtn) { activePlayBtn.classList.remove("is-playing"); activePlayBtn.innerHTML = playIcon; activePlayBtn = null; }
});

// ── 좋아요 ────────────────────────────────────────────────────────────────
document.querySelector("#btnLike")?.addEventListener("click", async () => {
  if (!user) { showToast("로그인이 필요합니다.", "danger"); return; }
  const btn = document.querySelector("#btnLike");
  btn.disabled = true;
  try {
    const nowLiked = await toggleLike(postId);
    const countEl = document.querySelector("#likeCount");
    countEl.textContent = parseInt(countEl.textContent) + (nowLiked ? 1 : -1);
    btn.style.color = nowLiked ? "#e74c3c" : "var(--muted)";
    const svg = btn.querySelector("svg");
    svg.setAttribute("fill", nowLiked ? "currentColor" : "none");
    svg.setAttribute("stroke", nowLiked ? "#e74c3c" : "currentColor");
  } finally { btn.disabled = false; }
});

// ── 게시글 ⋮ ─────────────────────────────────────────────────────────────
document.querySelector("#btnPostMore")?.addEventListener("click", (e) => {
  e.stopPropagation();
  const dd = document.querySelector("#postMoreDropdown");
  dd.hidden = !dd.hidden;
});

document.querySelector("#btnDelete")?.addEventListener("click", async () => {
  if (!confirm("게시글을 삭제할까요?")) return;
  try {
    await deletePost(postId);
    showToast("삭제되었습니다.");
    setTimeout(() => { window.location.href = "index.html"; }, 1000);
  } catch (err) { showToast(err.message, "danger"); }
});

// ── 댓글 실시간 ───────────────────────────────────────────────────────────
listenComments(postId, (comments) => {
  const list = document.querySelector("#commentList");
  const cnt  = document.querySelector("#commentCount");
  if (cnt) cnt.textContent = comments.length;
  list.innerHTML = comments.length
    ? comments.map((c) => renderComment(c, user?.uid)).join("")
    : '<div class="muted small empty-msg">아직 댓글이 없습니다.</div>';
  resolveAvatars(list);
});

// ── 댓글 수정/삭제 ────────────────────────────────────────────────────────
document.querySelector("#commentList").addEventListener("click", async (e) => {
  const moreBtn = e.target.closest(".comment-more-btn");
  if (moreBtn) {
    e.stopPropagation();
    const cid = moreBtn.dataset.commentId;
    const dd  = document.querySelector(`.post-list-dropdown[data-comment-id="${cid}"]`);
    document.querySelectorAll(".post-list-dropdown:not([hidden])").forEach((d) => { if (d !== dd) d.hidden = true; });
    dd.hidden = !dd.hidden;
    return;
  }
  const editBtn = e.target.closest("[data-action='edit-comment']");
  if (editBtn) {
    const cid    = editBtn.dataset.commentId;
    const item   = document.querySelector(`.comment-item[data-id="${cid}"]`);
    const textEl = item.querySelector(".comment-text");
    document.querySelectorAll(".post-list-dropdown:not([hidden])").forEach((d) => d.hidden = true);
    textEl.innerHTML = `
      <textarea class="input pd-edit-textarea">${escHtml(textEl.dataset.text)}</textarea>
      <div class="pd-edit-actions">
        <button class="btn primary pd-edit-btn" data-action="save-comment-post" data-comment-id="${escHtml(cid)}">저장</button>
        <button class="btn pd-edit-btn" data-action="cancel-edit-comment-post" data-comment-id="${escHtml(cid)}">취소</button>
      </div>`;
    textEl.querySelector("textarea").focus();
    return;
  }
  const saveBtn = e.target.closest("[data-action='save-comment-post']");
  if (saveBtn) {
    const cid     = saveBtn.dataset.commentId;
    const item    = document.querySelector(`.comment-item[data-id="${cid}"]`);
    const textEl  = item.querySelector(".comment-text");
    const newText = textEl.querySelector("textarea").value.trim();
    if (!newText) { showToast("내용을 입력해주세요.", "danger"); return; }
    saveBtn.disabled = true; saveBtn.textContent = "저장 중…";
    try {
      await updateComment(postId, cid, newText);
      textEl.dataset.text = newText;
      textEl.innerHTML = escHtml(newText);
    } catch (err) {
      showToast(err.message, "danger");
      saveBtn.disabled = false; saveBtn.textContent = "저장";
    }
    return;
  }
  const cancelBtn = e.target.closest("[data-action='cancel-edit-comment-post']");
  if (cancelBtn) {
    const cid    = cancelBtn.dataset.commentId;
    const item   = document.querySelector(`.comment-item[data-id="${cid}"]`);
    const textEl = item.querySelector(".comment-text");
    textEl.innerHTML = escHtml(textEl.dataset.text);
    return;
  }
  const delBtn = e.target.closest("[data-action='delete-comment']");
  if (delBtn) {
    if (!confirm("댓글을 삭제할까요?")) return;
    const cid = delBtn.dataset.commentId;
    try { await deleteComment(postId, cid); }
    catch (err) { showToast(err.message, "danger"); }
    return;
  }
});

document.addEventListener("click", () => {
  document.querySelectorAll(".post-list-dropdown:not([hidden])").forEach((d) => d.hidden = true);
});

document.querySelector("#formComment")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const input = document.querySelector("#commentInput");
  const text  = input.value.trim();
  if (!text) return;
  const btn = e.target.querySelector("[type=submit]");
  btn.disabled = true;
  try {
    await addComment(postId, text);
    input.value = "";
  } catch (err) { showToast(err.message, "danger"); }
  finally { btn.disabled = false; }
});
