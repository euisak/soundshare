import {
  auth, db, serverTimestamp, sendPasswordResetEmail, onAuthStateChanged,
  collection, doc, query, where, getDocs, getDoc, setDoc, deleteDoc, writeBatch,
  updatePassword, deleteUser, EmailAuthProvider, reauthenticateWithCredential,
} from "./firebase.js";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile,
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-auth.js";

function qs(sel) { return document.querySelector(sel); }

function setNotice(kind, msg) {
  const el = qs("#notice");
  if (!el) return;
  el.className = `notice ${kind || ""}`.trim();
  el.textContent = msg || "";
  el.hidden = !msg;
}

function getValue(id) {
  const el = qs(id);
  return el ? el.value.trim() : "";
}

function setLoading(btn, on) {
  if (!btn) return;
  btn.disabled = on;
  if (!btn.dataset.label) btn.dataset.label = btn.textContent;
  btn.textContent = on ? "처리 중…" : btn.dataset.label;
}

const ERROR_MAP = {
  "auth/invalid-email": "이메일 형식이 올바르지 않습니다.",
  "auth/user-not-found": "등록되지 않은 이메일입니다.",
  "auth/wrong-password": "비밀번호가 틀렸습니다.",
  "auth/invalid-credential":        "이메일 또는 비밀번호가 올바르지 않습니다.",
  "auth/invalid-login-credentials": "이메일 또는 비밀번호가 올바르지 않습니다.",
  "auth/email-already-in-use": "이미 사용 중인 이메일입니다.",
  "auth/weak-password": "비밀번호는 특수기호를 포함한 8자 이상이어야 합니다.",
  "auth/too-many-requests": "요청이 너무 많습니다. 잠시 후 다시 시도해주세요.",
  "auth/network-request-failed": "네트워크 오류가 발생했습니다.",
};

// 비밀번호: 8자 이상 + 특수기호 포함
function validatePassword(pw) {
  if (pw.length < 8) return "비밀번호는 8자 이상이어야 합니다.";
  if (!/[!@#$%^&*()\-_=+\[\]{};:'",.<>/?\\|`~]/.test(pw)) return "비밀번호에 특수기호를 포함해야 합니다.";
  return null;
}

// 닉네임 중복 확인
export async function isNicknameTaken(nickname) {
  const snap = await getDocs(query(collection(db, "users"), where("nickname", "==", nickname)));
  return !snap.empty;
}

// 회원가입 진행 중 onAuthStateChanged 자동 리다이렉트 방지 플래그
let registering = false;

function authError(code) {
  return ERROR_MAP[code] || null; // null 반환 → err.message fallback 가능하게
}

async function ensureUserDoc(user, nickname) {
  await setDoc(
    doc(db, "users", user.uid),
    {
      uid: user.uid,
      email: user.email,
      nickname: nickname || user.displayName || user.email.split("@")[0],
      spotifyConnected: false,
      createdAt: serverTimestamp(),
    },
    { merge: true }
  );
}

async function onLogin(e) {
  e.preventDefault();
  const btn = qs("#formLogin [type=submit]");
  setLoading(btn, true);
  setNotice("", "");
  try {
    const email = getValue("#loginEmail");
    const password = getValue("#loginPassword");
    if (!email || !password) throw new Error("이메일/비밀번호를 입력해주세요.");
    // 이메일 형식 확인
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new Error("이메일 형식이 올바르지 않습니다.");
    }
    await signInWithEmailAndPassword(auth, email, password);
    window.location.replace("index.html");
  } catch (err) {
    setNotice("danger", authError(err.code) || err.message || "오류가 발생했습니다. 다시 시도해주세요.");
    setLoading(btn, false);
  }
}

async function onRegister(e) {
  e.preventDefault();
  const btn = qs("#formRegister [type=submit]");
  setLoading(btn, true);
  setNotice("", "");
  registering = true;
  try {
    const email = getValue("#regEmail");
    const password = getValue("#regPassword");
    const nickname = getValue("#regNickname");

    // 필수 입력 확인
    if (!email || !password || !nickname) {
      throw new Error("닉네임, 이메일, 비밀번호를 모두 입력해주세요.");
    }

    // 이메일 형식 확인
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new Error("이메일 형식이 올바르지 않습니다.");
    }

    // 비밀번호 검증 (8자 이상 + 특수기호)
    const pwError = validatePassword(password);
    if (pwError) throw new Error(pwError);

    const cred = await createUserWithEmailAndPassword(auth, email, password);

    // 계정 생성 후 인증된 상태에서 닉네임 중복 확인 (Firestore 보안 규칙 통과)
    if (await isNicknameTaken(nickname)) {
      await cred.user.delete(); // 방금 만든 계정 롤백
      throw new Error("이미 사용 중인 닉네임입니다.");
    }

    if (nickname) await updateProfile(cred.user, { displayName: nickname });
    await ensureUserDoc(cred.user, nickname); // 닉네임 저장 완료 후 이동
    window.location.href = "index.html";
  } catch (err) {
    registering = false;
    setNotice("danger", authError(err.code) || err.message || "오류가 발생했습니다. 다시 시도해주세요.");
    setLoading(btn, false);
  }
}

async function onForgot(e) {
  e.preventDefault();
  const btn = qs("#formForgot [type=submit]");
  setLoading(btn, true);
  setNotice("", "");
  try {
    const email = getValue("#forgotEmail");
    if (!email) throw new Error("이메일을 입력해주세요.");
    await sendPasswordResetEmail(auth, email);
    setNotice("ok", "비밀번호 재설정 이메일을 전송했습니다. 받은편지함을 확인해주세요.");
  } catch (err) {
    setNotice("danger", authError(err.code) || err.message || "오류가 발생했습니다. 다시 시도해주세요.");
  } finally {
    setLoading(btn, false);
  }
}

// ── 모달용 export 함수들 ──────────────────────────────────────────

export async function signInModal(email, password) {
  if (!email || !password) throw new Error("이메일/비밀번호를 입력해주세요.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("이메일 형식이 올바르지 않습니다.");
  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch (err) {
    throw new Error(authError(err.code) || err.message || "오류가 발생했습니다.");
  }
}

export async function signUpModal(nickname, email, password) {
  if (!nickname || !email || !password) throw new Error("닉네임, 이메일, 비밀번호를 모두 입력해주세요.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("이메일 형식이 올바르지 않습니다.");
  const pwErr = validatePassword(password);
  if (pwErr) throw new Error(pwErr);
  let cred;
  try {
    cred = await createUserWithEmailAndPassword(auth, email, password);
  } catch (err) {
    throw new Error(authError(err.code) || err.message || "오류가 발생했습니다.");
  }
  if (await isNicknameTaken(nickname)) {
    await cred.user.delete();
    throw new Error("이미 사용 중인 닉네임입니다.");
  }
  if (nickname) await updateProfile(cred.user, { displayName: nickname });
  await ensureUserDoc(cred.user, nickname);
}

export async function sendResetEmail(email) {
  if (!email) throw new Error("이메일을 입력해주세요.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("이메일 형식이 올바르지 않습니다.");

  // Firestore에서 가입된 이메일인지 확인
  const snap = await getDocs(query(collection(db, "users"), where("email", "==", email)));
  if (snap.empty) throw new Error("가입되지 않은 이메일입니다.");

  try {
    await sendPasswordResetEmail(auth, email);
  } catch (err) {
    throw new Error(authError(err.code) || err.message || "오류가 발생했습니다.");
  }
}

// ── 설정 페이지용 함수들 ──────────────────────────────────────────

export async function changeNickname(newNickname) {
  const user = auth.currentUser;
  if (!user) throw new Error("로그인이 필요합니다.");
  if (!newNickname) throw new Error("닉네임을 입력해주세요.");
  if (newNickname.length > 10) throw new Error("닉네임은 10자 이내여야 합니다.");

  const taken = await isNicknameTaken(newNickname);
  if (taken && newNickname !== user.displayName) throw new Error("이미 사용 중인 닉네임입니다.");

  await updateProfile(user, { displayName: newNickname });
  await setDoc(doc(db, "users", user.uid), { nickname: newNickname }, { merge: true });

  // ── 게시글 authorName 일괄 업데이트 ─────────────────────────
  const postsSnap = await getDocs(
    query(collection(db, "posts"), where("authorId", "==", user.uid))
  );
  if (!postsSnap.empty) {
    const batch = writeBatch(db);
    postsSnap.docs.forEach((d) => batch.update(d.ref, { authorName: newNickname }));
    await batch.commit();
  }

  // ── 댓글 authorName 일괄 업데이트 (commentedPostIds 기반) ───
  const userSnap = await getDoc(doc(db, "users", user.uid));
  const postIds = userSnap.data()?.commentedPostIds || [];
  if (postIds.length) {
    const batch2 = writeBatch(db);
    for (const postId of postIds) {
      const commSnap = await getDocs(
        query(collection(db, "posts", postId, "comments"), where("authorId", "==", user.uid))
      );
      commSnap.docs.forEach((d) => batch2.update(d.ref, { authorName: newNickname }));
    }
    await batch2.commit();
  }
}

export async function changePassword(currentPassword, newPassword) {
  const user = auth.currentUser;
  if (!user) throw new Error("로그인이 필요합니다.");

  const pwErr = validatePassword(newPassword);
  if (pwErr) throw new Error(pwErr);

  const credential = EmailAuthProvider.credential(user.email, currentPassword);
  try {
    await reauthenticateWithCredential(user, credential);
  } catch (err) {
    throw new Error(authError(err.code) || "현재 비밀번호가 올바르지 않습니다.");
  }
  try {
    await updatePassword(user, newPassword);
  } catch (err) {
    throw new Error(authError(err.code) || err.message || "비밀번호 변경에 실패했습니다.");
  }
}

export async function updateProfilePhoto(dataUrl) {
  const user = auth.currentUser;
  if (!user) throw new Error("로그인이 필요합니다.");
  // Firebase Auth photoURL은 URL 길이 제한이 있어 base64 저장 불가 → Firestore에만 저장
  await setDoc(doc(db, "users", user.uid), { photoURL: dataUrl }, { merge: true });
}

export async function deleteAccount(currentPassword) {
  const user = auth.currentUser;
  if (!user) throw new Error("로그인이 필요합니다.");

  const credential = EmailAuthProvider.credential(user.email, currentPassword);
  try {
    await reauthenticateWithCredential(user, credential);
  } catch (err) {
    throw new Error(authError(err.code) || "비밀번호가 올바르지 않습니다.");
  }
  // Firestore 유저 문서 삭제
  try { await deleteDoc(doc(db, "users", user.uid)); } catch {}
  // Firebase Auth 계정 삭제
  await deleteUser(user);
}

export function initAuthPage() {
  // 이미 로그인돼 있으면 바로 홈으로 (회원가입 진행 중엔 무시)
  const unsub = onAuthStateChanged(auth, (user) => {
    if (user && !registering) { unsub(); window.location.replace("index.html"); }
  });

  // ── 뷰 전환 ─────────────────────────────────────────────────────
  const viewMap = { login: "#viewLogin", register: "#viewRegister", forgot: "#viewForgot" };

  function showView(name) {
    setNotice("", "");
    Object.entries(viewMap).forEach(([k, sel]) => {
      const el = qs(sel);
      if (el) el.hidden = k !== name;
    });
    if (name !== "register") resetNicknameState();
  }

  // URL 해시로 초기 뷰 결정 (#signup → register, #forgot → forgot)
  const hash = window.location.hash.slice(1);
  if (hash === "signup") showView("register");
  else if (hash === "forgot") showView("forgot");

  document.querySelectorAll("[data-to]").forEach((btn) => {
    btn.addEventListener("click", () => showView(btn.dataset.to));
  });

  // ── 닉네임 검증 상태 ─────────────────────────────────────────────
  // null: 미확인 / true: 사용가능 / false: 중복
  let nicknameState = null;

  function resetNicknameState() {
    nicknameState = null;
    const el = qs("#nicknameStatus");
    if (el) { el.textContent = ""; el.style.color = ""; }
    updateRegisterBtn();
  }

  function updateNicknameStatus() {
    const nickname = getValue("#regNickname");
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
    const email = getValue("#regEmail");
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

  // ── 회원가입 버튼 활성화 조건 ────────────────────────────────────
  function updateRegisterBtn() {
    const nickname = getValue("#regNickname");
    const email    = getValue("#regEmail");
    const password = getValue("#regPassword");
    const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    const btn = qs("#btnRegister");
    if (btn) btn.disabled = !(nickname && email && password && emailValid && nicknameState === true);
  }

  // 닉네임 입력 변경 → 상태 초기화
  qs("#regNickname")?.addEventListener("input", () => {
    nicknameState = null;
    updateNicknameStatus();
  });
  qs("#regEmail")?.addEventListener("input", updateEmailStatus);
  qs("#regPassword")?.addEventListener("input", updateRegisterBtn);

  // 닉네임 중복확인 버튼
  const btnCheck = qs("#btnCheckNickname");
  btnCheck?.addEventListener("click", async () => {
    const nickname = getValue("#regNickname");
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

  // ── 폼 이벤트 연결 ───────────────────────────────────────────────
  qs("#formLogin")?.addEventListener("submit", onLogin);
  qs("#formRegister")?.addEventListener("submit", onRegister);
  qs("#formForgot")?.addEventListener("submit", onForgot);
}
