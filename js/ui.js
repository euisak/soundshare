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

export function renderTrackCard(track, { compact = false } = {}) {
  if (!track) return "";
  const art = track.albumArt
    ? `<img class="track-art" src="${escHtml(track.albumArt)}" alt="${escHtml(track.name)}" />`
    : `<div class="track-art" style="background:rgba(109,124,255,.2);display:flex;align-items:center;justify-content:center;font-size:22px;">♪</div>`;
  const preview = track.previewUrl && !compact
    ? `<audio id="previewAudio" src="${escHtml(track.previewUrl)}" preload="none"></audio>
       <button class="audio-control" id="btnPreview" title="미리듣기">
         <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
       </button>`
    : "";
  const links = !compact ? `
    <div style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap">
      ${track.appleMusicUrl ? `<a href="${escHtml(track.appleMusicUrl)}" target="_blank" rel="noopener" style="font-size:11px;color:var(--brand);text-decoration:none">🍎 Apple Music</a>` : ""}
      ${track.spotifySearchUrl ? `<a href="${escHtml(track.spotifySearchUrl)}" target="_blank" rel="noopener" style="font-size:11px;color:#1db954;text-decoration:none">🟢 Spotify</a>` : ""}
    </div>` : "";
  return `
  <div class="track-card" style="flex-wrap:wrap">
    ${art}
    <div class="track-info" style="flex:1;min-width:0">
      <div class="track-name">${escHtml(track.name)}</div>
      <div class="track-artist">${escHtml(track.artist)}</div>
      ${compact ? "" : `<div class="track-album muted small">${escHtml(track.album)}</div>`}
      ${links}
    </div>
    ${preview}
  </div>`;
}

export function renderChips(items, color = "default") {
  if (!items?.length) return "";
  return `<div class="chips">${items.map((t) => `<span class="chip ${color}">${escHtml(t)}</span>`).join("")}</div>`;
}

export function renderPostCard(post) {
  // tracks 배열 또는 구버전 track 단일 모두 지원
  const trackList = post.tracks?.length ? post.tracks : (post.track ? [post.track] : []);
  const track = trackList.length ? trackList.map((t) => renderTrackCard(t, { compact: true })).join("") : "";
  const genres = renderChips(post.genre);
  const tags = renderChips(post.tags, "tag");
  return `
  <article class="card post-card" data-id="${escHtml(post.id)}">
    <div class="post-meta">
      <span class="post-author-avatar">${avatarLetter(post.authorName)}</span>
      <span>${escHtml(post.authorName)}</span>
      <span class="muted">·</span>
      <span class="muted">${timeAgo(post.createdAt)}</span>
    </div>
    <h2 class="post-title">${escHtml(post.title)}</h2>
    ${post.body ? `<p class="post-body">${escHtml(post.body)}</p>` : ""}
    ${track}
    ${genres}${tags}
    <div class="post-footer">
      <div class="action-bar">
        <span class="action-btn like-count">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
          ${post.likeCount || 0}
        </span>
        <span class="action-btn">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          ${post.commentCount || 0}
        </span>
      </div>
      <a class="btn" href="post.html#${post.id}">보기 →</a>
    </div>
  </article>`;
}

export function renderComment(c) {
  return `
  <div class="comment-item" data-id="${escHtml(c.id)}">
    <div class="comment-header">
      <span class="post-author-avatar" style="width:20px;height:20px;font-size:9px">${avatarLetter(c.authorName)}</span>
      <strong>${escHtml(c.authorName)}</strong>
      <span class="muted small">${timeAgo(c.createdAt)}</span>
    </div>
    <div class="comment-text">${escHtml(c.text)}</div>
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
