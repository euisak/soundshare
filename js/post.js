// 게시글 CRUD, 좋아요, 댓글, 검색
// Firestore posts 컬렉션과 posts/{id}/comments 서브컬렉션 다룸

import {
  db, auth, serverTimestamp,
  collection, doc, addDoc, setDoc, getDoc, getDocs, updateDoc, deleteDoc,
  query, orderBy, limit, where, arrayUnion, arrayRemove, increment, onSnapshot,
} from "./firebase.js";
import { addNotification } from "./notify.js";

// 게시글 생성
// write-page.js에서 만든 payload를 Firestore posts 컬렉션에 저장한다.
export async function createPost({ title, body, tags, tracks }) {
  // createPost(payload)로 전달된 객체 구조 분해
  // payload 내부 값: 제목, 본문, 태그, 트랙 목록
  const user = auth.currentUser;
  if (!user) throw new Error("로그인이 필요합니다.");
  // 현재 로그인한 사용자의 uid와 displayName을 작성자 정보로 함께 저장한다.
  // tracks에는 검색으로 추가한 곡 목록, 앨범아트, 미리듣기 URL, 곡별 메모가 들어간다.
  const ref = await addDoc(collection(db, "posts"), {
    authorId: user.uid,
    authorName: user.displayName || user.email.split("@")[0],
    title: title.trim(),
    body: body.trim(),
    tags: tags || [],
    tracks: tracks || [],
    likeCount: 0,
    likedBy: [],     // 좋아요 누른 유저 uid 배열
    savedBy: [],
    commentCount: 0,
    viewCount: 0,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

// 게시글 수정 (본인만 가능)
export async function updatePost(id, { title, body, tags, tracks, visibility }) {
  const user = auth.currentUser;
  if (!user) throw new Error("로그인이 필요합니다.");
  const snap = await getDoc(doc(db, "posts", id));
  if (!snap.exists() || snap.data()?.authorId !== user.uid) throw new Error("권한이 없습니다.");
  await updateDoc(doc(db, "posts", id), {
    title: title.trim(),
    body: body.trim(),
    tags: tags || [],
    tracks: tracks || [],
    visibility: visibility || "public",
    updatedAt: serverTimestamp(),
  });
}

// 조회수 증가 (게시글 상세 진입 시)
export async function incrementViewCount(postId) {
  try {
    await updateDoc(doc(db, "posts", postId), { viewCount: increment(1) });
  } catch { /* 조용히 무시 */ }
}

// 게시글 목록 조회
// sort 값에 따라 Firestore posts 컬렉션 조회 기준 변경
// recent: 작성일 최신순, popular: 좋아요 많은 순, oldest: 작성일 오래된순
export async function getPosts({ sort = "recent", limitN = 30 } = {}) {
  let q;

  if (sort === "popular") {
    // 인기순 조회
    // likeCount 내림차순으로 좋아요가 많은 게시글부터 가져옴
    q = query(collection(db, "posts"), orderBy("likeCount", "desc"), limit(limitN));
  } else if (sort === "oldest") {
    // 오래된순 조회
    // createdAt 오름차순으로 먼저 작성된 게시글부터 가져옴
    q = query(collection(db, "posts"), orderBy("createdAt", "asc"), limit(limitN));
  } else {
    // 최신순 조회
    // 기본값 recent 포함, createdAt 내림차순으로 최근 작성된 게시글부터 가져옴
    q = query(collection(db, "posts"), orderBy("createdAt", "desc"), limit(limitN));
  }

  const snap = await getDocs(q);
  // Firestore 문서 id와 문서 데이터를 합쳐 화면 렌더링용 객체로 변환
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// 게시글 검색
// Firestore full-text 검색 미지원으로 최신 게시글 50개를 가져온 뒤 클라이언트에서 필터링
export async function searchPosts(keyword, fields = ["title", "artist", "song", "album"]) {
  // keyword: 사용자가 입력한 검색어
  // fields: 검색 대상 필드 배열
  // 기본 검색 대상: 제목(title), 아티스트(artist), 곡명(song), 앨범명(album)
  const q = query(collection(db, "posts"), orderBy("createdAt", "desc"), limit(50));
  const snap = await getDocs(q);

  // 검색 비교용 문자열 정규화
  // 대소문자와 공백 차이를 줄여 검색 정확도 보완
  const normalize = (str) => (str || "").toLowerCase().replace(/\s+/g, ""); // 대소문자·띄어쓰기 무시
  const kw = normalize(keyword);
  if (!kw) return [];

  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((p) => {
      // 제목 검색
      if (fields.includes("title") && normalize(p.title).includes(kw)) return true;
      const tracks = p.tracks?.length ? p.tracks : (p.track ? [p.track] : []);
      // 트랙 정보 검색
      // 곡명, 아티스트명, 앨범명 중 하나라도 검색어 포함 시 결과에 포함
      if (tracks.some((t) => {
        if (fields.includes("song")   && normalize(t.name).includes(kw))   return true;
        if (fields.includes("artist") && normalize(t.artist).includes(kw)) return true;
        if (fields.includes("album")  && normalize(t.album).includes(kw))  return true;
        return false;
      })) return true;
      return false;
    });
}

// 단일 게시글 조회
export async function getPost(id) {
  const snap = await getDoc(doc(db, "posts", id));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}

// 게시글 삭제 (본인만 가능)
export async function deletePost(id) {
  const user = auth.currentUser;
  if (!user) throw new Error("로그인이 필요합니다.");
  const snap = await getDoc(doc(db, "posts", id));
  if (snap.data()?.authorId !== user.uid) throw new Error("권한이 없습니다.");
  await deleteDoc(doc(db, "posts", id));
}

// 좋아요 토글 (좋아요 시 알림 생성, 취소 시 알림 없음)
export async function toggleLike(postId) {
  const user = auth.currentUser;
  if (!user) throw new Error("로그인이 필요합니다.");
  const ref = doc(db, "posts", postId);
  const snap = await getDoc(ref);
  // Firestore에서 가져온 게시글 실제 데이터
  // 데이터가 없을 경우를 대비해 빈 객체 사용
  const data = snap.data() || {};
  // likedBy 배열에 현재 사용자 uid가 있는지 확인
  // true: 이미 좋아요 누른 상태, false: 아직 누르지 않은 상태
  // likedBy가 없으면 빈 배열로 처리해 오류 방지
  const liked = (data.likedBy || []).includes(user.uid); // 이미 좋아요 눌렀는지 확인
  await updateDoc(ref, {
    likedBy: liked ? arrayRemove(user.uid) : arrayUnion(user.uid), // 토글
    likeCount: increment(liked ? -1 : 1),
  });
  if (!liked) { // 좋아요 누를 때만 알림 생성
    addNotification({
      toUid: data.authorId,
      type: "like",
      postId,
      postTitle: data.title || "",
      fromName: user.displayName || user.email.split("@")[0],
    });
  }
  return !liked; // 변경된 좋아요 상태 반환
}

// 댓글 작성 (댓글 수 증가 + 유저 문서에 게시글 ID 기록 + 알림 생성)
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
  // 유저 문서에 댓글 단 게시글 ID 기록 (마이페이지 댓글 탭에서 사용)
  await setDoc(doc(db, "users", user.uid), { commentedPostIds: arrayUnion(postId) }, { merge: true });
  // 글 작성자에게 댓글 알림
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

// 댓글 실시간 리스너 (작성 시간순)
export function listenComments(postId, callback) {
  return onSnapshot(
    query(collection(db, "posts", postId, "comments"), orderBy("createdAt", "asc")),
    (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
  );
}

// 작성 시간 내림차순 정렬
function sortByCreatedAt(posts) {
  return posts.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
}

// 내가 작성한 게시글 목록
export async function getUserPosts(uid) {
  const q = query(collection(db, "posts"), where("authorId", "==", uid));
  const snap = await getDocs(q);
  return sortByCreatedAt(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
}

// 내가 좋아요한 게시글 목록
export async function getLikedPosts(uid) {
  const q = query(collection(db, "posts"), where("likedBy", "array-contains", uid));
  const snap = await getDocs(q);
  return sortByCreatedAt(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
}

// 내가 댓글 단 게시글 목록 (유저 문서의 commentedPostIds 기반)
export async function getCommentedPosts(uid) {
  const userSnap = await getDoc(doc(db, "users", uid));
  const postIds = userSnap.data()?.commentedPostIds || [];
  if (!postIds.length) return [];

  const results = await Promise.all(
    postIds.map(async (postId) => {
      const postSnap = await getDoc(doc(db, "posts", postId));
      if (!postSnap.exists()) return null;
      const post = { id: postSnap.id, ...postSnap.data() };

      // 해당 게시글에서 내가 쓴 댓글 조회
      const commSnap = await getDocs(
        query(collection(db, "posts", postId, "comments"), where("authorId", "==", uid))
      );
      if (commSnap.empty) return null; // 댓글 삭제된 경우 제외

      // 가장 최신 댓글 하나만 표시
      const comment = commSnap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))[0];

      return { post, comment };
    })
  );

  return results
    .filter(Boolean)
    .sort((a, b) => (b.comment.createdAt?.seconds || 0) - (a.comment.createdAt?.seconds || 0));
}

// 댓글 수정 (본인만 가능)
export async function updateComment(postId, commentId, text) {
  const user = auth.currentUser;
  if (!user) throw new Error("로그인이 필요합니다.");
  if (!text.trim()) throw new Error("댓글 내용을 입력해주세요.");
  const ref = doc(db, "posts", postId, "comments", commentId);
  const snap = await getDoc(ref);
  if (snap.data()?.authorId !== user.uid) throw new Error("권한이 없습니다.");
  await updateDoc(ref, { text: text.trim() });
}

// 댓글 삭제 (본인만 가능, 댓글 수 감소)
export async function deleteComment(postId, commentId) {
  const user = auth.currentUser;
  if (!user) throw new Error("로그인이 필요합니다.");
  const ref = doc(db, "posts", postId, "comments", commentId);
  const snap = await getDoc(ref);
  if (snap.data()?.authorId !== user.uid) throw new Error("권한이 없습니다.");
  await deleteDoc(ref);
  await updateDoc(doc(db, "posts", postId), { commentCount: increment(-1) });
}
