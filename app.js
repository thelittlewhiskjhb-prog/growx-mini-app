// ============================================
// GROWX MAIN APPLICATION
// Supabase-integrated with Auth & RLS
// ============================================

const packages = [
  [20,2],[40,4],[80,8],[120,12],[200,20],[450,45],[700,70],[1000,100],[2000,200],[3000,300]
];

function money(n){return "$"+Number(n||0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2});}

// UI STATE
let currentMember = null;
let memberBalanceCache = 0;
let memberPackagesCache = [];
let memberActivityCache = [];

/**
 * NAVIGATION
 */
function go(id){
  document.querySelectorAll(".screen").forEach(x=>x.classList.remove("active"));
  const target=document.getElementById(id);
  if(target)target.classList.add("active");
  const memberPages=["dashboard","packages","wallet","recharge","withdraw","gift","game"];
  const adminVisible=id==="admin";
  document.body.classList.toggle("admin-active",adminVisible);
}

/**
 * AUTHENTICATION FLOWS
 */
async function register(){
  const phone = document.getElementById("regPhone").value.trim();
  const pin1 = document.getElementById("regPin1").value;
  const pin2 = document.getElementById("regPin2").value;
  
  if(!phone || !/^[0-9]{4}$/.test(pin1) || pin1 !== pin2) {
    alert("Enter cellphone number and matching 4-digit PIN.");
    return;
  }
  
  const result = await registerMember(phone, pin1);
  if(result.success) {
    alert("Account created successfully! Please log in.");
    document.getElementById("regPhone").value = "";
    document.getElementById("regPin1").value = "";
    document.getElementById("regPin2").value = "";
    go("login");
  } else {
    alert("Registration failed: " + result.error);
  }
}

async function login(){
  const phone = document.getElementById("loginPhone").value.trim();
  const pin = document.getElementById("loginPin").value;
  
  if(!phone || !/^[0-9]{4}$/.test(pin)) {
    alert("Enter cellphone number and 4-digit PIN.");
    return;
  }
  
  const result = await loginMember(phone, pin);
  if(result.success) {
    currentMember = result.user;
    document.body.classList.add("logged-in");
    await updateMemberUI();
    go("dashboard");
  } else {
    alert("Login failed: " + result.error);
  }
}

async function logout(){
  const result = await logoutMember();
  if(result.success) {
    currentMember = null;
    document.body.classList.remove("logged-in");
    document.getElementById("loginPhone").value = "";
    document.getElementById("loginPin").value = "";
    go("welcome");
  }
}

/**
 * ADMIN LOGIN (simple PIN-based for demo)
 */
function adminLogin(){
  if(prompt("Admin access code:")==="GROWX-ADMIN") {
    document.body.classList.add("logged-in", "admin-active");
    go("admin");
  } else {
    alert("Access denied.");
  }
}

/**
 * UPDATE MEMBER UI
 */
async function updateMemberUI(){
  if(!isAuthenticated()) return;
  
  try {
    // Fetch fresh data from Supabase
    const profile = await getMemberProfile();
    const balance = await getMemberBalance();
    const packages = await getMemberPackages();
    const dailyReward = await getTotalDailyReward();
    const activity = await getActivityHistory();
    const withdrawals = await getWithdrawalHistory();
    
    memberBalanceCache = balance;
    memberPackagesCache = packages;
    memberActivityCache = activity;
    
    // Update UI elements
    const set = (id, v) => {
      const e = document.getElementById(id);
      if(e) e.textContent = v;
    };
    
    set("clientCode", profile?.client_code || "---");
    set("balanceDisplay", money(balance));
    set("availableDisplay", money(balance));
    set("walletBalance", money(balance));
    set("walletAvailable", money(balance));
    set("walletToday", "+" + money(dailyReward));
    set("todayReward", "+" + money(dailyReward));
    set("activePackage", packages.length + " PACKAGES");
    set("activeReward", money(dailyReward) + " DAILY REWARD");
    set("walletPackages", packages.length);
    set("rewardText", "+" + money(dailyReward) + " READY TO CLAIM");
    
    // Update activity log
    const act = document.getElementById("walletActivity");
    if(act) {
      act.innerHTML = activity.slice(0, 8).map(a => 
        `<div class="row"><span>✦ ${a.action_type.toUpperCase().replace(/_/g, ' ')}</span><b>${money(a.details?.amount || 0)}</b></div>`
      ).join("");
    }
    
    // Update withdrawals
    const withdrawalCards = withdrawals.slice().reverse().map(x => 
      `<div class="statusCard"><div><b>${money(x.amount)} USDT</b><small>${x.usdt_address.slice(0, 8)}…${x.usdt_address.slice(-6)}</small></div><span class="badge ${x.status}">${x.status.toUpperCase()}</span></div>`
    ).join("");
    
    const ws = document.getElementById("walletWithdrawals");
    const wd = document.getElementById("withdrawalStatus");
    if(ws) ws.innerHTML = withdrawalCards;
    if(wd) wd.innerHTML = withdrawalCards;
    
    updateRewardClaimUI();
  } catch(error) {
    console.error("Error updating UI:", error);
  }
}

/**
 * PACKAGES
 */
const packageList = document.getElementById("packageList");
if(packageList) {
  packageList.innerHTML = packages.map((p, i) => 
    `<button class="pkg" onclick="selectPackage(${i})"><span><b>$${p[0].toLocaleString()}</b><small>Package</small><small>$${p[1]}/day</small></span></button>`
  ).join("");
}

async function selectPackage(i){
  const amount = packages[i][0];
  const daily = packages[i][1];
  
  const result = await addMemberPackage(amount, daily);
  if(result.success) {
    alert(`Package added: ${money(amount)}. Daily reward: ${money(daily)}`);
    await updateMemberUI();
    go("dashboard");
  } else {
    alert("Error adding package: " + result.error);
  }
}

/**
 * WITHDRAWAL
 */
async function withdrawUSDT(){
  const addr = document.getElementById("usdtAddress").value.trim();
  const amount = Number(document.getElementById("usdtAmount").value);
  
  if(!addr || !Number.isFinite(amount) || amount <= 0) {
    alert("Enter valid TRON/TRC20 address and amount.");
    return;
  }
  
  const result = await requestWithdrawal(amount, addr);
  if(result.success) {
    alert(`Withdrawal request submitted: ${money(amount)} USDT. Status: Pending`);
    document.getElementById("usdtAddress").value = "";
    document.getElementById("usdtAmount").value = "";
    await updateMemberUI();
    go("dashboard");
  } else {
    alert("Error: " + result.error);
  }
}

/**
 * RECHARGE
 */
async function submitRecharge(){
  const amount = Number(document.getElementById("rechargeAmount").value);
  const ref = document.getElementById("rechargeRef").value.trim();
  
  if(!ref || !Number.isFinite(amount) || amount <= 0) {
    alert("Enter amount and transaction reference.");
    return;
  }
  
  alert(`Recharge request submitted: ${money(amount)} USDT (Ref: ${ref}). Admin will verify.`);
  document.getElementById("rechargeAmount").value = "";
  document.getElementById("rechargeRef").value = "";
}

/**
 * GIFT CODE
 */
async function redeemGift(){
  const code = document.getElementById("giftCode").value.trim().toUpperCase();
  
  if(!code) {
    alert("Enter a gift code.");
    return;
  }
  
  const result = await redeemGiftCode(code);
  if(result.success) {
    alert(`Gift code redeemed! You earned ${money(result.reward)} USDT.`);
    document.getElementById("giftCode").value = "";
    await updateMemberUI();
    go("dashboard");
  } else {
    alert("Error: " + result.error);
  }
}

/**
 * DAILY REWARD
 */
const REWARD_CLAIM_WINDOW = 24 * 60 * 60 * 1000;

function rewardClaimAvailable(){
  // Check Supabase for last claim (handled in claimReward)
  return true;
}

function updateRewardClaimUI(){
  const btn = document.getElementById("claimBtn");
  if(!btn) return;
  btn.disabled = false;
  btn.textContent = "CLAIM";
}

async function claimReward(){
  const result = await claimDailyReward();
  if(result.success) {
    alert(`Daily reward claimed: ${money(result.amount)} USDT`);
    await updateMemberUI();
  } else {
    alert("Error: " + result.error);
  }
}

setInterval(updateRewardClaimUI, 60000);
document.addEventListener("DOMContentLoaded", updateRewardClaimUI);

/**
 * CHART
 */
function drawRewardChart(){
  const c = document.getElementById("rewardChart");
  if(!c) return;
  const ctx = c.getContext("2d"), dpr = window.devicePixelRatio || 1;
  const w = c.clientWidth, h = c.clientHeight;
  c.width = w * dpr;
  c.height = h * dpr;
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, w, h);
  
  const vals = [22, 31, 29, 45, 54, 63, 78], pad = 18;
  ctx.strokeStyle = "rgba(255,255,255,.08)";
  ctx.lineWidth = 1;
  for(let y = 25; y < h; y += 35){
    ctx.beginPath();
    ctx.moveTo(pad, y);
    ctx.lineTo(w - pad, y);
    ctx.stroke();
  }
  
  const pts = vals.map((v, i) => [
    pad + i * (w - pad * 2) / (vals.length - 1),
    h - pad - (v / 80) * (h - pad * 2)
  ]);
  const grad = ctx.createLinearGradient(0, 0, w, 0);
  grad.addColorStop(0, "#58ffd1");
  grad.addColorStop(.5, "#8b5cff");
  grad.addColorStop(1, "#ff35d6");
  ctx.strokeStyle = grad;
  ctx.lineWidth = 3;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.beginPath();
  pts.forEach((p, i) => i ? ctx.lineTo(...p) : ctx.moveTo(...p));
  ctx.stroke();
  pts.forEach(p => {
    ctx.beginPath();
    ctx.arc(p[0], p[1], 4, 0, Math.PI * 2);
    ctx.fillStyle = "#58ffd1";
    ctx.fill();
  });
}

window.addEventListener("resize", drawRewardChart);
setTimeout(drawRewardChart, 80);

/**
 * GROW RUSH GAME
 */
let growRush = { running: false, score: 0, time: 20, timer: null };

function startGame(){
  clearInterval(growRush.timer);
  growRush = { running: true, score: 0, time: 20, timer: null };
  const s = document.getElementById("gameScore"), t = document.getElementById("gameTimer"), b = document.getElementById("gameBest"), tree = document.getElementById("gameTree"), hint = document.getElementById("gameHint");
  if(s) s.textContent = "0";
  if(t) t.textContent = "20";
  if(b) b.textContent = localStorage.getItem("growx_best_score") || "0";
  if(tree) { tree.textContent = "🌱"; tree.disabled = false; }
  if(hint) hint.textContent = "TAP FAST • GROW YOUR SCORE";
  growRush.timer = setInterval(() => {
    growRush.time--;
    if(t) t.textContent = String(growRush.time);
    if(growRush.time <= 0) {
      clearInterval(growRush.timer);
      growRush.running = false;
      const best = Math.max(growRush.score, Number(localStorage.getItem("growx_best_score") || 0));
      localStorage.setItem("growx_best_score", String(best));
      if(b) b.textContent = String(best);
      if(tree) tree.textContent = "🌳";
      if(hint) hint.textContent = "ROUND COMPLETE • SCORE " + growRush.score;
    }
  }, 1000);
}

function tapGrow(){
  if(!growRush.running) return;
  growRush.score++;
  const s = document.getElementById("gameScore"), tree = document.getElementById("gameTree");
  if(s) s.textContent = String(growRush.score);
  if(tree) {
    tree.classList.remove("tap");
    void tree.offsetWidth;
    tree.classList.add("tap");
    tree.textContent = growRush.score % 7 === 0 ? "🌳" : (growRush.score % 3 === 0 ? "🌿" : "🌱");
  }
}

// Initialize on load
window.addEventListener("DOMContentLoaded", () => {
  document.body.classList.remove("logged-in");
  if('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
});

window.addEventListener('load', () => {
  if('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
});
