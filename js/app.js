import { auth, onAuthStateChanged, signOut } from "./firebase.js";

export function qs(sel, parent = document) {
  return parent.querySelector(sel);
}

export function qsa(sel, parent = document) {
  return [...parent.querySelectorAll(sel)];
}

export function setText(sel, text) {
  const el = qs(sel);
  if (el) el.textContent = text ?? "";
}

export function setNotice(kind, msg) {
  const el = qs("#notice");
  if (!el) return;
  el.className = `notice ${kind || ""}`.trim();
  el.textContent = msg || "";
  el.hidden = !msg;
}

export function getConfig() {
  const cfg = window.__CONFIG__;
  if (!cfg) {
    throw new Error("Missing config.js (create from config.js.example).");
  }
  return cfg;
}

export async function loadHeader() {
  if (window.__headerReady) await window.__headerReady;
}

export function initTopbar() {
  const btnLogout = qs("#btnLogout");
  if (btnLogout) {
    btnLogout.addEventListener("click", async () => {
      await signOut(auth);
      window.location.href = "login.html";
    });
  }

  const authOnly = qsa("[data-auth='in']");
  const guestOnly = qsa("[data-auth='out']");
  const who = qs("#whoami");
  const avatar = qs("#userAvatar");

  onAuthStateChanged(auth, (user) => {
    authOnly.forEach((el) => (el.hidden = !user));
    guestOnly.forEach((el) => (el.hidden = !!user));

    const displayName = user?.displayName || user?.email?.split("@")[0] || "User";
    if (who) who.textContent = user ? displayName : "-";
    if (avatar && user) avatar.textContent = displayName[0].toUpperCase();
  });
}

export function requireAuth() {
  return new Promise((resolve) => {
    onAuthStateChanged(auth, (user) => {
      if (!user) {
        window.location.href = "login.html";
        return;
      }
      resolve(user);
    });
  });
}

export function getUrlParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

