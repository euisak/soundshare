// 알림 생성, 실시간 리스너, 삭제
// 좋아요/댓글 발생 시 알림 Firestore에 저장, 헤더 벨 아이콘에 실시간 반영

import {
  db, auth, serverTimestamp,
  collection, doc, addDoc, deleteDoc, query, where, onSnapshot,
} from "./firebase.js";

// 알림 생성 (본인 행동은 무시)
export async function addNotification({ toUid, type, postId, postTitle, fromName, commentText }) {
  if (!toUid || toUid === auth.currentUser?.uid) return; // 본인한테는 알림 안 보냄
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

// 실시간 알림 리스너 (최신순 정렬)
// onSnapshot → Firestore 변경 시 자동으로 callback 실행
export function listenNotifications(uid, callback) {
  const q = query(collection(db, "notifications"), where("toUid", "==", uid));
  return onSnapshot(q, (snap) => {
    const notifs = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)); // 최신순 정렬
    callback(notifs);
  });
}

// 알림 삭제 (알림 클릭 시 해당 게시글로 이동하면서 삭제)
export async function deleteNotification(notifId) {
  try {
    await deleteDoc(doc(db, "notifications", notifId));
  } catch { /* 조용히 무시 */ }
}
