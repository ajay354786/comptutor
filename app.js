import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.2/firebase-app.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.7.2/firebase-auth.js";

import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  addDoc,
  collection,
  query,
  where,
  orderBy,
  getDocs,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  onSnapshot,
} from "https://www.gstatic.com/firebasejs/10.7.2/firebase-firestore.js";

/* ===========================
   FIREBASE CONFIG
=========================== */
const firebaseConfig = {
  apiKey: "AIzaSyCTbXgQGzDg6wlh6Ch826eJLIgejr0rjGs",
  authDomain: "computer-course-tutor.firebaseapp.com",
  projectId: "computer-course-tutor",
  storageBucket: "computer-course-tutor.firebasestorage.app",
  messagingSenderId: "793175684814",
  appId: "1:793175684814:web:4786d6f506c91cb574429f",
  measurementId: "G-GZMH1GZBBV",
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

const $ = (id) => document.getElementById(id);
const page = location.pathname.split("/").pop();

export function toast(msg) { alert(msg); }
export function safeText(v) { return v === undefined || v === null ? "" : String(v); }
export function showErr(err) { console.error(err); alert(err?.message || "Unknown Error"); }
export function setLogoutVisible(isVisible){
  const btn = document.getElementById("logoutBtn");
  if(btn) btn.style.display = isVisible ? "inline-block" : "none";
}

export function formatDate(iso) {
  try { return iso ? new Date(iso).toLocaleString() : "Not Started"; }
  catch { return "Not Started"; }
}

export function daysLeft(isoEnd) {
  try {
    if (!isoEnd) return null;
    const end = new Date(isoEnd).getTime();
    return Math.ceil((end - Date.now()) / (1000 * 60 * 60 * 24));
  } catch { return null; }
}

document.addEventListener("click", async (e) => {
  if (e.target && e.target.id === "btnLogout") {
    await signOut(auth);
    toast("✅ Logged out");
    location.reload();
  }
});

export async function isAdmin(uid) {
  try {
    const snap = await getDoc(doc(db, "admins", uid));
    return snap.exists();
  } catch {
    return false;
  }
}

export async function getSettingsSafe() {
  try {
    const snap = await getDoc(doc(db, "settings", "app"));
    if (!snap.exists()) return { upiId: "", upiName: "", studentPrice: 999, tutorPayout: 800 };
    const d = snap.data();
    return {
      upiId: d.upiId || "",
      upiName: d.upiName || "",
      studentPrice: Number(d.studentPrice || 999),
      tutorPayout: Number(d.tutorPayout || 800),
    };
  } catch {
    return { upiId: "", upiName: "", studentPrice: 999, tutorPayout: 800 };
  }
}

// Page-specific scripts will be loaded based on current page
const loadPageScript = () => {
  if (page === "" || page === "index.html") {
    const script = document.createElement("script");
    script.src = "index.js";
    script.type = "module";
    document.head.appendChild(script);
  } else if (page === "student.html") {
    const script = document.createElement("script");
    script.src = "student.js";
    script.type = "module";
    document.head.appendChild(script);
  } else if (page === "tutor.html") {
    const script = document.createElement("script");
    script.src = "tutor.js";
    script.type = "module";
    document.head.appendChild(script);
  } else if (page === "tutor-dashboard.html") {
    const script = document.createElement("script");
    script.src = "tutor-dashboard.js";
    script.type = "module";
    document.head.appendChild(script);
  } else if (page === "admin.html") {
    const script = document.createElement("script");
    script.src = "admin.js";
    script.type = "module";
    document.head.appendChild(script);
  }
};

// Try both DOMContentLoaded and immediate execution
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", loadPageScript);
} else {
  loadPageScript();
}
