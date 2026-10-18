/* KAI Money Manager: offline-first, local-only prototype. No analytics or external API. */
(() => {
  "use strict";
  const DB_NAME = "kai-money-manager";
  const DB_VERSION = 1;
  const STORES = { transactions: "transactions", budgets: "budgets", goals: "goals", contributions: "contributions" };
  let db;
  let toastTimer;

  const $ = (id) => document.getElementById(id);
  const todayISO = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
  };
  const currentMonth = () => todayISO().slice(0,7);
  const money = (n) => new Intl.NumberFormat("en-SG", { style:"currency", currency:"SGD" }).format(Number(n)||0);
  const safeNum = (v) => Number.isFinite(Number(v)) ? Number(v) : 0;
  const makeId = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);

  function openDB() {
    return new Promise((resolve, reject) => {
      if (!("indexedDB" in window)) return reject(new Error("IndexedDB is not supported by this browser."));
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const database = req.result;
        if (!database.objectStoreNames.contains(STORES.transactions)) {
          const s = database.createObjectStore(STORES.transactions, { keyPath:"id" });
          s.createIndex("date", "date", { unique:false });
        }
        if (!database.objectStoreNames.contains(STORES.budgets)) database.createObjectStore(STORES.budgets, { keyPath:"month" });
        if (!database.objectStoreNames.contains(STORES.goals)) database.createObjectStore(STORES.goals, { keyPath:"id" });
        if (!database.objectStoreNames.contains(STORES.contributions)) {
          const s = database.createObjectStore(STORES.contributions, { keyPath:"id" });
          s.createIndex("date", "date", { unique:false });
          s.createIndex("goalId", "goalId", { unique:false });
        }
      };
      req.onsuccess = () => { db = req.result; resolve(db); };
      req.onerror = () => reject(req.error || new Error("Could not open local database."));
    });
  }
  function all(store) {
    return new Promise((resolve,reject) => {
      const req = db.transaction(store,"readonly").objectStore(store).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }
  function put(store, value) {
    return new Promise((resolve,reject) => {
      const tx = db.transaction(store,"readwrite");
      tx.objectStore(store).put(value);
      tx.oncomplete = () => resolve(value);
      tx.onerror = tx.onabort = () => reject(tx.error || new Error("Save failed."));
    });
  }
  function remove(store, key) {
    return new Promise((resolve,reject) => {
      const tx = db.transaction(store,"readwrite");
      tx.objectStore(store).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = tx.onabort = () => reject(tx.error || new Error("Delete failed."));
    });
  }
  function clearStore(store) {
    return new Promise((resolve,reject) => {
      const tx = db.transaction(store,"readwrite");
      tx.objectStore(store).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = tx.onabort = () => reject(tx.error);
    });
  }
  async function getAllData() {
    const [transactions,budgets,goals,contributions] = await Promise.all([
      all(STORES.transactions),all(STORES.budgets),all(STORES.goals),all(STORES.contributions)
    ]);
    return { schemaVersion:1, app:"KAI Money Manager", exportedAt:new Date().toISOString(), transactions,budgets,goals,contributions };
  }
  async function refresh() {
    const data = await getAllData();
    const month = $("plannerMonth").value || currentMonth();
    const txThisMonth = data.transactions.filter(t => String(t.date||"").startsWith(month));
    const income = data.transactions.filter(t=>t.type==="income").reduce((s,t)=>s+safeNum(t.amount),0);
    const expenses = data.transactions.filter(t=>t.type==="expense").reduce((s,t)=>s+safeNum(t.amount),0);
    const contributions = data.contributions.reduce((s,c)=>s+safeNum(c.amount),0);
    $("netBalance").textContent = money(income-expenses);
    $("totalIncome").textContent = money(income);
    $("totalExpenses").textContent = money(expenses);
    $("totalContributions").textContent = money(contributions);
    const mi = txThisMonth.filter(t=>t.type==="income").reduce((s,t)=>s+safeNum(t.amount),0);
    const me = txThisMonth.filter(t=>t.type==="expense").reduce((s,t)=>s+safeNum(t.amount),0);
    $("monthIncome").textContent = money(mi);
    $("monthExpenses").textContent = money(me);
    $("monthIncomeCount").textContent = `${txThisMonth.filter(t=>t.type==="income").length} entr${txThisMonth.filter(t=>t.type==="income").length===1?"y":"ies"}`;
    const budget = data.budgets.find(b=>b.month===currentMonth());
    $("budgetStatus").textContent = budget ? `${money(Math.max(0,budget.amount-me))} budget remaining this month` : "Set a budget in Planner";
    drawMonthlyChart(mi,me);
    renderCategories(txThisMonth.filter(t=>t.type==="expense"));
    renderGoals(data.goals,data.contributions,"dashboardGoals",true);
    renderRecords(data.transactions.filter(t=>t.date===todayISO() || t.date<=todayISO()).sort((a,b)=>(b.date||"").localeCompare(a.date||"")).slice(0,5),"recentList",false);
    renderTransactionPage(data.transactions);
    renderPlanner(data);
    renderGoals(data.goals,data.contributions,"goalList",false);
    renderContributions(data.contributions,data.goals);
    renderCalc();
  }
  function drawMonthlyChart(income, expenses) {
    const canvas = $("monthlyChart"), ctx = canvas.getContext("2d");
    const rect = canvas.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1,Math.floor(rect.width*dpr)); canvas.height = Math.max(1,Math.floor(rect.height*dpr));
    ctx.scale(dpr,dpr);
    const w=rect.width,h=rect.height,pad={l:38,r:12,t:12,b:28}, chartH=h-pad.t-pad.b, chartW=w-pad.l-pad.r;
    ctx.clearRect(0,0,w,h);
    const max=Math.max(income,expenses,100)*1.15;
    ctx.font="10px -apple-system, sans-serif"; ctx.textBaseline="middle";
    for(let i=0;i<=4;i++){
      const y=pad.t+chartH*i/4;
      ctx.strokeStyle="#e9eee9";ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(pad.l,y);ctx.lineTo(w-pad.r,y);ctx.stroke();
      ctx.fillStyle="#7b8988";ctx.textAlign="right";
      const v=max*(1-i/4);ctx.fillText(v>=1000?`${(v/1000).toFixed(v>=10000?0:1)}k`:Math.round(v).toString(),pad.l-7,y);
    }
    const bw=Math.min(54,chartW/4), centers=[pad.l+chartW*.32,pad.l+chartW*.70];
    [[income,"#3c8a68",centers[0]],[expenses,"#d47d67",centers[1]]].forEach(([val,color,cx])=>{
      const bh=(val/max)*chartH;
      ctx.fillStyle=color;roundRect(ctx,cx-bw/2,pad.t+chartH-bh,bw,bh,6);ctx.fill();
      ctx.fillStyle="#536568";ctx.textAlign="center";ctx.fillText(val>=1000?`${(val/1000).toFixed(1)}k`:Math.round(val).toString(),cx,Math.max(8,pad.t+chartH-bh-9));
    });
    ctx.fillStyle="#536568";ctx.textAlign="center";ctx.fillText("Income",centers[0],h-11);ctx.fillText("Spending",centers[1],h-11);
  }
  function roundRect(ctx,x,y,w,h,r){if(h<=0)return;const rr=Math.min(r,w/2,h/2);ctx.beginPath();ctx.moveTo(x+rr,y);ctx.arcTo(x+w,y,x+w,y+h,rr);ctx.arcTo(x+w,y+h,x,y+h,rr);ctx.arcTo(x,y+h,x,y,rr);ctx.arcTo(x,y,x+w,y,rr);ctx.closePath();}
  function renderCategories(expenses) {
    const totals={};expenses.forEach(t=>totals[t.category||"Other"]=(totals[t.category||"Other"]||0)+safeNum(t.amount));
    const entries=Object.entries(totals).sort((a,b)=>b[1]-a[1]);
    const el=$("categoryChart");
    if(!entries.length){el.innerHTML='<p class="empty">Add expenses this month to see your breakdown.</p>';return;}
    const max=entries[0][1]||1;
    el.innerHTML=entries.map(([name,val])=>`<div class="category-line"><span class="category-name">${escapeHTML(name)}</span><div class="bar-track"><div class="bar-fill" style="width:${Math.max(1,val/max*100)}%"></div></div><strong class="category-value">${money(val)}</strong></div>`).join("");
  }
  function renderRecords(records, target, actions) {
    const el=$(target);
    if(!records.length){el.innerHTML='<p class="empty">No records yet.</p>';return;}
    el.innerHTML=records.map(t=>`<div class="record"><div class="record-icon ${t.type==="expense"?"expense":""}">${t.type==="income"?"↙":"↗"}</div><div class="record-main"><strong>${escapeHTML(t.description)}</strong><small>${escapeHTML(t.category||"Other")} · ${escapeHTML(t.date||"No date")}</small></div><div class="record-amount ${t.type}">${t.type==="income"?"+":"−"}${money(t.amount)}</div>${actions?`<div class="record-actions"><button class="icon-button" data-edit-transaction="${t.id}" aria-label="Edit ${escapeHTML(t.description)}">✎</button><button class="icon-button" data-delete-transaction="${t.id}" aria-label="Delete ${escapeHTML(t.description)}">×</button></div>`:""}</div>`).join("");
  }
  function renderTransactionPage(allTransactions) {
    const month=$("transactionMonth").value||currentMonth(), filter=$("transactionFilter").value;
    const list=allTransactions.filter(t=>String(t.date||"").startsWith(month)&&(filter==="all"||t.type===filter)).sort((a,b)=>(b.date||"").localeCompare(a.date||""));
    renderRecords(list,"transactionList",true);
  }
  function renderPlanner(data) {
    const month=$("plannerMonth").value||currentMonth();
    const records=data.transactions.filter(t=>String(t.date||"").startsWith(month));
    const inc=records.filter(t=>t.type==="income").reduce((s,t)=>s+safeNum(t.amount),0);
    const exp=records.filter(t=>t.type==="expense").reduce((s,t)=>s+safeNum(t.amount),0);
    const budget=data.budgets.find(b=>b.month===month);
    if(document.activeElement!==$("monthlyBudget")) $("monthlyBudget").value=budget?budget.amount:"";
    $("plannerSpent").textContent=money(exp);$("plannerIncome").textContent=money(inc);$("plannerExpenses").textContent=money(exp);$("plannerNet").textContent=money(inc-exp);
    const limit=budget?safeNum(budget.amount):0, pct=limit>0?Math.min(100,exp/limit*100):0;
    $("budgetProgress").style.width=`${pct}%`;$("budgetProgress").style.background=exp>limit&&limit>0?"#bb544b":"#3c8a68";
    $("budgetUsed").textContent=limit>0?`${Math.round(exp/limit*100)}% used`:"No budget set";
    $("budgetRemaining").textContent=limit>0?`${exp>limit?"Over by":"Remaining"} ${money(Math.abs(limit-exp))}`:"Set a budget above";
    $("budgetAdvice").textContent=!budget?"Set a budget to get a simple spending check.":exp>limit?`You are over this month's budget by ${money(exp-limit)}. Review the spending categories.`:`You have ${money(limit-exp)} left in this month's budget.`;
  }
  function goalTotal(goalId, contributions){return contributions.filter(c=>c.goalId===goalId).reduce((s,c)=>s+safeNum(c.amount),0);}
  function renderGoals(goals,contributions,target,compact) {
    const el=$(target);
    if(!goals.length){el.innerHTML='<p class="empty">Create a savings goal to track contributions and progress.</p>';return;}
    el.innerHTML=goals.map(g=>{
      const total=goalTotal(g.id,contributions),pct=Math.min(100,total/Math.max(.01,safeNum(g.target))*100);
      return `<div class="goal-item"><div class="goal-top"><div><strong>${escapeHTML(g.name)}</strong><small>${g.targetDate?`Target date: ${escapeHTML(g.targetDate)}`:"No target date set"}</small></div><span class="goal-percent">${pct.toFixed(1)}%</span></div><div class="progress-track" style="margin-top:12px"><div class="progress-fill" style="width:${pct}%"></div></div><div class="goal-meta"><span>${money(total)} saved</span><span>${money(Math.max(0,g.target-total))} to go</span></div>${compact?"":`<div class="goal-actions"><button class="primary" data-contribute="${g.id}">＋ Contribution</button><button class="secondary" data-edit-goal="${g.id}">Edit</button><button class="secondary" data-delete-goal="${g.id}">Delete</button></div>`}</div>`;
    }).join("");
  }
  function renderContributions(contributions,goals) {
    const names=Object.fromEntries(goals.map(g=>[g.id,g.name]));
    const records=[...contributions].sort((a,b)=>(b.date||"").localeCompare(a.date||""));
    const el=$("contributionList");
    if(!records.length){el.innerHTML='<p class="empty">No contributions yet. Add one from a savings goal.</p>';return;}
    el.innerHTML=records.map(c=>`<div class="record"><div class="record-icon">◎</div><div class="record-main"><strong>${escapeHTML(names[c.goalId]||"Deleted goal")}</strong><small>${escapeHTML(c.date)}${c.note?" · "+escapeHTML(c.note):""}</small></div><div class="record-amount income">+${money(c.amount)}</div><button class="icon-button" data-delete-contribution="${c.id}" aria-label="Delete contribution">×</button></div>`).join("");
  }
  function renderCalc(){
    const a=safeNum($("calcA").value),b=safeNum($("calcB").value),op=$("calcOperator").value;
    let result=op==="+"?a+b:op==="-"?a-b:op==="*"?a*b:b===0?null:a/b;
    $("calcResult").textContent=result===null?"Cannot divide by zero":money(result);
  }
  function escapeHTML(value){return String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
  function toast(message){const el=$("toast");el.textContent=message;el.classList.add("show");clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove("show"),2600);}
  function goTo(view){document.querySelectorAll(".tab").forEach(b=>b.classList.toggle("active",b.dataset.view===view));document.querySelectorAll(".view").forEach(v=>v.classList.toggle("hidden",v.id!==`view-${view}`));window.scrollTo({top:0,behavior:"smooth"});}
  function openTransaction(record=null){
    $("transactionForm").reset();$("transactionId").value=record?.id||"";
    $("transactionDialogTitle").textContent=record?"Edit entry":"Add entry";
    $("entryType").value=record?.type||"expense";$("entryDescription").value=record?.description||"";
    $("entryAmount").value=record?.amount??"";$("entryCategory").value=record?.category||"Other";$("entryDate").value=record?.date||todayISO();
    $("transactionDialog").showModal();
  }
  async function handleTransactionSubmit(e){
    e.preventDefault();
    const record={id:$("transactionId").value||makeId(),type:$("entryType").value,description:$("entryDescription").value.trim(),amount:Math.round(Number($("entryAmount").value)*100)/100,category:$("entryCategory").value,date:$("entryDate").value,updatedAt:new Date().toISOString()};
    if(!record.description||!Number.isFinite(record.amount)||record.amount<=0||!record.date){toast("Please complete all fields with a valid amount.");return;}
    try{await put(STORES.transactions,record);$("transactionDialog").close();await refresh();toast("Entry saved on this device.");}catch(err){toast(`Could not save: ${err.message}`);}
  }
  async function editTransaction(id){const txs=await all(STORES.transactions),record=txs.find(t=>t.id===id);if(record)openTransaction(record);}
  async function deleteTransaction(id){if(!confirm("Delete this transaction? This cannot be undone unless you have a backup."))return;await remove(STORES.transactions,id);await refresh();toast("Transaction deleted.");}
  function openGoal(goal=null){
    $("goalForm").reset();$("goalId").value=goal?.id||"";$("goalDialogTitle").textContent=goal?"Edit goal":"New goal";
    $("goalName").value=goal?.name||"";$("goalTarget").value=goal?.target??"";$("goalDate").value=goal?.targetDate||"";$("goalDialog").showModal();
  }
  async function handleGoalSubmit(e){
    e.preventDefault();const target=Number($("goalTarget").value),name=$("goalName").value.trim();
    if(!name||!Number.isFinite(target)||target<=0){toast("Enter a goal name and target above zero.");return;}
    await put(STORES.goals,{id:$("goalId").value||makeId(),name,target:Math.round(target*100)/100,targetDate:$("goalDate").value||""});
    $("goalDialog").close();await refresh();toast("Goal saved.");
  }
  async function openContribution(goalId){
    const goals=await all(STORES.goals),g=goals.find(x=>x.id===goalId);if(!g)return;
    $("contributionForm").reset();$("contributionGoalId").value=g.id;$("contributionGoalName").value=g.name;$("contributionDate").value=todayISO();$("contributionDialog").showModal();
  }
  async function handleContributionSubmit(e){
    e.preventDefault();const amount=Number($("contributionAmount").value);
    if(!Number.isFinite(amount)||amount<=0||!$("contributionDate").value){toast("Enter a valid contribution and date.");return;}
    await put(STORES.contributions,{id:makeId(),goalId:$("contributionGoalId").value,amount:Math.round(amount*100)/100,date:$("contributionDate").value,note:$("contributionNote").value.trim()});
    $("contributionDialog").close();await refresh();toast("Goal contribution saved separately.");
  }
  async function deleteGoal(id){
    if(!confirm("Delete this goal and its contribution history? This cannot be undone unless backed up."))return;
    const contributions=await all(STORES.contributions);
    await Promise.all([remove(STORES.goals,id),...contributions.filter(c=>c.goalId===id).map(c=>remove(STORES.contributions,c.id))]);
    await refresh();toast("Goal and its contribution history deleted.");
  }
  function downloadJSON(data,filename){
    const blob=new Blob([JSON.stringify(data,null,2)],{type:"application/json"});
    const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  async function exportBackup(){
    const data=await getAllData();downloadJSON(data,`kai-money-backup-${todayISO()}.json`);$("backupStatus").textContent="Backup exported. Keep the file somewhere safe.";toast("Backup exported.");
  }
  function validateBackup(data){
    if(!data||typeof data!=="object"||!Array.isArray(data.transactions)||!Array.isArray(data.budgets)||!Array.isArray(data.goals)||!Array.isArray(data.contributions))throw new Error("This does not look like a valid KAI backup.");
    const validTx=data.transactions.every(t=>t&&typeof t.id==="string"&&["income","expense"].includes(t.type)&&typeof t.description==="string"&&Number.isFinite(Number(t.amount))&&Number(t.amount)>0&&/^\d{4}-\d{2}-\d{2}$/.test(t.date));
    const validBudgets=data.budgets.every(b=>b&&/^\d{4}-\d{2}$/.test(b.month)&&Number.isFinite(Number(b.amount))&&Number(b.amount)>=0);
    const validGoals=data.goals.every(g=>g&&typeof g.id==="string"&&typeof g.name==="string"&&Number.isFinite(Number(g.target))&&Number(g.target)>0);
    const validContrib=data.contributions.every(c=>c&&typeof c.id==="string"&&typeof c.goalId==="string"&&Number.isFinite(Number(c.amount))&&Number(c.amount)>0&&/^\d{4}-\d{2}-\d{2}$/.test(c.date));
    if(!validTx||!validBudgets||!validGoals||!validContrib)throw new Error("Backup contains invalid records. Current data was not changed.");
    return data;
  }
  async function importBackupFile(file){
    try{
      const data=validateBackup(JSON.parse(await file.text()));
      if(!confirm(`Import ${data.transactions.length} transactions, ${data.goals.length} goals and their contributions? This replaces all current KAI data on this device.`))return;
      for(const store of Object.values(STORES))await clearStore(store);
      for(const t of data.transactions)await put(STORES.transactions,t);
      for(const b of data.budgets)await put(STORES.budgets,b);
      for(const g of data.goals)await put(STORES.goals,g);
      for(const c of data.contributions)await put(STORES.contributions,c);
      await refresh();$("backupStatus").textContent="Backup imported successfully.";toast("Backup imported.");
    }catch(err){$("backupStatus").textContent=err.message||"Import failed.";toast("Import failed. Check the selected JSON file.");}
    finally{$("backupFile").value="";}
  }
  function wireEvents(){
    document.querySelectorAll(".tab").forEach(b=>b.addEventListener("click",()=>goTo(b.dataset.view)));
    document.querySelectorAll("[data-goto]").forEach(b=>b.addEventListener("click",()=>goTo(b.dataset.goto)));
    $("quickAdd").addEventListener("click",()=>openTransaction());
    $("newTransaction").addEventListener("click",()=>openTransaction());
    $("transactionForm").addEventListener("submit",handleTransactionSubmit);
    $("transactionMonth").addEventListener("change",async()=>renderTransactionPage(await all(STORES.transactions)));
    $("transactionFilter").addEventListener("change",async()=>renderTransactionPage(await all(STORES.transactions)));
    $("plannerMonth").addEventListener("change",refresh);
    $("saveBudget").addEventListener("click",async()=>{
      const month=$("plannerMonth").value,amount=Number($("monthlyBudget").value);
      if(!month||!Number.isFinite(amount)||amount<0){toast("Choose a month and enter a valid budget.");return;}
      await put(STORES.budgets,{month,amount:Math.round(amount*100)/100});await refresh();toast("Monthly budget saved.");
    });
    $("newGoal").addEventListener("click",()=>openGoal());
    $("goalForm").addEventListener("submit",handleGoalSubmit);
    $("contributionForm").addEventListener("submit",handleContributionSubmit);
    document.body.addEventListener("click",async e=>{
      const editTx=e.target.closest("[data-edit-transaction]");if(editTx)return editTransaction(editTx.dataset.editTransaction);
      const delTx=e.target.closest("[data-delete-transaction]");if(delTx)return deleteTransaction(delTx.dataset.deleteTransaction);
      const contribute=e.target.closest("[data-contribute]");if(contribute)return openContribution(contribute.dataset.contribute);
      const editG=e.target.closest("[data-edit-goal]");if(editG){const goals=await all(STORES.goals);return openGoal(goals.find(g=>g.id===editG.dataset.editGoal));}
      const delG=e.target.closest("[data-delete-goal]");if(delG)return deleteGoal(delG.dataset.deleteGoal);
      const delC=e.target.closest("[data-delete-contribution]");if(delC){if(confirm("Delete this contribution?")){await remove(STORES.contributions,delC.dataset.deleteContribution);await refresh();toast("Contribution deleted.");}}
    });
    document.querySelectorAll("[data-close]").forEach(b=>b.addEventListener("click",()=>$(b.dataset.close).close()));
    ["calcA","calcB","calcOperator"].forEach(id=>$(id).addEventListener("input",renderCalc));
    $("exportBackup").addEventListener("click",exportBackup);
    $("importBackup").addEventListener("click",()=>$("backupFile").click());
    $("backupFile").addEventListener("change",e=>{if(e.target.files[0])importBackupFile(e.target.files[0]);});
    $("clearAll").addEventListener("click",async()=>{
      if(!confirm("Permanently delete ALL transactions, budgets, goals and contributions stored by this app on this device? Export a backup first if you might need it."))return;
      if(!confirm("Final confirmation: delete all KAI Money Manager data from this browser?"))return;
      for(const store of Object.values(STORES))await clearStore(store);
      await refresh();toast("All local app data deleted.");
    });
    window.addEventListener("resize",()=>{const m=$("plannerMonth").value||currentMonth();all(STORES.transactions).then(t=>{const tx=t.filter(x=>String(x.date||"").startsWith(m));drawMonthlyChart(tx.filter(x=>x.type==="income").reduce((s,x)=>s+safeNum(x.amount),0),tx.filter(x=>x.type==="expense").reduce((s,x)=>s+safeNum(x.amount),0));});});
  }
  async function init(){
    $("entryDate").value=todayISO();$("contributionDate").value=todayISO();
    $("transactionMonth").value=currentMonth();$("plannerMonth").value=currentMonth();
    wireEvents();
    try{
      await openDB();
      if("serviceWorker" in navigator && (location.protocol==="https:"||location.hostname==="localhost")){
        navigator.serviceWorker.register("./sw.js").catch(err=>console.warn("Service worker registration failed",err));
      }
      await refresh();
    }catch(err){
      document.querySelector("main").insertAdjacentHTML("afterbegin",`<div class="card" style="border-color:#bb544b;color:#8b302a">Local database could not start: ${escapeHTML(err.message)}. Open this app from a supported browser over localhost or HTTPS, not directly as a file.</div>`);
    }
  }
  init();
})();