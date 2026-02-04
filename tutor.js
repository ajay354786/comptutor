// Tutor Page Logic - Auth Only (redirects to dashboard on login)
import { auth, db, toast, showErr, setLogoutVisible } from "./app.js";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.7.2/firebase-auth.js";
import {
  doc,
  setDoc,
  getDoc,
  serverTimestamp,
  addDoc,
  collection,
  getDocs,
  query,
  where,
} from "https://www.gstatic.com/firebasejs/10.7.2/firebase-firestore.js";

const $ = (id) => document.getElementById(id);

const authCard = $("tutorAuthCard");
const panel = $("tutorPanel");
const showDash = () => { 
  authCard.style.display = "none"; 
  panel.style.display = "block";
  setLogoutVisible(true);
};
const showAuth = () => { 
  authCard.style.display = "block"; 
  panel.style.display = "none";
  setLogoutVisible(false);
};

// ✅ TAB TOGGLE FOR SIGNUP/LOGIN + URL PARAMETER HANDLING
const tabTutorSignupBtn = $("tabTutorSignupBtn");
const tabTutorLoginBtn = $("tabTutorLoginBtn");
const tutorSignupForm = $("tutorSignupForm");
const tutorLoginForm = $("tutorLoginForm");

// Function to switch tabs
const switchTab = (toLogin = false) => {
  if (toLogin) {
    tabTutorLoginBtn.classList.add("active");
    tabTutorSignupBtn.classList.remove("active");
    tutorLoginForm.style.display = "block";
    tutorSignupForm.style.display = "none";
  } else {
    tabTutorSignupBtn.classList.add("active");
    tabTutorLoginBtn.classList.remove("active");
    tutorSignupForm.style.display = "block";
    tutorLoginForm.style.display = "none";
  }
};

// Check URL parameter to determine which tab to show
const params = new URLSearchParams(window.location.search);
const urlTab = params.get('tab');
if (urlTab === 'login') {
  switchTab(true);
} else {
  switchTab(false);
}

if (tabTutorSignupBtn) {
  tabTutorSignupBtn.onclick = () => {
    switchTab(false);
  };
}

if (tabTutorLoginBtn) {
  tabTutorLoginBtn.onclick = () => {
    switchTab(true);
  };
}

$("btnTutorSignup").onclick = async () => {
  try {
    const name = $("tName").value.trim();
    const phone = $("tPhone").value.trim();
    const email = $("tEmail").value.trim();
    const pass = $("tPass").value.trim();
    if (!name || !phone || !email || !pass) return toast("All fields required");

    console.log("📝 Creating tutor account for:", { name, phone, email });
    
    // Create auth user
    console.log("🔐 Creating Firebase auth user...");
    const cred = await createUserWithEmailAndPassword(auth, email, pass);
    const uid = cred.user.uid;
    console.log("✅ Auth user created, UID:", uid);
    
    // Create tutor document in Firestore
    const tutorData = {
      uid,
      name, 
      phone, 
      email,
      role: "tutor",
      isApproved: true,
      wallet: 0,
      totalEarned: 0,
      adminAddedBalance: 0,
      createdAt: serverTimestamp(),
    };
    
    console.log("💾 Writing document to Firestore...", tutorData);
    await setDoc(doc(db, "tutors", uid), tutorData);
    console.log("✅ Document write command completed");
    
    // Small delay to let Firestore process
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Verify document was actually created with extended retries
    let retries = 0;
    const maxRetries = 15;
    let documentExists = false;
    
    console.log("🔍 Verifying document creation...");
    while (retries < maxRetries && !documentExists) {
      try {
        const docSnap = await getDoc(doc(db, "tutors", uid));
        console.log(`📋 Verification attempt ${retries + 1}/${maxRetries}: exists=${docSnap.exists()}`);
        
        if (docSnap.exists()) {
          const data = docSnap.data();
          console.log("✅ DOCUMENT VERIFIED! Data:", data);
          documentExists = true;
          break;
        } else {
          retries++;
          if (retries < maxRetries) {
            console.log(`⏳ Document not found yet, waiting 1 second...`);
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        }
      } catch (err) {
        console.error("❌ Verification error:", err.message);
        retries++;
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    if (!documentExists) {
      console.error("❌ Document verification FAILED after 15 retries - CRITICAL ERROR");
      toast("❌ Error creating tutor account. Please try again.");
      // Try to sign out the failed auth
      try {
        await auth.signOut();
      } catch (e) {
        console.error("Error during cleanup:", e);
      }
      return;
    }
    
    console.log("✅✅✅ TUTOR ACCOUNT CREATED SUCCESSFULLY - READY TO REDIRECT");
    toast("✅ Tutor account created!");
    
    // Clear form
    $("tName").value = "";
    $("tPhone").value = "";
    $("tEmail").value = "";
    $("tPass").value = "";
    
    // Redirect to dashboard
    console.log("🚀 Redirecting to dashboard...");
    setTimeout(() => {
      location.href = "tutor-dashboard.html";
    }, 1000);
    
  } catch (e) { 
    console.error("❌ SIGNUP ERROR:", e.code, e.message);
    showErr(e); 
  }
};

$("btnTutorLogin").onclick = async () => {
  try {
    const email = $("tLoginEmail").value.trim();
    const pass = $("tLoginPass").value.trim();
    if (!email || !pass) return toast("Enter email & password");
    const cred = await signInWithEmailAndPassword(auth, email, pass);
    toast("✅ Login successful");
    $("tLoginEmail").value = "";
    $("tLoginPass").value = "";
    location.href = "tutor-dashboard.html";
  } catch (e) { 
    console.error("Login error:", e);
    showErr(e); 
  }
};

// Add logout button handler
$("logoutBtn").onclick = async () => {
  try {
    await auth.signOut();
    toast("✅ Logged out successfully");
    setLogoutVisible(false);
    if (authCard) authCard.style.display = "block";
    // Stay on tutor.html after logout
  } catch (e) {
    showErr(e);
  }
};

// HOME BUTTON LOGOUT HANDLER
const btnHome = document.getElementById("btnHome");
if (btnHome) {
  btnHome.onclick = async () => {
    try {
      await auth.signOut();
      window.location.href = "index.html";
    } catch (e) {
      console.error("Error logging out:", e);
      window.location.href = "index.html";
    }
  };
}

// Auth state handler - only manage logout visibility, DON'T auto-redirect
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    setLogoutVisible(false);
  } else {
    // User is logged in
    setLogoutVisible(true);
  }
});

// ✅ FORGOT PASSWORD HANDLERS - TUTOR
$("btnForgotPasswordTutor").onclick = () => {
  $("forgotPasswordModalTutor").style.display = "flex";
  $("forgotPasswordEmailTutor").value = "";
  $("forgotPasswordNewPasswordTutor").value = "";
};

$("btnCloseForgotPasswordTutor").onclick = () => {
  $("forgotPasswordModalTutor").style.display = "none";
};

$("forgotPasswordModalTutor").onclick = (e) => {
  if (e.target.id === "forgotPasswordModalTutor") {
    $("forgotPasswordModalTutor").style.display = "none";
  }
};

$("btnSubmitForgotPasswordTutor").onclick = async () => {
  try {
    const email = $("forgotPasswordEmailTutor").value.trim();
    const newPassword = $("forgotPasswordNewPasswordTutor").value.trim();
    
    if (!email) return toast("❌ Enter your email");
    if (!newPassword) return toast("❌ Enter your new password");
    if (newPassword.length < 6) return toast("❌ Password must be at least 6 characters");
    
    // Check if this email exists as a tutor
    const tutorQuery = await getDocs(query(collection(db, "tutors"), where("email", "==", email)));
    if (tutorQuery.empty) {
      return toast("❌ No tutor account found with this email");
    }
    
    // Create password reset request
    await addDoc(collection(db, "passwordResetRequests"), {
      userType: "tutor",
      email,
      newPassword,
      status: "pending",
      requestedAt: serverTimestamp(),
      uid: tutorQuery.docs[0].id,
    });
    
    toast("✅ Password reset request submitted! Admin will review it soon.");
    $("forgotPasswordModalTutor").style.display = "none";
    
  } catch (e) {
    console.error("Error submitting password reset:", e);
    showErr(e);
  }
};
