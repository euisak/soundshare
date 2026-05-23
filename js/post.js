import {
  db, auth, serverTimestamp,
  collection, doc, addDoc, getDoc, getDocs, updateDoc, deleteDoc,
  query, orderBy, limit, where, arrayUnion, arrayRemove, increment, onSnapshot,
} from "./firebase.js";

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
    tracks: tracks || [],          // 최대 5곡 배열
    likeCount: 0,
    likedBy: [],
    savedBy: [],
    commentCount: 0,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function getPosts({ genre, tag, limitN = 20 } = {}) {
  let q;
  if (genre) {
    q = query(
      collection(db, "posts"),
      where("genre", "array-contains", genre),
      orderBy("createdAt", "desc"),
      limit(limitN)
    );
  } else if (tag) {
    q = query(
      collection(db, "posts"),
      where("tags", "array-contains", tag),
      orderBy("createdAt", "desc"),
      limit(limitN)
    );
  } else {
    q = query(collection(db, "posts"), orderBy("createdAt", "desc"), limit(limitN));
  }
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function searchPosts(keyword) {
  // Firestore는 full-text search 미지원 — 제목 prefix 검색 (대소문자 구분)
  const q = query(collection(db, "posts"), orderBy("title"), limit(50));
  const snap = await getDocs(q);
  const kw = keyword.toLowerCase();
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((p) =>
      p.title?.toLowerCase().includes(kw) ||
      p.tags?.some((t) => t.toLowerCase().includes(kw)) ||
      p.genre?.some((g) => g.toLowerCase().includes(kw)) ||
      p.authorName?.toLowerCase().includes(kw)
    );
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
  const liked = (snap.data()?.likedBy || []).includes(user.uid);
  await updateDoc(ref, {
    likedBy: liked ? arrayRemove(user.uid) : arrayUnion(user.uid),
    likeCount: increment(liked ? -1 : 1),
  });
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
}

export function listenComments(postId, callback) {
  return onSnapshot(
    query(collection(db, "posts", postId, "comments"), orderBy("createdAt", "asc")),
    (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
  );
}

export async function getUserPosts(uid) {
  const q = query(
    collection(db, "posts"),
    where("authorId", "==", uid),
    orderBy("createdAt", "desc")
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function getSavedPosts(uid) {
  const q = query(
    collection(db, "posts"),
    where("savedBy", "array-contains", uid),
    orderBy("createdAt", "desc")
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function getLikedPosts(uid) {
  const q = query(
    collection(db, "posts"),
    where("likedBy", "array-contains", uid),
    orderBy("createdAt", "desc")
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}
