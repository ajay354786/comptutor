// Admin Page Logic
import { auth, db, toast, showErr, setLogoutVisible, safeText, getSettingsSafe, isAdmin } from "./app.js";
import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.7.2/firebase-auth.js";
import {
  doc,
  setDoc,
  getDoc,
  collection,
  query,
  where,
  getDocs,
  updateDoc,
  deleteDoc,
  addDoc,
  serverTimestamp,
  onSnapshot,
} from "https://www.gstatic.com/firebasejs/10.7.2/firebase-firestore.js";

const $ = (id) => document.getElementById(id);

// Store all students and tutors for searching
let allStudents = [];
let allTutors = [];

const loginCard = $("adminLoginCard");
const panel = $("adminPanel");

const showLogin = () => {
  loginCard.style.display = "block";
  panel.style.display = "none";
  setLogoutVisible(false);
};

const showDash = () => {
  loginCard.style.display = "none";
  panel.style.display = "block";
  setLogoutVisible(true);
};

// Auth state listener: render admin when auth state changes
onAuthStateChanged(auth, async (user) => {
  try {
    await renderAdmin();
  } catch (e) {
    console.error('Error in auth state listener for admin:', e);
  }
});
// Tab functionality
const setupTabs = () => {
  const tabs = document.querySelectorAll(".tab");
  const bodies = document.querySelectorAll(".tabBody");
  
  tabs.forEach((tab) => {
    tab.onclick = () => {
      tabs.forEach((t) => t.classList.remove("active"));
      bodies.forEach((b) => b.classList.remove("active"));
      tab.classList.add("active");
      const tabId = tab.getAttribute("data-tab");
      $(tabId).classList.add("active");
    };
  });
};

// Admin Login
$("btnAdminLogin").onclick = async () => {
  try {
    const email = $("aEmail").value.trim();
    const pass = $("aPass").value.trim();
    if (!email || !pass) return toast("Enter email & password");

    const cred = await signInWithEmailAndPassword(auth, email, pass);
    if (!(await isAdmin(cred.user.uid))) {
      await signOut(auth);
      return toast("❌ Not admin account");
    }

    toast("✅ Admin login successful");
    $("aEmail").value = "";
    $("aPass").value = "";
    // The onAuthStateChanged listener will trigger renderAdmin() automatically
  } catch (e) {
    showErr(e);
  }
};

// Main render function
const renderAdmin = async () => {
  const user = auth.currentUser;
  if (!user) {
    showLogin();
    return;
  }

  if (!(await isAdmin(user.uid))) {
    await signOut(auth);
    showLogin();
    return;
  }

  showDash();
  $("adminStatus").innerText = `✅ Admin Verified (${user.email})`;
  setupTabs();

  // Load Settings
  const settings = await getSettingsSafe();
  $("setUpiId").value = settings.upiId || "";
  $("setUpiName").value = settings.upiName || "";

  $("saveSettings").onclick = async () => {
    try {
      await setDoc(doc(db, "settings", "app"), {
        upiId: $("setUpiId").value.trim(),
        upiName: $("setUpiName").value.trim(),
        updatedAt: serverTimestamp(),
      }, { merge: true });
      toast("✅ Settings Saved");
    } catch (e) {
      showErr(e);
    }
  };

  // Load only Payments tab initially (first tab)
  await loadPayments();

  // Lazy load other tabs - preload in background after 1.5s
  setTimeout(async () => {
    if (!window.shiftsLoaded) { window.shiftsLoaded = true; await loadShifts(); }
    if (!window.tutorChangesLoaded) { window.tutorChangesLoaded = true; await loadTutorChanges(); }
    if (!window.studentsLoaded) { window.studentsLoaded = true; await loadStudents(); }
    if (!window.tutorsLoaded) { window.tutorsLoaded = true; await loadTutors(); }
    if (!window.withdrawalsLoaded) { window.withdrawalsLoaded = true; await loadWithdrawals(); }
  }, 1500);
};

// Load Payments Function
const loadPayments = async () => {
  const paymentList = $("paymentList");
  paymentList.innerHTML = "<div class='muted'>Loading...</div>";

  try {
    // Query without orderBy to avoid composite index requirement
    const q = query(
      collection(db, "paymentRequests"),
      where("status", "==", "pending")
    );
    const snapshot = await getDocs(q);

    // Sort in JavaScript
    const payments = snapshot.docs.sort((a, b) => 
      (b.data().createdAt?.toMillis?.() || 0) - (a.data().createdAt?.toMillis?.() || 0)
    );

    paymentList.innerHTML = "";

    if (payments.length === 0) {
      paymentList.innerHTML = "<div class='muted'>No pending payments</div>";
      return;
    }

    let table = `
      <table style="width:100%; border-collapse:collapse;">
        <thead>
          <tr style="background:#f0f0f0; border-bottom:2px solid #333;">
            <th style="padding:10px; text-align:left; border:1px solid #ddd;">No.</th>
            <th style="padding:10px; text-align:left; border:1px solid #ddd;">Student Email</th>
            <th style="padding:10px; text-align:left; border:1px solid #ddd;">Amount</th>
            <th style="padding:10px; text-align:left; border:1px solid #ddd;">Txn ID</th>
            <th style="padding:10px; text-align:left; border:1px solid #ddd;">Date & Time</th>
            <th style="padding:10px; text-align:center; border:1px solid #ddd;">Action</th>
          </tr>
        </thead>
        <tbody>
    `;

    payments.forEach((d, index) => {
      const r = d.data();
      table += `
        <tr style="border-bottom:1px solid #ddd;">
          <td style="padding:10px; border:1px solid #ddd;">${index + 1}</td>
          <td style="padding:10px; border:1px solid #ddd;">${safeText(r.studentEmail)}</td>
          <td style="padding:10px; border:1px solid #ddd;">₹${safeText(r.amount)}</td>
          <td style="padding:10px; border:1px solid #ddd;">${safeText(r.txnId)}</td>
          <td style="padding:10px; border:1px solid #ddd;">${safeText(r.payDate)} ${safeText(r.payTime)}</td>
          <td style="padding:10px; text-align:center; border:1px solid #ddd;">
            <button class="btnPro primary" data-approve="${d.id}" style="padding:5px 10px; margin-right:5px;">Approve</button>
            <button class="btnPro ghost" data-reject="${d.id}" style="padding:5px 10px;">Reject</button>
          </td>
        </tr>
      `;
    });

    table += `</tbody></table>`;
    paymentList.innerHTML = table;

    paymentList.onclick = async (e) => {
      const approveId = e.target.getAttribute("data-approve");
      const rejectId = e.target.getAttribute("data-reject");

      if (approveId) {
        try {
          const paymentDoc = doc(db, "paymentRequests", approveId);
          const paymentSnap = await getDoc(paymentDoc);
          
          if (!paymentSnap.exists()) {
            toast("❌ Payment not found");
            return;
          }

          const payment = paymentSnap.data();
          const studentDoc = doc(db, "students", payment.studentId);
          const studentSnap = await getDoc(studentDoc);

          if (!studentSnap.exists()) {
            toast("❌ Student not found");
            return;
          }

          // Update payment status
          await updateDoc(paymentDoc, {
            status: "approved",
            approvedAt: serverTimestamp(),
          });

          // Activate student
          const planEnd = new Date();
          planEnd.setDate(planEnd.getDate() + 30);

          await updateDoc(studentDoc, {
            isActive: true,
            planStart: new Date().toISOString(),
            planEnd: planEnd.toISOString(),
          });

          toast("✅ Payment approved & Student activated");
          await loadPayments();
          await loadStudents();
          await loadTutors();
        } catch (e) {
          showErr(e);
        }
      }

      if (rejectId) {
        try {
          await updateDoc(doc(db, "paymentRequests", rejectId), {
            status: "rejected",
            rejectedAt: serverTimestamp(),
          });
          toast("❌ Payment rejected");
          await loadPayments();
          await loadStudents();
        } catch (e) {
          showErr(e);
        }
      }
    };
  } catch (e) {
    paymentList.innerHTML = "<div class='muted'>Error loading payments</div>";
    console.error("Error loading payments:", e);
  }
};

// Render Students List (used by both loadStudents and search)
const renderStudentList = async (studentsToRender, tutors) => {
  const studentList = $("studentList");
  studentList.innerHTML = "";

  if (studentsToRender.length === 0) {
    studentList.innerHTML = "<div class='muted'>No students found</div>";
    return;
  }

  let table = `
    <table style="width:100%; border-collapse:collapse;">
      <thead>
        <tr style="background:#f0f0f0; border-bottom:2px solid #333;">
          <th style="padding:10px; text-align:left; border:1px solid #ddd;">No.</th>
          <th style="padding:10px; text-align:left; border:1px solid #ddd;">Name</th>
          <th style="padding:10px; text-align:left; border:1px solid #ddd;">Email</th>
          <th style="padding:10px; text-align:left; border:1px solid #ddd;">Phone</th>
          <th style="padding:10px; text-align:left; border:1px solid #ddd;">Status</th>
          <th style="padding:10px; text-align:left; border:1px solid #ddd;">Assign Tutor</th>
          <th style="padding:10px; text-align:center; border:1px solid #ddd;">Action</th>
        </tr>
      </thead>
      <tbody>
  `;

  studentsToRender.forEach((s, index) => {
    const sid = s.id;

    let tutorOptions = `<option value="">-- Select Tutor --</option>`;
    const noneSelected = !s.assignedTutorId ? "selected" : "";
    tutorOptions += `<option value="none" ${noneSelected}>❌ None (Unassigned)</option>`;
    tutors.forEach((t) => {
      const selected = s.assignedTutorId === t.id ? "selected" : "";
      tutorOptions += `<option value="${t.id}" ${selected}>${safeText(t.name)}</option>`;
    });

    table += `
      <tr style="border-bottom:1px solid #ddd;">
        <td style="padding:10px; border:1px solid #ddd;">${index + 1}</td>
        <td style="padding:10px; border:1px solid #ddd;">${safeText(s.name)}</td>
        <td style="padding:10px; border:1px solid #ddd;">${safeText(s.email)}</td>
        <td style="padding:10px; border:1px solid #ddd;">${safeText(s.phone)}</td>
        <td style="padding:10px; border:1px solid #ddd;">${s.isActive ? "✅ Active" : "❌ Inactive"}</td>
        <td style="padding:10px; border:1px solid #ddd;">
          <select class="studentTutor" data-sid="${sid}" style="width:100%; padding:5px; border:1px solid #ccc; border-radius:4px;">${tutorOptions}</select>
        </td>
        <td style="padding:10px; text-align:center; border:1px solid #ddd;">
          <button class="btnPro primary" data-showstudentdetails="${sid}" style="padding:5px 10px; margin-right:3px;">📊 Dashboard</button>
          <button class="btnPro ghost" data-assigntutor="${sid}" style="padding:5px 8px; margin-right:3px;">Assign</button>
          <button class="btnPro dark" data-deletestudent="${sid}" style="padding:5px 8px;">Delete</button>
        </td>
      </tr>
      <tr id="studentDetails-${sid}" style="display:none;">
        <td colspan="7" style="padding:15px; background:#f9f9f9; border:1px solid #ddd;">
          <div style="padding:10px; background:white; border-radius:5px; border:1px solid #e0e0e0;">
            <!-- Will be populated dynamically -->
          </div>
        </td>
      </tr>
    `;
  });

  table += `</tbody></table>`;
  studentList.innerHTML = table;

  studentList.onclick = async (e) => {
    const assignId = e.target.getAttribute("data-assigntutor");
    const deleteId = e.target.getAttribute("data-deletestudent");
    const showDetailsId = e.target.getAttribute("data-showstudentdetails");

    // Show/Hide Student Dashboard
    if (showDetailsId) {
      const detailsRow = $(`studentDetails-${showDetailsId}`);
      if (!detailsRow) return;

      if (detailsRow.style.display === "none") {
        // Load and show dashboard
        try {
          const studentSnap = await getDoc(doc(db, "students", showDetailsId));
          if (!studentSnap.exists()) return toast("❌ Student not found");
          
          const studentData = studentSnap.data();
          
          // Get assigned tutor info
          let tutorInfo = "Not Assigned";
          if (studentData.assignedTutorId) {
            const tutorSnap = await getDoc(doc(db, "tutors", studentData.assignedTutorId));
            if (tutorSnap.exists()) {
              const tData = tutorSnap.data();
              tutorInfo = `${safeText(tData.name)} (📱 ${safeText(tData.phone)})`;
            }
          }
          
          // Get shift requests
          const shiftQ = query(collection(db, "shiftRequests"), where("studentId", "==", showDetailsId));
          const shiftSnap = await getDocs(shiftQ);
          const shifts = shiftSnap.docs.sort((a, b) =>
            (b.data().createdAt?.toMillis?.() || 0) - (a.data().createdAt?.toMillis?.() || 0)
          );
          
          // Get payment requests
          const payQ = query(collection(db, "paymentRequests"), where("studentId", "==", showDetailsId));
          const paySnap = await getDocs(payQ);
          const payments = paySnap.docs.sort((a, b) =>
            (b.data().createdAt?.toMillis?.() || 0) - (a.data().createdAt?.toMillis?.() || 0)
          );
          
          // Get tutor change requests
          const tcrQ = query(collection(db, "tutorChangeRequests"), where("studentId", "==", showDetailsId));
          const tcrSnap = await getDocs(tcrQ);
          const tutorChanges = tcrSnap.docs.sort((a, b) =>
            (b.data().createdAt?.toMillis?.() || 0) - (a.data().createdAt?.toMillis?.() || 0)
          );
          
          // Build dashboard HTML
          let dashHTML = `
            <h4 style="margin:0 0 15px 0; color:#333;">📊 Student Live Dashboard - ${safeText(studentData.name)}</h4>
            
            <!-- KPI CARDS -->
            <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:12px; margin-bottom:15px;">
              <div style="background:#e8f5ff; padding:12px; border-radius:8px; border-left:4px solid #0066ff;">
                <div style="font-size:11px; color:#666; font-weight:600;">Status</div>
                <div style="font-size:18px; font-weight:900; color:#0066ff; margin:8px 0;">${studentData.isActive ? "✅ ACTIVE" : "❌ INACTIVE"}</div>
                <div style="font-size:10px; color:#999;">Plan Status</div>
              </div>
              
              <div style="background:#e8ffe8; padding:12px; border-radius:8px; border-left:4px solid #00cc00;">
                <div style="font-size:11px; color:#666; font-weight:600;">Plan Validity</div>
                <div style="font-size:16px; font-weight:900; color:#00cc00; margin:8px 0;">
                  ${studentData.planEnd ? new Date(studentData.planEnd).toLocaleDateString() : "N/A"}
                </div>
                <div style="font-size:10px; color:#999;">Expires on date</div>
              </div>
              
              <div style="background:#fff5e8; padding:12px; border-radius:8px; border-left:4px solid #ff9900;">
                <div style="font-size:11px; color:#666; font-weight:600;">Assigned Tutor</div>
                <div style="font-size:12px; font-weight:bold; color:#ff9900; margin:8px 0;">${tutorInfo}</div>
                <div style="font-size:10px; color:#999;">Current tutor</div>
              </div>
            </div>
            
            <!-- SHIFT REQUESTS SECTION -->
            <div style="margin-bottom:15px; padding-bottom:15px; border-bottom:1px solid #eee;">
              <h4 style="margin:0 0 10px 0; color:#333;">⏰ Shift Requests (${shifts.length})</h4>
              ${shifts.length === 0 ? `
                <div class="muted" style="padding:10px;">No shift requests</div>
              ` : `
                <div style="display:flex; flex-direction:column; gap:8px;">
                  ${shifts.map(sh => {
                    const shData = sh.data();
                    const hourNum = parseInt(shData.hour);
                    let timeStr = "";
                    let emoji = "";
                    
                    if (hourNum === 0) { timeStr = "12:00 AM - 1:00 AM"; emoji = "🌙"; }
                    else if (hourNum < 12) { timeStr = `${hourNum}:00 AM - ${hourNum + 1}:00 AM`; emoji = "🌅"; }
                    else if (hourNum === 12) { timeStr = "12:00 PM - 1:00 PM"; emoji = "☀️"; }
                    else { timeStr = `${hourNum - 12}:00 PM - ${hourNum - 11}:00 PM`; emoji = "🌆"; }
                    
                    const statusColor = shData.status === "approved" ? "#00cc00" : shData.status === "rejected" ? "#ff3333" : "#ff9900";
                    const statusEmoji = shData.status === "approved" ? "✅" : shData.status === "rejected" ? "❌" : "⏳";
                    
                    return `
                      <div style="background:white; padding:10px; border-radius:4px; border-left:4px solid ${statusColor}; font-size:13px;">
                        <div style="font-weight:600; color:#333;">${emoji} ${timeStr}</div>
                        <div style="color:${statusColor}; font-weight:bold; margin:4px 0;">${statusEmoji} ${safeText(shData.status).toUpperCase()}</div>
                        <div class="muted" style="font-size:11px;">Requested: ${new Date(shData.createdAt?.toDate?.() || new Date()).toLocaleDateString()}</div>
                      </div>
                    `;
                  }).join('')}
                </div>
              `}
            </div>
            
            <!-- PAYMENT REQUESTS SECTION -->
            <div style="margin-bottom:15px; padding-bottom:15px; border-bottom:1px solid #eee;">
              <h4 style="margin:0 0 10px 0; color:#333;">💳 Payment Requests (${payments.length})</h4>
              ${payments.length === 0 ? `
                <div class="muted" style="padding:10px;">No payment requests</div>
              ` : `
                <div style="display:flex; flex-direction:column; gap:8px;">
                  ${payments.map(pay => {
                    const payData = pay.data();
                    const statusColor = payData.status === "approved" ? "#00cc00" : payData.status === "rejected" ? "#ff3333" : "#ff9900";
                    const statusEmoji = payData.status === "approved" ? "✅" : payData.status === "rejected" ? "❌" : "⏳";
                    
                    return `
                      <div style="background:white; padding:10px; border-radius:4px; border-left:4px solid ${statusColor}; font-size:13px;">
                        <div style="font-weight:600; color:#333;">₹${safeText(payData.amount)} - TXN: ${safeText(payData.txnId)}</div>
                        <div style="color:${statusColor}; font-weight:bold; margin:4px 0;">${statusEmoji} ${safeText(payData.status).toUpperCase()}</div>
                        <div class="muted" style="font-size:11px;">Date: ${safeText(payData.payDate)} | Time: ${safeText(payData.payTime)}</div>
                      </div>
                    `;
                  }).join('')}
                </div>
              `}
            </div>
            
            <!-- TUTOR CHANGE REQUESTS SECTION -->
            <div style="margin-bottom:15px; padding-bottom:15px; border-bottom:1px solid #eee;">
              <h4 style="margin:0 0 10px 0; color:#333;">🔄 Tutor Change Requests (${tutorChanges.length})</h4>
              ${tutorChanges.length === 0 ? `
                <div class="muted" style="padding:10px;">No tutor change requests</div>
              ` : `
                <div style="display:flex; flex-direction:column; gap:8px;">
                  ${tutorChanges.map(tcr => {
                    const tcrData = tcr.data();
                    const statusColor = tcrData.status === "approved" ? "#00cc00" : tcrData.status === "rejected" ? "#ff3333" : "#ff9900";
                    const statusEmoji = tcrData.status === "approved" ? "✅" : tcrData.status === "rejected" ? "❌" : "⏳";
                    
                    return `
                      <div style="background:white; padding:10px; border-radius:4px; border-left:4px solid ${statusColor}; font-size:13px;">
                        <div style="font-weight:600; color:#333;">Reason: ${safeText(tcrData.reason)}</div>
                        <div style="color:${statusColor}; font-weight:bold; margin:4px 0;">${statusEmoji} ${safeText(tcrData.status).toUpperCase()}</div>
                        <div class="muted" style="font-size:11px;">Requested: ${new Date(tcrData.createdAt?.toDate?.() || new Date()).toLocaleDateString()}</div>
                      </div>
                    `;
                  }).join('')}
                </div>
              `}
            </div>
            
            <!-- ADD SHIFT REQUEST FORM -->
            <div style="margin-bottom:15px; padding:12px; background:#f0f8ff; border-radius:8px; border:1px solid #ccc;">
              <h4 style="margin:0 0 10px 0; color:#333;">⏰ Add Shift Request</h4>
              <div style="display:flex; gap:10px; align-items:flex-end;">
                <div style="flex:1;">
                  <label style="display:block; margin-bottom:5px; font-weight:600; font-size:12px;">Select Time Slot</label>
                  <select class="adminShiftHour-${showDetailsId}" style="width:100%; padding:8px; border:1px solid #ccc; border-radius:4px;">
                    <option value="">-- Choose Hour --</option>
                    <optgroup label="🌙 Night">
                      <option value="00">12:00 AM - 1:00 AM</option>
                      <option value="01">1:00 AM - 2:00 AM</option>
                      <option value="02">2:00 AM - 3:00 AM</option>
                      <option value="03">3:00 AM - 4:00 AM</option>
                      <option value="04">4:00 AM - 5:00 AM</option>
                      <option value="05">5:00 AM - 6:00 AM</option>
                    </optgroup>
                    <optgroup label="🌅 Morning">
                      <option value="06">6:00 AM - 7:00 AM</option>
                      <option value="07">7:00 AM - 8:00 AM</option>
                      <option value="08">8:00 AM - 9:00 AM</option>
                      <option value="09">9:00 AM - 10:00 AM</option>
                      <option value="10">10:00 AM - 11:00 AM</option>
                      <option value="11">11:00 AM - 12:00 PM</option>
                    </optgroup>
                    <optgroup label="☀️ Afternoon">
                      <option value="12">12:00 PM - 1:00 PM</option>
                      <option value="13">1:00 PM - 2:00 PM</option>
                      <option value="14">2:00 PM - 3:00 PM</option>
                      <option value="15">3:00 PM - 4:00 PM</option>
                      <option value="16">4:00 PM - 5:00 PM</option>
                      <option value="17">5:00 PM - 6:00 PM</option>
                    </optgroup>
                    <optgroup label="🌆 Evening">
                      <option value="18">6:00 PM - 7:00 PM</option>
                      <option value="19">7:00 PM - 8:00 PM</option>
                      <option value="20">8:00 PM - 9:00 PM</option>
                      <option value="21">9:00 PM - 10:00 PM</option>
                      <option value="22">10:00 PM - 11:00 PM</option>
                      <option value="23">11:00 PM - 12:00 AM</option>
                    </optgroup>
                  </select>
                </div>
                <button class="btnPro primary" data-adminaddshift="${showDetailsId}" style="padding:8px 14px;">➕ Add Shift</button>
              </div>
            </div>
            
            <!-- CHANGE TUTOR REQUEST FORM -->
            <div style="margin-bottom:15px; padding:12px; background:#fff0f8; border-radius:8px; border:1px solid #ccc;">
              <h4 style="margin:0 0 10px 0; color:#333;">🔄 Request Tutor Change</h4>
              <div style="display:flex; gap:10px; flex-direction:column;">
                <div>
                  <label style="display:block; margin-bottom:5px; font-weight:600; font-size:12px;">Reason for Change</label>
                  <textarea class="adminChangeTutorReason-${showDetailsId}" placeholder="Enter reason for tutor change..." style="width:100%; padding:8px; border:1px solid #ccc; border-radius:4px; min-height:80px; resize:vertical; font-family:Arial;"></textarea>
                </div>
                <button class="btnPro primary" data-adminchangetutor="${showDetailsId}" style="padding:8px 14px;">🔄 Submit Change Request</button>
              </div>
            </div>
            
            <!-- TEST: MODIFY STUDENT CREATED DATE FOR 30-DAY TESTING -->
            <div style="margin-bottom:15px; padding:12px; background:#fff9e6; border-radius:8px; border:2px dashed #ff9800;">
              <h4 style="margin:0 0 10px 0; color:#ff9800;">🧪 TEST MODE: Modify Creation Date</h4>
              <p style="font-size:12px; color:#999; margin:0 0 10px 0;">Use this to test the 30-day payout system by changing when the student was created.</p>
              <div style="display:flex; gap:10px; align-items:flex-end;">
                <div style="flex:1;">
                  <label style="display:block; margin-bottom:5px; font-weight:600; font-size:12px;">Days Ago (to simulate 30+ days)</label>
                  <input type="number" class="adminModifyCreatedDate-${showDetailsId}" value="31" min="0" max="365" placeholder="31" style="width:100%; padding:8px; border:1px solid #ccc; border-radius:4px;">
                </div>
                <button class="btnPro primary" data-testmodifycreateddate="${showDetailsId}" style="padding:8px 14px; background:#ff9800;">🔧 Set Date</button>
              </div>
            </div>
          `;
          
          const detailsContent = detailsRow.querySelector("div");
          detailsContent.innerHTML = dashHTML;
          detailsRow.style.display = "table-row";
        } catch (err) {
          console.error("Error loading student dashboard:", err);
          toast("❌ Error loading dashboard");
        }
      } else {
        // Hide dashboard
        detailsRow.style.display = "none";
      }
      return;
    }

    // Handle Add Shift Request
    const addShiftId = e.target.getAttribute("data-adminaddshift");
    if (addShiftId) {
      try {
        const hourSelect = document.querySelector(`.adminShiftHour-${addShiftId}`);
        const hour = hourSelect.value;
        
        if (!hour && hour !== "0") {
          toast("❌ Please select a time slot");
          return;
        }
        
        const studentSnap = await getDoc(doc(db, "students", addShiftId));
        if (!studentSnap.exists()) return toast("❌ Student not found");
        const studentData = studentSnap.data();
        
        await addDoc(collection(db, "shiftRequests"), {
          studentId: addShiftId,
          studentName: studentData.name || "Student",
          hour,
          status: "pending",
          createdAt: serverTimestamp(),
        });
        
        toast("✅ Shift request submitted");
        hourSelect.value = "";
        
        // Reload student dashboard and tabs
        const detailsRow = $(`studentDetails-${addShiftId}`);
        if (detailsRow.style.display !== "none") {
          e.target.dispatchEvent(new Event("click")); // Refresh dashboard
          setTimeout(() => e.target.dispatchEvent(new Event("click")), 100);
        }
        await loadStudents();
        if (window.loadShifts) await window.loadShifts();
      } catch (err) {
        console.error("Error adding shift:", err);
        showErr(err);
      }
      return;
    }

    // Handle Change Tutor Request
    const changeTutorId = e.target.getAttribute("data-adminchangetutor");
    if (changeTutorId) {
      try {
        const reasonTextarea = document.querySelector(`.adminChangeTutorReason-${changeTutorId}`);
        const reason = reasonTextarea.value.trim();
        
        if (!reason) {
          toast("❌ Please enter a reason");
          return;
        }
        
        const studentSnap = await getDoc(doc(db, "students", changeTutorId));
        if (!studentSnap.exists()) return toast("❌ Student not found");
        const studentData = studentSnap.data();
        
        await addDoc(collection(db, "tutorChangeRequests"), {
          studentId: changeTutorId,
          studentEmail: studentData.email,
          studentName: studentData.name || "Student",
          currentTutorId: studentData.assignedTutorId || "",
          reason,
          status: "pending",
          createdAt: serverTimestamp(),
        });
        
        toast("✅ Tutor change request submitted");
        reasonTextarea.value = "";
        
        // Reload student dashboard and tabs
        const detailsRow = $(`studentDetails-${changeTutorId}`);
        if (detailsRow.style.display !== "none") {
          e.target.dispatchEvent(new Event("click")); // Refresh dashboard
          setTimeout(() => e.target.dispatchEvent(new Event("click")), 100);
        }
        await loadStudents();
        if (window.loadTutorChanges) await window.loadTutorChanges();
      } catch (err) {
        console.error("Error changing tutor:", err);
        showErr(err);
      }
      return;
    }

    // TEST: Modify Student Creation Date
    const testModifyId = e.target.getAttribute("data-testmodifycreateddate");
    if (testModifyId) {
      try {
        const daysAgoInput = document.querySelector(`.adminModifyCreatedDate-${testModifyId}`);
        const daysAgo = parseInt(daysAgoInput.value) || 31;
        
        // Calculate the date that many days ago
        const newCreatedDate = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
        
        await updateDoc(doc(db, "students", testModifyId), {
          createdAt: newCreatedDate.toISOString(),
        });
        
        toast(`✅ TEST: Set student creation date to ${daysAgo} days ago (${newCreatedDate.toLocaleDateString()})`);
        
        // Reload student dashboard and tabs
        const detailsRow = $(`studentDetails-${testModifyId}`);
        if (detailsRow.style.display !== "none") {
          e.target.dispatchEvent(new Event("click")); // Refresh dashboard
          setTimeout(() => e.target.dispatchEvent(new Event("click")), 100);
        }
        await loadStudents();
        await loadTutors();
      } catch (err) {
        console.error("Error modifying created date:", err);
        showErr(err);
      }
      return;
    }

    if (assignId) {
      try {
        const select = document.querySelector(`.studentTutor[data-sid="${assignId}"]`);
        const tutorId = select.value;
        
        if (!tutorId) {
          toast("❌ Please select a tutor");
          return;
        }

        if (tutorId === "none") {
          // Unassign tutor
          await updateDoc(doc(db, "students", assignId), {
            assignedTutorId: null,
            assignedAt: null,
          });
          toast("✅ Tutor removed (Student unassigned)");
        } else {
          // Assign tutor
          await updateDoc(doc(db, "students", assignId), {
            assignedTutorId: tutorId,
            assignedAt: serverTimestamp(),
          });
          toast("✅ Tutor assigned");
        }
        
        await loadStudents();
        await loadTutors();
      } catch (e) {
        showErr(e);
      }
    }

    if (deleteId) {
      if (confirm("Are you sure you want to delete this student?")) {
        try {
          await deleteDoc(doc(db, "students", deleteId));
          toast("✅ Student deleted");
          await loadStudents();
          await loadTutors();
        } catch (e) {
          showErr(e);
        }
      }
    }
  };
};

// Load Students Function
const loadStudents = async () => {
  const studentList = $("studentList");
  studentList.innerHTML = "<div class='muted'>Loading...</div>";

  try {
    const q = query(collection(db, "students"));
    const snapshot = await getDocs(q);
    const students = snapshot.docs.sort((a, b) =>
      (b.data().createdAt?.toMillis?.() || 0) - (a.data().createdAt?.toMillis?.() || 0)
    );

    // Store all students for search
    allStudents = students.map(d => ({ id: d.id, ...d.data() }));

    // Get all tutors for dropdown
    const tutorQ = query(collection(db, "tutors"));
    const tutorSnap = await getDocs(tutorQ);
    const tutorDocs = tutorSnap.docs.sort((a, b) =>
      (b.data().createdAt?.toMillis?.() || 0) - (a.data().createdAt?.toMillis?.() || 0)
    );
    const tutors = [];
    tutorDocs.forEach((d) => {
      tutors.push({ id: d.id, name: d.data().name, phone: d.data().phone });
    });

    // Store tutors globally for search
    window.currentTutors = tutors;

    // Render all students
    await renderStudentList(allStudents, tutors);

    // Add search listener
    const studentSearchInput = $("studentSearch");
    if (studentSearchInput) {
      studentSearchInput.oninput = async (e) => {
        const searchTerm = e.target.value.toLowerCase();
        const filtered = allStudents.filter(student =>
          (student.name && student.name.toLowerCase().includes(searchTerm)) ||
          (student.email && student.email.toLowerCase().includes(searchTerm)) ||
          (student.phone && student.phone.toLowerCase().includes(searchTerm))
        );
        await renderStudentList(filtered, tutors);
      };
    }
  } catch (e) {
    studentList.innerHTML = "<div class='muted'>Error loading students</div>";
    console.error("Error loading students:", e);
  }
};

// Function to set up LIVE wallet updates for each tutor
const setupLiveWalletUpdates = (tutorId) => {
  const walletCardsContainer = $(`walletCards-${tutorId}`);
  if (!walletCardsContainer) return; // Container doesn't exist yet (not expanded)

  // Listen to students collection
  const studentQ = query(collection(db, "students"), where("assignedTutorId", "==", tutorId));
  const studentUnsub = onSnapshot(studentQ, async (studentSnap) => {
    const assignedStudents = studentSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const activeStudents = assignedStudents.filter(d => d.isActive === true);
    
    // Calculate wallet balance with PRO-RATA for days 1-29
    let dailyProRataBalance = 0;
    const dailyRate = 800 / 30; // ₹26.67 per day
    const completedThirtyDaysStudents = [];
    
    activeStudents.forEach(student => {
      // Safely get creation date
      let studentCreatedAt;
      if (student.createdAt && typeof student.createdAt.toDate === 'function') {
        studentCreatedAt = student.createdAt.toDate();
      } else if (student.createdAt instanceof Date) {
        studentCreatedAt = student.createdAt;
      } else {
        studentCreatedAt = new Date(student.createdAt);
      }
      
      const daysActive = Math.floor((Date.now() - studentCreatedAt.getTime()) / (24 * 60 * 60 * 1000));
      
      if (daysActive > 0) {
        if (daysActive >= 30) {
          // After 30 days, add full ₹800 to available balance
          dailyProRataBalance += 800;
          completedThirtyDaysStudents.push(student);
        } else {
          // For days 1-29, add pro-rata amount: daysActive * (800/30)
          dailyProRataBalance += daysActive * dailyRate;
        }
      }
    });
    
    const walletBalance = Math.round(dailyProRataBalance * 100) / 100; // Round to 2 decimals

    // Fetch withdrawal requests (for reference but not displayed)
    const wQ = query(collection(db, "withdrawalRequests"), where("tutorId", "==", tutorId));
    const wUnsub = onSnapshot(wQ, async (wSnap) => {

      // Fetch tutor doc to include any admin-added balance
      let adminAddedBalance = 0;
      try {
        const tutorDoc = await getDoc(doc(db, "tutors", tutorId));
        if (tutorDoc.exists()) {
          adminAddedBalance = tutorDoc.data().adminAddedBalance || 0;
        }
      } catch (err) {
        console.error("Error fetching tutor doc for adminAddedBalance:", err);
      }

      // Only show admin-added balance (actual withdrawable funds), NOT pro-rata
      const walletBalanceFinal = Math.round(adminAddedBalance * 100) / 100;

      // Set up real-time listener for tutor wallet updates
      const tutorWalletListener = onSnapshot(doc(db, "tutors", tutorId), (tutorSnap) => {
        if (tutorSnap.exists()) {
          const liveAdminAdded = tutorSnap.data().adminAddedBalance || 0;
          const liveWalletBalance = Math.round(liveAdminAdded * 100) / 100;
          
          // Update the wallet card in real-time
          const walletCard = document.querySelector(`[data-wallet-card="${tutorId}"]`);
          if (walletCard) {
            walletCard.innerHTML = `
              <div style="background:#e8f5ff; padding:12px; border-radius:8px; border-left:4px solid #0066ff;">
                <div style="font-size:11px; color:#666; font-weight:600;">Available Withdrawal Balance</div>
                <div style="font-size:22px; font-weight:900; color:#0066ff; margin:8px 0;">₹${liveWalletBalance.toFixed(2)}</div>
                <div style="font-size:10px; color:#999;">Admin-added balance</div>
              </div>
            `;
          }
        }
      }, (error) => {
        console.error("❌ Tutor wallet real-time listener error:", error);
      });
      
      // Store listener ref to cleanup later if needed
      if (!window.tutorWalletListeners) window.tutorWalletListeners = {};
      window.tutorWalletListeners[tutorId] = tutorWalletListener;

      // Update wallet cards HTML (initial render)
      walletCardsContainer.innerHTML = `
        <div data-wallet-card="${tutorId}">
          <div style="background:#e8f5ff; padding:12px; border-radius:8px; border-left:4px solid #0066ff;">
            <div style="font-size:11px; color:#666; font-weight:600;">Available Withdrawal Balance</div>
            <div style="font-size:22px; font-weight:900; color:#0066ff; margin:8px 0;">₹${walletBalanceFinal.toFixed(2)}</div>
            <div style="font-size:10px; color:#999;">Admin-added balance</div>
          </div>
        </div>
      `;
    });
  });
};

// Render Tutors List (used by both loadTutors and search)
const renderTutorList = async (tutorsToRender) => {
  const tutorList = $("tutorList");
  tutorList.innerHTML = "";

  if (tutorsToRender.length === 0) {
    tutorList.innerHTML = "<div class='muted'>No tutors found</div>";
    return;
  }

  let table = `
    <table style="width:100%; border-collapse:collapse;">
      <thead>
        <tr style="background:#f0f0f0; border-bottom:2px solid #333;">
          <th style="padding:10px; text-align:left; border:1px solid #ddd;">No.</th>
          <th style="padding:10px; text-align:left; border:1px solid #ddd;">Name</th>
          <th style="padding:10px; text-align:left; border:1px solid #ddd;">Email</th>
          <th style="padding:10px; text-align:left; border:1px solid #ddd;">Phone</th>
          <th style="padding:10px; text-align:center; border:1px solid #ddd;">Students</th>
          <th style="padding:10px; text-align:center; border:1px solid #ddd;">Action</th>
        </tr>
      </thead>
      <tbody>
  `;

  for (let index = 0; index < tutorsToRender.length; index++) {
    const t = tutorsToRender[index];
    const tid = t.id;

    // Initial data fetch (will be updated live below)
    const studentQ = query(
      collection(db, "students"),
      where("assignedTutorId", "==", tid)
    );
    const studentSnap = await getDocs(studentQ);
    const assignedStudents = studentSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    console.log(`[ADMIN TUTOR LOAD] Tutor: ${t.name}, Total students: ${assignedStudents.length}`, assignedStudents);
    
    // Get withdrawal requests
    const wQ = query(collection(db, "withdrawalRequests"), where("tutorId", "==", tid));
    const wSnap = await getDocs(wQ);
    const allTransactions = [];
    wSnap.docs.forEach((d) => {
      const r = d.data();
      allTransactions.push({ id: d.id, ...r });
    });
    
    // Calculate available balance from active students who completed 30 days
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const completedThirtyDaysStudents = assignedStudents.filter(d => {
      if (!d.isActive) return false;
      const studentCreatedAt = d.createdAt?.toDate?.() || new Date(d.createdAt);
      return studentCreatedAt <= thirtyDaysAgo;
    });
    const walletBalance = completedThirtyDaysStudents.length * 800;
    
    // Calculate estimated earnings from all active students
    const activeStudents = assignedStudents.filter(d => d.isActive === true);
    
    // Get payment methods
    const paymentMethods = t.paymentMethods || [];

    table += `
      <tr style="border-bottom:1px solid #ddd;">
        <td style="padding:10px; border:1px solid #ddd;">${index + 1}</td>
        <td style="padding:10px; border:1px solid #ddd;">${safeText(t.name)}</td>
        <td style="padding:10px; border:1px solid #ddd;">${safeText(t.email)}</td>
        <td style="padding:10px; border:1px solid #ddd;">${safeText(t.phone)}</td>
        <td style="padding:10px; text-align:center; border:1px solid #ddd;">
          <button class="btnPro primary" data-showtutordetails="${tid}" style="padding:5px 10px;">${assignedStudents.length} Students 📚</button>
        </td>
        <td style="padding:10px; text-align:center; border:1px solid #ddd;">
          <button class="btnPro dark" data-deletetutor="${tid}" style="padding:5px 10px;">Delete</button>
        </td>
      </tr>
      <tr id="tutorDetails-${tid}" style="display:none;">
        <td colspan="6" style="padding:15px; background:#f9f9f9; border:1px solid #ddd;">
          <div style="padding:10px; background:white; border-radius:5px; border:1px solid #e0e0e0;">
            
            <!-- WALLET & BANK INFO SECTION -->
            <div style="margin-bottom:20px; padding-bottom:15px; border-bottom:1px solid #eee;">
              <h4 style="margin:0 0 12px 0; color:#333;">💰 Tutor Financial Dashboard</h4>
              
              <!-- 4 WALLET CARDS - WITH LIVE UPDATE CONTAINERS -->
              <div style="display:grid; grid-template-columns:1fr 1fr 1fr 1fr; gap:12px; margin-bottom:15px;" id="walletCards-${tid}">
                <!-- Cards will be rendered here with live updates -->
              </div>
              
              <!-- BANK ACCOUNT INFO -->
              <div style="background:#fafafa; padding:12px; border-radius:8px; margin-bottom:12px;">
                <div style="font-size:13px; font-weight:600; margin-bottom:8px;">🏦 Bank Account</div>
                ${t.bankAccount ? `
                  <div style="font-size:13px; margin:6px 0;"><b>Account Holder:</b> ${safeText(t.bankAccount.holderName)}</div>
                  <div style="font-size:13px; margin:6px 0;"><b>Bank:</b> ${safeText(t.bankAccount.bankName)}</div>
                  <div style="font-size:13px; margin:6px 0;"><b>Account:</b> XXXX-XXXX-${t.bankAccount.accountNumber?.slice(-4) || 'N/A'}</div>
                  <div style="font-size:13px; margin:6px 0;"><b>IFSC:</b> ${safeText(t.bankAccount.ifsc)}</div>
                  <button class="btnPro ghost" data-edittutorbankaccount="${tid}" style="padding:5px 10px; margin-top:8px; font-size:11px;">✏️ Edit</button>
                ` : `
                  <div class="muted" style="font-size:13px;">❌ No bank account added</div>
                `}
                <button class="btnPro primary" data-addtutorbankaccount="${tid}" style="padding:5px 10px; margin-top:8px; font-size:11px; width:${t.bankAccount ? 'auto' : '100%'};">➕ ${t.bankAccount ? 'Update' : 'Add Bank Account'}</button>
              </div>
              
              <!-- PAYMENT METHODS -->
              <div style="background:#fafafa; padding:12px; border-radius:8px; margin-bottom:12px;">
                <div style="font-size:13px; font-weight:600; margin-bottom:8px;">💳 Payment Methods (${paymentMethods.length})</div>
                ${paymentMethods.length === 0 ? `
                  <div class="muted" style="font-size:13px;">No payment methods added</div>
                ` : `
                  <div style="display:flex; flex-direction:column; gap:6px; margin-bottom:8px;">
                    ${paymentMethods.map((pm, idx) => {
                      let display = '';
                      if (pm.type === 'upi') display = `📱 UPI: ${safeText(pm.value)} (${safeText(pm.name)})`;
                      else if (pm.type === 'phone') display = `☎️ Phone/GPay: ${safeText(pm.value)} (${safeText(pm.name)})`;
                      else if (pm.type === 'paypal') display = `💳 PayPal: ${safeText(pm.value)} (${safeText(pm.name)})`;
                      return `
                        <div style="background:white; padding:8px; border-radius:4px; font-size:12px; border-left:3px solid #0066ff; display:flex; justify-content:space-between; align-items:center;">
                          <span>${display}</span>
                          <button class="btnPro ghost" data-deletetutorpaymentmethod="${tid}" data-pmindex="${idx}" style="padding:3px 6px; font-size:10px;">🗑️ Remove</button>
                        </div>
                      `;
                    }).join('')}
                  </div>
                `}
                <button class="btnPro primary" data-addtutorpaymentmethod="${tid}" style="padding:8px 14px; width:100%;">➕ Add Payment Method</button>
              </div>
              
              <button class="btnPro primary" data-addpointstutor="${tid}" style="padding:8px 14px; width:100%;">💵 Add Points to Wallet</button>
            </div>
            
            <!-- WITHDRAWAL REQUESTS SECTION -->
            <div style="margin-bottom:20px; padding-bottom:15px; border-bottom:1px solid #eee;">
              <h4 style="margin:0 0 12px 0; color:#333;">📋 Withdrawal Requests (${allTransactions.length})</h4>
              ${allTransactions.length === 0 ? `
                <div class="muted" style="padding:10px;">No withdrawal requests yet</div>
              ` : `
                <div style="display:flex; flex-direction:column; gap:8px; max-height:300px; overflow-y:auto; margin-bottom:12px;">
                  ${allTransactions.map(trans => {
                    const statusColor = trans.status === "approved" ? "#00cc00" : trans.status === "rejected" ? "#ff4444" : "#0066ff";
                    const statusEmoji = trans.status === "approved" ? "✅" : trans.status === "rejected" ? "❌" : "⏳";
                    return `
                      <div style="background:white; padding:10px; border-radius:4px; border-left:4px solid ${statusColor}; font-size:13px;">
                        <div style="font-weight:600; color:#333;">₹${trans.amount} <span style="color:${statusColor}; font-weight:bold;">${statusEmoji} ${trans.status.toUpperCase()}</span></div>
                        <div class="muted" style="font-size:11px;">${new Date(trans.requestedAt?.toMillis?.()).toLocaleDateString()}</div>
                      </div>
                    `;
                  }).join('')}
                </div>
              `}
              
              <!-- ADMIN SUBMIT WITHDRAWAL FORM -->
              <div style="background:#fff9e6; padding:12px; border-radius:8px; border:1px solid #ffcc00;">
                <h5 style="margin:0 0 10px 0; color:#333;">➕ Create Withdrawal Request</h5>
                <div style="display:flex; gap:10px;">
                  <div style="flex:1;">
                    <label style="display:block; margin-bottom:5px; font-weight:600; font-size:12px;">Amount (₹)</label>
                    <input type="number" class="adminWithdrawalAmount-${tid}" placeholder="500" min="1" style="width:100%; padding:8px; border:1px solid #ccc; border-radius:4px;">
                  </div>
                  <button class="btnPro primary" data-adminsubmitwithdrawal="${tid}" style="padding:8px 14px; align-self:flex-end;">💰 Submit</button>
                </div>
              </div>
            </div>
            
            <!-- ASSIGNED STUDENTS SECTION -->
            <h4 style="margin:0 0 10px 0; color:#333;">Assigned Students to ${safeText(t.name)}</h4>
    `;

    if (assignedStudents.length === 0) {
      table += `<div class="muted" style="padding:10px;">No students assigned</div>`;
    } else {
      table += `
        <table style="width:100%; border-collapse:collapse; margin-top:10px;">
          <thead>
            <tr style="background:#e8f4f8; border-bottom:1px solid #ccc;">
              <th style="padding:8px; text-align:left; border:1px solid #ddd;">S.No</th>
              <th style="padding:8px; text-align:left; border:1px solid #ddd;">Name</th>
              <th style="padding:8px; text-align:left; border:1px solid #ddd;">Email</th>
              <th style="padding:8px; text-align:left; border:1px solid #ddd;">Phone</th>
              <th style="padding:8px; text-align:left; border:1px solid #ddd;">Assigned Date</th>
              <th style="padding:8px; text-align:left; border:1px solid #ddd;">Status</th>
            </tr>
          </thead>
          <tbody>
      `;

      assignedStudents.forEach((student, sIndex) => {
        // determine if student is eligible for 30-day payout and not yet cleared
        let eligible30 = false;
        let daysActive = 0;
        try {
          const now = Date.now();
          const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);
          const studentCreatedAt = student.createdAt?.toDate?.() || new Date(student.createdAt);
          daysActive = Math.floor((now - studentCreatedAt.getTime()) / (24 * 60 * 60 * 1000));
          const isEligible = student.isActive && studentCreatedAt <= thirtyDaysAgo && !student.payoutCleared;
          
          // Debug logging
          console.log(`[30-DAY CHECK] Student: ${student.name}, isActive: ${student.isActive}, createdAt: ${studentCreatedAt}, thirtyDaysAgo: ${thirtyDaysAgo}, payoutCleared: ${student.payoutCleared}, eligible: ${isEligible}`);
          
          if (isEligible) eligible30 = true;
        } catch (err) { console.error('student date parse', err); }

        // Format assigned date
        let assignedDateStr = "Unknown";
        try {
          const createdDate = student.createdAt?.toDate?.() || new Date(student.createdAt);
          assignedDateStr = createdDate.toLocaleDateString();
        } catch (err) { console.error('date format error', err); }

        let statusHtml = '';
        if (eligible30) {
          // Show EXPIRED status with approve button
          statusHtml = `<span style="color:#ff9800; font-weight:bold;">🔴 EXPIRED (${daysActive} days)</span><br/><button class="btnPro primary" data-approve30day="${student.id}" data-tutorid="${tid}" style="padding:5px 8px; margin-top:4px; font-size:12px;">Approve ₹800</button>`;
        } else if (student.payoutCleared) {
          // Show APPROVED status
          statusHtml = `<span style="color:#00cc00; font-weight:bold;">✅ APPROVED</span>`;
        } else if (student.isActive) {
          // Show ACTIVE status
          statusHtml = `<span style="color:#00cc00; font-weight:bold;">✅ Active</span>`;
        } else {
          // Show INACTIVE status
          statusHtml = `<span style="color:#ff6b6b; font-weight:bold;">❌ Inactive</span>`;
        }

        table += `
          <tr style="border-bottom:1px solid #ddd;">
            <td style="padding:8px; border:1px solid #ddd;">${sIndex + 1}</td>
            <td style="padding:8px; border:1px solid #ddd;">${safeText(student.name)}</td>
            <td style="padding:8px; border:1px solid #ddd;">${safeText(student.email)}</td>
            <td style="padding:8px; border:1px solid #ddd;">${safeText(student.phone)}</td>
            <td style="padding:8px; border:1px solid #ddd;">${assignedDateStr}</td>
            <td style="padding:8px; border:1px solid #ddd;">${statusHtml}</td>
          </tr>
        `;
      });

      table += `
          </tbody>
        </table>
      `;
    }

    table += `
            </div>
          </td>
        </tr>
    `;
  }

  table += `</tbody></table>`;
  tutorList.innerHTML = table;

  // Attach click handler for approve 30-day payout buttons
  tutorList.addEventListener('click', async (e) => {
    // Check if clicked element is the approve button
    if (!e.target.hasAttribute('data-approve30day')) return;
    
    const studentId = e.target.getAttribute('data-approve30day');
    const tutorId = e.target.getAttribute('data-tutorid');
    
    console.log(`[APPROVE CLICK] Attempting to approve student: ${studentId}, tutor: ${tutorId}`);
    
    if (!studentId || !tutorId) {
      console.error('Missing studentId or tutorId', { studentId, tutorId });
      return;
    }
    
    try {
      // Approve one-time ₹800 payout for this student: admin adds ₹800 to tutor's adminAddedBalance
      const tdoc = doc(db, 'tutors', tutorId);
      const tsnap = await getDoc(tdoc);
      const currentAdminAdded = tsnap.data().adminAddedBalance || 0;
      
      console.log(`[APPROVE] Current admin balance: ${currentAdminAdded}, adding 800...`);
      
      await updateDoc(tdoc, { adminAddedBalance: currentAdminAdded + 800 });

      // mark student as payout cleared so they don't count again
      const sdoc = doc(db, 'students', studentId);
      await updateDoc(sdoc, { payoutCleared: true, payoutClearedAt: serverTimestamp() });

      // record transaction for audit
      try {
        await addDoc(collection(db, 'walletTransactions'), {
          tutorId,
          tutorName: tsnap.data().name,
          tutorEmail: tsnap.data().email,
          type: 'admin_30d_payout',
          amount: 800,
          reason: '30-day student payout approved',
          studentId,
          timestamp: serverTimestamp(),
          addedBy: auth.currentUser?.email || 'admin',
        });
      } catch (recErr) { console.error('Error recording wallet transaction', recErr); }

      toast('✅ Approved ₹800 for student payout and updated tutor wallet');
      console.log('[APPROVE] Success! Reloading tutors...');
      await loadTutors();
    } catch (err) {
      console.error('[APPROVE] Error:', err);
      showErr(err);
    }
  });

  // NOW SET UP LIVE WALLET UPDATES FOR EACH TUTOR
  for (let i = 0; i < tutorsToRender.length; i++) {
    const tid = tutorsToRender[i].id;
    setupLiveWalletUpdates(tid);
  }

  tutorList.onclick = async (e) => {
    const deleteId = e.target.getAttribute("data-deletetutor");
    const showDetailsId = e.target.getAttribute("data-showtutordetails");
    const addPointsId = e.target.getAttribute("data-addpointstutor");
    const addBankId = e.target.getAttribute("data-addtutorbankaccount");
    const editBankId = e.target.getAttribute("data-edittutorbankaccount");
    const addPaymentMethodId = e.target.getAttribute("data-addtutorpaymentmethod");
    const deletePaymentMethodId = e.target.getAttribute("data-deletetutorpaymentmethod");
    const submitWithdrawalId = e.target.getAttribute("data-adminsubmitwithdrawal");

    if (showDetailsId) {
      const detailsRow = $(`tutorDetails-${showDetailsId}`);
      if (detailsRow) {
        if (detailsRow.style.display === "none") {
          detailsRow.style.display = "table-row";
          e.target.textContent = "Hide Students 📚";
          // Trigger live wallet updates when details are shown
          setupLiveWalletUpdates(showDetailsId);
        } else {
          detailsRow.style.display = "none";
          // Count students again for display
          const studentQ = query(
            collection(db, "students"),
            where("assignedTutorId", "==", showDetailsId)
          );
          const studentSnap = await getDocs(studentQ);
          e.target.textContent = `${studentSnap.docs.length} Students 📚`;
        }
      }
    }

    // Add/Edit Bank Account
    if (addBankId || editBankId) {
      try {
        const tutorId = addBankId || editBankId;
        const tutorSnap = await getDoc(doc(db, "tutors", tutorId));
        const tutor = tutorSnap.data();
        
        const bankData = tutor.bankAccount || {};
        
        const inputs = {
          holderName: prompt("Account Holder Name:", bankData.holderName || ""),
          bankName: prompt("Bank Name (e.g., HDFC, ICICI):", bankData.bankName || ""),
          accountNumber: prompt("Account Number:", bankData.accountNumber || ""),
          ifsc: prompt("IFSC Code:", bankData.ifsc || "")
        };
        
        if (!inputs.holderName || !inputs.bankName || !inputs.accountNumber || !inputs.ifsc) {
          toast("❌ All fields required");
          return;
        }
        
        await updateDoc(doc(db, "tutors", tutorId), {
          bankAccount: inputs
        });
        
        toast("✅ Bank account updated");
        await loadTutors();
      } catch (err) {
        console.error("Error updating bank account:", err);
        showErr(err);
      }
      return;
    }

    // Add Payment Method
    if (addPaymentMethodId) {
      try {
        const pmType = prompt("Payment Method Type:\n1. upi\n2. phone (Phone/GPay)\n3. paypal", "upi");
        if (!pmType || !["upi", "phone", "paypal"].includes(pmType)) {
          toast("❌ Invalid type (use: upi, phone, or paypal)");
          return;
        }
        
        let value = "";
        let name = "";
        
        if (pmType === "upi") {
          value = prompt("UPI ID (e.g., username@upi):", "");
          name = prompt("Name/Label (e.g., Personal):", "");
        } else if (pmType === "phone") {
          value = prompt("Phone Number:", "");
          name = prompt("Name/Label (e.g., GPay):", "");
        } else if (pmType === "paypal") {
          value = prompt("PayPal Email:", "");
          name = prompt("Name/Label (e.g., PayPal Account):", "");
        }
        
        if (!value || !name) {
          toast("❌ All fields required");
          return;
        }
        
        const tutorSnap = await getDoc(doc(db, "tutors", addPaymentMethodId));
        const tutor = tutorSnap.data();
        const paymentMethods = tutor.paymentMethods || [];
        
        paymentMethods.push({ type: pmType, value, name });
        
        await updateDoc(doc(db, "tutors", addPaymentMethodId), {
          paymentMethods
        });
        
        toast("✅ Payment method added");
        await loadTutors();
      } catch (err) {
        console.error("Error adding payment method:", err);
        showErr(err);
      }
      return;
    }

    // Delete Payment Method
    if (deletePaymentMethodId) {
      try {
        const pmIndex = parseInt(e.target.getAttribute("data-pmindex"));
        if (confirm("Delete this payment method?")) {
          const tutorSnap = await getDoc(doc(db, "tutors", deletePaymentMethodId));
          const tutor = tutorSnap.data();
          const paymentMethods = tutor.paymentMethods || [];
          
          paymentMethods.splice(pmIndex, 1);
          
          await updateDoc(doc(db, "tutors", deletePaymentMethodId), {
            paymentMethods
          });
          
          toast("✅ Payment method deleted");
          await loadTutors();
        }
      } catch (err) {
        console.error("Error deleting payment method:", err);
        showErr(err);
      }
      return;
    }

    // Submit Withdrawal Request
    if (submitWithdrawalId) {
      try {
        const amountInput = document.querySelector(`.adminWithdrawalAmount-${submitWithdrawalId}`);
        const amount = parseInt(amountInput.value);
        
        if (!amount || amount < 1) {
          toast("❌ Enter valid amount");
          return;
        }
        
        // Get tutor and calculate available balance
        const tutorSnap = await getDoc(doc(db, "tutors", submitWithdrawalId));
        if (!tutorSnap.exists()) return toast("❌ Tutor not found");
        
        // Get all students assigned to this tutor
        const sQ = query(collection(db, "students"));
        const sSnap = await getDocs(sQ);
        const assignedStudents = sSnap.docs.filter(d => d.data().assignedTutorId === submitWithdrawalId);
        
        // Calculate available balance from active students who completed 30 days
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const completedThirtyDaysStudents = assignedStudents.filter(d => {
          const student = d.data();
          if (!student.isActive) return false;
          const studentCreatedAt = student.createdAt?.toDate?.() || new Date(student.createdAt);
          return studentCreatedAt <= thirtyDaysAgo;
        });
        
        const walletBalance = completedThirtyDaysStudents.length * 800;
        
        if (amount > walletBalance) {
          toast(`❌ Insufficient balance. Available: ₹${walletBalance} (Need ${Math.ceil(amount / 800)} active students 30+ days old)`);
          return;
        }
        
        await addDoc(collection(db, "withdrawalRequests"), {
          tutorId: submitWithdrawalId,
          amount,
          status: "pending",
          requestedAt: serverTimestamp(),
        });
        
        toast("✅ Withdrawal request submitted");
        amountInput.value = "";
        await loadTutors();
        if (window.loadWithdrawals) await window.loadWithdrawals();
      } catch (err) {
        console.error("Error submitting withdrawal:", err);
        showErr(err);
      }
      return;
    }

    if (addPointsId) {
      const tutorSnap = await getDoc(doc(db, "tutors", addPointsId));
      const tutor = tutorSnap.data();
      
      // Store current tutor ID for add points
      window.currentTutorForPoints = { id: addPointsId, name: tutor.name, email: tutor.email };
      
      $("apTutorName").value = tutor.name || "Unknown";
      $("apAmount").value = "";
      $("apReason").value = "manual_adjustment";
      $("apNotes").value = "";
      
      $("addPointsOverlay").style.display = "flex";
    }

    if (deleteId) {
      if (confirm("Are you sure you want to delete this tutor?")) {
        try {
          await deleteDoc(doc(db, "tutors", deleteId));
          toast("✅ Tutor deleted");
          await loadTutors();
          await loadStudents();
        } catch (e) {
          showErr(e);
        }
      }
    }
  };
};

// Load Tutors Function
const loadTutors = async () => {
  const tutorList = $("tutorList");
  tutorList.innerHTML = "<div class='muted'>Loading...</div>";

  try {
    const q = query(collection(db, "tutors"));
    
    // Use onSnapshot for LIVE data updates
    onSnapshot(q, async (snapshot) => {
      const tutors = snapshot.docs.sort((a, b) =>
        (b.data().createdAt?.toMillis?.() || 0) - (a.data().createdAt?.toMillis?.() || 0)
      );

      // Store all tutors for search
      allTutors = tutors.map(d => ({ id: d.id, ...d.data() }));

      // Render all tutors
      await renderTutorList(allTutors);

      // Add search listener
      const tutorSearchInput = $("tutorSearch");
      if (tutorSearchInput) {
        tutorSearchInput.oninput = async (e) => {
          const searchTerm = e.target.value.toLowerCase();
          const filtered = allTutors.filter(tutor =>
            (tutor.name && tutor.name.toLowerCase().includes(searchTerm)) ||
            (tutor.email && tutor.email.toLowerCase().includes(searchTerm)) ||
            (tutor.phone && tutor.phone.toLowerCase().includes(searchTerm))
          );
          await renderTutorList(filtered);
        };
      }
    }, (error) => {
      tutorList.innerHTML = "<div class='muted'>Error loading tutors</div>";
      console.error("Error loading tutors:", error);
    });
  } catch (e) {
    tutorList.innerHTML = "<div class='muted'>Error setting up live tutors</div>";
    console.error("Error setting up tutors listener:", e);
  }
};

// Load Withdrawals Function
const loadWithdrawals = async () => {
  const withdrawalList = $("withdrawalList");
  withdrawalList.innerHTML = "<div class='muted'>Loading...</div>";

  try {
    const q = query(collection(db, "withdrawalRequests"), where("status", "==", "pending"));
    const snapshot = await getDocs(q);
    
    if (!snapshot) {
      withdrawalList.innerHTML = "<div class='muted'>No pending withdrawal requests</div>";
      return;
    }

    const withdrawals = snapshot.docs.sort((a, b) =>
      (b.data().requestedAt?.toMillis?.() || 0) - (a.data().requestedAt?.toMillis?.() || 0)
    );

    withdrawalList.innerHTML = "";

    if (withdrawals.length === 0) {
      withdrawalList.innerHTML = "<div class='muted'>No pending withdrawal requests</div>";
      return;
    }

    let table = `
      <table style="width:100%; border-collapse:collapse;">
        <thead>
          <tr style="background:#f0f0f0; border-bottom:2px solid #333;">
            <th style="padding:10px; text-align:left; border:1px solid #ddd;">No.</th>
            <th style="padding:10px; text-align:left; border:1px solid #ddd;">Tutor Name</th>
            <th style="padding:10px; text-align:left; border:1px solid #ddd;">Amount</th>
            <th style="padding:10px; text-align:left; border:1px solid #ddd;">Bank Account</th>
            <th style="padding:10px; text-align:left; border:1px solid #ddd;">Date Requested</th>
            <th style="padding:10px; text-align:center; border:1px solid #ddd;">Action</th>
          </tr>
        </thead>
        <tbody>
    `;

    withdrawals.forEach((d, index) => {
      const r = d.data();
      
      // Safe access for nested objects
      const bankAccount = r.bankAccount || { holderName: "N/A", bankName: "N/A", accountNumber: "0000" };
      const bankDisplay = `${bankAccount.holderName} - ${bankAccount.bankName}`;
      const dateRequested = r.requestedAt?.toMillis?.() ? new Date(r.requestedAt.toMillis()).toLocaleDateString() : "N/A";
      const tutorName = r.tutorName || "Unknown";
      const amount = r.amount || 0;
      
      table += `
        <tr style="border-bottom:1px solid #ddd;">
          <td style="padding:10px; border:1px solid #ddd;">${index + 1}</td>
          <td style="padding:10px; border:1px solid #ddd;">
            <b>${safeText(tutorName)}</b><br/>
            <small class="muted">${safeText(r.tutorEmail)}</small>
          </td>
          <td style="padding:10px; border:1px solid #ddd;"><b>₹${amount}</b></td>
          <td style="padding:10px; border:1px solid #ddd;">
            ${safeText(bankDisplay)}<br/>
            <small class="muted">XXXX-XXXX-${bankAccount.accountNumber.slice(-4)}</small><br/>
            <small class="muted">IFSC: ${bankAccount.ifsc || "N/A"}</small>
          </td>
          <td style="padding:10px; border:1px solid #ddd;">${dateRequested}</td>
          <td style="padding:10px; text-align:center; border:1px solid #ddd;">
            <button class="btnPro primary" data-approvewithdrawal="${d.id}" style="padding:6px 10px; margin-right:5px; font-size:12px; cursor:pointer;">✅ Approve</button>
            <button class="btnPro dark" data-rejectwithdrawal="${d.id}" style="padding:6px 10px; font-size:12px; cursor:pointer;">❌ Reject</button>
          </td>
        </tr>
      `;
    });

    table += `</tbody></table>`;
    withdrawalList.innerHTML = table;

    withdrawalList.onclick = async (e) => {
      const approveId = e.target.getAttribute("data-approvewithdrawal");
      const rejectId = e.target.getAttribute("data-rejectwithdrawal");

      if (approveId) {
        try {
          const wdoc = doc(db, "withdrawalRequests", approveId);
          const wsnap = await getDoc(wdoc);
          const wreq = wsnap.data();

          // Get tutor data to calculate current available balance
          const tdoc = doc(db, "tutors", wreq.tutorId);
          const tsnap = await getDoc(tdoc);
          const tutorData = tsnap.data();
          
          // Get all students assigned to this tutor to recalculate available balance
          const sq = query(collection(db, "students"));
          const ssnapshot = await getDocs(sq);
          const assignedStudents = ssnapshot.docs.filter(sd => sd.data().assignedTutorId === wreq.tutorId);
          
          // Calculate current available balance (daily pro-rata)
          const dailyRate = 800 / 30; // ₹26.67 per day
          let dailyEarningsBalance = 0;
          
          assignedStudents.forEach(studentDoc => {
            const student = studentDoc.data();
            if (!student.isActive) return;
            
            let studentCreatedAt;
            if (student.createdAt && typeof student.createdAt.toDate === 'function') {
              studentCreatedAt = student.createdAt.toDate();
            } else if (student.createdAt instanceof Date) {
              studentCreatedAt = student.createdAt;
            } else {
              studentCreatedAt = new Date(student.createdAt);
            }
            
            const daysActive = Math.floor((Date.now() - studentCreatedAt.getTime()) / (24 * 60 * 60 * 1000));
            
            if (daysActive > 0) {
              if (daysActive >= 30) {
                dailyEarningsBalance += 800;
              } else {
                dailyEarningsBalance += daysActive * dailyRate;
              }
            }
          });
          
          // Get pending withdrawal amount
          let pendingWithdrawalAmount = 0;
          const wq = query(collection(db, "withdrawalRequests"), where("tutorId", "==", wreq.tutorId), where("status", "==", "pending"));
          const wsnap_all = await getDocs(wq);
          wsnap_all.docs.forEach(d => {
            if (d.id !== approveId) {
              pendingWithdrawalAmount += d.data().amount || 0;
            }
          });
          
          // Calculate total available balance: admin added + daily earnings - pending withdrawals
          const adminAddedBalance = tutorData.adminAddedBalance || 0;
          const totalBalance = adminAddedBalance + dailyEarningsBalance;
          const currentAvailableBalance = Math.max(0, Math.round((totalBalance - pendingWithdrawalAmount) * 100) / 100);
          
          // Check if withdrawal amount is valid
          if (wreq.amount > currentAvailableBalance) {
            return toast(`❌ Tutor's available balance (₹${currentAvailableBalance}) is less than requested amount (₹${wreq.amount})`);
          }

          // Approve withdrawal and deduct from tutor's adminAddedBalance
          const newAdminBalance = Math.max(0, Math.round((adminAddedBalance - wreq.amount) * 100) / 100);
          
          await updateDoc(wdoc, {
            status: "approved",
            approvedAt: serverTimestamp(),
            approvedBy: auth.currentUser.email,
            tutorAvailableBalance: currentAvailableBalance,
            deductedAmount: wreq.amount,
          });
          
          // Deduct from tutor's adminAddedBalance
          await updateDoc(doc(db, "tutors", wreq.tutorId), {
            adminAddedBalance: newAdminBalance,
          });

          // Record this withdrawal in tutor's transaction history
          const newBalance = Math.round((currentAvailableBalance - wreq.amount) * 100) / 100;
          await addDoc(collection(db, "walletTransactions"), {
            tutorId: wreq.tutorId,
            type: "withdrawal_debit",
            amount: wreq.amount,
            reason: `Withdrawal approved by ${auth.currentUser.email}`,
            timestamp: serverTimestamp(),
            status: "completed",
            withdrawalRequestId: approveId,
            previousBalance: currentAvailableBalance,
            newBalance: newBalance,
          });

          toast(`✅ Withdrawal approved! Tutor balance: ₹${currentAvailableBalance} → ₹${newBalance}`);
          await loadWithdrawals();
        } catch (e) {
          console.error("Approval error:", e);
          showErr(e);
        }
      }

      if (rejectId) {
        try {
          await updateDoc(doc(db, "withdrawalRequests", rejectId), {
            status: "rejected",
            rejectedAt: serverTimestamp(),
            rejectedBy: auth.currentUser.email,
          });
          toast("❌ Withdrawal rejected");
          await loadWithdrawals();
        } catch (e) {
          showErr(e);
        }
      }
    };
  } catch (e) {
    withdrawalList.innerHTML = "<div class='muted'>⚠️ Error loading withdrawals - " + (e.message || "Unknown error") + "</div>";
    console.error("Error loading withdrawals:", e);
  }
};
window.loadWithdrawals = loadWithdrawals;

// Load Shift Requests Function
const loadShifts = async () => {
  const shiftList = $("shiftList");
  shiftList.innerHTML = "<div class='muted'>Loading...</div>";

  try {
    const q = query(collection(db, "shiftRequests"), where("status", "==", "pending"));
    const snapshot = await getDocs(q);

    if (!snapshot || snapshot.docs.length === 0) {
      shiftList.innerHTML = "<div class='muted'>No pending shift requests</div>";
      return;
    }

    const shifts = snapshot.docs.sort((a, b) =>
      (b.data().createdAt?.toMillis?.() || 0) - (a.data().createdAt?.toMillis?.() || 0)
    );

    shiftList.innerHTML = "";

    let table = `
      <table style="width:100%; border-collapse:collapse;">
        <thead>
          <tr style="background:#f0f0f0; border-bottom:2px solid #333;">
            <th style="padding:10px; text-align:left; border:1px solid #ddd;">No.</th>
            <th style="padding:10px; text-align:left; border:1px solid #ddd;">Student Name</th>
            <th style="padding:10px; text-align:left; border:1px solid #ddd;">Time Period</th>
            <th style="padding:10px; text-align:left; border:1px solid #ddd;">Study Hour</th>
            <th style="padding:10px; text-align:left; border:1px solid #ddd;">Requested Date</th>
            <th style="padding:10px; text-align:center; border:1px solid #ddd;">Action</th>
          </tr>
        </thead>
        <tbody>
    `;

    for (let idx = 0; idx < shifts.length; idx++) {
      const d = shifts[idx];
      const r = d.data();
      const hourNum = parseInt(r.hour);
      let timeStr = "";
      let period = "";
      
      if (hourNum === 0) timeStr = "12:00 AM - 1:00 AM";
      else if (hourNum < 12) timeStr = `${hourNum}:00 AM - ${hourNum + 1}:00 AM`;
      else if (hourNum === 12) timeStr = "12:00 PM - 1:00 PM";
      else timeStr = `${hourNum - 12}:00 PM - ${hourNum - 11}:00 PM`;

      // Get time period category
      if (hourNum <= 5) { period = "🌙 Night (12 AM - 5 AM)"; }
      else if (hourNum <= 11) { period = "🌅 Morning (6 AM - 11 AM)"; }
      else if (hourNum <= 17) { period = "☀️ Afternoon (12 PM - 5 PM)"; }
      else { period = "🌆 Evening (6 PM - 11 PM)"; }

      const createdDate = r.createdAt?.toDate?.() ? new Date(r.createdAt.toDate()).toLocaleDateString() : "N/A";
      const studentName = r.studentName || "Unknown";

      table += `
        <tr style="border-bottom:1px solid #ddd;">
          <td style="padding:10px; border:1px solid #ddd;">${idx + 1}</td>
          <td style="padding:10px; border:1px solid #ddd;">${safeText(studentName)}</td>
          <td style="padding:10px; border:1px solid #ddd;"><b>${period}</b></td>
          <td style="padding:10px; border:1px solid #ddd;">${timeStr}</td>
          <td style="padding:10px; border:1px solid #ddd;">${createdDate}</td>
          <td style="padding:10px; text-align:center; border:1px solid #ddd;">
            <button class="btnPro primary" data-approveshift="${d.id}" style="padding:5px 8px; margin-right:5px;">Approve</button>
            <button class="btnPro dark" data-rejectshift="${d.id}" style="padding:5px 8px;">Reject</button>
          </td>
        </tr>
      `;
    }

    table += `</tbody></table>`;
    shiftList.innerHTML = table;

    // Handle Shift Approval/Rejection with event delegation
    const buttons = shiftList.querySelectorAll("[data-approveshift], [data-rejectshift]");
    buttons.forEach(btn => {
      btn.onclick = async (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        const approveId = btn.getAttribute("data-approveshift");
        const rejectId = btn.getAttribute("data-rejectshift");

        if (approveId) {
          try {
            const sdoc = doc(db, "shiftRequests", approveId);
            await updateDoc(sdoc, { status: "approved" });
            toast("✅ Shift request approved");
            await loadShifts();
          } catch (e) {
            showErr(e);
          }
        }

        if (rejectId) {
          try {
            const sdoc = doc(db, "shiftRequests", rejectId);
            await updateDoc(sdoc, { status: "rejected" });
            toast("❌ Shift request rejected");
            await loadShifts();
          } catch (e) {
            showErr(e);
          }
        }
      };
    });
  } catch (e) {
    shiftList.innerHTML = "<div class='muted'>⚠️ Error loading shifts - " + (e.message || "Unknown error") + "</div>";
    console.error("Error loading shifts:", e);
  }
};
window.loadShifts = loadShifts;

// Load Tutor Change Requests Function
const loadTutorChanges = async () => {
  const tutorChangeList = $("tutorChangeList");
  tutorChangeList.innerHTML = "<div class='muted'>Loading...</div>";

  try {
    const q = query(collection(db, "tutorChangeRequests"), where("status", "==", "pending"));
    const snapshot = await getDocs(q);

    if (!snapshot || snapshot.docs.length === 0) {
      tutorChangeList.innerHTML = "<div class='muted'>No pending tutor change requests</div>";
      return;
    }

    const changes = snapshot.docs.sort((a, b) =>
      (b.data().createdAt?.toMillis?.() || 0) - (a.data().createdAt?.toMillis?.() || 0)
    );

    tutorChangeList.innerHTML = "";

    let table = `
      <table style="width:100%; border-collapse:collapse;">
        <thead>
          <tr style="background:#f0f0f0; border-bottom:2px solid #333;">
            <th style="padding:10px; text-align:left; border:1px solid #ddd;">No.</th>
            <th style="padding:10px; text-align:left; border:1px solid #ddd;">Student Email</th>
            <th style="padding:10px; text-align:left; border:1px solid #ddd;">Reason for Change</th>
            <th style="padding:10px; text-align:left; border:1px solid #ddd;">Requested Date</th>
            <th style="padding:10px; text-align:center; border:1px solid #ddd;">Action</th>
          </tr>
        </thead>
        <tbody>
    `;

    for (let idx = 0; idx < changes.length; idx++) {
      const d = changes[idx];
      const r = d.data();
      const createdDate = r.createdAt?.toDate?.() ? new Date(r.createdAt.toDate()).toLocaleDateString() : "N/A";
      const studentEmail = r.studentEmail || "Unknown";
      const reason = r.reason || "No reason provided";

      table += `
        <tr style="border-bottom:1px solid #ddd;">
          <td style="padding:10px; border:1px solid #ddd;">${idx + 1}</td>
          <td style="padding:10px; border:1px solid #ddd;">${safeText(studentEmail)}</td>
          <td style="padding:10px; border:1px solid #ddd;"><i>${safeText(reason)}</i></td>
          <td style="padding:10px; border:1px solid #ddd;">${createdDate}</td>
          <td style="padding:10px; text-align:center; border:1px solid #ddd;">
            <button class="btnPro primary" data-approvechange="${d.id}" style="padding:5px 8px; margin-right:5px;">Approve</button>
            <button class="btnPro dark" data-rejectchange="${d.id}" style="padding:5px 8px;">Reject</button>
          </td>
        </tr>
      `;
    }

    table += `</tbody></table>`;
    tutorChangeList.innerHTML = table;

    // Handle Tutor Change Approval/Rejection
    const buttons = tutorChangeList.querySelectorAll("[data-approvechange], [data-rejectchange]");
    buttons.forEach(btn => {
      btn.onclick = async (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        const approveId = btn.getAttribute("data-approvechange");
        const rejectId = btn.getAttribute("data-rejectchange");

        if (approveId) {
          try {
            const cdoc = doc(db, "tutorChangeRequests", approveId);
            await updateDoc(cdoc, { status: "approved" });
            toast("✅ Tutor change request approved - Student can be reassigned");
            await loadTutorChanges();
          } catch (e) {
            showErr(e);
          }
        }

        if (rejectId) {
          try {
            const cdoc = doc(db, "tutorChangeRequests", rejectId);
            await updateDoc(cdoc, { status: "rejected" });
            toast("❌ Tutor change request rejected");
            await loadTutorChanges();
          } catch (e) {
            showErr(e);
          }
        }
      };
    });
  } catch (e) {
    tutorChangeList.innerHTML = "<div class='muted'>⚠️ Error loading tutor changes - " + (e.message || "Unknown error") + "</div>";
    console.error("Error loading tutor changes:", e);
  }
};
window.loadTutorChanges = loadTutorChanges;

// ADD POINTS TO TUTOR WALLET MODAL HANDLERS
const addPointsOverlay = $("addPointsOverlay");
const btnAddPoints = $("btnAddPoints");
const btnCloseAddPoints = $("btnCloseAddPoints");

btnCloseAddPoints.onclick = () => {
  addPointsOverlay.style.display = "none";
};

// Click outside modal to close
addPointsOverlay.onclick = (e) => {
  if (e.target === addPointsOverlay) {
    addPointsOverlay.style.display = "none";
  }
};

btnAddPoints.onclick = async () => {
  const tutorId = window.currentTutorForPoints?.id;
  const amount = parseFloat($("apAmount").value);
  const reason = $("apReason").value;
  const notes = $("apNotes").value;

  if (!tutorId) {
    toast("❌ Tutor not selected");
    return;
  }

  if (!amount || amount < 1) {
    toast("❌ Enter valid amount");
    return;
  }

  try {
    const tdoc = doc(db, "tutors", tutorId);
    const tsnap = await getDoc(tdoc);
    const currentAdminAdded = tsnap.data().adminAddedBalance || 0;

    // Update tutor wallet with admin-added balance (separate field)
    await updateDoc(tdoc, {
      "adminAddedBalance": currentAdminAdded + amount,
    });

    // Create transaction record (for audit trail)
    try {
      await addDoc(collection(db, "walletTransactions"), {
        tutorId,
        tutorName: window.currentTutorForPoints.name,
        tutorEmail: window.currentTutorForPoints.email,
        type: "admin_add",
        amount,
        reason,
        notes,
        timestamp: serverTimestamp(),
        addedBy: auth.currentUser.email,
      });
    } catch (e) {
      console.error("Error recording transaction:", e);
    }

    toast(`✅ ₹${amount} added to ${window.currentTutorForPoints.name}'s wallet`);
    addPointsOverlay.style.display = "none";
    await loadTutors();
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

// AUTH LISTENER
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    setLogoutVisible(false);
    showLogin();
    return;
  }
  setLogoutVisible(true);
  await renderAdmin();

  // Set up real-time listeners for tutors collection
  const tutorsQuery = query(collection(db, "tutors"));
  const unsubscribeTutors = onSnapshot(tutorsQuery, async (snapshot) => {
    if (window.tutorsLoaded) {
      await loadTutors();
    }
  }, (error) => {
    console.error("Tutors listener error:", error);
  });
  window.tutorsUnsubscribe = unsubscribeTutors;

  // Set up real-time listeners for students collection
  const studentsQuery = query(collection(db, "students"));
  const unsubscribeStudents = onSnapshot(studentsQuery, async (snapshot) => {
    if (window.studentsLoaded) {
      await loadStudents();
    }
  }, (error) => {
    console.error("Students listener error:", error);
  });
  window.studentsUnsubscribe = unsubscribeStudents;

  // Set up real-time listeners for withdrawal requests
  const withdrawalsQuery = query(collection(db, "withdrawalRequests"));
  const unsubscribeWithdrawals = onSnapshot(withdrawalsQuery, async (snapshot) => {
    if (window.withdrawalsLoaded) {
      await window.loadWithdrawals?.();
    }
  }, (error) => {
    console.error("Withdrawals listener error:", error);
  });
  window.withdrawalsUnsubscribe = unsubscribeWithdrawals;

  // ✅ LOAD PASSWORD RESET REQUESTS
  async function loadPasswordResets() {
    const list = $("passwordResetList");
    list.innerHTML = "<div class='muted'>Loading...</div>";
    
    try {
      const q = query(collection(db, "passwordResetRequests"), where("status", "==", "pending"));
      const snapshot = await getDocs(q);
      
      if (snapshot.empty) {
        list.innerHTML = "<div class='muted'>No pending password reset requests</div>";
        return;
      }
      
      let html = "<div style='display:flex;flex-direction:column;gap:10px;'>";
      
      snapshot.forEach((doc) => {
        const req = doc.data();
        const date = req.requestedAt ? new Date(req.requestedAt.toMillis()).toLocaleDateString() : "Unknown";
        const reason = req.reason || "Not provided";
        
        html += `
          <div style="background:#f9f9f9;padding:15px;border-radius:8px;border-left:4px solid #ff9900;">
            <div style="display:flex;justify-content:space-between;align-items:start;">
              <div style="flex:1;">
                <div><b>${req.userType.toUpperCase()}</b></div>
                <div class="muted" style="font-size:13px;">Email: ${req.email}</div>
                <div class="muted" style="font-size:13px;">Reason: ${reason}</div>
                <div class="muted" style="font-size:12px;">Requested: ${date}</div>
              </div>
              <button class="btnPro primary" data-approvepw="${doc.id}" data-uid="${req.uid}" data-type="${req.userType}" data-email="${req.email}" data-newpassword="${req.newPassword}">Review</button>
            </div>
          </div>
        `;
      });
      
      html += "</div>";
      list.innerHTML = html;
      
      // Attach approval handlers
      const buttons = list.querySelectorAll("[data-approvepw]");
      buttons.forEach(btn => {
        btn.onclick = async () => {
          const docId = btn.getAttribute("data-approvepw");
          const uid = btn.getAttribute("data-uid");
          const userType = btn.getAttribute("data-type");
          const email = btn.getAttribute("data-email");
          const newPassword = btn.getAttribute("data-newpassword");
          
          // Show password reset modal
          $("prUserType").innerText = userType.toUpperCase();
          $("prEmail").innerText = email;
          $("prDate").innerText = new Date().toLocaleDateString();
          $("prReason").innerText = "User requested password reset";
          $("newPasswordField").value = newPassword;
          
          window.currentPasswordResetId = docId;
          window.currentPasswordResetUid = uid;
          window.currentPasswordResetType = userType;
          $("passwordResetModal").style.display = "flex";
        };
      });
    } catch (err) {
      showErr(err);
      list.innerHTML = "<div class='muted'>Error loading password requests</div>";
    }
  }
  
  // Load password resets initially
  await loadPasswordResets();
  
  // ✅ PASSWORD RESET MODAL HANDLERS
  $("btnClosePasswordResetModal").onclick = () => {
    $("passwordResetModal").style.display = "none";
  };
  
  $("passwordResetModal").onclick = (e) => {
    if (e.target.id === "passwordResetModal") {
      $("passwordResetModal").style.display = "none";
    }
  };
  
  $("btnApprovePasswordReset").onclick = async () => {
    try {
      const newPassword = $("newPasswordField").value.trim();
      if (!newPassword) return toast("❌ No password to set");
      
      const docId = window.currentPasswordResetId;
      const uid = window.currentPasswordResetUid;
      const userType = window.currentPasswordResetType;
      
      // Update password reset request status
      await updateDoc(doc(db, "passwordResetRequests", docId), {
        status: "approved",
        approvedAt: serverTimestamp(),
      });
      
      // Update user's password in their account document
      const userCollection = userType === "tutor" ? "tutors" : "students";
      await updateDoc(doc(db, userCollection, uid), {
        password: newPassword, // Store in Firestore (should be hashed in production)
        passwordResetAt: serverTimestamp(),
      });
      
      toast("✅ Password reset approved! User's new password is now active.");
      $("passwordResetModal").style.display = "none";
      await loadPasswordResets();
    } catch (e) {
      showErr(e);
    }
  };
  
  $("btnRejectPasswordReset").onclick = async () => {
    try {
      const docId = window.currentPasswordResetId;
      
      await updateDoc(doc(db, "passwordResetRequests", docId), {
        status: "rejected",
        rejectedAt: serverTimestamp(),
      });
      
      toast("❌ Password reset request rejected");
      $("passwordResetModal").style.display = "none";
      await loadPasswordResets();
    } catch (e) {
      showErr(e);
    }
  };
  
  // Set up real-time listeners for password reset requests
  const passwordResetQuery = query(collection(db, "passwordResetRequests"));
  const unsubscribePasswordReset = onSnapshot(passwordResetQuery, async (snapshot) => {
    await loadPasswordResets();
  }, (error) => {
    console.error("Password reset listener error:", error);
  });
  window.passwordResetUnsubscribe = unsubscribePasswordReset;

  // Set up real-time listeners for payment requests
  const paymentsQuery = query(collection(db, "paymentRequests"));
  const unsubscribePayments = onSnapshot(paymentsQuery, async (snapshot) => {
    // Auto-refresh payments tab when data changes
    await loadPayments();
  }, (error) => {
    console.error("Payments listener error:", error);
  });
  window.paymentsUnsubscribe = unsubscribePayments;
});
