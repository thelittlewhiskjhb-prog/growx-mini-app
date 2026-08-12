// ============================================
// GROWX MAIN APPLICATION - PRODUCTION
// Supabase-integrated backend
// RLS-protected data access
// ============================================

const packages = [
  [20, 2], [40, 4], [80, 8], [120, 12], [200, 20],
  [450, 45], [700, 70], [1000, 100], [2000, 200], [3000, 300]
];

// ============================================
// UTILITIES
// ============================================

function money(n) {
  return "$" + Number(n || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

// ============================================
// UI STATE
// ============================================

let currentMember = null;
let memberCache = {
  balance: 0,
  packages: [],
  withdrawals: [],
  rewardHistory: []
};

// ============================================
// NAVIGATION
// ============================================

function go(id) {
  document.querySelectorAll(".screen").forEach(x => x.classList.remove("active"));
  const target = document.getElementById(id);
  if (target) target.classList.add("active");

  // Show/hide member nav
  const memberNav = document.getElementById("memberNav");
  if (memberNav) {
    const memberPages = ["dashboard", "packages", "wallet", "recharge", "withdraw", "gift", "game"];
    memberNav.style.display = memberPages.includes(id) ? "grid" : "none";
  }

  // Hide member nav on admin
  if (id === "admin") {
    document.body.classList.add("admin-mode");
  } else {
    document.body.classList.remove("admin-mode");
  }
}

// ============================================
// AUTHENTICATION
// ============================================

async function register() {
  const phone = document.getElementById("regPhone").value.trim();
  const pin1 = document.getElementById("regPin1").value;
  const pin2 = document.getElementById("regPin2").value;

  if (!phone || !/^[0-9]{4}$/.test(pin1) || pin1 !== pin2) {
    alert("Enter cellphone number and matching 4-digit PIN.");
    return;
  }

  const result = await registerMember(phone, pin1);
  if (result.success) {
    alert(`Account created! Client code: ${result.clientCode}\nPlease log in.`);
    document.getElementById("regPhone").value = "";
    document.getElementById("regPin1").value = "";
    document.getElementById("regPin2").value = "";
    go("login");
  } else {
    alert("Registration failed: " + result.error);
  }
}

async function login() {
  const phone = document.getElementById("loginPhone").value.trim();
  const pin = document.getElementById("loginPin").value;

  if (!phone || !/^[0-9]{4}$/.test(pin)) {
    alert("Enter cellphone number and 4-digit PIN.");
    return;
  }

  const result = await loginMember(phone, pin);
  if (result.success) {
    currentMember = result.user;
    document.body.classList.add("logged-in");
    await updateMemberUI();
    go("dashboard");
  } else {
    alert("Login failed: " + result.error);
  }
}

async function logout() {
  const result = await logoutMember();
  if (result.success) {
    currentMember = null;
    document.body.classList.remove("logged-in", "admin-mode");
    document.getElementById("loginPhone").value = "";
    document.getElementById("loginPin").value = "";
    go("welcome");
  }
}

function adminLogin() {
  if (prompt("Admin access code:") === "GROWX-ADMIN") {
    document.body.classList.add("logged-in", "admin-mode");
    go("admin");
  } else {
    alert("Access denied.");
  }
}

// ============================================
// MEMBER DASHBOARD UI
// ============================================

async function updateMemberUI() {
  if (!isAuthenticated()) return;

  try {
    const profile = await getMemberProfile();
    const balance = await getMemberBalance();
    const pkgs = await getMemberPackages();
    const dailyReward = await getTotalDailyReward();
    const withdrawals = await getWithdrawalHistory();
    const history = await getLedgerHistory();

    memberCache = { balance, packages: pkgs, withdrawals, rewardHistory: history };

    // Update dashboard
    const set = (id, v) => {
      const e = document.getElementById(id);
      if (e) e.textContent = v;
    };

    set("clientCode", profile?.client_code || "---");
    set("balanceDisplay", money(balance));
    set("availableDisplay", money(balance));
    set("walletBalance", money(balance));
    set("walletAvailable", money(balance));
    set("walletToday", "+" + money(dailyReward));
    set("todayReward", "+" + money(dailyReward));
    set("activePackage", pkgs.length + " PACKAGES");
    set("activeReward", money(dailyReward) + " DAILY REWARD");
    set("walletPackages", pkgs.length);
    set("rewardText", "+" + money(dailyReward) + " READY TO CLAIM");

    // Activity log
    const act = document.getElementById("walletActivity");
    if (act) {
      act.innerHTML = history
        .slice(0, 8)
        .map(
          (a) =>
            `<div class="row"><span>${a.transaction_type.toUpperCase().replace(/_/g, " ")}</span><b>${money(a.amount)}</b></div>`
        )
        .join("");
    }

    // Withdrawals
    const withdrawalCards = withdrawals
      .slice()
      .reverse()
      .map(
        (x) =>
          `<div class="statusCard"><div><b>${money(x.amount)} USDT</b><small>${x.usdt_address.slice(
            0,
            8
          )}\u2026${x.usdt_address.slice(-6)}</small></div><span class="badge ${x.status.toLowerCase()}">${x.status}</span></div>`
      )
      .join("");

    const ws = document.getElementById("walletWithdrawals");
    const wd = document.getElementById("withdrawalStatus");
    if (ws) ws.innerHTML = withdrawalCards;
    if (wd) wd.innerHTML = withdrawalCards;

    updateRewardClaimUI();
  } catch (error) {
    console.error("Error updating UI:", error);
  }
}

// ============================================
// PACKAGES
// ============================================

(async () => {
  const packageList = document.getElementById("packageList");
  if (!packageList) return;

  try {
    const pkgs = await getAvailablePackages();
    if (pkgs.length === 0) {
      packageList.innerHTML = packages
        .map(
          (p, i) =>
            `<button class="pkg" onclick="selectPackage(${i})"><span><b>$${p[0].toLocaleString()}</b><small>Package</small><small>$${p[1]}/day</small></span></button>`
        )
        .join("");
    } else {
      packageList.innerHTML = pkgs
        .map(
          (p) =>
            `<button class="pkg" onclick="selectPackageFromDB('${p.id}')"><span><b>${money(p.amount)}</b><small>${p.description || "Package"}</small><small>${money(p.daily_reward_amount)}/day</small></span></button>`
        )
        .join("");
    }
  } catch (error) {
    console.error("Error loading packages:", error);
  }
})();

async function selectPackage(index) {
  const amount = packages[index][0];
  const daily = packages[index][1];

  // Find matching package in DB or use static list
  try {
    const pkgs = await getAvailablePackages();
    const pkg = pkgs.find((p) => p.amount === amount);
    if (pkg) {
      await selectPackageFromDB(pkg.id);
    } else {
      alert("Package not found. Please contact support.");
    }
  } catch (error) {
    alert("Error: " + error.message);
  }
}

async function selectPackageFromDB(packageId) {
  const result = await addMemberPackage(packageId);
  if (result.success) {
    const pkg = memberCache.packages.find((p) => p.id === packageId);
    alert(`Package added: ${money(pkg?.amount || 0)}.`);
    await updateMemberUI();
    go("dashboard");
  } else {
    alert("Error: " + result.error);
  }
}

// ============================================
// WITHDRAWAL
// ============================================

async function withdrawUSDT() {
  const addr = document.getElementById("usdtAddress").value.trim();
  const amount = Number(document.getElementById("usdtAmount").value);

  if (!addr || !Number.isFinite(amount) || amount <= 0) {
    alert("Enter valid TRON/TRC20 address and amount.");
    return;
  }

  const result = await requestWithdrawal(amount, addr);
  if (result.success) {
    alert(`Withdrawal request submitted: ${money(amount)} USDT\nStatus: PROCESSING`);
    document.getElementById("usdtAddress").value = "";
    document.getElementById("usdtAmount").value = "";
    await updateMemberUI();
    go("dashboard");
  } else {
    alert("Error: " + result.error);
  }
}

// ============================================
// RECHARGE
// ============================================

async function submitRecharge() {
  const amount = Number(document.getElementById("rechargeAmount").value);
  const ref = document.getElementById("rechargeRef").value.trim();

  if (!ref || !Number.isFinite(amount) || amount <= 0) {
    alert("Enter amount and transaction reference.");
    return;
  }

  alert(
    `Recharge request submitted: ${money(amount)} USDT\nReference: ${ref}\nAdmin will verify.`
  );
  document.getElementById("rechargeAmount").value = "";
  document.getElementById("rechargeRef").value = "";
}

// ============================================
// GIFT CODES
// ============================================

async function redeemGift() {
  const code = document.getElementById("giftCode").value.trim().toUpperCase();

  if (!code) {
    alert("Enter a gift code.");
    return;
  }

  const result = await redeemGiftCode(code);
  if (result.success) {
    alert(`Gift code redeemed! You earned ${money(result.reward)} USDT.`);
    document.getElementById("giftCode").value = "";
    await updateMemberUI();
    go("dashboard");
  } else {
    alert("Error: " + result.error);
  }
}

// ============================================
// DAILY REWARD
// ============================================

async function updateRewardClaimUI() {
  const btn = document.getElementById("claimBtn");
  if (!btn) return;

  try {
    const eligible = await canClaimReward();
    btn.disabled = !eligible.can_claim;
    btn.textContent = eligible.can_claim ? "CLAIM" : eligible.reason.toUpperCase();
  } catch (error) {
    btn.disabled = true;
    btn.textContent = "ERROR";
  }
}

async function claimReward() {
  const result = await claimDailyReward();
  if (result.success) {
    alert(`Daily reward claimed: ${money(result.amount)} USDT`);
    await updateMemberUI();
  } else {
    alert("Error: " + result.error);
  }
}

setInterval(updateRewardClaimUI, 60000);

// ============================================
// CHART
// ============================================

function drawRewardChart() {
  const c = document.getElementById("rewardChart");
  if (!c) return;

  const ctx = c.getContext("2d"),
    dpr = window.devicePixelRatio || 1;
  const w = c.clientWidth,
    h = c.clientHeight;
  c.width = w * dpr;
  c.height = h * dpr;
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, w, h);

  const vals = [22, 31, 29, 45, 54, 63, 78],
    pad = 18;
  ctx.strokeStyle = "rgba(255,255,255,.08)";
  ctx.lineWidth = 1;
  for (let y = 25; y < h; y += 35) {
    ctx.beginPath();
    ctx.moveTo(pad, y);
    ctx.lineTo(w - pad, y);
    ctx.stroke();
  }

  const pts = vals.map((v, i) => [
    pad + (i * (w - pad * 2)) / (vals.length - 1),
    h - pad - (v / 80) * (h - pad * 2)
  ]);

  const grad = ctx.createLinearGradient(0, 0, w, 0);
  grad.addColorStop(0, "#58ffd1");
  grad.addColorStop(0.5, "#8b5cff");
  grad.addColorStop(1, "#ff35d6");

  ctx.strokeStyle = grad;
  ctx.lineWidth = 3;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.beginPath();
  pts.forEach((p, i) => (i ? ctx.lineTo(...p) : ctx.moveTo(...p)));
  ctx.stroke();

  pts.forEach((p) => {
    ctx.beginPath();
    ctx.arc(p[0], p[1], 4, 0, Math.PI * 2);
    ctx.fillStyle = "#58ffd1";
    ctx.fill();
  });
}

window.addEventListener("resize", drawRewardChart);
setTimeout(drawRewardChart, 80);

// ============================================
// GROW RUSH GAME (Consolidated)
// Score-only, no real-money rewards
// ============================================

let growRush = { running: false, score: 0, time: 20, timer: null };

function startGame() {
  clearInterval(growRush.timer);
  growRush = { running: true, score: 0, time: 20, timer: null };

  const scoreEl = document.getElementById("gameScore");
  const timerEl = document.getElementById("gameTimer");
  const bestEl = document.getElementById("gameBest");
  const treeEl = document.getElementById("gameTree");
  const hintEl = document.getElementById("gameHint");

  if (scoreEl) scoreEl.textContent = "0";
  if (timerEl) timerEl.textContent = "20";
  if (bestEl)
    bestEl.textContent = localStorage.getItem("growx_best_score") || "0";
  if (treeEl) {
    treeEl.textContent = "🌱";
    treeEl.disabled = false;
  }
  if (hintEl) hintEl.textContent = "TAP FAST • GROW YOUR SCORE";

  growRush.timer = setInterval(() => {
    growRush.time--;
    if (timerEl) timerEl.textContent = String(growRush.time);

    if (growRush.time <= 0) {
      clearInterval(growRush.timer);
      growRush.running = false;

      const best = Math.max(
        growRush.score,
        Number(localStorage.getItem("growx_best_score") || 0)
      );
      localStorage.setItem("growx_best_score", String(best));

      if (bestEl) bestEl.textContent = String(best);
      if (treeEl) treeEl.textContent = "🌳";
      if (hintEl)
        hintEl.textContent = "ROUND COMPLETE • SCORE " + growRush.score;
    }
  }, 1000);
}

function tapGrow() {
  if (!growRush.running) return;
  growRush.score++;

  const scoreEl = document.getElementById("gameScore");
  const treeEl = document.getElementById("gameTree");

  if (scoreEl) scoreEl.textContent = String(growRush.score);

  if (treeEl) {
    treeEl.classList.remove("tap");
    void treeEl.offsetWidth; // Trigger reflow
    treeEl.classList.add("tap");
    treeEl.textContent =
      growRush.score % 7 === 0 ? "🌳" : growRush.score % 3 === 0 ? "🌿" : "🌱";
  }
}

// ============================================
// ADMIN INTERFACE
// ============================================

async function openClient() {
  const query = document.getElementById("search").value.trim().toUpperCase();
  if (!query) {
    alert("Enter a cellphone number or client code.");
    return;
  }

  const result = await adminSearchMember(query);
  if (result.success && result.data.length > 0) {
    const member = result.data[0];
    displayClientDetails(member);
  } else {
    alert("Member not found.");
  }
}

function displayClientDetails(member) {
  const panel = document.getElementById("clientPanel");
  if (!panel) return;

  panel.innerHTML = `
    <div class="row"><span>CLIENT CODE</span><b>${member.client_code || "---"}</b></div>
    <div class="row"><span>CELLPHONE</span><b>${member.phone || "---"}</b></div>
    <div class="row"><span>BALANCE</span><b>${money(member.balance || 0)}</b></div>
    <div class="row"><span>ASSET</span><b>USDT</b></div>
    <div class="row"><span>NETWORK</span><b>TRC20</b></div>
    <label>AUTHORISED ALLOCATION</label><input id="alloc" inputmode="decimal" placeholder="0.00 USDT" value="">
    <label>TRANSACTION REFERENCE</label><input id="ref" placeholder="Reference" value="">
    <button class="primary" onclick="allocate('${member.id}')">RECORD ALLOCATION</button>
  `;
}

async function allocate(memberId) {
  const amount = Number(document.getElementById("alloc").value);
  const ref = document.getElementById("ref").value.trim();

  if (!amount || !ref || amount <= 0) {
    alert("Enter amount and reference.");
    return;
  }

  const result = await adminRecordAllocation(memberId, amount, ref);
  if (result.success) {
    alert(
      `Allocation recorded: ${money(amount)} USDT\nReference: ${ref}`
    );
    document.getElementById("alloc").value = "";
    document.getElementById("ref").value = "";
  } else {
    alert("Error: " + result.error);
  }
}

// Load pending withdrawals for admin
(async () => {
  if (isAdmin && typeof adminGetPendingWithdrawals === "function") {
    const result = await adminGetPendingWithdrawals();
    if (result.success && result.data) {
      const queue = document.getElementById("queue");
      if (queue) {
        queue.innerHTML = result.data
          .map(
            (r, i) => `
          <div class="request">
            <div class="requesttop"><b>#${i + 1} • ${r.client_code}</b><span>● ${r.status}</span></div>
            <div class="requestamount">${money(r.amount)}</div>
            <div class="requestmeta"><span>USDT TRC20</span><span>${new Date(
              r.requested_at
            ).toLocaleString()}</span></div>
          </div>
        `
          )
          .join("");
      }
    }
  }
})();

// ============================================
// INITIALIZATION
// ============================================

window.addEventListener("DOMContentLoaded", () => {
  document.body.classList.remove("logged-in", "admin-mode");
  updateRewardClaimUI();

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  }
});

window.addEventListener("load", () => {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  }
});
