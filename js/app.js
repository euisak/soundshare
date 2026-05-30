import { auth, onAuthStateChanged, signOut, db, getDoc, doc } from "./firebase.js";
import { signInModal, signUpModal, sendResetEmail, isNicknameTaken } from "./auth.js";
import { listenNotifications, deleteNotification } from "./notify.js";
import { timeAgo, escHtml } from "./ui.js";

export function qs(sel, parent = document) {
  return parent.querySelector(sel);
}

export function qsa(sel, parent = document) {
  return [...parent.querySelectorAll(sel)];
}

export function setText(sel, text) {
  const el = qs(sel);
  if (el) el.textContent = text ?? "";
}

export function setNotice(kind, msg) {
  const el = qs("#notice");
  if (!el) return;
  el.className = `notice ${kind || ""}`.trim();
  el.textContent = msg || "";
  el.hidden = !msg;
}

export function getConfig() {
  const cfg = window.__CONFIG__;
  if (!cfg) throw new Error("Missing config.js (create from config.js.example).");
  return cfg;
}

export async function loadHeader() {
  if (window.__headerReady) await window.__headerReady;
}

export function initTopbar() {
  const btnLogout = qs("#btnLogout");
  if (btnLogout) {
    btnLogout.addEventListener("click", async () => {
      await signOut(auth);
      window.location.href = "index.html";
    });
  }

  const authOnly = qsa("[data-auth='in']");
  const guestOnly = qsa("[data-auth='out']");
  const avatar    = qs("#userAvatar");
  const btnNotif  = qs("#btnNotif");
  const notifPanel = qs("#notifPanel");
  const notifDot  = qs("#notifDot");
  const notifList = qs("#notifList");

  // ── 알림 UI 렌더 ─────────────────────────────────────────────
  function renderNotifList(notifs) {
    if (!notifList) return;
    if (!notifs.length) {
      notifList.innerHTML = '<div class="notif-empty">새 알림이 없습니다</div>';
      return;
    }
    notifList.innerHTML = notifs.map((n) => {
      const icon   = n.type === "like" ? "❤️" : "💬";
      const action = n.type === "like"
        ? "님이 회원님의 게시글에 좋아요를 눌렀습니다"
        : "님이 댓글을 달았습니다";
      const title  = n.postTitle
        ? `<span class="notif-post-title"> — ${escHtml(
            n.postTitle.length > 20 ? n.postTitle.slice(0, 20) + "…" : n.postTitle
          )}</span>`
        : "";
      const preview = (n.type === "comment" && n.commentText)
        ? `<div class="notif-comment">"${escHtml(
            n.commentText.length > 50 ? n.commentText.slice(0, 50) + "…" : n.commentText
          )}"</div>`
        : "";
      const when = n.createdAt ? timeAgo(n.createdAt) : "";
      return `
        <div class="notif-item" data-notif-id="${escHtml(n.id)}" data-post-id="${escHtml(n.postId)}">
          <span class="notif-icon">${icon}</span>
          <div class="notif-body">
            <div class="notif-text"><strong>${escHtml(n.fromName)}</strong>${action}${title}</div>
            ${preview}
            <div class="notif-time">${when}</div>
          </div>
        </div>`;
    }).join("");
  }

  // ── 알림 리스너 ──────────────────────────────────────────────
  let notifUnsub = null;

  // ── 프로필 팝오버 토글 ──────────────────────────────────────
  const profilePopover = qs("#profilePopover");
  avatar?.addEventListener("click", (e) => {
    e.stopPropagation();
    if (profilePopover) profilePopover.hidden = !profilePopover.hidden;
  });

  // ── 벨 버튼 토글 ────────────────────────────────────────────
  btnNotif?.addEventListener("click", (e) => {
    e.stopPropagation();
    if (notifPanel) notifPanel.hidden = !notifPanel.hidden;
  });

  // ── 알림 항목 클릭: 삭제 완료 후 해당 게시글로 이동 ────────────
  notifList?.addEventListener("click", async (e) => {
    const item = e.target.closest(".notif-item");
    if (!item) return;
    const notifId = item.dataset.notifId;
    const postId  = item.dataset.postId;
    item.style.opacity = "0.5";          // 클릭 피드백
    await deleteNotification(notifId);   // 삭제 완료 후 이동
    if (notifPanel) notifPanel.hidden = true;
    window.location.href = `post.html#${postId}`;
  });

  // ── 패널 외부 클릭 시 닫기 ──────────────────────────────────
  document.addEventListener("click", (e) => {
    if (notifPanel && !notifPanel.hidden) {
      if (!notifPanel.contains(e.target) && e.target !== btnNotif) {
        notifPanel.hidden = true;
      }
    }
    if (profilePopover && !profilePopover.hidden) {
      if (!profilePopover.contains(e.target) && e.target !== avatar) {
        profilePopover.hidden = true;
      }
    }
  });

  onAuthStateChanged(auth, (user) => {
    authOnly.forEach((el) => (el.hidden = !user));
    guestOnly.forEach((el) => (el.hidden = !!user));

    if (avatar) {
      if (user) {
        const displayName = user.displayName || user.email?.split("@")[0] || "U";
        avatar.textContent = displayName[0].toUpperCase(); // 기본값 먼저 표시
        // Firestore에서 photoURL 읽기 (Auth photoURL은 base64 저장 불가)
        getDoc(doc(db, "users", user.uid)).then((snap) => {
          const photoURL = snap.data()?.photoURL;
          if (photoURL) {
            avatar.innerHTML = `<img src="${photoURL}" alt="프로필" style="width:100%;height:100%;border-radius:50%;object-fit:cover">`;
          }
        }).catch(() => {});
      } else {
        avatar.textContent = "?";
      }
    }

    // 알림 리스너 관리
    if (notifUnsub) { notifUnsub(); notifUnsub = null; }
    if (user) {
      notifUnsub = listenNotifications(user.uid, (notifs) => {
        if (notifDot) notifDot.hidden = notifs.length === 0;
        renderNotifList(notifs);
      });
    } else {
      if (notifDot) notifDot.hidden = true;
      renderNotifList([]);
    }
  });

  initAuthModal();
}

export function initAuthModal() {
  const modal = qs("#authModal");
  if (!modal) return;

  const noticeEl = qs("#authNotice");
  const views = {
    login:    qs("#authViewLogin"),
    register: qs("#authViewRegister"),
    forgot:   qs("#authViewForgot"),
  };

  // ── 알림 ─────────────────────────────────────────────────────────
  function setNotice(kind, msg) {
    if (!noticeEl) return;
    noticeEl.className = `notice ${kind || ""}`.trim();
    noticeEl.textContent = msg || "";
    noticeEl.hidden = !msg;
  }

  // ── 닉네임 상태: null=미확인 / true=사용가능 / false=중복 ─────────
  let nicknameState = null;

  function resetNicknameState() {
    nicknameState = null;
    const el = qs("#nicknameStatus");
    if (el) { el.textContent = ""; el.style.color = ""; }
    updateRegisterBtn();
  }

  function updateNicknameStatus() {
    const nickname = (qs("#regNickname")?.value || "").trim();
    const el = qs("#nicknameStatus");
    if (!el) return;
    if (!nickname) {
      el.textContent = ""; el.style.color = "";
    } else if (nicknameState === null) {
      el.textContent = "닉네임 중복 확인이 필요합니다.";
      el.style.color = "var(--muted)";
    } else if (nicknameState === true) {
      el.textContent = "사용 가능한 닉네임입니다.";
      el.style.color = "var(--ok)";
    } else {
      el.textContent = "이미 사용 중인 닉네임입니다.";
      el.style.color = "var(--danger)";
    }
    updateRegisterBtn();
  }

  // ── 이메일 실시간 검증 ───────────────────────────────────────────
  function updateEmailStatus() {
    const email = (qs("#regEmail")?.value || "").trim();
    const el = qs("#emailStatus");
    if (!el) return;
    if (!email || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      el.textContent = ""; el.style.color = "";
    } else {
      el.textContent = "이메일 형식이 올바르지 않습니다.";
      el.style.color = "var(--danger)";
    }
    updateRegisterBtn();
  }

  // ── 비밀번호 확인 실시간 검증 ──────────────────────────────────
  function updatePasswordConfirmStatus() {
    const pw  = (qs("#regPassword")?.value || "");
    const pwc = (qs("#regPasswordConfirm")?.value || "");
    const el  = qs("#passwordConfirmStatus");
    if (!el) return;
    if (!pwc) {
      el.textContent = ""; el.style.color = "";
    } else if (pw === pwc) {
      el.textContent = "비밀번호가 일치합니다.";
      el.style.color = "var(--ok)";
    } else {
      el.textContent = "비밀번호가 일치하지 않습니다.";
      el.style.color = "var(--danger)";
    }
    updateRegisterBtn();
  }

  // ── 회원가입 버튼 활성화 조건 ────────────────────────────────────
  function updateRegisterBtn() {
    const nickname = (qs("#regNickname")?.value || "").trim();
    const email    = (qs("#regEmail")?.value || "").trim();
    const password = (qs("#regPassword")?.value || "");
    const pwConfirm = (qs("#regPasswordConfirm")?.value || "");
    const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    const pwMatch = password !== "" && password === pwConfirm;
    const btn = qs("#btnRegister");
    if (btn) btn.disabled = !(nickname && email && password && emailValid && nicknameState === true && pwMatch);
  }

  // ── 로딩 상태 ────────────────────────────────────────────────────
  function setLoading(btn, on) {
    if (!btn) return;
    btn.disabled = on;
    if (!btn.dataset.label) btn.dataset.label = btn.textContent;
    btn.textContent = on ? "처리 중…" : btn.dataset.label;
  }

  // ── 뷰 전환 ─────────────────────────────────────────────────────
  function showView(name) {
    setNotice("", "");
    Object.entries(views).forEach(([k, el]) => { if (el) el.hidden = k !== name; });
    if (name !== "register") {
      resetNicknameState();
      // 비밀번호 확인 필드 초기화
      const pwc = qs("#regPasswordConfirm");
      if (pwc) pwc.value = "";
      const pwcStatus = qs("#passwordConfirmStatus");
      if (pwcStatus) { pwcStatus.textContent = ""; pwcStatus.style.color = ""; }
    }
  }

  function openModal(view = "login") {
    showView(view);
    modal.hidden = false;
    document.body.style.overflow = "hidden";
  }

  function closeModal() {
    modal.hidden = true;
    document.body.style.overflow = "";
    setNotice("", "");
  }

  // ── 열기 / 닫기 ─────────────────────────────────────────────────
  qs("#btnOpenLogin")?.addEventListener("click", () => openModal("login"));
  qs("#btnCloseAuth")?.addEventListener("click", closeModal);

  // URL 파라미터로 자동 오픈 (?openAuth=login|signup|forgot)
  const openParam = new URLSearchParams(location.search).get("openAuth");
  if (openParam) {
    const viewName = openParam === "signup" ? "register" : openParam === "forgot" ? "forgot" : "login";
    openModal(viewName);
    history.replaceState({}, "", location.pathname);
  }

  // ── 뷰 전환 버튼 ────────────────────────────────────────────────
  modal.querySelectorAll("[data-to]").forEach((btn) => {
    btn.addEventListener("click", () => showView(btn.dataset.to));
  });

  // ── 회원가입 실시간 검증 ─────────────────────────────────────────
  qs("#regNickname")?.addEventListener("input", () => {
    nicknameState = null;
    updateNicknameStatus();
  });
  qs("#regEmail")?.addEventListener("input", updateEmailStatus);
  qs("#regPassword")?.addEventListener("input", () => {
    updatePasswordConfirmStatus();
    updateRegisterBtn();
  });
  qs("#regPasswordConfirm")?.addEventListener("input", updatePasswordConfirmStatus);

  // 닉네임 중복확인 버튼
  const btnCheck = qs("#btnCheckNickname");
  btnCheck?.addEventListener("click", async () => {
    const nickname = (qs("#regNickname")?.value || "").trim();
    if (!nickname) {
      const el = qs("#nicknameStatus");
      if (el) { el.textContent = "닉네임을 입력해주세요."; el.style.color = "var(--danger)"; }
      return;
    }
    setLoading(btnCheck, true);
    try {
      const taken = await isNicknameTaken(nickname);
      nicknameState = !taken;
    } catch {
      nicknameState = null;
    } finally {
      setLoading(btnCheck, false);
    }
    updateNicknameStatus();
  });

  // ── 로그인 폼 ────────────────────────────────────────────────────
  qs("#formLogin")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = e.currentTarget.querySelector("[type=submit]");
    setLoading(btn, true);
    setNotice("", "");
    try {
      await signInModal(
        (qs("#loginEmail")?.value || "").trim(),
        (qs("#loginPassword")?.value || "").trim()
      );
      closeModal();
    } catch (err) {
      setNotice("danger", err.message);
      setLoading(btn, false);
    }
  });

  // ── 회원가입 폼 ──────────────────────────────────────────────────
  qs("#formRegister")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = e.currentTarget.querySelector("[type=submit]");
    setLoading(btn, true);
    setNotice("", "");
    try {
      await signUpModal(
        (qs("#regNickname")?.value || "").trim(),
        (qs("#regEmail")?.value || "").trim(),
        (qs("#regPassword")?.value || "").trim()
      );
      closeModal();
    } catch (err) {
      setNotice("danger", err.message);
      setLoading(btn, false);
    }
  });

  // ── 비밀번호 찾기 폼 ─────────────────────────────────────────────
  qs("#formForgot")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = e.currentTarget.querySelector("[type=submit]");
    setLoading(btn, true);
    setNotice("", "");
    try {
      await sendResetEmail((qs("#forgotEmail")?.value || "").trim());
      setNotice("ok", "비밀번호 재설정 이메일을 전송했습니다. 받은편지함을 확인해주세요.");
    } catch (err) {
      setNotice("danger", err.message);
    } finally {
      setLoading(btn, false);
    }
  });

  window.__openAuthModal = openModal;
}

export function requireAuth() {
  return new Promise((resolve) => {
    onAuthStateChanged(auth, (user) => {
      if (!user) {
        window.location.href = "index.html?openAuth=login";
        return;
      }
      resolve(user);
    });
  });
}

export function getUrlParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}
