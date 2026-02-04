// Import Firebase functions from app.js context
import { auth, db, toast, showErr, isAdmin } from "./app.js";
import { signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.7.2/firebase-auth.js";
import { getDoc, doc } from "https://www.gstatic.com/firebasejs/10.7.2/firebase-firestore.js";

// Homepage is now just navigation - login/signup pages are student.html, tutor.html, admin.html
