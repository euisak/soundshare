// settings.html 전용 로직
// 닉네임 변경, 비밀번호 변경, 프로필 사진 업로드, 공개 범위 설정, 회원 탈퇴

import { loadHeader, initTopbar, requireAuth } from "./app.js";
import { isNicknameTaken, changeNickname, changePassword, deleteAccount, updateProfilePhoto } from "./auth.js";
import { db, getDoc, setDoc, doc } from "./firebase.js";
import { avatarLetter, showToast } from "./ui.js";

await loadHeader();
initTopbar();
const user = await requireAuth(); // 비로그인 차단

const name = user.displayName || user.email.split("@")[0]; // 표시 이름
const profileAvatarEl = document.querySelector("#profileAvatar");

const userSnap = await getDoc(doc(db, "users", user.uid));
let currentPhotoURL = userSnap.data()?.photoURL || null;

function renderProfileAvatar(photoURL) {
  if (photoURL) {
    profileAvatarEl.innerHTML = `<img src="${photoURL}" alt="프로필" />`;
  } else {
    profileAvatarEl.textContent = avatarLetter(name);
  }
}
renderProfileAvatar(currentPhotoURL);
document.querySelector("#profileName").textContent  = name;
document.querySelector("#profileEmail").textContent = user.email;

// ── 공통 유틸 ────────────────────────────────────────────
function setNotice(id, kind, msg) { // id: CSS selector, kind: "ok"|"danger"|""
  const el = document.querySelector(id);
  if (!el) return;
  el.className = `notice ${kind || ""}`.trim();
  el.textContent = msg || "";
  el.hidden = !msg;
}

function setLoading(btn, on, label) { // 버튼 로딩 상태 토글 (disabled + 텍스트 변경)
  btn.disabled = on;
  if (!btn.dataset.label) btn.dataset.label = btn.textContent; // 원본 텍스트 보존
  btn.textContent = on ? "처리 중…" : (label || btn.dataset.label);
}

// ── 프로필 사진 업로드 ──────────────────────────────────────
const photoFileInput  = document.querySelector("#photoFileInput");  // 숨겨진 파일 input
const photoSaveRow    = document.querySelector("#photoSaveRow");    // 저장/취소 버튼 행
const btnSavePhoto    = document.querySelector("#btnSavePhoto");
const btnCancelPhoto  = document.querySelector("#btnCancelPhoto");
let   pendingPhotoUrl = null; // Canvas로 리사이즈된 base64 이미지 (저장 전 임시)

document.querySelector("#photoUploadWrap").addEventListener("click", () => {
  photoFileInput.click();
});

photoFileInput.addEventListener("change", () => {
  const file = photoFileInput.files[0];
  if (!file) return;
  if (!/\.(jpe?g|png)$/i.test(file.name)) {
    showToast("JPG 또는 PNG 파일만 업로드할 수 있습니다.", "danger");
    photoFileInput.value = ""; return;
  }
  if (file.size > 5 * 1024 * 1024) {
    showToast("파일 크기는 5MB 이하여야 합니다.", "danger");
    photoFileInput.value = ""; return;
  }
  const reader = new FileReader();
  reader.onload = (ev) => {
    const img = new Image();
    img.onload = () => {
      const SIZE = 200; // 200×200 픽셀로 리사이즈
      const canvas = document.createElement("canvas");
      canvas.width = SIZE; canvas.height = SIZE;
      const ctx = canvas.getContext("2d");
      const side = Math.min(img.width, img.height); // 정사각형 크롭 (짧은 쪽 기준)
      const sx = (img.width - side) / 2, sy = (img.height - side) / 2;
      ctx.drawImage(img, sx, sy, side, side, 0, 0, SIZE, SIZE);
      pendingPhotoUrl = canvas.toDataURL("image/jpeg", 0.75); // JPEG 75% 품질로 변환
      profileAvatarEl.innerHTML = `<img src="${pendingPhotoUrl}" alt="미리보기" />`; // 미리보기
      photoSaveRow.hidden = false;
      setNotice("#noticePhoto", "", "");
    };
    img.src = ev.target.result;
  };
  reader.readAsDataURL(file);
});

btnCancelPhoto.addEventListener("click", () => {
  pendingPhotoUrl = null;
  photoFileInput.value = "";
  photoSaveRow.hidden = true;
  renderProfileAvatar(currentPhotoURL);
  setNotice("#noticePhoto", "", "");
});

btnSavePhoto.addEventListener("click", async () => {
  if (!pendingPhotoUrl) return;
  setLoading(btnSavePhoto, true);
  setNotice("#noticePhoto", "", "");
  try {
    await updateProfilePhoto(pendingPhotoUrl);
    currentPhotoURL = pendingPhotoUrl;
    pendingPhotoUrl = null;
    showToast("프로필 사진이 변경되었습니다.");
    photoSaveRow.hidden = true;
    photoFileInput.value = "";
  } catch (err) {
    setNotice("#noticePhoto", "danger", err.message);
  } finally {
    setLoading(btnSavePhoto, false, "사진 저장");
  }
});

// ── 닉네임 변경 ──────────────────────────────────────────
let nickState = null; // null=미확인, true=사용가능, false=중복
const nickInput    = document.querySelector("#newNickname");
const nickStatus   = document.querySelector("#nickStatus");    // 중복 확인 결과 표시
const btnCheckNick = document.querySelector("#btnCheckNick");  // 중복 확인 버튼
const btnSaveNick  = document.querySelector("#btnSaveNick");   // 저장 버튼

nickInput.value = "";

function updateNickUI() {
  const val = nickInput.value.trim();
  if (!val) {
    nickStatus.textContent = ""; nickStatus.style.color = "";
  } else if (val === (user.displayName || "")) {
    nickStatus.textContent = "현재 사용 중인 닉네임입니다.";
    nickStatus.style.color = "var(--muted)";
    nickState = true;
  } else if (nickState === null) {
    nickStatus.textContent = "중복 확인이 필요합니다.";
    nickStatus.style.color = "var(--muted)";
  } else if (nickState === true) {
    nickStatus.textContent = "사용 가능한 닉네임입니다.";
    nickStatus.style.color = "var(--ok)";
  } else {
    nickStatus.textContent = "이미 사용 중인 닉네임입니다.";
    nickStatus.style.color = "var(--danger)";
  }
  btnSaveNick.disabled = !(val && nickState === true);
}

nickInput.addEventListener("input", () => {
  const val = nickInput.value.trim();
  nickState = val === (user.displayName || "") ? true : null;
  updateNickUI();
});

btnCheckNick.addEventListener("click", async () => {
  const val = nickInput.value.trim();
  if (!val) {
    nickStatus.textContent = "닉네임을 입력해주세요.";
    nickStatus.style.color = "var(--danger)"; return;
  }
  if (val === (user.displayName || "")) { nickState = true; updateNickUI(); return; }
  setLoading(btnCheckNick, true);
  try {
    nickState = !(await isNicknameTaken(val));
  } catch { nickState = null; }
  finally { setLoading(btnCheckNick, false); }
  updateNickUI();
});

document.querySelector("#formNickname").addEventListener("submit", async (e) => {
  e.preventDefault();
  setLoading(btnSaveNick, true);
  setNotice("#noticeNickname", "", "");
  try {
    await changeNickname(nickInput.value.trim());
    const newName = nickInput.value.trim();
    document.querySelector("#profileName").textContent = newName;
    if (!currentPhotoURL && !pendingPhotoUrl) profileAvatarEl.textContent = avatarLetter(newName);
    nickState = null;
    updateNickUI();
    showToast("닉네임이 변경되었습니다.");
  } catch (err) {
    setNotice("#noticeNickname", "danger", err.message);
  } finally {
    setLoading(btnSaveNick, false, "저장");
  }
});

// ── 비밀번호 변경 ──────────────────────────────────────
const newPwInput      = document.querySelector("#newPw");
const newPwConfirm    = document.querySelector("#newPwConfirm");
const pwConfirmStatus = document.querySelector("#pwConfirmStatus");
const btnSavePw       = document.querySelector("#btnSavePw");

function updatePwBtn() {
  const cur = document.querySelector("#currentPw").value;
  btnSavePw.disabled = !(cur && newPwInput.value && newPwConfirm.value && newPwInput.value === newPwConfirm.value);
}

function updatePwConfirmStatus() {
  const np = newPwInput.value, npc = newPwConfirm.value;
  if (!npc) { pwConfirmStatus.textContent = ""; pwConfirmStatus.style.color = ""; }
  else if (np === npc) { pwConfirmStatus.textContent = "비밀번호가 일치합니다."; pwConfirmStatus.style.color = "var(--ok)"; }
  else { pwConfirmStatus.textContent = "비밀번호가 일치하지 않습니다."; pwConfirmStatus.style.color = "var(--danger)"; }
  updatePwBtn();
}

document.querySelector("#currentPw").addEventListener("input", updatePwBtn);
newPwInput.addEventListener("input", () => { updatePwConfirmStatus(); updatePwBtn(); });
newPwConfirm.addEventListener("input", updatePwConfirmStatus);

document.querySelector("#formPassword").addEventListener("submit", async (e) => {
  e.preventDefault();
  setLoading(btnSavePw, true);
  setNotice("#noticePw", "", "");
  try {
    await changePassword(document.querySelector("#currentPw").value, newPwInput.value);
    document.querySelector("#formPassword").reset();
    pwConfirmStatus.textContent = "";
    updatePwBtn();
    showToast("비밀번호가 변경되었습니다.");
  } catch (err) {
    setNotice("#noticePw", "danger", err.message);
  } finally {
    setLoading(btnSavePw, false, "변경");
  }
});

// ── 회원 탈퇴 ──────────────────────────────────────────
const btnShowDelete     = document.querySelector("#btnShowDelete");
const btnCancelDelete   = document.querySelector("#btnCancelDelete");
const deleteConfirmArea = document.querySelector("#deleteConfirmArea");

btnShowDelete.addEventListener("click", () => {
  if (!confirm("정말 탈퇴하시겠습니까?\n모든 데이터가 영구적으로 삭제되며 복구할 수 없습니다.")) return;
  deleteConfirmArea.hidden = false;
  btnShowDelete.hidden = true;
  setNotice("#noticeDelete", "", "");
  document.querySelector("#deletePw").focus();
});

btnCancelDelete.addEventListener("click", () => {
  deleteConfirmArea.hidden = true;
  btnShowDelete.hidden = false;
  document.querySelector("#deletePw").value = "";
  setNotice("#noticeDelete", "", "");
});

document.querySelector("#formDelete").addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = e.currentTarget.querySelector("[type=submit]");
  setLoading(btn, true);
  setNotice("#noticeDelete", "", "");
  try {
    await deleteAccount(document.querySelector("#deletePw").value);
    showToast("계정이 삭제되었습니다.");
    setTimeout(() => { window.location.href = "index.html"; }, 1000);
  } catch (err) {
    setNotice("#noticeDelete", "danger", err.message);
    setLoading(btn, false, "탈퇴 확인");
  }
});

updateNickUI();

// ── 공개 범위 ──────────────────────────────────────────
const togglePosts    = document.querySelector("#togglePosts");    // 게시글 공개 토글
const toggleComments = document.querySelector("#toggleComments"); // 댓글 공개 토글

// Firestore에 저장된 값으로 초기화 (기본값 true)
togglePosts.checked    = userSnap.data()?.postsPublic    !== false;
toggleComments.checked = userSnap.data()?.commentsPublic !== false;

async function savePrivacy() {
  setNotice("#noticePrivacy", "", "");
  try {
    await setDoc(doc(db, "users", user.uid), {
      postsPublic:    togglePosts.checked,
      commentsPublic: toggleComments.checked,
    }, { merge: true });
    setNotice("#noticePrivacy", "ok", "저장되었습니다.");
    setTimeout(() => setNotice("#noticePrivacy", "", ""), 2000);
  } catch (err) {
    setNotice("#noticePrivacy", "danger", err.message);
  }
}

togglePosts.addEventListener("change",    savePrivacy);
toggleComments.addEventListener("change", savePrivacy);
