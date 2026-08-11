const tg = window.Telegram?.WebApp;
if (tg) { tg.ready(); tg.expand(); }

const packages = [
  {amount:180, reward:20, name:"SEED"},
  {amount:500, reward:50, name:"SPROUT"},
  {amount:1800, reward:180, name:"GROWTH"},
  {amount:3500, reward:350, name:"ADVANCE"},
  {amount:5000, reward:500, name:"PREMIUM"},
  {amount:8000, reward:800, name:"HARVEST"},
  {amount:10000, reward:1000, name:"EVERGREEN"},
  {amount:20000, reward:2000, name:"ELITE"}
];

const screens = [...document.querySelectorAll(".screen")];
function show(id){
  screens.forEach(s=>s.classList.toggle("active", s.id===id));
  window.scrollTo({top:0,behavior:"smooth"});
}
document.querySelectorAll("[data-page]").forEach(b=>b.addEventListener("click",()=>show(b.dataset.page)));

const list=document.getElementById("packageList");
list.innerHTML=packages.map(p=>`
  <div class="package">
    <div><div class="eyebrow">${p.name}</div><div class="amount">R${p.amount.toLocaleString()}</div></div>
    <div style="text-align:right"><div class="eyebrow">DAILY REWARD</div><div class="reward">R${p.reward.toLocaleString()}</div></div>
  </div>`).join("");

let pin="";
const dots=[...document.querySelectorAll("#pinDots i")];
document.querySelectorAll(".keypad button[data-key]").forEach(btn=>{
  btn.addEventListener("click",()=>{
    const key=btn.dataset.key;
    if(key==="back") pin=pin.slice(0,-1);
    else if(pin.length<4) pin+=key;
    dots.forEach((d,i)=>d.classList.toggle("filled",i<pin.length));
    document.getElementById("pinDisplay").textContent=pin.length ? "•".repeat(pin.length) : "Enter PIN";
    if(pin.length===4){
      setTimeout(()=>{
        // Demo only: real authentication must be server-side.
        show("dashboard"); pin="";
        dots.forEach(d=>d.classList.remove("filled"));
        document.getElementById("pinDisplay").textContent="Enter PIN";
      },180);
    }
  });
});

let seconds=3*3600+42*60+18;
setInterval(()=>{
  seconds=(seconds-1+86400)%86400;
  const h=String(Math.floor(seconds/3600)).padStart(2,"0");
  const m=String(Math.floor(seconds%3600/60)).padStart(2,"0");
  const s=String(seconds%60).padStart(2,"0");
  document.getElementById("countdown").textContent=`${h}:${m}:${s}`;
},1000);

function toast(msg){
  const el=document.getElementById("toast"); el.textContent=msg; el.classList.add("show");
  setTimeout(()=>el.classList.remove("show"),2500);
}
document.getElementById("withdrawBtn").addEventListener("click",()=>{
  const amount=document.getElementById("withdrawAmount").value.trim();
  if(!amount) return toast("Enter a withdrawal amount.");
  toast("Demo request created — no money was moved.");
});
document.getElementById("lockBtn").addEventListener("click",()=>{
  show("pinScreen"); toast("App locked.");
});
document.getElementById("settingsBtn").addEventListener("click",()=>show("security"));
