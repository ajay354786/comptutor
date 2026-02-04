// Tutor Dashboard Logic
import { auth, db, toast, showErr, setLogoutVisible, safeText, getSettingsSafe, formatDate } from "./app.js";
import {
  doc,
  getDoc,
  collection,
  query,
  getDocs,
  serverTimestamp,
  updateDoc,
  where,
  addDoc,
  onSnapshot,
} from "https://www.gstatic.com/firebasejs/10.7.2/firebase-firestore.js";

const $ = (id) => document.getElementById(id);

const panel = $("tutorPanel");
const loadingCard = $("tutorLoadingCard");
const showDash = () => { 
  panel.style.display = "block";
  if (loadingCard) loadingCard.style.display = "none";
  setLogoutVisible(true);
};

function loadTutorDashboard(uid) {
  try {
    console.log("🔄 Starting tutor dashboard load for UID:", uid);
    
    // Set a timeout for the entire dashboard load
    const loadTimeout = setTimeout(() => {
      console.error("❌ TIMEOUT: Dashboard load took too long!");
      if (loadingCard) loadingCard.innerHTML = `
        <div style="text-align:center; padding:40px;">
          <div style="font-size:48px; margin-bottom:15px;">⏱️</div>
          <h3>Dashboard Load Timeout</h3>
          <p class="muted">The dashboard took too long to load. This might be a network issue.</p>
          <button class="btnPro primary" onclick="location.reload()">Retry Loading</button>
          <button class="btnPro ghost" onclick="location.href='tutor.html'" style="margin-left:10px;">Go to Login</button>
        </div>
      `;
    }, 30000); // 30 second timeout
    
    // First, try a direct fetch to verify document exists
    getDoc(doc(db, "tutors", uid))
      .then((snap) => {
        clearTimeout(loadTimeout); // Clear timeout on success
        console.log("✅ Direct fetch successful, exists:", snap.exists());
        
        if (!snap.exists()) {
          console.error("❌ Tutor document doesn't exist for UID:", uid);
          if (loadingCard) loadingCard.innerHTML = `
            <div style="text-align:center; padding:40px;">
              <div style="font-size:48px; margin-bottom:15px;">⚠️</div>
              <h3>Tutor Account Not Found</h3>
              <p class="muted">Your tutor account was not created properly. Please register first.</p>
              <p class="muted tiny">UID: ${uid}</p>
              <button class="btnPro primary" onclick="location.href='tutor.html'">Go to Register</button>
            </div>
          `;
          return;
        }

        console.log("✅ Tutor document verified:", snap.data());
        showDash();
        const t = snap.data();
        $("tutorStatus").innerText = "✅ Tutor Active";
        setupLiveTutorWallet(uid, t);

        // Now set up real-time listener for future updates
        const unsubscribe = onSnapshot(
          doc(db, "tutors", uid),
          (liveSnap) => {
            console.log("📡 Real-time update received on tutors doc. adminAddedBalance:", liveSnap.data()?.adminAddedBalance);
            if (liveSnap.exists()) {
              const updatedData = liveSnap.data();
              setupLiveTutorWallet(uid, updatedData);
            }
          },
          (error) => {
            console.error("❌ Real-time listener error:", error);
          }
        );
        
        window.tutorDashboardUnsub = unsubscribe;
      })
      .catch((error) => {
        clearTimeout(loadTimeout); // Clear timeout on error
        console.error("❌ Document fetch error:", error);
        if (loadingCard) loadingCard.innerHTML = `
          <div style="text-align:center; padding:40px;">
            <div style="font-size:48px; margin-bottom:15px;">❌</div>
            <h3>Error Loading Dashboard</h3>
            <p class="muted">${error.message}</p>
            <button class="btnPro primary" onclick="location.reload()">Retry</button>
            <button class="btnPro ghost" onclick="location.href='tutor.html'" style="margin-left:10px;">Login Again</button>
          </div>
        `;
      });
  } catch (e) {
    console.error("❌ Exception in loadTutorDashboard:", e);
    if (loadingCard) loadingCard.innerHTML = `
      <div style="text-align:center; padding:40px;">
        <div style="font-size:48px; margin-bottom:15px;">❌</div>
        <h3>Error Loading Dashboard</h3>
        <p class="muted">${e.message}</p>
        <button class="btnPro primary" onclick="location.href='tutor.html'">Go to Login</button>
      </div>
    `;
  }
}

// ✅ CALCULATE TOTAL DAILY EARNINGS FROM ACTIVE STUDENTS
function calculateTotalDailyEarnings(assignedStudents) {
  const DAILY_RATE = 26.67; // ₹800 / 30 days
  let totalDailyEarnings = 0;
  
  assignedStudents.forEach(studentDoc => {
    const s = studentDoc.data();
    if (!s.isActive || s.payoutCleared) return; // Skip inactive or completed students
    
    // Calculate days active
    let createdAt;
    if (s.createdAt && typeof s.createdAt.toDate === 'function') createdAt = s.createdAt.toDate();
    else if (s.createdAt instanceof Date) createdAt = s.createdAt;
    else createdAt = new Date(s.createdAt);
    
    const daysActive = Math.floor((Date.now() - createdAt.getTime()) / (24 * 60 * 60 * 1000));
    if (daysActive > 0 && daysActive < 30) {
      totalDailyEarnings += daysActive * DAILY_RATE;
    } else if (daysActive >= 30) {
      totalDailyEarnings += 800; // Full amount for 30+ days students
    }
  });
  
  return Math.round(totalDailyEarnings * 100) / 100;
}

// ✅ AUTO-GENERATE DAILY EARNING TRANSACTIONS
async function generateDailyEarningTransactions(uid, assignedStudents) {
  console.log("[DAILY EARNING] Checking for new daily earnings...", assignedStudents.length, "students");
  
  const DAILY_RATE = 26.67; // ₹800 / 30 days
  const dailyEarningsRef = collection(db, "walletTransactions");
  
  for (const studentDoc of assignedStudents) {
    const s = studentDoc.data();
    if (!s.isActive || s.payoutCleared) continue; // Skip inactive or paid students
    
    // Calculate days active
    let createdAt;
    if (s.createdAt && typeof s.createdAt.toDate === 'function') createdAt = s.createdAt.toDate();
    else if (s.createdAt instanceof Date) createdAt = s.createdAt;
    else createdAt = new Date(s.createdAt);
    
    const daysActive = Math.floor((Date.now() - createdAt.getTime()) / (24 * 60 * 60 * 1000));
    if (daysActive <= 0 || daysActive >= 30) continue; // Only days 1-29
    
    // Check if transaction for this day already exists
    const existingQuery = query(
      dailyEarningsRef,
      where("tutorId", "==", uid),
      where("studentId", "==", s.id),
      where("type", "==", "credit"),
      where("day", "==", daysActive)
    );
    
    const existingDocs = await getDocs(existingQuery);
    if (existingDocs.size > 0) {
      console.log(`[DAILY EARNING] Day ${daysActive} already exists for ${s.name}`);
      continue;
    }
    
    // Create new daily earning transaction
    try {
      const txnRef = await addDoc(dailyEarningsRef, {
        tutorId: uid,
        studentId: s.id,
        studentName: s.name,
        studentPhone: s.phone,
        type: "credit",
        category: "daily_student_earning",
        day: daysActive,
        amount: DAILY_RATE,
        reason: `Day ${daysActive} - ${safeText(s.name)} (₹${DAILY_RATE.toFixed(2)}/day)`,
        timestamp: new Date(),
        status: "completed",
        createdBy: "system"
      });
      console.log(`[DAILY EARNING] Created transaction for ${s.name}, Day ${daysActive}: ${txnRef.id}`);
    } catch (err) {
      console.error("[DAILY EARNING] Error creating transaction:", err);
    }
  }
}

// Live wallet updates function
function setupLiveTutorWallet(uid, tutorData) {
  // LIVE: Listen to withdrawal requests
  const wQ = query(collection(db, "withdrawalRequests"), where("tutorId", "==", uid));
  onSnapshot(wQ, (wSnap) => {
    // Get all transactions for reference (not displayed)
    const allTransactions = [];
    let pendingWithdrawalAmount = 0; // Calculate pending withdrawals
    
    wSnap.docs.forEach((d) => {
      const r = d.data();
      allTransactions.push({
        id: d.id,
        ...r,
      });
      // Add pending withdrawal amounts
      if (r.status === "pending") {
        pendingWithdrawalAmount += r.amount || 0;
      }
    });
    
    console.log(`[WITHDRAWAL REQUESTS] Total pending: ₹${pendingWithdrawalAmount}`);

    // LIVE: Listen to all students
    const sQ = query(collection(db, "students"));
    onSnapshot(sQ, (sSnap) => {
      // Filter students assigned to this tutor
      const assignedStudents = sSnap.docs.filter(d => d.data().assignedTutorId === uid);
      
      // Log for debugging
      console.log(`[TUTOR DASHBOARD SNAPSHOT] Received ${assignedStudents.length} assigned students:`, assignedStudents.map(d => ({
        name: d.data().name,
        isActive: d.data().isActive,
        payoutCleared: d.data().payoutCleared,
        createdAt: d.data().createdAt?.toDate?.()
      })));
      
      // Available Withdrawal Balance: do NOT auto-add pro-rata or 30-day amounts.
      // Only use admin-added balance so admin controls actual withdrawable funds.
      const adminAddedBalance = tutorData.adminAddedBalance || 0;
      let walletBalance = Math.round(adminAddedBalance * 100) / 100;
      
      // IMPORTANT: Deduct pending withdrawals from available balance
      const availableBalance = Math.max(0, Math.round((walletBalance - pendingWithdrawalAmount) * 100) / 100);
      
      console.log(`[TUTOR DASHBOARD] adminAddedBalance: ${adminAddedBalance}, pending: ${pendingWithdrawalAmount}, available: ${availableBalance}`);

      // Keep track of students who completed 30 days (for display only)
      const completedThirtyDaysStudents = [];
      try {
        const dailyRate = 800 / 30; // kept for informational/legacy use only
        assignedStudents.forEach(studentDoc => {
          const s = studentDoc.data();
          if (!s.isActive) return;
          let studentCreatedAt;
          if (s.createdAt && typeof s.createdAt.toDate === 'function') studentCreatedAt = s.createdAt.toDate();
          else if (s.createdAt instanceof Date) studentCreatedAt = s.createdAt;
          else studentCreatedAt = new Date(s.createdAt);
          const daysActive = Math.floor((Date.now() - studentCreatedAt.getTime()) / (24 * 60 * 60 * 1000));
          if (daysActive >= 30 && !s.payoutCleared) completedThirtyDaysStudents.push(s);
        });
      } catch (err) {
        console.error('Error computing completedThirtyDaysStudents', err);
      }
      
      // Exclude students already paid-out (payoutCleared) from payout calculations
      const activeStudents = assignedStudents.filter(d => d.data().isActive === true && !d.data().payoutCleared);
      
      // ✅ CALCULATE TOTAL DAILY EARNINGS FROM ACTIVE STUDENTS
      const totalDailyEarnings = calculateTotalDailyEarnings(assignedStudents);
      const totalWalletBalance = Math.round((availableBalance + totalDailyEarnings) * 100) / 100;
      
      // LIVE UPDATE: Display wallet values
      $("walletBalance").innerText = totalWalletBalance.toFixed(2);
      
      // Store transactions and students for handlers
      window.tutorTransactions = allTransactions;
      window.completedThirtyDaysStudents = completedThirtyDaysStudents;
      window.tutorWalletBalance = totalWalletBalance;
      window.tutorAvailableBalance = availableBalance;
      window.tutorAdminAddedBalance = walletBalance;
      window.tutorPendingWithdrawal = pendingWithdrawalAmount;
      window.tutorDailyEarnings = totalDailyEarnings;
      window.tutorAssignedStudents = assignedStudents;
      window.tutorActiveStudents = activeStudents;
      
      // Setup Bank Account Info
      setupBankAccountInfo(uid, tutorData);
      
      // Setup Payment Methods
      setupPaymentMethods(uid, tutorData);
      
      // ✅ REBUILD ASSIGNED STUDENTS LIST EACH TIME DATA CHANGES
      renderAssignedStudentsList(assignedStudents);
      
      // ✅ AUTO-GENERATE DAILY EARNING TRANSACTIONS (check every snapshot)
      generateDailyEarningTransactions(uid, assignedStudents);
      
      // ✅ Setup all modal handlers with current scope
      setupWithdrawalAndTransactionHandlers(uid, tutorData, walletBalance, wSnap, allTransactions, assignedStudents, activeStudents, completedThirtyDaysStudents);
    });
  });
}

// Setup bank account display and handlers
function setupBankAccountInfo(uid, t) {
  // Load bank account info
  if (t.bankAccount && t.bankAccount.accountNumber) {
    $("bankAccountInfo").innerHTML = `
      <b>${safeText(t.bankAccount.holderName)}</b><br/>
      <span class="muted">Bank:</span> ${safeText(t.bankAccount.bankName)}<br/>
      <span class="muted">Account:</span> XXXX-XXXX-${t.bankAccount.accountNumber.slice(-4)}<br/>
      <span class="muted">IFSC:</span> ${safeText(t.bankAccount.ifsc)}<br/>
      <button class="btnPro primary" style="width:100%;margin-top:8px;" id="btnEditBankAccount">Edit Account</button>
    `;
    $("btnEditBankAccount").onclick = () => {
      $("bankAccountModal").style.display = "flex";
      $("bankHolderName").value = t.bankAccount.holderName;
      $("bankName").value = t.bankAccount.bankName;
      $("bankAccount").value = t.bankAccount.accountNumber;
      $("bankIFSC").value = t.bankAccount.ifsc;
    };
    // Hide Add Bank Account button if bank account already exists
    $("btnAddBankAccount").style.display = "none";
  } else {
    $("bankAccountInfo").innerHTML = `<p class="muted">No bank account added yet</p>`;
    // Show Add Bank Account button if no account exists
    $("btnAddBankAccount").style.display = "block";
  }
}

// Setup payment methods display and handlers
function setupPaymentMethods(uid, t) {
  // Display payment methods
  const paymentMethods = t.paymentMethods || [];
  let pmHtml = '';
  
  if (paymentMethods.length > 0) {
    paymentMethods.forEach((pm, index) => {
      let display = '';
      if (pm.type === 'upi') {
        display = `📱 UPI: ${safeText(pm.value)} (${safeText(pm.name)})`;
      } else if (pm.type === 'phone') {
        display = `📞 Phone/GPay: ${safeText(pm.value)} (${safeText(pm.name)})`;
      } else if (pm.type === 'paypal') {
        display = `💳 PayPal: ${safeText(pm.value)} (${safeText(pm.name)})`;
      }
      pmHtml += `<div style="background:#f9f9f9;padding:8px;border-radius:4px;margin-bottom:6px;display:flex;justify-content:space-between;align-items:center;">
        <span>${display}</span>
        <div style="display:flex;gap:4px;">
          <button class="btnPro primary" style="padding:4px 8px;font-size:12px;" data-editpm="${index}">Edit</button>
          <button class="btnPro dark" style="padding:4px 8px;font-size:12px;" data-deletepm="${index}">Delete</button>
        </div>
      </div>`;
    });
    $("paymentMethodsInfo").innerHTML = pmHtml;
    
    // Delete and Edit payment method handler
    $("paymentMethodsInfo").onclick = async (e) => {
      const deleteIdx = e.target.getAttribute("data-deletepm");
      const editIdx = e.target.getAttribute("data-editpm");
      
      if (deleteIdx !== null && deleteIdx !== undefined) {
        try {
          const tutorSnap = await getDoc(doc(db, "tutors", uid));
          const tutorData = tutorSnap.data();
          const currentMethods = tutorData.paymentMethods || [];
          
          const indexToDelete = parseInt(deleteIdx);
          currentMethods.splice(indexToDelete, 1);
          
          await updateDoc(doc(db, "tutors", uid), {
            paymentMethods: currentMethods,
          });
          toast("✅ Payment method deleted");
        } catch (err) {
          showErr(err);
        }
      } else if (editIdx !== null && editIdx !== undefined) {
        const tutorSnap = await getDoc(doc(db, "tutors", uid));
        const tutorData = tutorSnap.data();
        const currentMethods = tutorData.paymentMethods || [];
        
        const indexToEdit = parseInt(editIdx);
        const pmToEdit = currentMethods[indexToEdit];
        
        $("paymentMethodModal").style.display = "flex";
        $("pmType").value = pmToEdit.type;
        $("pmValue").value = pmToEdit.value;
        $("pmName").value = pmToEdit.name;
        
        // Trigger onchange to update labels
        $("pmType").dispatchEvent(new Event('change'));
        
        // Store the index being edited
        window.editingPaymentMethodIndex = indexToEdit;
      }
    };
    // Hide Add Payment Method button if payment methods already exist
    $("btnAddPaymentMethod").style.display = "none";
  } else {
    $("paymentMethodsInfo").innerHTML = `<p class="muted" style="margin:0;">No payment methods added yet</p>`;
    // Show Add Payment Method button if no methods exist
    $("btnAddPaymentMethod").style.display = "block";
  }
}

// ✅ RENDER ASSIGNED STUDENTS LIST - Called each time data updates to show current status
function renderAssignedStudentsList(assignedStudents) {
  const list = $("assignedStudents");
  list.innerHTML = "";

  if (assignedStudents.length === 0) {
    list.innerHTML = `<div class="muted">No students assigned yet</div>`;
    return;
  }

  assignedStudents.forEach((d) => {
    const s = d.data();
    const div = document.createElement("div");
    div.className = "item";

    // compute created/assigned date safely
    let assignedDate = "Unknown";
    let daysActive = 0;
    let isExpired = false;
    
    try {
      if (s.createdAt && typeof s.createdAt.toDate === 'function') assignedDate = formatDate(s.createdAt.toDate());
      else if (s.createdAt instanceof Date) assignedDate = formatDate(s.createdAt);
      else if (typeof s.createdAt === 'string') assignedDate = formatDate(new Date(s.createdAt));
      
      // Calculate if student is 30+ days old
      let studentCreatedAt;
      if (s.createdAt && typeof s.createdAt.toDate === 'function') studentCreatedAt = s.createdAt.toDate();
      else if (s.createdAt instanceof Date) studentCreatedAt = s.createdAt;
      else studentCreatedAt = new Date(s.createdAt);
      daysActive = Math.floor((Date.now() - studentCreatedAt.getTime()) / (24 * 60 * 60 * 1000));
      isExpired = daysActive >= 30 && !s.payoutCleared;
      
      console.log(`[STUDENT LIST] ${s.name}: daysActive=${daysActive}, payoutCleared=${s.payoutCleared}, isExpired=${isExpired}, isActive=${s.isActive}`);
    } catch (err) { console.error('Error formatting createdAt', err); }

    // Determine status with EXPIRED badge
    let statusText = "ACTIVE ✅";
    let statusColor = "#00cc00";
    const payoutClearedStatus = s.payoutCleared === true; // Explicitly check for true
    
    if (!s.isActive) {
      statusText = "NOT ACTIVE ❌";
      statusColor = "#ff6b6b";
    } else if (isExpired) {
      statusText = "🔴 EXPIRED (Pending Approval)";
      statusColor = "#ff9800";
    } else if (payoutClearedStatus) {
      statusText = "✅ APPROVED (₹800 paid)";
      statusColor = "#0066ff";
    }

    div.innerHTML = `
      <b>${safeText(s.name)}</b><br/>
      <span class="muted">Phone:</span> ${safeText(s.phone)}<br/>
      <span class="muted">Email:</span> ${safeText(s.email)}<br/>
      <span class="muted">Status:</span> <span style="color:${statusColor};">${statusText}</span><br/>
      <span class="muted">Assigned:</span> ${assignedDate}<br/>
      <span class="muted">Active Days:</span> <strong style="color:#0066ff;">${Math.min(daysActive, 30)}/30</strong>
      ${daysActive > 0 ? `<div style="background:#e8e8e8;height:6px;border-radius:3px;margin:6px 0;overflow:hidden;"><div style="background:#${daysActive >= 30 ? 'ff9800' : '4c63ff'};height:100%;width:${Math.min((daysActive / 30) * 100, 100)}%;"></div></div>` : ''}
      ${daysActive > 0 && daysActive < 30 ? `<span class="muted" style="font-size:11px;">💰 Daily earning: ₹26.67/day (₹${(daysActive * 26.67).toFixed(2)} earned)</span>` : ''}
      ${daysActive >= 30 && !s.payoutCleared ? `<span class="muted" style="font-size:11px;color:#ff9800;font-weight:bold;">⚠️ Ready for approval: Full ₹800 available</span>` : ''}
      ${daysActive >= 30 && s.payoutCleared ? `<span class="muted" style="font-size:11px;color:#0066ff;font-weight:bold;">✅ Approved: ₹800 paid</span>` : ''}
    `;
    list.appendChild(div);
  });
}

// Setup withdrawal requests and transaction handlers
function setupWithdrawalAndTransactionHandlers(uid, t, walletBalance, wSnap, allTransactions, assignedStudents, activeStudents, completedThirtyDaysStudents) {
  // ✅ BANK ACCOUNT MODAL
  $("btnAddBankAccount").onclick = () => {
    $("bankAccountModal").style.display = "flex";
    $("bankHolderName").value = "";
    $("bankName").value = "";
    $("bankAccount").value = "";
    $("bankIFSC").value = "";
  };

  // ✅ PAYMENT METHOD MODAL
  $("pmType").onchange = function() {
    const type = this.value;
    if (type === 'upi') {
      $("pmLabelValue").textContent = 'UPI ID';
      $("pmLabelName").textContent = 'UPI Holder Name';
      $("pmValue").placeholder = 'upi@bank';
    } else if (type === 'phone') {
      $("pmLabelValue").textContent = 'Phone Number';
      $("pmLabelName").textContent = 'Phone Holder Name';
      $("pmValue").placeholder = '9876543210';
    } else if (type === 'paypal') {
      $("pmLabelValue").textContent = 'PayPal Email';
      $("pmLabelName").textContent = 'PayPal Account Name';
      $("pmValue").placeholder = 'email@paypal.com';
    }
  };

  $("btnAddPaymentMethod").onclick = () => {
    $("paymentMethodModal").style.display = "flex";
    $("pmType").value = "";
    $("pmValue").value = "";
    $("pmName").value = "";
    $("pmLabelValue").textContent = 'UPI ID';
    $("pmLabelName").textContent = 'UPI Holder Name';
    $("pmValue").placeholder = 'upi@bank';
  };

  $("btnClosePaymentModal").onclick = () => {
    $("paymentMethodModal").style.display = "none";
    delete window.editingPaymentMethodIndex;
  };

  $("paymentMethodModal").onclick = (e) => {
    if (e.target.id === "paymentMethodModal") {
      $("paymentMethodModal").style.display = "none";
    }
  };

  $("btnSavePaymentMethod").onclick = async () => {
    const type = $("pmType").value;
    const value = $("pmValue").value.trim();
    const name = $("pmName").value.trim();

    if (!type || !value || !name) {
      toast("❌ Fill all fields");
      return;
    }

    try {
      const tutorSnap = await getDoc(doc(db, "tutors", auth.currentUser.uid));
      const tutorData = tutorSnap.data();
      const currentMethods = tutorData.paymentMethods || [];
      
      if (window.editingPaymentMethodIndex !== undefined) {
        currentMethods[window.editingPaymentMethodIndex] = { type, value, name };
        toast("✅ Payment method updated");
        delete window.editingPaymentMethodIndex;
      } else {
        currentMethods.push({ type, value, name });
        toast("✅ Payment method added");
      }

      await updateDoc(doc(db, "tutors", auth.currentUser.uid), {
        paymentMethods: currentMethods,
      });

      $("paymentMethodModal").style.display = "none";
      await loadTutorDashboard(auth.currentUser.uid);
    } catch (err) {
      showErr(err);
    }
  };

  // ✅ BANK ACCOUNT MODAL CLOSE
  $("btnCloseBankModal").onclick = () => {
    $("bankAccountModal").style.display = "none";
  };

  $("bankAccountModal").onclick = (e) => {
    if (e.target === $("bankAccountModal")) $("bankAccountModal").style.display = "none";
  };

  $("btnSaveBankAccount").onclick = async () => {
    try {
      const holderName = $("bankHolderName").value.trim();
      const bankName = $("bankName").value.trim();
      const accountNumber = $("bankAccount").value.trim();
      const ifsc = $("bankIFSC").value.trim();
      if (!holderName || !bankName || !accountNumber || !ifsc) return toast("All fields required");

      await updateDoc(doc(db, "tutors", uid), {
        bankAccount: { holderName, bankName, accountNumber, ifsc, verified: false },
      });
      toast("✅ Bank account saved");
      $("bankAccountModal").style.display = "none";
      await loadTutorDashboard(uid);
    } catch (e) {
      showErr(e);
    }
  };

  // ✅ WITHDRAWAL AMOUNT CALCULATOR
  $("withdrawalAmount").oninput = () => {
    const amount = parseInt($("withdrawalAmount").value) || 0;
    const availableBalance = window.tutorAvailableBalance || 0;
    
    if (amount < 1) {
      $("withdrawalInfo").innerText = "Enter amount to see details";
    } else if (amount > availableBalance) {
      $("withdrawalInfo").innerText = `❌ Insufficient balance. Available: ₹${Math.floor(availableBalance)}`;
    } else {
      $("withdrawalInfo").innerText = `✅ Withdrawal amount: ₹${amount} (No fees • Direct to bank • Instant processing)`;
    }
  };

  // ✅ WITHDRAWAL REQUEST MODAL
  $("btnRequestWithdrawal").onclick = () => {
    const hasBank = t.bankAccount && t.bankAccount.accountNumber;
    const hasPaymentMethod = t.paymentMethods && t.paymentMethods.length > 0;
    
    if (!hasBank && !hasPaymentMethod) {
      return toast("❌ Add bank account or payment method (UPI/GPay) first");
    }
    $("withdrawalModal").style.display = "flex";
    $("withdrawalAmount").value = "";
    $("withdrawalInfo").innerText = "Enter amount to see details";
  };

  $("btnCloseWithdrawalModal").onclick = () => {
    $("withdrawalModal").style.display = "none";
  };

  $("withdrawalModal").onclick = (e) => {
    if (e.target === $("withdrawalModal")) $("withdrawalModal").style.display = "none";
  };

  $("btnConfirmWithdrawal").onclick = async () => {
    try {
      const amount = parseInt($("withdrawalAmount").value) || 0;
      if (amount < 1) return toast("❌ Enter a valid amount");
      
      const availableBalance = window.tutorAvailableBalance || 0;
      if (amount > availableBalance) return toast(`❌ Insufficient available balance. You have ₹${Math.floor(availableBalance)} available.`);

      const withdrawalData = {
        tutorId: uid,
        tutorName: t.name,
        tutorEmail: t.email,
        amount,
        status: "pending",
        requestedAt: serverTimestamp(),
      };

      // Add payment method details (either bank account or UPI/GPay)
      if (t.bankAccount && t.bankAccount.accountNumber) {
        withdrawalData.bankAccount = {
          holderName: t.bankAccount.holderName,
          bankName: t.bankAccount.bankName,
          accountNumber: t.bankAccount.accountNumber,
          ifsc: t.bankAccount.ifsc,
        };
      } else if (t.paymentMethods && t.paymentMethods.length > 0) {
        withdrawalData.paymentMethod = t.paymentMethods[0]; // Use first payment method
      }

      await addDoc(collection(db, "withdrawalRequests"), withdrawalData);

      toast("✅ Withdrawal request submitted. Amount reserved.");
      $("withdrawalModal").style.display = "none";
      $("withdrawalAmount").value = "";
      
      // Reload dashboard to update pending balance
      setTimeout(async () => {
        await loadTutorDashboard(uid);
      }, 500);
    } catch (e) {
      showErr(e);
    }
  };

  // ✅ LOAD WITHDRAWAL REQUESTS
  const requestsList = $("withdrawalRequestsList");
  requestsList.innerHTML = "";

  if (wSnap.docs.length === 0) {
    requestsList.innerHTML = `<div class="muted">No withdrawal requests yet</div>`;
  } else {
    wSnap.docs.forEach((d) => {
      const r = d.data();
      const statusColor = r.status === "approved" ? "#00cc00" : r.status === "rejected" ? "#ff4444" : "#0066ff";
      const div = document.createElement("div");
      div.className = "item";
      div.innerHTML = `
        <div style="display:flex;justify-content:space-between;">
          <div>
            <b>₹${r.amount}</b><br/>
            <span class="muted">Status: <span style="color:${statusColor};font-weight:bold;">${r.status.toUpperCase()}</span></span><br/>
            <span class="muted">${new Date(r.requestedAt?.toMillis?.()).toLocaleDateString()}</span>
          </div>
        </div>
      `;
      requestsList.appendChild(div);
    });
  }
  
  // Available Balance Click Handler
  $("availableBalanceClickable").onclick = () => {
    const adminBalance = window.tutorAdminAddedBalance || 0;
    const dailyEarnings = window.tutorDailyEarnings || 0;
    const pendingWithdrawal = window.tutorPendingWithdrawal || 0;
    const availableBalance = window.tutorAvailableBalance || 0;
    const totalWithPending = adminBalance + dailyEarnings;
    
    const breakdownHtml = `
      <div style="background:linear-gradient(135deg,#f0f9ff,#e8f5ff);border:2px solid #4c63ff;border-radius:12px;padding:16px;margin-bottom:15px;">
        <div style="font-size:13px;color:#666;line-height:1.8;margin-bottom:12px;">
          <div style="display:flex;justify-content:space-between;margin-bottom:8px;">
            <span>Admin Added Balance:</span>
            <span style="font-weight:bold;color:#0066ff;">₹${adminBalance.toFixed(2)}</span>
          </div>
          <div style="display:flex;justify-content:space-between;margin-bottom:8px;">
            <span>Daily Earnings:</span>
            <span style="font-weight:bold;color:#00cc00;">₹${dailyEarnings.toFixed(2)}</span>
          </div>
          <div style="display:flex;justify-content:space-between;margin-bottom:12px;padding-bottom:12px;border-bottom:2px solid #ddd;">
            <span><b>Gross Balance:</b></span>
            <span style="font-weight:bold;color:#4c63ff;">₹${totalWithPending.toFixed(2)}</span>
          </div>
          ${pendingWithdrawal > 0 ? `
          <div style="display:flex;justify-content:space-between;margin-bottom:12px;padding:10px;background:#fff5f0;border-left:4px solid #ff9900;border-radius:4px;">
            <span style="color:#ff6b35;">⏳ Pending Withdrawal:</span>
            <span style="font-weight:bold;color:#ff6b35;">-₹${pendingWithdrawal.toFixed(2)}</span>
          </div>
          ` : ''}
          <div style="display:flex;justify-content:space-between;padding-top:12px;border-top:2px solid #0066ff;">
            <span style="font-size:15px;"><b>Available to Withdraw:</b></span>
            <span style="font-size:15px;font-weight:bold;color:#0066ff;">₹${availableBalance.toFixed(2)}</span>
          </div>
        </div>
      </div>
    `;
    
    $("modalAvailableBalance").innerHTML = breakdownHtml;
    
    // Update breakdown values
    $("walletAdminBalance").innerText = adminBalance.toFixed(2);
    $("walletDailyEarnings").innerText = dailyEarnings.toFixed(2);
    
    const studentList = $("availableBalanceStudentList");
    studentList.innerHTML = "";
    
    // Show all active students with daily earnings breakdown
    const allStudentsWithEarnings = window.tutorAssignedStudents.filter(d => d.data().isActive && !d.data().payoutCleared);
    
    if (allStudentsWithEarnings.length === 0) {
      studentList.innerHTML = `<div class="muted" style="text-align:center;padding:20px;">No active students yet</div>`;
    } else {
      allStudentsWithEarnings.forEach((studentDoc) => {
        const s = studentDoc.data();
        try {
          let createdAt;
          if (s.createdAt && typeof s.createdAt.toDate === 'function') {
            createdAt = s.createdAt.toDate();
          } else if (s.createdAt instanceof Date) {
            createdAt = s.createdAt;
          } else {
            createdAt = new Date(s.createdAt);
          }
          
          const daysActive = Math.floor((Date.now() - createdAt.getTime()) / (24 * 60 * 60 * 1000));
          const dailyRate = 800 / 30;
          const dailyEarning = Math.min(daysActive, 30) * dailyRate;
          
          const div = document.createElement("div");
          div.className = "item";
          div.style.borderLeft = "4px solid #4c63ff";
          div.style.background = "#f8f9fb";
          div.style.marginBottom = "10px";
          div.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:start;gap:12px;">
              <div style="flex:1;">
                <div style="font-size:15px;font-weight:bold;margin-bottom:4px;color:#111;">📚 ${safeText(s.name)}</div>
                <div class="muted" style="font-size:12px;margin-bottom:8px;">
                  📞 ${safeText(s.phone)}
                </div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;font-size:12px;margin-bottom:8px;">
                  <div style="background:white;padding:8px;border-radius:6px;border-left:3px solid #4c63ff;">
                    <div class="muted" style="font-size:10px;margin-bottom:3px;">Days Active</div>
                    <div style="font-weight:bold;color:#4c63ff;font-size:14px;">${daysActive}/30</div>
                  </div>
                  <div style="background:white;padding:8px;border-radius:6px;border-left:3px solid #00cc00;">
                    <div class="muted" style="font-size:10px;margin-bottom:3px;">Earning</div>
                    <div style="font-weight:bold;color:#00cc00;font-size:14px;">₹${dailyEarning.toFixed(2)}</div>
                  </div>
                </div>
                <div style="background:linear-gradient(90deg,#e8f5ff,#f0f9ff);padding:8px;border-radius:6px;border-left:3px solid #0066ff;">
                  <div style="font-size:11px;color:#666;">₹26.67/day × ${Math.min(daysActive, 30)} days = <b style="color:#0066ff;">₹${dailyEarning.toFixed(2)}</b></div>
                </div>
              </div>
            </div>
          `;
          studentList.appendChild(div);
        } catch (err) {
          console.error("Error displaying student:", err);
        }
      });
    }
    
    $("availableBalanceModal").style.display = "flex";
  };
  
  // Close available balance modal
  $("btnCloseAvailableBalanceModal").onclick = () => {
    $("availableBalanceModal").style.display = "none";
  };
  
  $("availableBalanceModal").onclick = (e) => {
    if (e.target.id === "availableBalanceModal") {
      $("availableBalanceModal").style.display = "none";
    }
  };
  
}

// ✅ LOGOUT BUTTON HANDLER
$("logoutBtn").onclick = async () => {
  try {
    await auth.signOut();
    toast("✅ Logged out successfully");
    window.location.href = "tutor.html";
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

// Auth check and load dashboard if logged in
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.2/firebase-auth.js";

onAuthStateChanged(auth, async (user) => {
  console.log("👤 Auth state changed, user:", user?.uid);
  
  if (!user) {
    // Not logged in, redirect to tutor.html
    console.log("❌ No user found, redirecting to tutor.html");
    window.location.href = "tutor.html";
    return;
  }
  
  console.log("✅ User found, loading dashboard for UID:", user.uid);
  
  // Load dashboard - this handles all listeners and updates
  loadTutorDashboard(user.uid);
});
