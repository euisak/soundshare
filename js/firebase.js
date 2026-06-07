// Firebase 초기화 및 Auth, Firestore 함수 export
// 모든 JS 파일은 여기서 Firebase 관련 함수를 import해서 사용

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signOut,
  sendPasswordResetEmail,
  updatePassword,
  deleteUser,
  EmailAuthProvider,
  reauthenticateWithCredential,
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-auth.js";
import {
  getFirestore,
  serverTimestamp,
  collection,
  doc,
  addDoc,
  setDoc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  writeBatch,
  query,
  orderBy,
  limit,
  where,
  arrayUnion,
  arrayRemove,
  increment,
  onSnapshot,
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js";

// config.js 에서 Firebase 설정 읽기
function getConfig() {
  const cfg = window.__CONFIG__;
  if (!cfg || !cfg.firebase) throw new Error("Missing config.js — create from config.js.example");
  return cfg;
}

const { firebase } = getConfig();

export const app  = initializeApp(firebase); // Firebase 앱 초기화
export const auth = getAuth(app);            // Firebase Auth 인스턴스
export const db   = getFirestore(app);       // Firestore 인스턴스

// 다른 파일에서 import해서 쓸 수 있도록 re-export
export {
  onAuthStateChanged, signOut, sendPasswordResetEmail,
  updatePassword, deleteUser, EmailAuthProvider, reauthenticateWithCredential,
  serverTimestamp,
  collection, doc, addDoc, setDoc,
  getDoc, getDocs, updateDoc, deleteDoc, writeBatch,
  query, orderBy, limit, where,
  arrayUnion, arrayRemove, increment, onSnapshot,
};
