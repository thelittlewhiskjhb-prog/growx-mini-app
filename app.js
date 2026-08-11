const packages = [
  [20, 2], [40, 4], [80, 8], [120, 12], [200, 20],
  [450, 45], [700, 70], [1000, 100], [2000, 200], [3000, 300]
];

const publicScreens = new Set(["welcome","login","register"]);
const memberScreens = new Set(["dashboard","packages","wallet","recharge","withdraw","gift","security"]);

function setBottomNav(visible){
  const nav=document.querySelector(".bottomNav");
  if(nav) nav.classList.toggle("visible", visible);
}

function go(id){
  document.querySelectorAll(".screen").forEach(x=>x.classList.remove("active"));
  const target=document.getElementById(id);
  if(target) target.classList.add("active");

  // Bottom navigation is a member-only control. It is hidden on welcome/login/registration.
  setBottomNav(memberScreens.has(id));

  window.scrollTo({top:0,behavior:"smooth"});
  document.querySelectorAll(".bottomNav button").forEach(b=>b.classList.remove("active"));
}

const packageList=document.getElementById("packageList");
packageList.innerHTML=packages.map((p,i)=>`
  <button class="pkg" onclick="selectPackage(${i})">
    <span><b>$${p[0].toLocaleString()}</b><small>Package investment</small></span>
    <span class="reward">$${p[1].toFixed(2)} / DAY</span>
  </button>`).join("");

function register(){
  let p=regPhone.value.trim(),a=regPin1.value,b=regPin2.value;
  if(!p||!/^[0-9]{4}$/.test(a)||a!==b)
    return alert("Enter a cellphone number and matching 4-digit PIN.");
  alert("Demo account created. A secure backend would generate the unique letters-only client code.");
  go("login");
}

function login(){
  if(!loginPhone.value.trim()||!/^[0-9]{4}$/.test(loginPin.value))
    return alert("Enter your cellphone number and 4-digit PIN.");
  go("dashboard");
}

function logout(){
  setBottomNav(false);
  go("welcome");
}

function selectPackage(i){
  const amount=packages[i][0], daily=packages[i][1];
  activePackage.textContent="$"+amount.toLocaleString()+" PACKAGE";
  activeReward.textContent="$"+daily.toFixed(2)+" DAILY REWARD • ACTIVE";
  todayReward.textContent="+$"+daily.toFixed(2);
  rewardText.textContent="+$"+daily.toFixed(2)+" READY TO CLAIM";
  document.getElementById("claimBtn").disabled=false;
  document.getElementById("claimBtn").textContent="CLAIM";
  alert(`Demo package selected: $${amount.toLocaleString()} with a displayed daily reward of $${daily.toFixed(2)}.`);
  go("dashboard");
}

function claimReward(){
  const btn=document.getElementById("claimBtn");
  btn.disabled=true;
  btn.textContent="CLAIMED";
  rewardText.textContent="TODAY'S REWARD CLAIMED";
  alert("Demo reward claim recorded. No real funds were created or transferred.");
}

function submitRecharge(){
  const amount=rechargeAmount.value.trim(), ref=rechargeRef.value.trim();
  if(!amount||!ref) return alert("Enter the USDT amount and transaction reference.");
  alert("Demo recharge submitted for review. No cryptocurrency was moved.");
}

function withdrawUSDT(){
  const addr=usdtAddress.value.trim(), amount=usdtAmount.value.trim();
  if(!addr||!amount) return alert("Enter a TRON/TRC20 wallet address and amount.");
  alert("Demo USDT withdrawal request created. No cryptocurrency was transferred.");
}

function redeemGift(){
  const code=giftCode.value.trim();
  if(!code) return alert("Enter a gift code.");
  alert("Demo gift code submitted. Gift-code validation will be connected to the secure backend later.");
}

function adminLogin(){
  if(prompt("Prototype admin access code:")==="GROWX-ADMIN") go("admin");
  else alert("Access denied.");
}

const requests=[
  ["KTRXWQ","$100.00","2026-08-08 09:14","USDT TRC20"],
  ["LMNQZA","$75.00","2026-08-09 11:32","USDT TRC20"],
  ["ABCDXY","$250.00","2026-08-10 08:47","USDT TRC20"],
  ["QWERTY","$50.00","2026-08-11 10:05","USDT TRC20"]
];
queue.innerHTML=requests.map((r,i)=>`
  <div class="request">
    <div class="requesttop"><b>#${i+1} · ${r[0]}</b><span>● PENDING</span></div>
    <div class="requestamount">${r[1]}</div>
    <div class="requestmeta"><span>${r[3]}</span><span>${r[2]}</span></div>
  </div>`).join("");

function openClient(){
  let q=search.value.trim().toUpperCase();
  if(!q)return alert("Enter a cellphone number or client code.");
  clientPanel.innerHTML=`
    <div class="row"><span>CLIENT CODE</span><b>${q.match(/^[A-Z]+$/)?q:"KTRXWQ"}</b></div>
    <div class="row"><span>CELLPHONE</span><b>••••••1234</b></div>
    <div class="row"><span>PACKAGE</span><b>$500</b></div>
    <div class="row"><span>BALANCE</span><b>$845.00</b></div>
    <div class="row"><span>ASSET</span><b>USDT</b></div>
    <div class="row"><span>NETWORK</span><b>TRC20</b></div>
    <label>AUTHORISED ALLOCATION</label><input id="alloc" inputmode="decimal" placeholder="0.00 USDT">
    <label>TRANSACTION REFERENCE</label><input id="ref" placeholder="Reference">
    <button class="primary" onclick="allocate()">RECORD DEMO ALLOCATION</button>`;
}

function allocate(){
  if(!alloc.value.trim()||!ref.value.trim())
    return alert("Enter amount and transaction reference.");
  alert("Demo allocation recorded. No real funds were created or moved.");
}

/* Simple canvas graph matching the futuristic UI. */
function drawRewardChart(){
  const c=document.getElementById("rewardChart");
  if(!c)return;
  const ctx=c.getContext("2d"), dpr=window.devicePixelRatio||1;
  const w=c.clientWidth,h=c.clientHeight;
  c.width=w*dpr;c.height=h*dpr;ctx.scale(dpr,dpr);
  ctx.clearRect(0,0,w,h);

  const vals=[22,31,29,45,54,63,78], pad=18;
  ctx.strokeStyle="rgba(255,255,255,.08)";ctx.lineWidth=1;
  for(let y=25;y<h;y+=35){ctx.beginPath();ctx.moveTo(pad,y);ctx.lineTo(w-pad,y);ctx.stroke();}

  const pts=vals.map((v,i)=>[
    pad+i*(w-pad*2)/(vals.length-1),
    h-pad-(v/80)*(h-pad*2)
  ]);
  const grad=ctx.createLinearGradient(0,0,w,0);
  grad.addColorStop(0,"#58ffd1");grad.addColorStop(.5,"#8b5cff");grad.addColorStop(1,"#ff35d6");
  ctx.strokeStyle=grad;ctx.lineWidth=3;ctx.lineJoin="round";ctx.lineCap="round";
  ctx.beginPath();pts.forEach((p,i)=>i?ctx.lineTo(...p):ctx.moveTo(...p));ctx.stroke();
  pts.forEach(p=>{ctx.beginPath();ctx.arc(p[0],p[1],4,0,Math.PI*2);ctx.fillStyle="#58ffd1";ctx.fill();});
}
window.addEventListener("resize",drawRewardChart);
setTimeout(drawRewardChart,80);
