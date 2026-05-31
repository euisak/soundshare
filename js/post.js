import {
  db, auth, serverTimestamp,
  collection, doc, addDoc, setDoc, getDoc, getDocs, updateDoc, deleteDoc,
  query, orderBy, limit, where, arrayUnion, arrayRemove, increment, onSnapshot,
} from "./firebase.js";
import { addNotification } from "./notify.js";

export async function createPost({ title, body, genre, tags, tracks }) {
  const user = auth.currentUser;
  if (!user) throw new Error("로그인이 필요합니다.");
  const ref = await addDoc(collection(db, "posts"), {
    authorId: user.uid,
    authorName: user.displayName || user.email.split("@")[0],
    title: title.trim(),
    body: body.trim(),
    genre: genre || [],
    tags: tags || [],
    tracks: tracks || [],
    likeCount: 0,
    likedBy: [],
    savedBy: [],
    commentCount: 0,
    viewCount: 0,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updatePost(id, { title, body, genre, tags, tracks, visibility }) {
  const user = auth.currentUser;
  if (!user) throw new Error("로그인이 필요합니다.");
  const snap = await getDoc(doc(db, "posts", id));
  if (!snap.exists() || snap.data()?.authorId !== user.uid) throw new Error("권한이 없습니다.");
  await updateDoc(doc(db, "posts", id), {
    title: title.trim(),
    body: body.trim(),
    genre: genre || [],
    tags: tags || [],
    tracks: tracks || [],
    visibility: visibility || "public",
    updatedAt: serverTimestamp(),
  });
}

export async function incrementViewCount(postId) {
  try {
    await updateDoc(doc(db, "posts", postId), { viewCount: increment(1) });
  } catch { /* 조용히 무시 */ }
}

export async function getPosts({ sort = "recent", limitN = 30 } = {}) {
  const q = sort === "popular"
    ? query(collection(db, "posts"), orderBy("likeCount", "desc"), limit(limitN))
    : query(collection(db, "posts"), orderBy("createdAt", "desc"), limit(limitN));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function searchPosts(keyword, fields = ["title", "artist", "song"]) {
  // Firestore full-text search 미지원 → 최신 50개 클라이언트 필터링
  const q = query(collection(db, "posts"), orderBy("createdAt", "desc"), limit(50));
  const snap = await getDocs(q);

  // 소문자 + 공백 제거로 정규화 (대소문자·띄어쓰기 무관하게 비교)
  const normalize = (str) => (str || "").toLowerCase().replace(/\s+/g, "");
  const kw = normalize(keyword);
  if (!kw) return [];

  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((p) => {
      if (fields.includes("title") && normalize(p.title).includes(kw)) return true;
      const tracks = p.tracks?.length ? p.tracks : (p.track ? [p.track] : []);
      if (tracks.some((t) => {
        if (fields.includes("song")   && normalize(t.name).includes(kw))   return true;
        if (fields.includes("artist") && normalize(t.artist).includes(kw)) return true;
        if (fields.includes("album")  && normalize(t.album).includes(kw))  return true;
        return false;
      })) return true;
      return false;
    });
}

export async function getPost(id) {
  const snap = await getDoc(doc(db, "posts", id));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}

export async function deletePost(id) {
  const user = auth.currentUser;
  if (!user) throw new Error("로그인이 필요합니다.");
  const snap = await getDoc(doc(db, "posts", id));
  if (snap.data()?.authorId !== user.uid) throw new Error("권한이 없습니다.");
  await deleteDoc(doc(db, "posts", id));
}

export async function toggleLike(postId) {
  const user = auth.currentUser;
  if (!user) throw new Error("로그인이 필요합니다.");
  const ref = doc(db, "posts", postId);
  const snap = await getDoc(ref);
  const data = snap.data() || {};
  const liked = (data.likedBy || []).includes(user.uid);
  await updateDoc(ref, {
    likedBy: liked ? arrayRemove(user.uid) : arrayUnion(user.uid),
    likeCount: increment(liked ? -1 : 1),
  });
  // 좋아요 누를 때만 알림 (취소 시엔 생성 안 함)
  if (!liked) {
    addNotification({
      toUid: data.authorId,
      type: "like",
      postId,
      postTitle: data.title || "",
      fromName: user.displayName || user.email.split("@")[0],
    });
  }
  return !liked;
}

export async function toggleSave(postId) {
  const user = auth.currentUser;
  if (!user) throw new Error("로그인이 필요합니다.");
  const ref = doc(db, "posts", postId);
  const snap = await getDoc(ref);
  const saved = (snap.data()?.savedBy || []).includes(user.uid);
  await updateDoc(ref, {
    savedBy: saved ? arrayRemove(user.uid) : arrayUnion(user.uid),
  });
  return !saved;
}

export async function addComment(postId, text) {
  const user = auth.currentUser;
  if (!user) throw new Error("로그인이 필요합니다.");
  await addDoc(collection(db, "posts", postId, "comments"), {
    authorId: user.uid,
    authorName: user.displayName || user.email.split("@")[0],
    text: text.trim(),
    createdAt: serverTimestamp(),
  });
  await updateDoc(doc(db, "posts", postId), { commentCount: increment(1) });
  // 유저 문서에 댓글 단 게시글 ID 기록 (마이페이지 탭용)
  await setDoc(doc(db, "users", user.uid), { commentedPostIds: arrayUnion(postId) }, { merge: true });
  // 댓글 알림 — 글 작성자에게
  const postSnap = await getDoc(doc(db, "posts", postId));
  const postData = postSnap.data();
  if (postData) {
    addNotification({
      toUid: postData.authorId,
      type: "comment",
      postId,
      postTitle: postData.title || "",
      fromName: user.displayName || user.email.split("@")[0],
      commentText: text.trim(),
    });
  }
}

export function listenComments(postId, callback) {
  return onSnapshot(
    query(collection(db, "posts", postId, "comments"), orderBy("createdAt", "asc")),
    (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
  );
}

function sortByCreatedAt(posts) {
  return posts.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
}

export async function getUserPosts(uid) {
  const q = query(collection(db, "posts"), where("authorId", "==", uid));
  const snap = await getDocs(q);
  return sortByCreatedAt(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
}

export async function getSavedPosts(uid) {
  const q = query(collection(db, "posts"), where("savedBy", "array-contains", uid));
  const snap = await getDocs(q);
  return sortByCreatedAt(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
}

export async function getLikedPosts(uid) {
  const q = query(collection(db, "posts"), where("likedBy", "array-contains", uid));
  const snap = await getDocs(q);
  return sortByCreatedAt(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
}

export async function getCommentedPosts(uid) {
  const userSnap = await getDoc(doc(db, "users", uid));
  const postIds = userSnap.data()?.commentedPostIds || [];
  if (!postIds.length) return [];

  const results = await Promise.all(
    postIds.map(async (postId) => {
      const postSnap = await getDoc(doc(db, "posts", postId));
      if (!postSnap.exists()) return null;
      const post = { id: postSnap.id, ...postSnap.data() };

      // 해당 포스트에 내가 쓴 댓글 조회 (단일 필드 equality → 인덱스 불필요)
      const commSnap = await getDocs(
        query(collection(db, "posts", postId, "comments"), where("authorId", "==", uid))
      );
      if (commSnap.empty) return null; // 댓글 삭제된 경우 제외

      // 가장 최신 댓글 하나
      const comment = commSnap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))[0];

      return { post, comment };
    })
  );

  return results
    .filter(Boolean)
    .sort((a, b) => (b.post.createdAt?.seconds || 0) - (a.post.createdAt?.seconds || 0));
}

export async function updateComment(postId, commentId, text) {
  const user = auth.currentUser;
  if (!user) throw new Error("로그인이 필요합니다.");
  if (!text.trim()) throw new Error("댓글 내용을 입력해주세요.");
  const ref = doc(db, "posts", postId, "comments", commentId);
  const snap = await getDoc(ref);
  if (snap.data()?.authorId !== user.uid) throw new Error("권한이 없습니다.");
  await updateDoc(ref, { text: text.trim() });
}

export async function deleteComment(postId, commentId) {
  const user = auth.currentUser;
  if (!user) throw new Error("로그인이 필요합니다.");
  const ref = doc(db, "posts", postId, "comments", commentId);
  const snap = await getDoc(ref);
  if (snap.data()?.authorId !== user.uid) throw new Error("권한이 없습니다.");
  await deleteDoc(ref);
  await updateDoc(doc(db, "posts", postId), { commentCount: increment(-1) });
}
