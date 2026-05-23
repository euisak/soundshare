import {
  db, auth, serverTimestamp,
  collection, doc, addDoc, deleteDoc, query, where, onSnapshot,
} from "./firebase.js";

/**
 * 알림 생성 — 본인 행동은 무시
 */
export async function addNotification({ toUid, type, postId, postTitle, fromName, commentText }) {
  if (!toUid || toUid === auth.currentUser?.uid) return;
  try {
    await addDoc(collection(db, "notifications"), {
      toUid,
      fromUid: auth.currentUser?.uid || "",
      fromName: fromName || "",
      type,           // "like" | "comment"
      postId,
      postTitle: postTitle || "",
      commentText: commentText || "",
      createdAt: serverTimestamp(),
    });
  } catch { /* 조용히 무시 */ }
}

/**
 * 실시간 알림 리스너 — 최신순 정렬
 */
export function listenNotifications(uid, callback) {
  const q = query(collection(db, "notifications"), where("toUid", "==", uid));
  return onSnapshot(q, (snap) => {
    const notifs = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    callback(notifs);
  });
}

/**
 * 알림 삭제 (클릭 시 처리)
 */
export async function deleteNotification(notifId) {
  try {
    await deleteDoc(doc(db, "notifications", notifId));
  } catch { /* 조용히 무시 */ }
}
