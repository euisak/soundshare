import {
  auth, db, serverTimestamp, sendPasswordResetEmail,
  collection, doc, query, where, getDocs, getDoc, setDoc, deleteDoc, writeBatch,
  updatePassword, deleteUser, EmailAuthProvider, reauthenticateWithCredential,
} from "./firebase.js";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile,
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-auth.js";

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
      createdAt: serverTimestamp(),
    },
    { merge: true }
  );
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
    throw new Error("현재 비밀번호가 올바르지 않습니다.");
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
    throw new Error("비밀번호가 올바르지 않습니다.");
  }
  // Firestore 유저 문서 삭제
  try { await deleteDoc(doc(db, "users", user.uid)); } catch {}
  // Firebase Auth 계정 삭제
  await deleteUser(user);
}

