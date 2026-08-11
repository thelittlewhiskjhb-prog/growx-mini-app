const packages = [
  [20,2],[40,4],[80,8],[120,12],[200,20],[450,45],[700,70],[1000,100],[2000,200],[3000,300]
];
const STORAGE_KEY="growxDemoLedgerV6";
function money(n){return "$"+Number(n||0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2});}
function loadLedger(){try{const x=JSON.parse(localStorage.getItem(STORAGE_KEY));if(x)return x;}catch(e){} return {balance:650,packages:[{amount:200,daily:20},{amount:450,daily:45}],claimedDate:null,activity:[{type:"seed",amount:650,date:new Date().toISOString()}],withdrawals:[]};}
let ledger=loadLedger();
function saveLedger(){localStorage.setItem(STORAGE_KEY,JSON.stringify(ledger));}
function totalDaily(){return ledger.packages.reduce((s,p)=>s+Number(p.daily),0);}
function updateMemberUI(){
 const daily=totalDaily(),bal=ledger.balance,count=ledger.packages.length,today=new Date().toISOString().slice(0,10),claimed=ledger.claimedDate===today;
 const set=(id,v)=>{const e=document.getElementById(id);if(e)e.textContent=v;};
 set("balanceDisplay",money(bal));set("availableDisplay",money(bal));set("walletBalance",money(bal));set("walletAvailable",money(bal));set("walletToday","+"+money(daily));set("todayReward","+"+money(daily));set("walletPackages",count);set("activePackage",count+(count===1?" PACKAGE":" PACKAGES"));set("activeReward",money(daily)+" DAILY REWARD • "+(claimed?"CLAIMED TODAY":"READY"));set("rewardText",claimed?"TODAY'S REWARD CLAIMED":"+"+money(daily)+" READY TO CLAIM");
 const btn=document.getElementById("claimBtn");if(btn){btn.disabled=claimed;btn.textContent=claimed?"CLAIMED":"CLAIM";}
 const act=document.getElementById("walletActivity");if(act)act.innerHTML=ledger.activity.slice().reverse().slice(0,8).map(a=>`<div class="row"><span>${a.type==="reward"?"✦ DAILY REWARD":a.type==="withdraw"?"↗ WITHDRAWAL":"◈ PACKAGE"}</span><b>${a.type==="withdraw"?"-":"+"}${money(a.amount)}</b></div>`).join("");
 const cards=ledger.withdrawals.slice().reverse().map(x=>`<div class="statusCard"><div><b>${money(x.amount)} USDT</b><small>${x.address.slice(0,8)}…${x.address.slice(-6)}</small></div><span class="status ${x.status.toLowerCase()}">${x.status}</span></div>`).join("")||"<small>No withdrawals submitted.</small>";
 const ws=document.getElementById("walletWithdrawals"),wd=document.getElementById("withdrawalStatus");if(ws)ws.innerHTML=cards;if(wd)wd.innerHTML=cards;
}
function go(id){document.querySelectorAll(".screen").forEach(x=>x.classList.remove("active"));const target=document.getElementById(id);if(target)target.classList.add("active");const memberPages=["dashboard","packages","wallet","recharge","withdraw","gift","game"];const isMember=memberPages.includes(id);document.body.classList.toggle("logged-in",isMember);const nav=document.getElementById("memberNav");if(nav)nav.style.display=isMember?"grid":"none";if(isMember)updateMemberUI();window.scrollTo({top:0,behavior:"smooth"});}
const packageList=document.getElementById("packageList");packageList.innerHTML=packages.map((p,i)=>`<button class="pkg" onclick="selectPackage(${i})"><span><b>$${p[0].toLocaleString()}</b><small>Package investment</small></span><span class="reward">$${p[1].toFixed(2)} / DAY</span></button>`).join("");
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
  document.body.classList.add("logged-in");
  go("dashboard");
}

function logout(){document.body.classList.remove("logged-in"); go("welcome");}

function selectPackage(i){const amount=packages[i][0],daily=packages[i][1];ledger.packages.push({amount,daily});saveLedger();updateMemberUI();alert(`Demo package added: ${money(amount)}. Combined daily reward: ${money(totalDaily())}.`);go("dashboard");}
function claimReward(){const today=new Date().toISOString().slice(0,10);if(ledger.claimedDate===today)return alert("Today's combined daily reward has already been claimed.");const daily=totalDaily();if(!daily)return alert("Add a package before claiming a reward.");ledger.balance+=daily;ledger.claimedDate=today;ledger.activity.push({type:"reward",amount:daily,date:new Date().toISOString()});saveLedger();updateMemberUI();alert(`Daily reward claimed: ${money(daily)} added to your balance.`);}

function submitRecharge(){
  const amount=rechargeAmount.value.trim(), ref=rechargeRef.value.trim();
  if(!amount||!ref) return alert("Enter the USDT amount and transaction reference.");
  alert("Demo recharge submitted for review. No cryptocurrency was moved.");
}

function withdrawUSDT(){const addr=usdtAddress.value.trim(),amount=Number(usdtAmount.value);if(!addr||!Number.isFinite(amount)||amount<=0)return alert("Enter a valid TRON/TRC20 wallet address and amount.");if(amount>ledger.balance)return alert("Insufficient available balance.");ledger.balance-=amount;const request={id:"WD-"+Date.now().toString(36).toUpperCase(),address:addr,amount,status:"PROCESSING",date:new Date().toISOString()};ledger.withdrawals.push(request);ledger.activity.push({type:"withdraw",amount,date:request.date});saveLedger();updateMemberUI();usdtAmount.value="";usdtAddress.value="";alert(`Withdrawal ${request.id} submitted. ${money(amount)} deducted from your demo balance. Status: PROCESSING.`);go("withdraw");}

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
    <div class="row"><span>PACKAGES</span><b>${ledger.packages.length}</b></div>
    <div class="row"><span>BALANCE</span><b>${money(ledger.balance)}</b></div>
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

window.addEventListener("DOMContentLoaded",()=>{document.body.classList.remove("logged-in"); const n=document.getElementById("memberNav"); if(n)n.style.display="none";});

window.addEventListener('load',()=>{if('serviceWorker' in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{});});


/* GROW RUSH mini-game: score-only arcade interaction, no wagering or cash rewards. */
let gameActive=false, gameScoreValue=0, gameTime=20, gameTimer=null;
function startGame(){
  if(gameActive)return;
  gameActive=true; gameScoreValue=0; gameTime=20;
  gameScore.textContent="0"; gameRound.textContent="20s";
  gameStart.disabled=true; gameStart.textContent="ROUND LIVE";
  gameMeter.style.width="100%";
  clearInterval(gameTimer);
  gameTimer=setInterval(()=>{
    gameTime--;
    gameRound.textContent=gameTime+"s";
    gameMeter.style.width=(gameTime/20*100)+"%";
    if(gameTime<=0) endGame();
  },1000);
}
function tapGrow(){
  if(!gameActive)return;
  gameScoreValue++;
  gameScore.textContent=gameScoreValue;
  const tree=document.getElementById("treeButton");
  tree.classList.remove("pop");
  void tree.offsetWidth;
  tree.classList.add("pop");
}
function endGame(){
  clearInterval(gameTimer); gameTimer=null; gameActive=false;
  const best=Number(localStorage.getItem("growxBestScore")||0);
  const rounds=Number(localStorage.getItem("growxRounds")||0)+1;
  if(gameScoreValue>best)localStorage.setItem("growxBestScore",gameScoreValue);
  localStorage.setItem("growxRounds",rounds);
  bestScore.textContent=Math.max(best,gameScoreValue);
  roundsPlayed.textContent=rounds;
  gameStart.disabled=false; gameStart.textContent="PLAY AGAIN";
  gameRound.textContent="DONE";
  alert("Round complete — score: "+gameScoreValue);
}
(function loadGameStats(){
  const b=localStorage.getItem("growxBestScore")||0;
  const r=localStorage.getItem("growxRounds")||0;
  setTimeout(()=>{if(document.getElementById("bestScore")){bestScore.textContent=b;roundsPlayed.textContent=r;}},0);
})();

window.addEventListener("DOMContentLoaded",()=>updateMemberUI());


/* GROW RUSH — score-only arcade game */
let growGame={running:false,score:0,time:20,timer:null};
function startGame(){
  clearInterval(growGame.timer);
  growGame={running:true,score:0,time:20,timer:null};
  const s=document.getElementById("gameScore"),t=document.getElementById("gameTimer"),tree=document.getElementById("gameTree");
  if(s)s.textContent="0";
  if(t)t.textContent="20";
  if(tree){tree.textContent="🌱";tree.classList.remove("burst");}
  growGame.timer=setInterval(()=>{
    growGame.time--;
    if(t)t.textContent=String(growGame.time);
    if(growGame.time<=0){
      clearInterval(growGame.timer);
      growGame.running=false;
      if(tree)tree.textContent="🌳";
      alert("Round complete! Score: "+growGame.score);
    }
  },1000);
}
function tapGrow(){
  if(!growGame.running)return;
  growGame.score++;
  const s=document.getElementById("gameScore");
  const tree=document.getElementById("gameTree");
  if(s)s.textContent=String(growGame.score);
  if(tree){
    tree.classList.remove("burst");
    void tree.offsetWidth;
    tree.classList.add("burst");
    tree.textContent=growGame.score%5===0?"🌳":"🌿";
  }
}
