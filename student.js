// Student Page Logic
import { auth, db, toast, showErr, setLogoutVisible, safeText, formatDate, daysLeft, getSettingsSafe } from "./app.js";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.7.2/firebase-auth.js";
import {
  doc,
  setDoc,
  getDoc,
  addDoc,
  collection,
  query,
  where,
  getDocs,
  serverTimestamp,
  onSnapshot,
} from "https://www.gstatic.com/firebasejs/10.7.2/firebase-firestore.js";

const $ = (id) => document.getElementById(id);

const authCard = $("studentAuthCard");
const panel = $("studentPanel");
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

// ✅ TAB TOGGLE FOR SIGNUP/LOGIN
const tabSignupBtn = $("tabSignupBtn");
const tabLoginBtn = $("tabLoginBtn");
const signupForm = $("signupForm");
const loginForm = $("loginForm");

if (tabSignupBtn) {
  tabSignupBtn.onclick = () => {
    tabSignupBtn.classList.add("active");
    tabLoginBtn.classList.remove("active");
    signupForm.style.display = "block";
    loginForm.style.display = "none";
  };
}

if (tabLoginBtn) {
  tabLoginBtn.onclick = () => {
    tabLoginBtn.classList.add("active");
    tabSignupBtn.classList.remove("active");
    signupForm.style.display = "none";
    loginForm.style.display = "block";
  };
}

$("btnStudentSignup").onclick = async () => {
  try {
    const name = $("sName").value.trim();
    const phone = $("sPhone").value.trim();
    const email = $("sEmail").value.trim();
    const pass = $("sPass").value.trim();
    if (!name || !phone || !email || !pass) return toast("All fields required");

    const cred = await createUserWithEmailAndPassword(auth, email, pass);
    await setDoc(doc(db, "students", cred.user.uid), {
      name, phone, email,
      role: "student",
      isActive: false,
      assignedTutorId: null,
      planStart: null,
      planEnd: null,
      createdAt: serverTimestamp(),
    });

    toast("✅ Student created & logged in");
    $("sName").value = "";
    $("sPhone").value = "";
    $("sEmail").value = "";
    $("sPass").value = "";
    await loadStudent(cred.user.uid);
  } catch (e) { showErr(e); }
};

$("btnStudentLogin").onclick = async () => {
  try {
    const email = $("sLoginEmail").value.trim();
    const pass = $("sLoginPass").value.trim();
    if (!email || !pass) return toast("Enter email & password");
    const cred = await signInWithEmailAndPassword(auth, email, pass);
    toast("✅ Login successful");
    $("sLoginEmail").value = "";
    $("sLoginPass").value = "";
    await loadStudent(cred.user.uid);
  } catch (e) { showErr(e); }
};

$("btnBuy").onclick = () => { $("payForm").style.display = "block"; $("txnId").focus(); };

// Change Tutor Modal Handlers
$("btnChangeTutor").onclick = () => {
  $("changeTutorModal").style.display = "flex";
  $("changeTutorReason").value = "";
};

$("btnCancelChangeTutor").onclick = () => {
  $("changeTutorModal").style.display = "none";
};

$("changeTutorModal").onclick = (e) => {
  if (e.target === $("changeTutorModal")) {
    $("changeTutorModal").style.display = "none";
  }
};

$("btnSubmitChangeTutor").onclick = async () => {
  try {
    const user = auth.currentUser;
    if (!user) return toast("Login first");

    const reason = $("changeTutorReason").value.trim();
    if (!reason) return toast("Please provide a reason for change");

    const studentDoc = await getDoc(doc(db, "students", user.uid));
    const studentData = studentDoc.exists() ? studentDoc.data() : {};

    await addDoc(collection(db, "tutorChangeRequests"), {
      studentId: user.uid,
      studentEmail: user.email,
      studentName: studentData.name || "Student",
      currentTutorId: studentData.assignedTutorId || "",
      reason,
      status: "pending",
      createdAt: serverTimestamp(),
    });

    toast("✅ Tutor change request submitted");
    $("changeTutorModal").style.display = "none";
    $("changeTutorReason").value = "";
    await loadStudent(user.uid);
  } catch (e) { showErr(e); }
};

$("btnSubmitShift").onclick = async () => {
  try {
    const user = auth.currentUser;
    if (!user) return toast("Login first");

    const hour = $("shiftSelect").value;
    if (!hour) return toast("Select a time slot");

    await addDoc(collection(db, "shiftRequests"), {
      studentId: user.uid,
      studentName: auth.currentUser?.displayName || "Student",
      hour,
      status: "pending",
      createdAt: serverTimestamp(),
    });

    toast("✅ Shift request submitted");
    $("shiftSelect").value = "";
    await loadStudent(user.uid);
  } catch (e) { showErr(e); }
};

$("submitPay").onclick = async () => {
  try {
    const user = auth.currentUser;
    if (!user) return toast("Login first");

    const txnId = $("txnId").value.trim();
    const payDate = $("payDate").value;
    const payTime = $("payTime").value;
    if (!txnId || !payDate || !payTime) return toast("Txn ID + Date + Time required");

    const settings = await getSettingsSafe();
    await addDoc(collection(db, "paymentRequests"), {
      studentId: user.uid,
      studentEmail: user.email,
      amount: settings.studentPrice,
      txnId, payDate, payTime,
      status: "pending",
      createdAt: serverTimestamp(),
    });

    toast("✅ Payment request submitted");
    $("payForm").style.display = "none";
    $("txnId").value = "";
    $("payDate").value = "";
    $("payTime").value = "";
    await loadStudent(user.uid);
  } catch (e) { showErr(e); }
};

let unsubStudent = null;

async function loadStudent(uid) {
  // Unsubscribe from previous listener if any
  if (unsubStudent) unsubStudent();

  // Real-time listener for student data
  unsubStudent = onSnapshot(
    doc(db, "students", uid), 
    async (snap) => {
      console.log("📍 Student data updated:", snap.data());
      
      if (!snap.exists()) {
        console.log("❌ Student document not found");
        showAuth();
        return;
      }

      showDash();
      const s = snap.data();
      console.log("✅ Student loaded:", s);

      $("studentWelcome").innerText = safeText(s.name);
      $("statusBox").innerText = s.isActive ? "✅ ACTIVE" : "❌ NOT ACTIVE";

      if (s.isActive && s.planEnd) {
        const dl = daysLeft(s.planEnd);
        $("planValidity").innerText = dl !== null
          ? `Active till ${formatDate(s.planEnd)} (${dl} days left)`
          : `Active till ${formatDate(s.planEnd)}`;
      } else {
        $("planValidity").innerText = "Pending / Not Started";
      }

      if (s.assignedTutorId) {
        console.log("🎓 Tutor ID found:", s.assignedTutorId);
        try {
          // Use onSnapshot for LIVE tutor updates
          onSnapshot(doc(db, "tutors", s.assignedTutorId), (tSnap) => {
            console.log("🎓 Tutor data updated:", tSnap.data());
            if (tSnap.exists()) {
              const tData = tSnap.data();
              const tutorPhone = tData.phone && tData.phone.trim() ? tData.phone : "N/A";
              $("tutorNameDisplay").innerText = safeText(tData.name);
              $("tutorPhoneDisplay").innerText = `📱 ${safeText(tutorPhone)}`;
              $("btnChangeTutor").style.display = "block";
              console.log("✅ Tutor displayed live:", tData.name);
            } else {
              console.log("❌ Tutor document doesn't exist");
              $("tutorNameDisplay").innerText = "Tutor not found";
              $("tutorPhoneDisplay").innerText = "";
              $("btnChangeTutor").style.display = "none";
            }
          });
        } catch (err) {
          console.error("❌ Error setting up tutor listener:", err);
          $("tutorNameDisplay").innerText = "Error loading tutor";
          $("tutorPhoneDisplay").innerText = "";
          $("btnChangeTutor").style.display = "none";
        }
      } else {
        console.log("❌ No tutor assigned yet");
        $("tutorNameDisplay").innerText = "Not Assigned";
        $("tutorPhoneDisplay").innerText = "";
        $("btnChangeTutor").style.display = "none";
      }

      const settings = await getSettingsSafe();
      $("upiId").innerText = settings.upiId || "(Admin will set)";
      $("upiName").innerText = settings.upiName || "(Admin will set)";

      // Load shift requests LIVE
      const qShift = query(
        collection(db, "shiftRequests"),
        where("studentId", "==", uid)
      );
      onSnapshot(qShift, (shiftSnap) => {
        const shifts = shiftSnap.docs.sort((a, b) =>
          (b.data().createdAt?.toMillis?.() || 0) - (a.data().createdAt?.toMillis?.() || 0)
        );

        // Check if there's an approved shift
        const approvedShift = shifts.find(shift => shift.data().status === "approved");
        
        // Show/hide sections based on student status and shifts
        const buyCourseEl = $("buyCourseSection");
        const shiftEl = $("shiftSection");
        
        if (buyCourseEl) {
          if (s.isActive) {
            console.log("✅ Student is ACTIVE - hiding buy course, showing shift");
            buyCourseEl.style.display = "none";
            // Show shift box only if there's NO approved shift yet
            if (shiftEl) {
              if (approvedShift) {
                console.log("✅ Approved shift found - hiding shift selection box");
                shiftEl.style.display = "none";
              } else {
                console.log("⏳ No approved shift yet - showing shift selection box");
                shiftEl.style.display = "block";
              }
            }
          } else {
            console.log("❌ Student is NOT ACTIVE - showing buy course, hiding shift");
            buyCourseEl.style.display = "block";
            if (shiftEl) shiftEl.style.display = "none";
          }
        }

        // Display shift requests in the requests section - LIVE UPDATE
        const shiftBox = $("shiftRequests");
        shiftBox.innerHTML = "";
        if (shifts.length === 0) {
          shiftBox.innerHTML = `<div class="muted">No shift requests yet</div>`;
        } else {
          shifts.forEach((d) => {
            const sh = d.data();
            const hourNum = parseInt(sh.hour);
            let timeStr = "";
            let period = "";
            let emoji = "";

            if (hourNum === 0) timeStr = "12:00 AM - 1:00 AM";
            else if (hourNum < 12) timeStr = `${hourNum}:00 AM - ${hourNum + 1}:00 AM`;
            else if (hourNum === 12) timeStr = "12:00 PM - 1:00 PM";
            else timeStr = `${hourNum - 12}:00 PM - ${hourNum - 11}:00 PM`;

            // Get time period category
            if (hourNum <= 5) { period = "🌙 Night"; }
            else if (hourNum <= 11) { period = "🌅 Morning"; }
            else if (hourNum <= 17) { period = "☀️ Afternoon"; }
            else { period = "🌆 Evening"; }

            const div = document.createElement("div");
            div.className = "item";
            const statusColor = sh.status === "approved" ? "#00cc00" : sh.status === "rejected" ? "#ff3333" : "#ff9900";
            div.innerHTML = `
              <b>${period}</b><br/>
              <b>Time:</b> ${timeStr}<br/>
              <b>${period}</b><br/>
              <b>Time:</b> ${timeStr}<br/>
              <b>Status:</b> <span style="color:${statusColor};font-weight:bold;">${safeText(sh.status).toUpperCase()}</span><br/>
              <span class="muted tiny">Requested: ${formatDate(sh.createdAt?.toDate?.() || new Date())}</span>
            `;
            shiftBox.appendChild(div);
          });
        }
      });

      // Load tutor change requests LIVE
      const qTutorChange = query(
        collection(db, "tutorChangeRequests"),
        where("studentId", "==", uid)
      );
      onSnapshot(qTutorChange, (tutorChangeSnap) => {
        const tutorChangeRequests = tutorChangeSnap.docs.sort((a, b) =>
          (b.data().createdAt?.toMillis?.() || 0) - (a.data().createdAt?.toMillis?.() || 0)
        );

        const tutorChangeBox = $("tutorChangeRequests");
        tutorChangeBox.innerHTML = "";
        if (tutorChangeRequests.length === 0) {
          tutorChangeBox.innerHTML = `<div class="muted">No tutor change requests yet</div>`;
        } else {
          tutorChangeRequests.forEach((d) => {
            const tcr = d.data();
            const div = document.createElement("div");
            div.className = "item";
            const statusColor = tcr.status === "approved" ? "#00cc00" : tcr.status === "rejected" ? "#ff3333" : "#ff9900";
            div.innerHTML = `
              <b>Reason:</b> ${safeText(tcr.reason)}<br/>
              <b>Status:</b> <span style="color:${statusColor};font-weight:bold;">${safeText(tcr.status).toUpperCase()}</span><br/>
              <span class="muted tiny">Requested: ${formatDate(tcr.createdAt?.toDate?.() || new Date())}</span>
            `;
            tutorChangeBox.appendChild(div);
          });
        }
      });

      // Load payment requests LIVE
      const q1 = query(
        collection(db, "paymentRequests"),
        where("studentId", "==", uid)
      );
      onSnapshot(q1, (reqSnap) => {
        // Sort in JavaScript
        const requests = reqSnap.docs.sort((a, b) =>
          (b.data().createdAt?.toMillis?.() || 0) - (a.data().createdAt?.toMillis?.() || 0)
        );

        const box = $("myRequests");
        box.innerHTML = "";
        if (requests.length === 0) {
          box.innerHTML = `<div class="muted">No requests yet</div>`;
          return;
        }

        requests.forEach((d) => {
          const r = d.data();
          const div = document.createElement("div");
          div.className = "item";
          div.innerHTML = `
            <b>Txn:</b> ${safeText(r.txnId)}<br/>
            <b>Date/Time:</b> ${safeText(r.payDate)} ${safeText(r.payTime)}<br/>
            <b>Amount:</b> ₹${safeText(r.amount)}<br/>
            <b>Status:</b> ${safeText(r.status).toUpperCase()}
          `;
          box.appendChild(div);
        });
      });
    },
    (error) => {
      console.error("❌ Listener error:", error);
      alert("Real-time sync error: " + error.message);
    });
}

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    setLogoutVisible(false);
    return showAuth();
  }
  setLogoutVisible(true);
  await loadStudent(user.uid);
});

// ✅ FORGOT PASSWORD HANDLERS - STUDENT
$("btnForgotPasswordStudent").onclick = () => {
  $("forgotPasswordModalStudent").style.display = "flex";
  $("forgotPasswordEmailStudent").value = "";
  $("forgotPasswordNewPasswordStudent").value = "";
};

$("btnCloseForgotPasswordStudent").onclick = () => {
  $("forgotPasswordModalStudent").style.display = "none";
};

$("forgotPasswordModalStudent").onclick = (e) => {
  if (e.target.id === "forgotPasswordModalStudent") {
    $("forgotPasswordModalStudent").style.display = "none";
  }
};

$("btnSubmitForgotPasswordStudent").onclick = async () => {
  try {
    const email = $("forgotPasswordEmailStudent").value.trim();
    const newPassword = $("forgotPasswordNewPasswordStudent").value.trim();
    
    if (!email) return toast("❌ Enter your email");
    if (!newPassword) return toast("❌ Enter your new password");
    if (newPassword.length < 6) return toast("❌ Password must be at least 6 characters");
    
    // Check if this email exists as a student
    const studentQuery = await getDocs(query(collection(db, "students"), where("email", "==", email)));
    if (studentQuery.empty) {
      return toast("❌ No student account found with this email");
    }
    
    // Create password reset request
    await addDoc(collection(db, "passwordResetRequests"), {
      userType: "student",
      email,
      newPassword,
      status: "pending",
      requestedAt: serverTimestamp(),
      uid: studentQuery.docs[0].id,
    });
    
    toast("✅ Password reset request submitted! Admin will review it soon.");
    $("forgotPasswordModalStudent").style.display = "none";
    
  } catch (e) {
    console.error("Error submitting password reset:", e);
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

// LOGOUT BUTTON HANDLER
const logoutBtn = document.getElementById("logoutBtn");
if (logoutBtn) {
  logoutBtn.onclick = async () => {
    try {
      await auth.signOut();
      window.location.href = "index.html";
    } catch (e) {
      console.error("Error logging out:", e);
      window.location.href = "index.html";
    }
  };
}
