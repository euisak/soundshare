import { auth, db, serverTimestamp, sendPasswordResetEmail, onAuthStateChanged } from "./firebase.js";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile,
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-auth.js";
import { doc, setDoc } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js";

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
  "auth/weak-password": "비밀번호는 6자 이상이어야 합니다.",
  "auth/too-many-requests": "요청이 너무 많습니다. 잠시 후 다시 시도해주세요.",
  "auth/network-request-failed": "네트워크 오류가 발생했습니다.",
};

function authError(code) {
  return ERROR_MAP[code] || "오류가 발생했습니다. 다시 시도해주세요.";
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
    await signInWithEmailAndPassword(auth, email, password);
    window.location.replace("index.html");
  } catch (err) {
    setNotice("danger", authError(err.code) || err.message);
    setLoading(btn, false);
  }
}

async function onRegister(e) {
  e.preventDefault();
  const btn = qs("#formRegister [type=submit]");
  setLoading(btn, true);
  setNotice("", "");
  try {
    const email = getValue("#regEmail");
    const password = getValue("#regPassword");
    const nickname = getValue("#regNickname");
    if (!email || !password) throw { code: "auth/missing-fields", message: "이메일/비밀번호를 입력해주세요." };
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    if (nickname) await updateProfile(cred.user, { displayName: nickname });
    ensureUserDoc(cred.user, nickname).catch(console.warn); // 백그라운드 저장, 실패해도 진행
    window.location.href = "index.html";
  } catch (err) {
    setNotice("danger", authError(err.code) || err.message);
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
    setNotice("danger", authError(err.code) || err.message);
  } finally {
    setLoading(btn, false);
  }
}

export function initAuthPage() {
  // 이미 로그인돼 있으면 바로 홈으로
  const unsub = onAuthStateChanged(auth, (user) => {
    if (user) { unsub(); window.location.replace("index.html"); }
  });

  const formLogin    = qs("#formLogin");
  const formRegister = qs("#formRegister");
  const formForgot   = qs("#formForgot");
  if (formLogin)    formLogin.addEventListener("submit", onLogin);
  if (formRegister) formRegister.addEventListener("submit", onRegister);
  if (formForgot)   formForgot.addEventListener("submit", onForgot);
}
