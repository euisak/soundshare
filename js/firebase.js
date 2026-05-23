import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signOut,
  sendPasswordResetEmail,
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
  query,
  orderBy,
  limit,
  where,
  arrayUnion,
  arrayRemove,
  increment,
  onSnapshot,
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js";

function getConfig() {
  const cfg = window.__CONFIG__;
  if (!cfg || !cfg.firebase) throw new Error("Missing config.js — create from config.js.example");
  return cfg;
}

const { firebase } = getConfig();

export const app = initializeApp(firebase);
export const auth = getAuth(app);
export const db = getFirestore(app);

export {
  onAuthStateChanged, signOut, sendPasswordResetEmail,
  serverTimestamp,
  collection, doc, addDoc, setDoc,
  getDoc, getDocs, updateDoc, deleteDoc,
  query, orderBy, limit, where,
  arrayUnion, arrayRemove, increment, onSnapshot,
};
