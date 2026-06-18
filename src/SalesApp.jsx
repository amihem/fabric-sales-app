import { useState, useEffect, useRef } from "react";
import * as XLSX from "xlsx";

// ─── PERSISTENT STORAGE ──────────────────────────────────────
const SK = "fabric-sales-v1";
const EMPTY = {
  customers: [],   // { id, name, type:"Trading"|"Agency"|"Both", phone, city, cdRate:0, gstin }
  suppliers: [],   // { id, name, phone, city }
  products: [],    // { id, name, supplierId, supplierName, unit:"Mtr" }
  tradingSales: [], // { id, date, customerId, customerName, productId, productName, supplierName, meters, rate, amount, remarks }
  agencySales: [],  // { id, date, customerId, customerName, productId, productName, supplierName, meters, rate, amount, cdRate, remarks }
  tradingPayments: [], // { id, date, customerId, customerName, amount, mode, remarks }
  agencyPayments: [],  // { id, date, customerId, customerName, invoiceId, grossAmount, cdDays, cdPct, cdAmount, netAmount, commission, mode, remarks }
};

async function loadData() {
  try { const raw = localStorage.getItem(SK); if (raw) return { ...EMPTY, ...JSON.parse(raw) }; } catch(e){}
  return { ...EMPTY };
}
async function saveData(d) { try { localStorage.setItem(SK, JSON.stringify(d)); } catch(e){} }

// ─── UTILS ───────────────────────────────────────────────────
const fmt   = n  => Number(n||0).toLocaleString("en-IN",{maximumFractionDigits:2});
const fmtD  = d  => d ? new Date(d).toLocaleDateString("en-IN") : "—";
const today = () => new Date().toISOString().split("T")[0];
const uid   = () => Date.now()+"-"+Math.random().toString(36).slice(2,6);
const daysBetween = (d1,d2) => Math.floor((new Date(d2)-new Date(d1))/86400000);

// CD slab logic
function getCDPct(days) {
  if (days <= 10)  return 4;
  if (days <= 50)  return 3;
  if (days <= 60)  return 2;
  if (days <= 120) return 0;
  return 0;
}
function getCDLabel(days) {
  if (days <= 10)  return "4% CD (0-10 days)";
  if (days <= 50)  return "3% CD (11-50 days)";
  if (days <= 60)  return "2% CD (51-60 days)";
  if (days <= 120) return "0% CD (61-120 days)";
  return "No CD (120+ days)";
}

// WhatsApp
function waOpen(phone, msg) {
  const num = phone ? "91"+String(phone).replace(/\D/g,"").slice(-10) : "";
  window.open(`https://wa.me/${num}?text=${encodeURIComponent(msg)}`,"_blank");
}

// Commission calc
const tradingCommission = (meters) => Number(meters||0) * 1.5;
const agencyCommission  = (netAmt)  => Number(netAmt||0) * 0.005;

// Export JSON backup
function exportBackup(data) {
  const b = new Blob([JSON.stringify(data,null,2)],{type:"application/json"});
  const a = document.createElement("a");
  a.href = URL.createObjectURL(b);
  a.download = `FabricSales_Backup_${today()}.json`;
  a.click();
}

// Export CSV (simple Excel-compatible)
function exportCSV(rows, filename) {
  const csv = rows.map(r => r.map(c => `"${String(c||"").replace(/"/g,'""')}"`).join(",")).join("\n");
  const b = new Blob(["\uFEFF"+csv],{type:"text/csv"});
  const a = document.createElement("a");
  a.href = URL.createObjectURL(b);
  a.download = filename;
  a.click();
}

// ─── TABS ────────────────────────────────────────────────────
const TABS = ["Dashboard","Trading","Agency","Outstanding","Aging","Commission","Masters","Reports"];

// ─── APP ROOT ─────────────────────────────────────────────────
export default function App() {
  const [tab,    setTab]    = useState("Dashboard");
  const [data,   setData]   = useState(null);
  const [modal,  setModal]  = useState(null);
  const [toast,  setToast]  = useState(null);

  useEffect(()=>{ loadData().then(setData); },[]);
  useEffect(()=>{ if(data) saveData(data); },[data]);

  const showToast = (msg,err) => { setToast({msg,err}); setTimeout(()=>setToast(null),2800); };

  const add = (section,rec) => {
    setData(p=>({...p,[section]:[...p[section],{...rec,id:uid()}]}));
    showToast("✅ Saved!"); setModal(null);
  };
  const bulkAdd = (newCustomers,newSales) => {
    setData(p=>({
      ...p,
      customers: [...p.customers, ...newCustomers.map(c=>({...c,id:c.id||uid()}))],
      tradingSales: [...p.tradingSales, ...newSales.map(s=>({...s,id:uid()}))],
    }));
    showToast(`✅ Imported ${newSales.length} sale${newSales.length===1?"":"s"}!`);
    setModal(null);
  };
  const del = (section,id) => {
    setData(p=>({...p,[section]:p[section].filter(r=>r.id!==id)}));
    showToast("🗑️ Deleted",true);
  };

  const importBackup = (e) => {
    const file = e.target.files[0]; if(!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const parsed = JSON.parse(ev.target.result);
        if(!parsed.tradingSales) throw new Error();
        setData({...EMPTY,...parsed});
        showToast("✅ Backup restored!");
      } catch { showToast("❌ Invalid backup file",true); }
    };
    reader.readAsText(file);
    e.target.value="";
  };

  if(!data) return (
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",minHeight:"100vh",background:"#0F1923",flexDirection:"column",gap:12}}>
      <div style={{fontSize:44}}>🧵</div>
      <div style={{color:"#E8C97E",fontWeight:800,fontSize:16,letterSpacing:1}}>Loading your data…</div>
    </div>
  );

  // ── Computed outstanding ──────────────────────────────────
  // Trading outstanding per customer
  const tradingOut = {};
  data.tradingSales.forEach(s=>{
    if(!tradingOut[s.customerId]) tradingOut[s.customerId]={name:s.customerName,due:0,paid:0};
    tradingOut[s.customerId].due += +s.amount||0;
  });
  data.tradingPayments.forEach(p=>{
    if(!tradingOut[p.customerId]) tradingOut[p.customerId]={name:p.customerName,due:0,paid:0};
    tradingOut[p.customerId].paid += +p.amount||0;
  });

  // Agency outstanding per customer
  const agencyOut = {};
  data.agencySales.forEach(s=>{
    if(!agencyOut[s.customerId]) agencyOut[s.customerId]={name:s.customerName,due:0,paid:0,cdGiven:0};
    agencyOut[s.customerId].due += +s.amount||0;
  });
  data.agencyPayments.forEach(p=>{
    if(!agencyOut[p.customerId]) agencyOut[p.customerId]={name:p.customerName,due:0,paid:0,cdGiven:0};
    agencyOut[p.customerId].paid    += +p.netAmount||0;
    agencyOut[p.customerId].cdGiven += +p.cdAmount||0;
  });

  const totTradingSale   = data.tradingSales.reduce((a,s)=>a+(+s.amount||0),0);
  const totAgencySale    = data.agencySales.reduce((a,s)=>a+(+s.amount||0),0);
  const totTradingOut    = Object.values(tradingOut).reduce((a,v)=>a+Math.max(0,v.due-v.paid),0);
  const totAgencyOut     = Object.values(agencyOut).reduce((a,v)=>a+Math.max(0,v.due-v.paid-v.cdGiven),0);
  const totTradingComm   = data.tradingSales.reduce((a,s)=>a+tradingCommission(s.meters),0);
  const totAgencyComm    = data.agencyPayments.reduce((a,p)=>a+(+p.commission||0),0);

  return (
    <div style={{fontFamily:"'Segoe UI',system-ui,sans-serif",background:"#F2F4F8",minHeight:"100vh",maxWidth:560,margin:"0 auto",WebkitTextSizeAdjust:"100%",touchAction:"manipulation"}}>

      {/* ── HEADER ── */}
      <div style={{background:"linear-gradient(135deg,#0F1923 0%,#1A3A5C 100%)",padding:"calc(env(safe-area-inset-top,0px) + 14px) 16px 12px",position:"sticky",top:0,zIndex:100,boxShadow:"0 2px 20px rgba(0,0,0,0.4)"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8}}>
          <div style={{minWidth:0}}>
            <div style={{fontSize:10,letterSpacing:2.5,color:"#E8C97E",textTransform:"uppercase",fontWeight:700}}>🧵 Fabric Business</div>
            <div style={{fontSize:21,fontWeight:900,color:"#fff",letterSpacing:0.3}}>Sales Manager</div>
            <div style={{fontSize:10,color:"rgba(255,255,255,0.45)",marginTop:2}}>Trading & Agency • Auto-saved</div>
          </div>
          <div style={{display:"flex",gap:7,flexShrink:0}}>
            <button onClick={()=>exportBackup(data)} style={hdrBtn("#E8C97E","#0F1923")}>📤<div style={{fontSize:9.5,fontWeight:700}}>Backup</div></button>
            <label style={hdrBtn("#E8C97E","#0F1923")}>
              📥<div style={{fontSize:9.5,fontWeight:700}}>Restore</div>
              <input type="file" accept=".json" onChange={importBackup} style={{display:"none"}}/>
            </label>
          </div>
        </div>
      </div>

      {/* ── TABS ── */}
      <div style={{background:"#1A3A5C",display:"flex",overflowX:"auto",WebkitOverflowScrolling:"touch",scrollbarWidth:"none",position:"sticky",top:0,zIndex:99,boxShadow:"0 2px 10px rgba(0,0,0,0.15)"}}>
        {TABS.map(t=>(
          <button key={t} onClick={()=>setTab(t)}
            style={{flex:"0 0 auto",padding:"13px 15px",fontSize:12.5,fontWeight:tab===t?800:500,color:tab===t?"#E8C97E":"rgba(255,255,255,0.6)",background:"none",border:"none",borderBottom:tab===t?"3px solid #E8C97E":"3px solid transparent",cursor:"pointer",whiteSpace:"nowrap",letterSpacing:0.2,minHeight:46}}>
            {t}
          </button>
        ))}
      </div>

      {/* ── PAGES ── */}
      <div style={{padding:"14px 14px calc(env(safe-area-inset-bottom,0px) + 32px)"}}>
        {tab==="Dashboard"   && <Dashboard data={data} totTradingSale={totTradingSale} totAgencySale={totAgencySale} totTradingOut={totTradingOut} totAgencyOut={totAgencyOut} totTradingComm={totTradingComm} totAgencyComm={totAgencyComm} />}
        {tab==="Trading"     && <TradingTab data={data} onAdd={()=>setModal({type:"tradingSale"})} onAddPay={()=>setModal({type:"tradingPayment"})} onDel={del} tradingOut={tradingOut} />}
        {tab==="Agency"      && <AgencyTab data={data} onAdd={()=>setModal({type:"agencySale"})} onAddPay={()=>setModal({type:"agencyPayment"})} onDel={del} agencyOut={agencyOut} />}
        {tab==="Outstanding" && <OutstandingTab tradingOut={tradingOut} agencyOut={agencyOut} data={data} onTradingPay={()=>setModal({type:"tradingPayment"})} onAgencyPay={()=>setModal({type:"agencyPayment"})} />}
        {tab==="Aging"       && <AgingTab data={data} tradingOut={tradingOut} agencyOut={agencyOut} />}
        {tab==="Commission"  && <CommissionTab data={data} totTradingComm={totTradingComm} totAgencyComm={totAgencyComm} />}
        {tab==="Masters"     && <MastersTab data={data} onAdd={setModal} onDel={del} />}
        {tab==="Reports"     && <ReportsTab data={data} tradingOut={tradingOut} agencyOut={agencyOut} totTradingSale={totTradingSale} totAgencySale={totAgencySale} />}
      </div>

      {/* ── MODALS ── */}
      {modal?.type==="tradingSale"     && <TradingSaleModal    data={data} onSave={r=>add("tradingSales",r)}    onClose={()=>setModal(null)}/>}
      {modal?.type==="agencySale"      && <AgencySaleModal     data={data} onSave={r=>add("agencySales",r)}     onClose={()=>setModal(null)}/>}
      {modal?.type==="tradingPayment"  && <TradingPaymentModal data={data} onSave={r=>add("tradingPayments",r)} onClose={()=>setModal(null)} preCustomer={modal.preCustomer}/>}
      {modal?.type==="agencyPayment"   && <AgencyPaymentModal  data={data} onSave={r=>add("agencyPayments",r)}  onClose={()=>setModal(null)} preCustomer={modal.preCustomer}/>}
      {modal?.type==="customer"        && <CustomerModal       data={data} onSave={r=>add("customers",r)}       onClose={()=>setModal(null)}/>}
      {modal?.type==="supplier"        && <SupplierModal       data={data} onSave={r=>add("suppliers",r)}       onClose={()=>setModal(null)}/>}
      {modal?.type==="product"         && <ProductModal        data={data} onSave={r=>add("products",r)}        onClose={()=>setModal(null)}/>}
      {modal?.type==="tallyImport"     && <TallyImportModal     data={data} onImport={bulkAdd}                    onClose={()=>setModal(null)}/>}

      {/* ── TOAST ── */}
      {toast&&<div style={{position:"fixed",bottom:"calc(env(safe-area-inset-bottom,0px) + 24px)",left:"50%",transform:"translateX(-50%)",background:toast.err?"#B03A2E":"#0F1923",color:"#E8C97E",padding:"11px 24px",borderRadius:24,fontSize:13.5,fontWeight:700,zIndex:999,boxShadow:"0 4px 20px rgba(0,0,0,0.4)",whiteSpace:"nowrap",border:"1px solid rgba(232,201,126,0.3)",maxWidth:"90%",textAlign:"center"}}>{toast.msg}</div>}
    </div>
  );
}

// ─── DASHBOARD ────────────────────────────────────────────────
function Dashboard({data,totTradingSale,totAgencySale,totTradingOut,totAgencyOut,totTradingComm,totAgencyComm}) {
  const totComm = totTradingComm + totAgencyComm;
  const kpis = [
    {label:"Trading Sales",  val:`₹${fmt(totTradingSale)}`, color:"#2980B9", icon:"🏪"},
    {label:"Agency Sales",   val:`₹${fmt(totAgencySale)}`,  color:"#27AE60", icon:"🤝"},
    {label:"Trading Due",    val:`₹${fmt(totTradingOut)}`,  color:"#E74C3C", icon:"⏳"},
    {label:"Agency Due",     val:`₹${fmt(totAgencyOut)}`,   color:"#E67E22", icon:"⏳"},
    {label:"Trading Comm",   val:`₹${fmt(totTradingComm)}`, color:"#8E44AD", icon:"💰"},
    {label:"Agency Comm",    val:`₹${fmt(totAgencyComm)}`,  color:"#16A085", icon:"💰"},
  ];

  // Recent 5 transactions
  const recent = [
    ...data.tradingSales.map(s=>({...s,_t:"Trading Sale"})),
    ...data.agencySales.map(s=>({...s,_t:"Agency Sale"})),
  ].sort((a,b)=>new Date(b.date)-new Date(a.date)).slice(0,6);

  return (
    <div>
      {/* Total commission banner */}
      <div style={{background:"linear-gradient(135deg,#0F1923,#1A3A5C)",borderRadius:16,padding:"14px 16px",marginBottom:14,border:"1px solid rgba(232,201,126,0.3)"}}>
        <div style={{fontSize:10,color:"#E8C97E",letterSpacing:2,textTransform:"uppercase",fontWeight:600}}>Total Commission Earned</div>
        <div style={{fontSize:30,fontWeight:900,color:"#E8C97E",marginTop:4}}>₹{fmt(totComm)}</div>
        <div style={{fontSize:11,color:"rgba(255,255,255,0.45)",marginTop:2}}>Trading: ₹{fmt(totTradingComm)} + Agency: ₹{fmt(totAgencyComm)}</div>
      </div>

      {/* KPI grid */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:14}}>
        {kpis.map(k=>(
          <div key={k.label} style={{background:"#fff",borderRadius:14,padding:"13px",borderLeft:`4px solid ${k.color}`,boxShadow:"0 1px 8px rgba(0,0,0,0.06)"}}>
            <div style={{fontSize:19}}>{k.icon}</div>
            <div style={{fontSize:10.5,color:"#999",marginTop:4,fontWeight:600,textTransform:"uppercase",letterSpacing:0.5}}>{k.label}</div>
            <div style={{fontSize:16,fontWeight:900,color:k.color,marginTop:2}}>{k.val}</div>
          </div>
        ))}
      </div>

      {/* Recent */}
      <div style={{background:"#fff",borderRadius:14,padding:15,boxShadow:"0 1px 8px rgba(0,0,0,0.06)"}}>
        <div style={{fontWeight:800,fontSize:14,color:"#0F1923",marginBottom:11}}>🕐 Recent Transactions</div>
        {recent.length===0&&<Empty text="No transactions yet."/>}
        {recent.map(item=>(
          <div key={item.id} style={{display:"flex",justifyContent:"space-between",padding:"9px 0",borderBottom:"1px solid #F5F7FA"}}>
            <div>
              <div style={{fontSize:13.5,fontWeight:600}}>{item.customerName}</div>
              <div style={{fontSize:11.5,color:"#aaa"}}>{item.productName} · {fmtD(item.date)}</div>
            </div>
            <div style={{textAlign:"right"}}>
              <div style={{fontSize:14,fontWeight:800,color:item._t==="Trading Sale"?"#2980B9":"#27AE60"}}>₹{fmt(item.amount)}</div>
              <div style={{fontSize:10.5,color:"#bbb"}}>{item._t}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── TRADING TAB ──────────────────────────────────────────────
function TradingTab({data,onAdd,onAddPay,onDel,tradingOut}) {
  const [view,setView]=useState("sales");
  const [search,setSearch]=useState("");

  const sales = [...data.tradingSales]
    .filter(s=>!search||s.customerName?.toLowerCase().includes(search.toLowerCase())||s.productName?.toLowerCase().includes(search.toLowerCase()))
    .sort((a,b)=>new Date(b.date)-new Date(a.date));

  const payments = [...data.tradingPayments].sort((a,b)=>new Date(b.date)-new Date(a.date));

  return (
    <div>
      <div style={{display:"flex",gap:8,marginBottom:12,flexWrap:"wrap"}}>
        <Btn color="#2980B9" onClick={onAdd}>+ Sale Entry</Btn>
        <Btn color="#27AE60" onClick={onAddPay}>+ Payment</Btn>
      </div>
      <SegCtrl options={[{v:"sales",l:`🏪 Sales (${data.tradingSales.length})`},{v:"payments",l:`💰 Payments (${data.tradingPayments.length})`}]} val={view} onChange={setView}/>
      {view==="sales"&&<>
        <input placeholder="Search customer or product…" value={search} onChange={e=>setSearch(e.target.value)} style={{...IS,margin:"10px 0"}}/>
        {sales.length===0&&<Empty text="No trading sales yet."/>}
        {sales.map(s=>(
          <TapCard key={s.id} onDelete={()=>onDel("tradingSales",s.id)}>
            <Row><B>{s.customerName}</B><span style={{fontWeight:900,color:"#2980B9",fontSize:14}}>₹{fmt(s.amount)}</span></Row>
            <Mute>{s.productName} · {s.supplierName}</Mute>
            <Mute>{fmt(s.meters)} m @ ₹{fmt(s.rate)}/m · {fmtD(s.date)}</Mute>
            <div style={{marginTop:4,fontSize:11,color:"#8E44AD",fontWeight:600}}>💰 Comm: ₹{fmt(tradingCommission(s.meters))}</div>
          </TapCard>
        ))}
      </>}
      {view==="payments"&&<>
        {payments.length===0&&<Empty text="No payments yet."/>}
        {payments.map(p=>(
          <TapCard key={p.id} onDelete={()=>onDel("tradingPayments",p.id)}>
            <Row><B>{p.customerName}</B><span style={{fontWeight:900,color:"#27AE60"}}>₹{fmt(p.amount)}</span></Row>
            <Mute>{p.mode} · {fmtD(p.date)}</Mute>
            {p.remarks&&<Mute>📝 {p.remarks}</Mute>}
          </TapCard>
        ))}
      </>}
    </div>
  );
}

// ─── AGENCY TAB ───────────────────────────────────────────────
function AgencyTab({data,onAdd,onAddPay,onDel,agencyOut}) {
  const [view,setView]=useState("sales");
  const [search,setSearch]=useState("");

  const sales = [...data.agencySales]
    .filter(s=>!search||s.customerName?.toLowerCase().includes(search.toLowerCase())||s.productName?.toLowerCase().includes(search.toLowerCase()))
    .sort((a,b)=>new Date(b.date)-new Date(a.date));

  const payments = [...data.agencyPayments].sort((a,b)=>new Date(b.date)-new Date(a.date));

  return (
    <div>
      <div style={{display:"flex",gap:8,marginBottom:12,flexWrap:"wrap"}}>
        <Btn color="#27AE60" onClick={onAdd}>+ Sale Entry</Btn>
        <Btn color="#16A085" onClick={onAddPay}>+ Payment + CD</Btn>
      </div>
      <SegCtrl options={[{v:"sales",l:`🤝 Sales (${data.agencySales.length})`},{v:"payments",l:`💰 Payments (${data.agencyPayments.length})`}]} val={view} onChange={setView}/>
      {view==="sales"&&<>
        <input placeholder="Search customer or product…" value={search} onChange={e=>setSearch(e.target.value)} style={{...IS,margin:"10px 0"}}/>
        {sales.length===0&&<Empty text="No agency sales yet."/>}
        {sales.map(s=>(
          <TapCard key={s.id} onDelete={()=>onDel("agencySales",s.id)}>
            <Row><B>{s.customerName}</B><span style={{fontWeight:900,color:"#27AE60",fontSize:14}}>₹{fmt(s.amount)}</span></Row>
            <Mute>{s.productName} · {s.supplierName}</Mute>
            <Mute>{fmt(s.meters)} m @ ₹{fmt(s.rate)}/m · {fmtD(s.date)}</Mute>
            <div style={{marginTop:4,fontSize:11,color:"#16A085",fontWeight:600}}>CD Rate: {s.cdRate}%</div>
          </TapCard>
        ))}
      </>}
      {view==="payments"&&<>
        {payments.length===0&&<Empty text="No payments yet."/>}
        {payments.map(p=>(
          <TapCard key={p.id} onDelete={()=>onDel("agencyPayments",p.id)}>
            <Row><B>{p.customerName}</B><span style={{fontWeight:900,color:"#27AE60"}}>₹{fmt(p.netAmount)}</span></Row>
            <Mute>Gross: ₹{fmt(p.grossAmount)} · CD {p.cdPct}%: ₹{fmt(p.cdAmount)} · Days: {p.cdDays}</Mute>
            <div style={{fontSize:11,color:"#16A085",fontWeight:600,marginTop:3}}>💰 Comm: ₹{fmt(p.commission)}</div>
            <Mute>{p.mode} · {fmtD(p.date)}</Mute>
          </TapCard>
        ))}
      </>}
    </div>
  );
}

// ─── OUTSTANDING TAB ──────────────────────────────────────────
function OutstandingTab({tradingOut,agencyOut,data,onTradingPay,onAgencyPay}) {
  const [view,setView]=useState("trading");

  const phoneMap={};
  data.customers.forEach(c=>{phoneMap[c.id]=c.phone;});

  const tradingEntries = Object.entries(tradingOut)
    .map(([id,v])=>({id,...v,net:Math.max(0,v.due-v.paid)}))
    .filter(e=>e.net>0).sort((a,b)=>b.net-a.net);

  const agencyEntries = Object.entries(agencyOut)
    .map(([id,v])=>({id,...v,net:Math.max(0,v.due-v.paid-v.cdGiven)}))
    .filter(e=>e.net>0).sort((a,b)=>b.net-a.net);

  const buildWAMsg = (entries, type) => {
    const d = new Date().toLocaleDateString("en-IN");
    const lines = entries.map(e=>`• ${e.name}: ₹${fmt(e.net)}`).join("\n");
    const total = entries.reduce((a,e)=>a+e.net,0);
    return `🧵 *Fabric Business — ${type} Outstanding*\n📅 ${d}\n\n${lines}\n\n*Total: ₹${fmt(total)}*`;
  };

  const buildPartyWA = (e, type) => {
    const d = new Date().toLocaleDateString("en-IN");
    return `🧵 *Fabric Business*\n📅 ${d}\n\nDear *${e.name}*,\n\nYour ${type} outstanding:\n💰 Total Due: ₹${fmt(e.due)}\n✅ Paid: ₹${fmt(e.paid)}${type==="Agency"?`\n🎁 CD Given: ₹${fmt(e.cdGiven||0)}`:""}\n⚠️ *Balance: ₹${fmt(e.net)}*\n\nKindly arrange payment 🙏`;
  };

  return (
    <div>
      <SegCtrl options={[{v:"trading",l:"🏪 Trading"},{v:"agency",l:"🤝 Agency"}]} val={view} onChange={setView}/>
      <div style={{margin:"12px 0 8px",display:"flex",gap:8}}>
        {view==="trading"
          ? <><Btn color="#2980B9" onClick={onTradingPay}>+ Trading Payment</Btn>
              <Btn color="#25D366" onClick={()=>waOpen("",buildWAMsg(tradingEntries,"Trading"))}>📲 WA Summary</Btn></>
          : <><Btn color="#27AE60" onClick={onAgencyPay}>+ Agency Payment</Btn>
              <Btn color="#25D366" onClick={()=>waOpen("",buildWAMsg(agencyEntries,"Agency"))}>📲 WA Summary</Btn></>}
      </div>

      {/* Summary card */}
      <div style={{background:"#fff",borderRadius:12,padding:12,marginBottom:12,boxShadow:"0 1px 8px rgba(0,0,0,0.06)",borderLeft:`4px solid ${view==="trading"?"#2980B9":"#27AE60"}`}}>
        <Mute>Total {view==="trading"?"Trading":"Agency"} Outstanding</Mute>
        <div style={{fontSize:22,fontWeight:900,color:view==="trading"?"#2980B9":"#27AE60"}}>
          ₹{fmt(view==="trading"
            ? tradingEntries.reduce((a,e)=>a+e.net,0)
            : agencyEntries.reduce((a,e)=>a+e.net,0))}
        </div>
      </div>

      {view==="trading"&&<>
        {tradingEntries.length===0&&<Empty text="No trading outstanding! ✅"/>}
        {tradingEntries.map(e=>(
          <div key={e.id} style={{background:"#fff",borderRadius:13,padding:"13px 15px",marginBottom:10,boxShadow:"0 1px 8px rgba(0,0,0,0.06)",borderLeft:"4px solid #2980B9"}}>
            <Row><B style={{fontSize:15}}>{e.name}</B><span style={{fontWeight:900,fontSize:16,color:"#E74C3C"}}>₹{fmt(e.net)}</span></Row>
            <Mute>Due: ₹{fmt(e.due)} · Paid: ₹{fmt(e.paid)}</Mute>
            <button onClick={()=>waOpen(phoneMap[e.id]||"",buildPartyWA(e,"Trading"))}
              style={{marginTop:9,background:"#E8FBF0",color:"#25D366",border:"1px solid #25D366",borderRadius:9,padding:"9px 16px",fontSize:13,fontWeight:700,cursor:"pointer",minHeight:42}}>
              📲 WhatsApp
            </button>
          </div>
        ))}
      </>}

      {view==="agency"&&<>
        {agencyEntries.length===0&&<Empty text="No agency outstanding! ✅"/>}
        {agencyEntries.map(e=>(
          <div key={e.id} style={{background:"#fff",borderRadius:13,padding:"13px 15px",marginBottom:10,boxShadow:"0 1px 8px rgba(0,0,0,0.06)",borderLeft:"4px solid #27AE60"}}>
            <Row><B style={{fontSize:15}}>{e.name}</B><span style={{fontWeight:900,fontSize:16,color:"#E74C3C"}}>₹{fmt(e.net)}</span></Row>
            <Mute>Due: ₹{fmt(e.due)} · Paid: ₹{fmt(e.paid)} · CD Given: ₹{fmt(e.cdGiven)}</Mute>
            <button onClick={()=>waOpen(phoneMap[e.id]||"",buildPartyWA(e,"Agency"))}
              style={{marginTop:9,background:"#E8FBF0",color:"#25D366",border:"1px solid #25D366",borderRadius:9,padding:"9px 16px",fontSize:13,fontWeight:700,cursor:"pointer",minHeight:42}}>
              📲 WhatsApp
            </button>
          </div>
        ))}
      </>}
    </div>
  );
}

// ─── AGING TAB (Customer-wise Outstanding with Ageing) ─────────
function AgingTab({data}) {
  const [view,setView]=useState("all");
  const [search,setSearch]=useState("");
  const [expanded,setExpanded]=useState(null);
  const todayMs = new Date().setHours(0,0,0,0);

  function buildAging(sales, payments, label) {
    const map={};
    sales.forEach(s=>{
      if(!map[s.customerId]) map[s.customerId]={name:s.customerName,invoices:[]};
      map[s.customerId].invoices.push({date:s.date,amount:+s.amount||0,id:s.id,productName:s.productName});
    });
    // Simple: total paid deducted from oldest first
    const paidMap={};
    payments.forEach(p=>{ paidMap[p.customerId]=(paidMap[p.customerId]||0)+(+p.amount||+(p.netAmount)||0); });

    return Object.entries(map).map(([id,v])=>{
      let remaining = paidMap[id]||0;
      const buckets={b0:0,b30:0,b60:0,b90:0,b120:0};
      const openInvoices=[];
      const sorted=[...v.invoices].sort((a,b)=>new Date(a.date)-new Date(b.date));
      sorted.forEach(inv=>{
        let amt=inv.amount;
        const deduct=Math.min(amt,remaining); amt-=deduct; remaining-=deduct;
        if(amt<=0) return;
        const days=Math.floor((todayMs-new Date(inv.date).setHours(0,0,0,0))/86400000);
        let bucket;
        if(days<=30)       {buckets.b0  +=amt; bucket="0–30d";}
        else if(days<=60)  {buckets.b30 +=amt; bucket="31–60d";}
        else if(days<=90)  {buckets.b60 +=amt; bucket="61–90d";}
        else if(days<=120) {buckets.b90 +=amt; bucket="91–120d";}
        else               {buckets.b120+=amt; bucket="120d+";}
        openInvoices.push({...inv,outstanding:amt,days,bucket,type:label});
      });
      const total=Object.values(buckets).reduce((a,b)=>a+b,0);
      return {id,name:v.name,...buckets,total,openInvoices};
    }).filter(e=>e.total>0);
  }

  const tradingAging = buildAging(data.tradingSales, data.tradingPayments, "Trading");
  const agencyAging  = buildAging(data.agencySales,  data.agencyPayments, "Agency");

  // Merge trading + agency per customer into one combined, customer-wise view
  const combinedMap = {};
  tradingAging.forEach(e=>{
    combinedMap[e.id] = combinedMap[e.id] || {id:e.id,name:e.name,b0:0,b30:0,b60:0,b90:0,b120:0,total:0,openInvoices:[],hasTrading:false,hasAgency:false};
    const c=combinedMap[e.id];
    c.b0+=e.b0; c.b30+=e.b30; c.b60+=e.b60; c.b90+=e.b90; c.b120+=e.b120; c.total+=e.total;
    c.openInvoices.push(...e.openInvoices); c.hasTrading=true;
  });
  agencyAging.forEach(e=>{
    combinedMap[e.id] = combinedMap[e.id] || {id:e.id,name:e.name,b0:0,b30:0,b60:0,b90:0,b120:0,total:0,openInvoices:[],hasTrading:false,hasAgency:false};
    const c=combinedMap[e.id];
    c.b0+=e.b0; c.b30+=e.b30; c.b60+=e.b60; c.b90+=e.b90; c.b120+=e.b120; c.total+=e.total;
    c.openInvoices.push(...e.openInvoices); c.hasAgency=true;
  });

  const allEntries = Object.values(combinedMap).sort((a,b)=>b.total-a.total);
  const sourceEntries =
    view==="trading" ? tradingAging.sort((a,b)=>b.total-a.total) :
    view==="agency"  ? agencyAging.sort((a,b)=>b.total-a.total) :
    allEntries;

  const entries = sourceEntries.filter(e=>!search||e.name?.toLowerCase().includes(search.toLowerCase()));

  const phoneMap={};
  data.customers.forEach(c=>{phoneMap[c.id]=c.phone;});

  const buckets=[
    {key:"b0",  label:"0–30d",  color:"#27AE60",bg:"#E9F7EF"},
    {key:"b30", label:"31–60d", color:"#F39C12",bg:"#FEF9E7"},
    {key:"b60", label:"61–90d", color:"#E67E22",bg:"#FEF3E7"},
    {key:"b90", label:"91–120d",color:"#C0392B",bg:"#FADBD8"},
    {key:"b120",label:"120d+",  color:"#922B21",bg:"#F5B7B1"},
  ];

  const totals=entries.reduce((acc,e)=>{
    buckets.forEach(b=>acc[b.key]=(acc[b.key]||0)+e[b.key]);
    acc.total=(acc.total||0)+e.total; return acc;
  },{});

  const buildAgingWA=()=>{
    const d=new Date().toLocaleDateString("en-IN");
    const lines=entries.map(e=>`• ${e.name}: ₹${fmt(e.total)} (120d+: ₹${fmt(e.b120)})`).join("\n");
    const label = view==="trading"?"Trading":view==="agency"?"Agency":"Customer-wise";
    return `🧵 *${label} Outstanding & Ageing*\n📅 ${d}\n\n${lines}\n\n*Total: ₹${fmt(totals.total||0)}*`;
  };

  const buildPartyAgingWA=(e)=>{
    const d=new Date().toLocaleDateString("en-IN");
    const lines = buckets.filter(b=>e[b.key]>0).map(b=>`${b.label}: ₹${fmt(e[b.key])}`).join("\n");
    return `🧵 *Fabric Business*\n📅 ${d}\n\nDear *${e.name}*,\n\nYour outstanding ageing summary:\n${lines}\n\n⚠️ *Total Due: ₹${fmt(e.total)}*\n\nKindly arrange payment 🙏`;
  };

  return (
    <div>
      <SecTitle>Customer-wise Outstanding &amp; Ageing</SecTitle>
      <SegCtrl options={[{v:"all",l:"👥 All"},{v:"trading",l:"🏪 Trading"},{v:"agency",l:"🤝 Agency"}]} val={view} onChange={setView}/>
      <input placeholder="🔎 Search customer…" value={search} onChange={e=>setSearch(e.target.value)} style={{...IS,margin:"10px 0"}}/>

      {/* Summary buckets */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:9,margin:"4px 0 12px"}}>
        {buckets.map(b=>(
          <div key={b.key} style={{background:b.bg,borderRadius:12,padding:"11px 12px",borderLeft:`4px solid ${b.color}`}}>
            <div style={{fontSize:10.5,color:b.color,fontWeight:700,textTransform:"uppercase"}}>{b.label}</div>
            <div style={{fontSize:16,fontWeight:900,color:b.color,marginTop:3}}>₹{fmt(totals[b.key]||0)}</div>
          </div>
        ))}
      </div>

      <div style={{background:"linear-gradient(135deg,#0F1923,#1A3A5C)",borderRadius:14,padding:"14px 16px",marginBottom:16,display:"flex",justifyContent:"space-between",alignItems:"center",gap:10}}>
        <div>
          <div style={{fontSize:10.5,color:"#E8C97E",textTransform:"uppercase",letterSpacing:1,fontWeight:600}}>Total Outstanding ({entries.length} customers)</div>
          <div style={{fontSize:24,fontWeight:900,color:"#fff"}}>₹{fmt(totals.total||0)}</div>
        </div>
        <button onClick={()=>waOpen("",buildAgingWA())}
          style={{background:"#25D366",color:"#fff",border:"none",borderRadius:10,padding:"11px 16px",fontSize:13,fontWeight:700,cursor:"pointer",flexShrink:0,minHeight:44}}>
          📲 Share
        </button>
      </div>

      {entries.length===0&&<Empty text="No outstanding found."/>}
      {entries.map(e=>{
        const isOpen = expanded===e.id;
        return (
        <div key={e.id} style={{background:"#fff",borderRadius:14,padding:"14px 15px",marginBottom:11,boxShadow:"0 1px 8px rgba(0,0,0,0.07)"}}>
          <div onClick={()=>setExpanded(isOpen?null:e.id)} style={{cursor:"pointer"}}>
            <Row>
              <div>
                <B style={{fontSize:15}}>{e.name}</B>
                {view==="all"&&(e.hasTrading||e.hasAgency)&&(
                  <div style={{display:"flex",gap:5,marginTop:4}}>
                    {e.hasTrading&&<span style={{fontSize:9.5,padding:"2px 8px",borderRadius:20,background:"#EAF4FC",color:"#2980B9",fontWeight:700}}>🏪 Trading</span>}
                    {e.hasAgency&&<span style={{fontSize:9.5,padding:"2px 8px",borderRadius:20,background:"#E9F7EF",color:"#27AE60",fontWeight:700}}>🤝 Agency</span>}
                  </div>
                )}
              </div>
              <span style={{fontWeight:900,fontSize:17,color:"#C0392B"}}>₹{fmt(e.total)}</span>
            </Row>
          </div>

          <div style={{marginTop:10}}>
            {buckets.map(b=>e[b.key]>0&&(
              <div key={b.key} style={{display:"flex",alignItems:"center",gap:8,marginBottom:5}}>
                <div style={{fontSize:10.5,color:b.color,fontWeight:700,width:64,flexShrink:0}}>{b.label}</div>
                <div style={{flex:1,background:"#F0F4F8",borderRadius:5,height:7}}>
                  <div style={{width:`${Math.min(100,e[b.key]/e.total*100)}%`,background:b.color,height:7,borderRadius:5}}/>
                </div>
                <div style={{fontSize:12,fontWeight:700,color:b.color,width:78,textAlign:"right",flexShrink:0}}>₹{fmt(e[b.key])}</div>
              </div>
            ))}
          </div>

          {isOpen&&(
            <div style={{marginTop:10,paddingTop:10,borderTop:"1px solid #F0F4F8"}}>
              <Mute style={{marginBottom:6,fontWeight:700,color:"#888"}}>Open Invoices ({e.openInvoices.length})</Mute>
              {e.openInvoices.sort((a,b)=>b.days-a.days).map(inv=>(
                <div key={inv.id+inv.type} style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:"1px solid #F7F9FB"}}>
                  <div>
                    <div style={{fontSize:12.5,fontWeight:600}}>{inv.productName||"—"} <span style={{color:"#bbb",fontWeight:500}}>· {inv.type}</span></div>
                    <div style={{fontSize:10.5,color:"#bbb"}}>{fmtD(inv.date)} · {inv.days}d old · {inv.bucket}</div>
                  </div>
                  <div style={{fontWeight:800,fontSize:12.5,color:"#C0392B",alignSelf:"center"}}>₹{fmt(inv.outstanding)}</div>
                </div>
              ))}
            </div>
          )}

          <div style={{display:"flex",gap:8,marginTop:11,flexWrap:"wrap"}}>
            <button onClick={()=>waOpen(phoneMap[e.id]||"",buildPartyAgingWA(e))}
              style={{background:"#E8FBF0",color:"#25D366",border:"1px solid #25D366",borderRadius:9,padding:"9px 14px",fontSize:12,fontWeight:700,cursor:"pointer",minHeight:40}}>
              📲 WhatsApp
            </button>
            {e.b120>0&&(
              <button onClick={()=>waOpen(phoneMap[e.id]||"",`🧵 Dear ${e.name},\n\n⚠️ Your payment of ₹${fmt(e.b120)} is overdue 120+ days.\n\nTotal outstanding: ₹${fmt(e.total)}\n\nKindly arrange immediately 🙏`)}
                style={{background:"#FADBD8",color:"#922B21",border:"1px solid #922B21",borderRadius:9,padding:"9px 14px",fontSize:12,fontWeight:700,cursor:"pointer",minHeight:40}}>
                ⚠️ Urgent Reminder
              </button>
            )}
          </div>
        </div>
      );})}
    </div>
  );
}

// ─── COMMISSION TAB ───────────────────────────────────────────
function CommissionTab({data,totTradingComm,totAgencyComm}) {
  const [view,setView]=useState("summary");

  const monthly={trading:{},agency:{}};
  data.tradingSales.forEach(s=>{
    const k=s.date?.slice(0,7)||"?";
    if(!monthly.trading[k]) monthly.trading[k]={meters:0,comm:0,count:0};
    monthly.trading[k].meters+=+s.meters||0;
    monthly.trading[k].comm+=tradingCommission(s.meters);
    monthly.trading[k].count++;
  });
  data.agencyPayments.forEach(p=>{
    const k=p.date?.slice(0,7)||"?";
    if(!monthly.agency[k]) monthly.agency[k]={amount:0,comm:0,count:0};
    monthly.agency[k].amount+=+p.netAmount||0;
    monthly.agency[k].comm+=+p.commission||0;
    monthly.agency[k].count++;
  });

  const buildWA=()=>{
    const d=new Date().toLocaleDateString("en-IN");
    return `🧵 *Commission Report*\n📅 ${d}\n\n🏪 Trading: ₹${fmt(totTradingComm)}\n🤝 Agency: ₹${fmt(totAgencyComm)}\n\n*Total: ₹${fmt(totTradingComm+totAgencyComm)}*`;
  };

  return (
    <div>
      {/* Total banner */}
      <div style={{background:"linear-gradient(135deg,#0F1923,#1A3A5C)",borderRadius:16,padding:"14px 16px",marginBottom:14,border:"1px solid rgba(232,201,126,0.3)",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div>
          <div style={{fontSize:10,color:"#E8C97E",letterSpacing:2,textTransform:"uppercase"}}>Total Commission</div>
          <div style={{fontSize:28,fontWeight:900,color:"#E8C97E"}}>₹{fmt(totTradingComm+totAgencyComm)}</div>
        </div>
        <button onClick={()=>waOpen("",buildWA())} style={{background:"#25D366",color:"#fff",border:"none",borderRadius:10,padding:"8px 14px",fontSize:12,fontWeight:700,cursor:"pointer"}}>📲 Share</button>
      </div>

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:14}}>
        <div style={{background:"#EAF4FC",borderRadius:14,padding:"12px",borderLeft:"4px solid #2980B9"}}>
          <div style={{fontSize:10,color:"#2980B9",fontWeight:600,textTransform:"uppercase"}}>Trading</div>
          <div style={{fontSize:18,fontWeight:900,color:"#2980B9"}}>₹{fmt(totTradingComm)}</div>
          <div style={{fontSize:10,color:"#aaa"}}>@ ₹1.5/m</div>
        </div>
        <div style={{background:"#E9F7EF",borderRadius:14,padding:"12px",borderLeft:"4px solid #27AE60"}}>
          <div style={{fontSize:10,color:"#27AE60",fontWeight:600,textTransform:"uppercase"}}>Agency</div>
          <div style={{fontSize:18,fontWeight:900,color:"#27AE60"}}>₹{fmt(totAgencyComm)}</div>
          <div style={{fontSize:10,color:"#aaa"}}>@ 0.5% on net</div>
        </div>
      </div>

      <SegCtrl options={[{v:"summary",l:"Monthly"},{v:"trading",l:"Trading Detail"},{v:"agency",l:"Agency Detail"}]} val={view} onChange={setView}/>
      <div style={{marginTop:12}}>
        {view==="summary"&&<>
          {[...new Set([...Object.keys(monthly.trading),...Object.keys(monthly.agency)])].sort((a,b)=>b.localeCompare(a)).map(m=>(
            <div key={m} style={{background:"#fff",borderRadius:12,padding:"12px 14px",marginBottom:8,boxShadow:"0 1px 6px rgba(0,0,0,0.05)"}}>
              <Row><B style={{fontSize:13}}>{m}</B><span style={{fontWeight:900,color:"#8E44AD"}}>₹{fmt((monthly.trading[m]?.comm||0)+(monthly.agency[m]?.comm||0))}</span></Row>
              {monthly.trading[m]&&<Mute>🏪 Trading: ₹{fmt(monthly.trading[m].comm)} ({fmt(monthly.trading[m].meters)}m)</Mute>}
              {monthly.agency[m] &&<Mute>🤝 Agency: ₹{fmt(monthly.agency[m].comm)}</Mute>}
            </div>
          ))}
          {Object.keys(monthly.trading).length===0&&Object.keys(monthly.agency).length===0&&<Empty text="No commission data yet."/>}
        </>}

        {view==="trading"&&<>
          {data.tradingSales.length===0&&<Empty text="No trading sales yet."/>}
          {[...data.tradingSales].sort((a,b)=>new Date(b.date)-new Date(a.date)).map(s=>(
            <div key={s.id} style={{background:"#fff",borderRadius:12,padding:"11px 14px",marginBottom:8,boxShadow:"0 1px 6px rgba(0,0,0,0.05)",borderLeft:"3px solid #2980B9"}}>
              <Row><B>{s.customerName}</B><span style={{fontWeight:900,color:"#8E44AD"}}>₹{fmt(tradingCommission(s.meters))}</span></Row>
              <Mute>{s.productName} · {fmt(s.meters)}m × ₹1.5 · {fmtD(s.date)}</Mute>
            </div>
          ))}
        </>}

        {view==="agency"&&<>
          {data.agencyPayments.length===0&&<Empty text="No agency payments yet."/>}
          {[...data.agencyPayments].sort((a,b)=>new Date(b.date)-new Date(a.date)).map(p=>(
            <div key={p.id} style={{background:"#fff",borderRadius:12,padding:"11px 14px",marginBottom:8,boxShadow:"0 1px 6px rgba(0,0,0,0.05)",borderLeft:"3px solid #27AE60"}}>
              <Row><B>{p.customerName}</B><span style={{fontWeight:900,color:"#8E44AD"}}>₹{fmt(p.commission)}</span></Row>
              <Mute>Net Received: ₹{fmt(p.netAmount)} × 0.5% · {fmtD(p.date)}</Mute>
            </div>
          ))}
        </>}
      </div>
    </div>
  );
}

// ─── MASTERS TAB ──────────────────────────────────────────────
function MastersTab({data,onAdd,onDel}) {
  const [view,setView]=useState("customers");
  return (
    <div>
      <button onClick={()=>onAdd({type:"tallyImport"})}
        style={{width:"100%",background:"linear-gradient(135deg,#1A3A5C,#0F1923)",color:"#E8C97E",border:"1px solid rgba(232,201,126,0.4)",borderRadius:12,padding:"13px",fontSize:13.5,fontWeight:800,cursor:"pointer",marginBottom:14,minHeight:48}}>
        📥 Import Sales (Tally / Excel)
      </button>
      <SegCtrl options={[{v:"customers",l:`👤 Customers (${data.customers.length})`},{v:"suppliers",l:`🏭 Suppliers (${data.suppliers.length})`},{v:"products",l:`📦 Products (${data.products.length})`}]} val={view} onChange={setView}/>
      <div style={{marginTop:12}}>
        {view==="customers"&&<>
          <Btn color="#0F1923" onClick={()=>onAdd({type:"customer"})} style={{marginBottom:12}}>+ Add Customer</Btn>
          {data.customers.length===0&&<Empty text="No customers yet."/>}
          {data.customers.map(c=>(
            <TapCard key={c.id} onDelete={()=>onDel("customers",c.id)}>
              <Row><B style={{fontSize:14}}>{c.name}</B>
                <span style={{fontSize:10.5,padding:"2px 10px",borderRadius:20,background:"#EAF0FB",color:"#1A3A5C",fontWeight:700}}>{c.type}</span>
              </Row>
              <Mute>📞 {c.phone||"—"} · 🏙️ {c.city||"—"}</Mute>
              {c.cdRate&&<Mute>CD: {c.cdRate}%</Mute>}
              {c.gstin&&<Mute>GSTIN: {c.gstin}</Mute>}
            </TapCard>
          ))}
        </>}
        {view==="suppliers"&&<>
          <Btn color="#0F1923" onClick={()=>onAdd({type:"supplier"})} style={{marginBottom:12}}>+ Add Supplier</Btn>
          {data.suppliers.length===0&&<Empty text="No suppliers yet."/>}
          {data.suppliers.map(s=>(
            <TapCard key={s.id} onDelete={()=>onDel("suppliers",s.id)}>
              <B style={{fontSize:14}}>{s.name}</B>
              <Mute>📞 {s.phone||"—"} · 🏙️ {s.city||"—"}</Mute>
            </TapCard>
          ))}
        </>}
        {view==="products"&&<>
          <Btn color="#0F1923" onClick={()=>onAdd({type:"product"})} style={{marginBottom:12}}>+ Add Product</Btn>
          {data.products.length===0&&<Empty text="No products yet."/>}
          {/* Group by supplier */}
          {[...new Set(data.products.map(p=>p.supplierName))].sort().map(sup=>(
            <div key={sup} style={{marginBottom:14}}>
              <div style={{fontSize:11,fontWeight:800,color:"#1A3A5C",textTransform:"uppercase",letterSpacing:1,marginBottom:6,padding:"4px 8px",background:"#EAF0FB",borderRadius:6}}>🏭 {sup}</div>
              {data.products.filter(p=>p.supplierName===sup).map(p=>(
                <TapCard key={p.id} onDelete={()=>onDel("products",p.id)}>
                  <Row><B>{p.name}</B><Mute>{p.unit||"Mtr"}</Mute></Row>
                </TapCard>
              ))}
            </div>
          ))}
        </>}
      </div>
    </div>
  );
}

// ─── REPORTS TAB ──────────────────────────────────────────────
function ReportsTab({data,tradingOut,agencyOut,totTradingSale,totAgencySale}) {
  const [rep,setRep]=useState("tradingSales");

  const exportTradingCSV=()=>{
    const rows=[["Date","Customer","Product","Supplier","Meters","Rate","Amount","Commission"]];
    data.tradingSales.forEach(s=>rows.push([s.date,s.customerName,s.productName,s.supplierName,s.meters,s.rate,s.amount,tradingCommission(s.meters).toFixed(2)]));
    exportCSV(rows,`Trading_Sales_${today()}.csv`);
  };
  const exportAgencyCSV=()=>{
    const rows=[["Date","Customer","Product","Supplier","Meters","Rate","Amount","CD%"]];
    data.agencySales.forEach(s=>rows.push([s.date,s.customerName,s.productName,s.supplierName,s.meters,s.rate,s.amount,s.cdRate]));
    exportCSV(rows,`Agency_Sales_${today()}.csv`);
  };
  const exportOutstandingCSV=()=>{
    const rows=[["Type","Customer","Total Due","Paid","Balance"]];
    Object.entries(tradingOut).forEach(([,v])=>rows.push(["Trading",v.name,v.due,v.paid,Math.max(0,v.due-v.paid)]));
    Object.entries(agencyOut).forEach(([,v])=>rows.push(["Agency",v.name,v.due,v.paid,Math.max(0,v.due-v.paid-v.cdGiven)]));
    exportCSV(rows,`Outstanding_${today()}.csv`);
  };
  const exportCommCSV=()=>{
    const rows=[["Type","Date","Customer","Product","Meters","Sale Amount","Commission"]];
    data.tradingSales.forEach(s=>rows.push(["Trading",s.date,s.customerName,s.productName,s.meters,s.amount,tradingCommission(s.meters).toFixed(2)]));
    data.agencyPayments.forEach(p=>rows.push(["Agency",p.date,p.customerName,"","",(p.netAmount||0),(p.commission||0)]));
    exportCSV(rows,`Commission_${today()}.csv`);
  };

  const repOptions=[
    {v:"tradingSales",l:"Trading Sales"},
    {v:"agencySales", l:"Agency Sales"},
    {v:"outstanding", l:"Outstanding"},
    {v:"commission",  l:"Commission"},
  ];

  return (
    <div>
      <div style={{display:"flex",overflowX:"auto",WebkitOverflowScrolling:"touch",gap:8,marginBottom:14,scrollbarWidth:"none"}}>
        {repOptions.map(r=>(
          <button key={r.v} onClick={()=>setRep(r.v)}
            style={{flex:"0 0 auto",padding:"10px 16px",borderRadius:20,fontSize:13,fontWeight:rep===r.v?700:500,border:`1.5px solid ${rep===r.v?"#0F1923":"#ddd"}`,background:rep===r.v?"#0F1923":"#fff",color:rep===r.v?"#E8C97E":"#666",cursor:"pointer",minHeight:42}}>
            {r.l}
          </button>
        ))}
      </div>

      {rep==="tradingSales"&&<>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
          <SecTitle>Trading Sales Report</SecTitle>
          <button onClick={exportTradingCSV} style={{background:"#27AE60",color:"#fff",border:"none",borderRadius:9,padding:"9px 15px",fontSize:12.5,fontWeight:700,cursor:"pointer",minHeight:40}}>📊 Export CSV</button>
        </div>
        <div style={{background:"#EAF4FC",borderRadius:12,padding:12,marginBottom:12}}>
          <Mute>Total Trading Sales</Mute>
          <div style={{fontSize:22,fontWeight:900,color:"#2980B9"}}>₹{fmt(totTradingSale)}</div>
          <Mute>{data.tradingSales.length} entries · Comm: ₹{fmt(data.tradingSales.reduce((a,s)=>a+tradingCommission(s.meters),0))}</Mute>
        </div>
        {data.tradingSales.length===0&&<Empty text="No trading sales."/>}
        {[...data.tradingSales].sort((a,b)=>new Date(b.date)-new Date(a.date)).map(s=>(
          <div key={s.id} style={{background:"#fff",borderRadius:12,padding:"11px 13px",marginBottom:8,boxShadow:"0 1px 6px rgba(0,0,0,0.05)"}}>
            <Row><B>{s.customerName}</B><span style={{fontWeight:800,color:"#2980B9"}}>₹{fmt(s.amount)}</span></Row>
            <Mute>{s.productName} · {s.supplierName} · {fmt(s.meters)}m · {fmtD(s.date)}</Mute>
            <Mute style={{color:"#8E44AD"}}>Comm: ₹{fmt(tradingCommission(s.meters))}</Mute>
          </div>
        ))}
      </>}

      {rep==="agencySales"&&<>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
          <SecTitle>Agency Sales Report</SecTitle>
          <button onClick={exportAgencyCSV} style={{background:"#27AE60",color:"#fff",border:"none",borderRadius:9,padding:"9px 15px",fontSize:12.5,fontWeight:700,cursor:"pointer",minHeight:40}}>📊 Export CSV</button>
        </div>
        <div style={{background:"#E9F7EF",borderRadius:12,padding:12,marginBottom:12}}>
          <Mute>Total Agency Sales</Mute>
          <div style={{fontSize:22,fontWeight:900,color:"#27AE60"}}>₹{fmt(totAgencySale)}</div>
          <Mute>{data.agencySales.length} entries</Mute>
        </div>
        {data.agencySales.length===0&&<Empty text="No agency sales."/>}
        {[...data.agencySales].sort((a,b)=>new Date(b.date)-new Date(a.date)).map(s=>(
          <div key={s.id} style={{background:"#fff",borderRadius:12,padding:"11px 13px",marginBottom:8,boxShadow:"0 1px 6px rgba(0,0,0,0.05)"}}>
            <Row><B>{s.customerName}</B><span style={{fontWeight:800,color:"#27AE60"}}>₹{fmt(s.amount)}</span></Row>
            <Mute>{s.productName} · {s.supplierName} · {fmt(s.meters)}m · {fmtD(s.date)}</Mute>
            <Mute>CD: {s.cdRate}%</Mute>
          </div>
        ))}
      </>}

      {rep==="outstanding"&&<>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
          <SecTitle>Outstanding Report</SecTitle>
          <button onClick={exportOutstandingCSV} style={{background:"#27AE60",color:"#fff",border:"none",borderRadius:9,padding:"9px 15px",fontSize:12.5,fontWeight:700,cursor:"pointer",minHeight:40}}>📊 Export CSV</button>
        </div>
        <div style={{fontWeight:700,fontSize:12,color:"#2980B9",marginBottom:6}}>🏪 Trading</div>
        {Object.entries(tradingOut).filter(([,v])=>v.due-v.paid>0).map(([id,v])=>(
          <div key={id} style={{background:"#fff",borderRadius:12,padding:"10px 13px",marginBottom:7,boxShadow:"0 1px 6px rgba(0,0,0,0.05)",borderLeft:"3px solid #2980B9"}}>
            <Row><B>{v.name}</B><span style={{fontWeight:900,color:"#E74C3C"}}>₹{fmt(v.due-v.paid)}</span></Row>
            <Mute>Due: ₹{fmt(v.due)} · Paid: ₹{fmt(v.paid)}</Mute>
          </div>
        ))}
        {Object.entries(tradingOut).filter(([,v])=>v.due-v.paid<=0).length===Object.keys(tradingOut).length&&<Empty text="No trading outstanding ✅"/>}
        <div style={{fontWeight:700,fontSize:12,color:"#27AE60",margin:"12px 0 6px"}}>🤝 Agency</div>
        {Object.entries(agencyOut).filter(([,v])=>v.due-v.paid-v.cdGiven>0).map(([id,v])=>(
          <div key={id} style={{background:"#fff",borderRadius:12,padding:"10px 13px",marginBottom:7,boxShadow:"0 1px 6px rgba(0,0,0,0.05)",borderLeft:"3px solid #27AE60"}}>
            <Row><B>{v.name}</B><span style={{fontWeight:900,color:"#E74C3C"}}>₹{fmt(v.due-v.paid-v.cdGiven)}</span></Row>
            <Mute>Due: ₹{fmt(v.due)} · Paid: ₹{fmt(v.paid)} · CD: ₹{fmt(v.cdGiven)}</Mute>
          </div>
        ))}
        {Object.entries(agencyOut).filter(([,v])=>v.due-v.paid-v.cdGiven<=0).length===Object.keys(agencyOut).length&&<Empty text="No agency outstanding ✅"/>}
      </>}

      {rep==="commission"&&<>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
          <SecTitle>Commission Report</SecTitle>
          <button onClick={exportCommCSV} style={{background:"#27AE60",color:"#fff",border:"none",borderRadius:9,padding:"9px 15px",fontSize:12.5,fontWeight:700,cursor:"pointer",minHeight:40}}>📊 Export CSV</button>
        </div>
        <div style={{background:"#F4ECF7",borderRadius:12,padding:12,marginBottom:12}}>
          <Mute>Total Commission</Mute>
          <div style={{fontSize:22,fontWeight:900,color:"#8E44AD"}}>₹{fmt(data.tradingSales.reduce((a,s)=>a+tradingCommission(s.meters),0)+data.agencyPayments.reduce((a,p)=>a+(+p.commission||0),0))}</div>
        </div>
      </>}
    </div>
  );
}

// ─── MODALS ───────────────────────────────────────────────────
function ModalBase({title,onClose,children}) {
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",zIndex:200,display:"flex",alignItems:"flex-end"}} onClick={onClose}>
      <div style={{background:"#fff",width:"100%",maxWidth:560,margin:"0 auto",borderRadius:"20px 20px 0 0",padding:"18px 16px calc(env(safe-area-inset-bottom,0px) + 28px)",maxHeight:"92vh",overflowY:"auto"}} onClick={e=>e.stopPropagation()}>
        <Row style={{marginBottom:16}}>
          <B style={{fontSize:16.5,color:"#0F1923"}}>{title}</B>
          <button onClick={onClose} style={{background:"#F0F4F8",border:"none",borderRadius:20,width:38,height:38,fontSize:16,cursor:"pointer",color:"#555",flexShrink:0}}>✕</button>
        </Row>
        {children}
      </div>
    </div>
  );
}
function F({label,children}) {
  return <div style={{marginBottom:13}}><label style={{fontSize:12.5,color:"#666",fontWeight:600,display:"block",marginBottom:5}}>{label}</label>{children}</div>;
}
function SaveBtn({color,onClick,children}) {
  return <button onClick={onClick} style={{background:color,color:"#fff",border:"none",borderRadius:12,padding:"15px",fontSize:15.5,fontWeight:800,cursor:"pointer",width:"100%",marginTop:10,minHeight:50}}>{children}</button>;
}

// Smart input with datalist suggestions
function SmartInput({value,onChange,placeholder,list,idPrefix}) {
  const lid=`${idPrefix}-list`;
  return <>
    <input list={lid} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} style={IS} autoComplete="off"/>
    <datalist id={lid}>{list.map(i=><option key={i} value={i}/>)}</datalist>
  </>;
}

function TradingSaleModal({data,onSave,onClose}) {
  const [f,sf]=useState({date:today(),customerId:"",customerName:"",productId:"",productName:"",supplierName:"",meters:"",rate:"",amount:"",remarks:""});
  const s=(k,v)=>{
    const u={...f,[k]:v};
    if(k==="meters"||k==="rate"){const m=k==="meters"?v:u.meters,r=k==="rate"?v:u.rate;if(m&&r)u.amount=(m*r).toFixed(2);}
    sf(u);
  };
  const selectCustomer=(name)=>{
    const c=data.customers.find(c=>c.name===name);
    sf(p=>({...p,customerId:c?.id||"",customerName:name}));
  };
  const selectProduct=(name)=>{
    const p=data.products.find(p=>p.name===name);
    sf(prev=>({...prev,productId:p?.id||"",productName:name,supplierName:p?.supplierName||prev.supplierName}));
  };
  const custNames=[...new Set([...data.customers.filter(c=>c.type==="Trading"||c.type==="Both").map(c=>c.name)])];
  const prodNames=[...new Set(data.products.map(p=>p.name))];
  const comm=tradingCommission(f.meters);
  return (
    <ModalBase title="🏪 Trading Sale Entry" onClose={onClose}>
      <F label="Date *"><input type="date" value={f.date} onChange={e=>s("date",e.target.value)} style={IS}/></F>
      <F label="Customer *"><SmartInput value={f.customerName} onChange={selectCustomer} placeholder="Type customer name" list={custNames} idPrefix="tc"/></F>
      <F label="Product *"><SmartInput value={f.productName} onChange={selectProduct} placeholder="Type product name" list={prodNames} idPrefix="tp"/></F>
      <F label="Supplier"><input value={f.supplierName} onChange={e=>s("supplierName",e.target.value)} placeholder="Auto-filled from product" style={IS}/></F>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
        <F label="Meters *"><input type="number" placeholder="0" value={f.meters} onChange={e=>s("meters",e.target.value)} style={IS}/></F>
        <F label="Rate/m (₹)"><input type="number" placeholder="0.00" value={f.rate} onChange={e=>s("rate",e.target.value)} style={IS}/></F>
      </div>
      <F label="Amount (₹) *"><input type="number" value={f.amount} onChange={e=>s("amount",e.target.value)} style={{...IS,background:"#F5F8FF"}}/></F>
      {f.meters>0&&<div style={{background:"#F4ECF7",borderRadius:10,padding:"10px 12px",marginBottom:8,fontSize:12,color:"#8E44AD",fontWeight:700}}>💰 Commission: {fmt(f.meters)}m × ₹1.5 = <b>₹{fmt(comm)}</b></div>}
      <F label="Remarks"><input placeholder="Optional" value={f.remarks} onChange={e=>s("remarks",e.target.value)} style={IS}/></F>
      <SaveBtn color="#2980B9" onClick={()=>{if(!f.customerName||!f.productName||!f.meters||!f.amount)return alert("Fill required (*) fields");onSave(f);}}>Save Trading Sale</SaveBtn>
    </ModalBase>
  );
}

function AgencySaleModal({data,onSave,onClose}) {
  const [f,sf]=useState({date:today(),customerId:"",customerName:"",productId:"",productName:"",supplierName:"",meters:"",rate:"",amount:"",cdRate:2,remarks:""});
  const s=(k,v)=>{
    const u={...f,[k]:v};
    if(k==="meters"||k==="rate"){const m=k==="meters"?v:u.meters,r=k==="rate"?v:u.rate;if(m&&r)u.amount=(m*r).toFixed(2);}
    sf(u);
  };
  const selectCustomer=(name)=>{
    const c=data.customers.find(c=>c.name===name);
    sf(p=>({...p,customerId:c?.id||"",customerName:name,cdRate:c?.cdRate||2}));
  };
  const selectProduct=(name)=>{
    const p=data.products.find(p=>p.name===name);
    sf(prev=>({...prev,productId:p?.id||"",productName:name,supplierName:p?.supplierName||prev.supplierName}));
  };
  const custNames=[...new Set(data.customers.filter(c=>c.type==="Agency"||c.type==="Both").map(c=>c.name))];
  const prodNames=[...new Set(data.products.map(p=>p.name))];
  return (
    <ModalBase title="🤝 Agency Sale Entry" onClose={onClose}>
      <F label="Date *"><input type="date" value={f.date} onChange={e=>s("date",e.target.value)} style={IS}/></F>
      <F label="Customer *"><SmartInput value={f.customerName} onChange={selectCustomer} placeholder="Type customer name" list={custNames} idPrefix="ac"/></F>
      <F label="Product *"><SmartInput value={f.productName} onChange={selectProduct} placeholder="Type product name" list={prodNames} idPrefix="ap"/></F>
      <F label="Supplier"><input value={f.supplierName} onChange={e=>s("supplierName",e.target.value)} placeholder="Auto-filled from product" style={IS}/></F>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
        <F label="Meters *"><input type="number" placeholder="0" value={f.meters} onChange={e=>s("meters",e.target.value)} style={IS}/></F>
        <F label="Rate/m (₹)"><input type="number" placeholder="0.00" value={f.rate} onChange={e=>s("rate",e.target.value)} style={IS}/></F>
      </div>
      <F label="Amount (₹) *"><input type="number" value={f.amount} onChange={e=>s("amount",e.target.value)} style={{...IS,background:"#F5F8FF"}}/></F>
      <F label="CD Rate (%)">
        <select value={f.cdRate} onChange={e=>s("cdRate",+e.target.value)} style={IS}>
          <option value={4}>4% (0-10 days)</option>
          <option value={3}>3% (11-50 days)</option>
          <option value={2}>2% (51-60 days)</option>
          <option value={0}>0% (No CD)</option>
        </select>
      </F>
      <F label="Remarks"><input placeholder="Optional" value={f.remarks} onChange={e=>s("remarks",e.target.value)} style={IS}/></F>
      <SaveBtn color="#27AE60" onClick={()=>{if(!f.customerName||!f.productName||!f.meters||!f.amount)return alert("Fill required (*) fields");onSave(f);}}>Save Agency Sale</SaveBtn>
    </ModalBase>
  );
}

function TradingPaymentModal({data,onSave,onClose,preCustomer}) {
  const [f,sf]=useState({date:today(),customerId:preCustomer?.id||"",customerName:preCustomer?.name||"",amount:"",mode:"NEFT/RTGS",remarks:""});
  const s=(k,v)=>sf({...f,[k]:v});
  const selectCustomer=(name)=>{const c=data.customers.find(c=>c.name===name);sf(p=>({...p,customerId:c?.id||"",customerName:name}));};
  const custNames=[...new Set([...data.customers.map(c=>c.name),...data.tradingSales.map(s=>s.customerName)])];
  return (
    <ModalBase title="💰 Trading Payment" onClose={onClose}>
      <F label="Date *"><input type="date" value={f.date} onChange={e=>s("date",e.target.value)} style={IS}/></F>
      <F label="Customer *"><SmartInput value={f.customerName} onChange={selectCustomer} placeholder="Customer name" list={custNames} idPrefix="tpay"/></F>
      <F label="Amount (₹) *"><input type="number" placeholder="0.00" value={f.amount} onChange={e=>s("amount",e.target.value)} style={IS}/></F>
      <F label="Mode"><select value={f.mode} onChange={e=>s("mode",e.target.value)} style={IS}>{["NEFT/RTGS","UPI","Cheque","Cash","Other"].map(m=><option key={m}>{m}</option>)}</select></F>
      <F label="Remarks"><input placeholder="Optional" value={f.remarks} onChange={e=>s("remarks",e.target.value)} style={IS}/></F>
      <SaveBtn color="#2980B9" onClick={()=>{if(!f.customerName||!f.amount)return alert("Fill required fields");onSave(f);}}>Save Payment</SaveBtn>
    </ModalBase>
  );
}

function AgencyPaymentModal({data,onSave,onClose,preCustomer}) {
  const [f,sf]=useState({date:today(),customerId:preCustomer?.id||"",customerName:preCustomer?.name||"",invoiceId:"",grossAmount:"",cdDays:"",cdPct:0,cdAmount:"0",netAmount:"",commission:"",mode:"NEFT/RTGS",remarks:""});

  const s=(k,v)=>{
    const u={...f,[k]:v};
    // Auto-calculate CD and commission
    if(k==="cdDays"||k==="grossAmount"||k==="cdPct") {
      const days=k==="cdDays"?+v:+u.cdDays;
      const gross=k==="grossAmount"?+v:+u.grossAmount;
      const pct=k==="cdPct"?+v:getCDPct(days);
      u.cdPct=pct;
      u.cdAmount=(gross*pct/100).toFixed(2);
      u.netAmount=(gross-gross*pct/100).toFixed(2);
      u.commission=agencyCommission(u.netAmount).toFixed(2);
    }
    if(k==="netAmount") u.commission=agencyCommission(+v).toFixed(2);
    sf(u);
  };

  const selectCustomer=(name)=>{const c=data.customers.find(c=>c.name===name);sf(p=>({...p,customerId:c?.id||"",customerName:name}));};
  const custNames=[...new Set([...data.customers.map(c=>c.name),...data.agencySales.map(s=>s.customerName)])];
  const custInvoices=data.agencySales.filter(s=>s.customerName===f.customerName);

  return (
    <ModalBase title="🤝 Agency Payment + CD" onClose={onClose}>
      <F label="Date *"><input type="date" value={f.date} onChange={e=>s("date",e.target.value)} style={IS}/></F>
      <F label="Customer *"><SmartInput value={f.customerName} onChange={selectCustomer} placeholder="Customer name" list={custNames} idPrefix="apay"/></F>
      {custInvoices.length>0&&(
        <F label="Invoice (optional)">
          <select value={f.invoiceId} onChange={e=>{
            const inv=data.agencySales.find(i=>i.id===e.target.value);
            sf(p=>({...p,invoiceId:e.target.value,grossAmount:inv?.amount||p.grossAmount}));
          }} style={IS}>
            <option value="">Select invoice</option>
            {custInvoices.map(i=><option key={i.id} value={i.id}>{fmtD(i.date)} — ₹{fmt(i.amount)} ({i.productName})</option>)}
          </select>
        </F>
      )}
      <F label="Gross Amount (₹) *"><input type="number" placeholder="Invoice amount" value={f.grossAmount} onChange={e=>s("grossAmount",e.target.value)} style={IS}/></F>
      <F label="Payment Days (for CD)">
        <input type="number" placeholder="Days since invoice date" value={f.cdDays} onChange={e=>s("cdDays",e.target.value)} style={IS}/>
        {f.cdDays>0&&<div style={{fontSize:10.5,color:"#16A085",marginTop:3,fontWeight:600}}>→ {getCDLabel(+f.cdDays)}</div>}
      </F>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
        <F label="CD % (auto)"><input type="number" value={f.cdPct} onChange={e=>s("cdPct",e.target.value)} style={IS}/></F>
        <F label="CD Amount (₹)"><input type="number" value={f.cdAmount} readOnly style={{...IS,background:"#F5FFF8"}}/></F>
      </div>
      <F label="Net Amount (₹) *"><input type="number" value={f.netAmount} onChange={e=>s("netAmount",e.target.value)} style={{...IS,background:"#F5FFF8",fontWeight:700}}/></F>
      {f.netAmount>0&&(
        <div style={{background:"#F4ECF7",borderRadius:10,padding:"10px 12px",marginBottom:8,fontSize:12,color:"#8E44AD",fontWeight:700}}>
          💰 Commission: ₹{fmt(f.netAmount)} × 0.5% = <b>₹{fmt(f.commission)}</b>
        </div>
      )}
      <F label="Mode"><select value={f.mode} onChange={e=>s("mode",e.target.value)} style={IS}>{["NEFT/RTGS","UPI","Cheque","Cash","Other"].map(m=><option key={m}>{m}</option>)}</select></F>
      <F label="Remarks"><input placeholder="Optional" value={f.remarks} onChange={e=>s("remarks",e.target.value)} style={IS}/></F>
      <SaveBtn color="#27AE60" onClick={()=>{if(!f.customerName||!f.grossAmount||!f.netAmount)return alert("Fill required fields");onSave({...f,commission:+f.commission||0});}}>Save Payment & Commission</SaveBtn>
    </ModalBase>
  );
}

function CustomerModal({data,onSave,onClose}) {
  const [f,sf]=useState({name:"",type:"Both",phone:"",city:"",cdRate:2,gstin:""});
  const s=(k,v)=>sf({...f,[k]:v});
  const names=data.customers.map(c=>c.name);
  return (
    <ModalBase title="👤 Add Customer" onClose={onClose}>
      <F label="Name *"><SmartInput value={f.name} onChange={v=>s("name",v)} placeholder="Customer name" list={names} idPrefix="cust"/></F>
      <F label="Type *"><select value={f.type} onChange={e=>s("type",e.target.value)} style={IS}><option>Trading</option><option>Agency</option><option>Both</option></select></F>
      <F label="Phone (for WhatsApp)"><input placeholder="10-digit" value={f.phone} onChange={e=>s("phone",e.target.value)} style={IS}/></F>
      <F label="City"><input placeholder="City" value={f.city} onChange={e=>s("city",e.target.value)} style={IS}/></F>
      <F label="Default CD Rate (%)"><select value={f.cdRate} onChange={e=>s("cdRate",+e.target.value)} style={IS}><option value={4}>4%</option><option value={3}>3%</option><option value={2}>2%</option><option value={0}>0%</option></select></F>
      <F label="GSTIN"><input placeholder="Optional" value={f.gstin} onChange={e=>s("gstin",e.target.value)} style={IS}/></F>
      <SaveBtn color="#0F1923" onClick={()=>{if(!f.name)return alert("Enter customer name");onSave(f);}}>Save Customer</SaveBtn>
    </ModalBase>
  );
}

function SupplierModal({data,onSave,onClose}) {
  const [f,sf]=useState({name:"",phone:"",city:""});
  const s=(k,v)=>sf({...f,[k]:v});
  const names=data.suppliers.map(s=>s.name);
  return (
    <ModalBase title="🏭 Add Supplier" onClose={onClose}>
      <F label="Supplier Name *"><SmartInput value={f.name} onChange={v=>s("name",v)} placeholder="Supplier name" list={names} idPrefix="sup"/></F>
      <F label="Phone"><input placeholder="Phone" value={f.phone} onChange={e=>s("phone",e.target.value)} style={IS}/></F>
      <F label="City"><input placeholder="City" value={f.city} onChange={e=>s("city",e.target.value)} style={IS}/></F>
      <SaveBtn color="#0F1923" onClick={()=>{if(!f.name)return alert("Enter supplier name");onSave(f);}}>Save Supplier</SaveBtn>
    </ModalBase>
  );
}

function ProductModal({data,onSave,onClose}) {
  const [f,sf]=useState({name:"",supplierId:"",supplierName:"",unit:"Mtr"});
  const s=(k,v)=>sf({...f,[k]:v});
  const selectSupplier=(name)=>{const sup=data.suppliers.find(s=>s.name===name);sf(p=>({...p,supplierId:sup?.id||"",supplierName:name}));};
  const supNames=data.suppliers.map(s=>s.name);
  const prodNames=data.products.map(p=>p.name);
  return (
    <ModalBase title="📦 Add Product" onClose={onClose}>
      <F label="Product Name *"><SmartInput value={f.name} onChange={v=>s("name",v)} placeholder="Product / quality name" list={prodNames} idPrefix="prod"/></F>
      <F label="Supplier *"><SmartInput value={f.supplierName} onChange={selectSupplier} placeholder="Type supplier name" list={supNames} idPrefix="prodsup"/></F>
      <F label="Unit"><select value={f.unit} onChange={e=>s("unit",e.target.value)} style={IS}><option>Mtr</option><option>Kg</option><option>Pcs</option></select></F>
      <SaveBtn color="#0F1923" onClick={()=>{if(!f.name||!f.supplierName)return alert("Fill required fields");onSave(f);}}>Save Product</SaveBtn>
    </ModalBase>
  );
}

// ─── TALLY IMPORT ─────────────────────────────────────────────
const TALLY_NON_PRODUCT = new Set([
  "IGST 5%","IGST 12%","IGST 18%","IGST 28%","CGST 2.5%","CGST 6%","CGST 9%","CGST 14%",
  "SGST 2.5%","SGST 6%","SGST 9%","SGST 14%","ROUND OF","ROUND OFF","FREIGHT EXPENSES",
  "FREIGHT","COOLIE & CARTAGE","CARTAGE","SALES RETURN","OFFICE EXPENSE","DISCOUNT","PACKING CHARGES",
]);

function excelDateToJS(v) {
  if (v instanceof Date) return v;
  if (typeof v === "number") {
    // Excel serial date
    const d = new Date(Math.round((v - 25569) * 86400 * 1000));
    return d;
  }
  if (typeof v === "string") {
    const d = new Date(v);
    if (!isNaN(d)) return d;
  }
  return null;
}

function parseTallySalesRegister(rows) {
  // rows: array of arrays (raw cell values), as produced by XLSX.utils.sheet_to_json(ws,{header:1})
  const invoices = [];
  let cur = null;
  for (const row of rows) {
    const date = row[0], part = row[1], qty = row[2], rate = row[3], c4 = row[4], c5 = row[5], c6 = row[6];
    const jsDate = (date!==undefined && date!==null && date!=="") ? excelDateToJS(date) : null;
    const isHeaderRow = jsDate && !isNaN(jsDate);
    if (isHeaderRow) {
      if (cur) invoices.push(cur);
      cur = { date: jsDate, customer: String(part||"").trim(), vchno: c5, total: typeof c6==="number" ? c6 : parseFloat(c6), items: [] };
    } else if (part!==undefined && part!==null && String(part).trim()!=="") {
      const p = String(part).trim();
      if (p==="Sales Accounts" || p==="Particulars") continue;
      const isProduct = !TALLY_NON_PRODUCT.has(p.toUpperCase()) && (qty!==undefined && qty!==null && qty!=="" && !isNaN(parseFloat(qty)));
      if (isProduct && cur) {
        cur.items.push({ product: p, qty: parseFloat(qty)||0, rate: parseFloat(rate)||0, amount: typeof c4==="number" ? c4 : parseFloat(c4)||0 });
      }
    }
  }
  if (cur) invoices.push(cur);
  // drop cancelled / empty invoices
  return invoices.filter(inv => inv.customer && inv.customer.toLowerCase()!=="(cancelled)" && inv.items.length>0 && !isNaN(inv.total));
}

// Flat format: one row per sale line — Date | (tag) | Customer Name | Product | Qty | Rate | Amount
// Column order is auto-detected from the header row rather than assumed fixed, so minor reordering
// or an extra/missing tag column still works.
function detectFlatColumns(headerRow) {
  const norm = (s)=>String(s||"").trim().toLowerCase();
  const idx = {};
  headerRow.forEach((cell,i)=>{
    const c = norm(cell);
    if (c==="date") idx.date=i;
    else if (c.includes("customer")) idx.customer=i;
    else if (c==="product"||c.includes("item")||c.includes("description")) idx.product=i;
    else if (c==="qty"||c.includes("quantity")) idx.qty=i;
    else if (c==="rate"||c.includes("price")) idx.rate=i;
    else if (c==="amount"||c.includes("total")) idx.amount=i;
  });
  const required = ["date","customer","product","amount"];
  if (required.every(k=>idx[k]!==undefined)) return idx;
  return null;
}

function parseFlatSalesSheet(rows, colIdx) {
  const invoices = [];
  for (let r=1; r<rows.length; r++) { // skip header row
    const row = rows[r];
    if (!row || row.every(c=>c===null||c===undefined||c==="")) continue;
    const dateRaw = row[colIdx.date];
    const jsDate = (dateRaw!==undefined && dateRaw!==null && dateRaw!=="") ? excelDateToJS(dateRaw) : null;
    const customer = String(row[colIdx.customer]||"").trim();
    const product = String(row[colIdx.product]||"").trim();
    const amount = parseFloat(row[colIdx.amount]);
    // skip totals row / blank rows: no date, or no customer, or amount not a number
    if (!jsDate || isNaN(jsDate) || !customer || !product || isNaN(amount)) continue;
    const qty = colIdx.qty!==undefined ? parseFloat(row[colIdx.qty])||0 : 0;
    const rate = colIdx.rate!==undefined ? parseFloat(row[colIdx.rate])||0 : 0;
    invoices.push({
      date: jsDate, customer, vchno: `R${r}`, total: amount,
      items: [{ product, qty, rate, amount }],
    });
  }
  return invoices;
}

// Tries the flat one-row-per-line format first (simpler, more common for ad-hoc exports),
// then falls back to the multi-row Tally "Sales Register" voucher format.
function parseSalesFile(rows) {
  if (rows.length>1) {
    const flatCols = detectFlatColumns(rows[0]);
    if (flatCols) {
      const flat = parseFlatSalesSheet(rows, flatCols);
      if (flat.length>0) return flat;
    }
  }
  return parseTallySalesRegister(rows);
}

function TallyImportModal({data,onImport,onClose}) {
  const [stage,setStage]=useState("upload"); // upload | preview | error
  const [fileName,setFileName]=useState("");
  const [invoices,setInvoices]=useState([]);
  const [errorMsg,setErrorMsg]=useState("");
  const [excluded,setExcluded]=useState({}); // vchno+date key -> true if excluded
  const fileRef = useRef(null);

  const existingNamesLower = new Set(data.customers.map(c=>c.name.trim().toLowerCase()));

  const handleFile = (e) => {
    const file = e.target.files[0]; if(!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const wb = XLSX.read(ev.target.result, {type:"array", cellDates:true});
        // Try to find the sheet that looks like a Sales Register; fall back to first sheet
        let sheetName = wb.SheetNames.find(n=>/sales/i.test(n)) || wb.SheetNames[0];
        const ws = wb.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(ws, {header:1, raw:true, defval:null});
        const parsed = parseSalesFile(rows);
        if (parsed.length===0) {
          setErrorMsg("Couldn't find any sales rows in this file. Make sure it's either a Tally Sales Register export, or an Excel sheet with columns Date, Customer Name, Product, Qty, Rate, Amount.");
          setStage("error");
          return;
        }
        setInvoices(parsed);
        setExcluded({});
        setStage("preview");
      } catch (err) {
        setErrorMsg("This file couldn't be read. Please make sure it's a valid Excel (.xlsx) export from Tally.");
        setStage("error");
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const invKey = (inv,idx) => `${idx}-${inv.vchno}`;
  const toggleExclude = (key) => setExcluded(p=>({...p,[key]:!p[key]}));

  const includedInvoices = invoices.filter((inv,idx)=>!excluded[invKey(inv,idx)]);
  const totalAmount = includedInvoices.reduce((a,inv)=>a+(inv.total||0),0);
  const uniqueCustomers = [...new Set(includedInvoices.map(inv=>inv.customer))];
  const newCustomers = uniqueCustomers.filter(n=>!existingNamesLower.has(n.trim().toLowerCase()));
  const lineCount = includedInvoices.reduce((a,inv)=>a+inv.items.length,0);
  const dateRange = includedInvoices.length ? {
    from: includedInvoices.reduce((m,i)=>i.date<m?i.date:m, includedInvoices[0].date),
    to: includedInvoices.reduce((m,i)=>i.date>m?i.date:m, includedInvoices[0].date),
  } : null;

  const doImport = () => {
    const custByLower = {};
    data.customers.forEach(c=>{custByLower[c.name.trim().toLowerCase()]=c;});
    const newCustRecs = newCustomers.map(name=>({id:uid(),name,type:"Trading",phone:"",city:"",cdRate:0,gstin:""}));
    newCustRecs.forEach(c=>{ custByLower[c.name.trim().toLowerCase()] = c; });

    const saleRows = [];
    includedInvoices.forEach(inv=>{
      const cust = custByLower[inv.customer.trim().toLowerCase()];
      const dateStr = inv.date.toISOString().split("T")[0];
      inv.items.forEach(item=>{
        saleRows.push({
          date: dateStr,
          customerId: cust.id,
          customerName: inv.customer,
          productId: "",
          productName: item.product,
          supplierName: "",
          meters: item.qty || "",
          rate: item.rate || "",
          amount: item.amount,
          remarks: `Imported (Ref ${inv.vchno})`,
        });
      });
    });
    onImport(newCustRecs, saleRows);
  };

  if (stage==="upload") {
    return (
      <ModalBase title="📥 Import Sales from Tally / Excel" onClose={onClose}>
        <div style={{background:"#EAF4FC",borderRadius:12,padding:"13px 14px",marginBottom:16,fontSize:12.5,color:"#1A3A5C",lineHeight:1.5}}>
          Works with two formats: a <b>Tally Sales Register</b> export (Gateway of Tally → Display More Reports → Sales Register → Alt+E → Excel), or a simple <b>structured Excel sheet</b> with columns Date, Customer Name, Product, Qty, Rate, Amount. Upload either below — the format is detected automatically.
        </div>
        <label style={{display:"block",border:"2px dashed #C7D6E8",borderRadius:14,padding:"32px 16px",textAlign:"center",cursor:"pointer",background:"#FAFBFD"}}>
          <div style={{fontSize:30,marginBottom:8}}>📄</div>
          <div style={{fontWeight:700,fontSize:14,color:"#1A3A5C",marginBottom:4}}>Tap to choose Excel file</div>
          <div style={{fontSize:11.5,color:"#999"}}>.xlsx or .xls file</div>
          <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={handleFile} style={{display:"none"}}/>
        </label>
      </ModalBase>
    );
  }

  if (stage==="error") {
    return (
      <ModalBase title="📥 Import Sales" onClose={onClose}>
        <div style={{background:"#FADBD8",borderRadius:12,padding:"14px",marginBottom:14,fontSize:13,color:"#922B21",lineHeight:1.5}}>⚠️ {errorMsg}</div>
        <Btn color="#0F1923" onClick={()=>setStage("upload")} style={{width:"100%"}}>Try Another File</Btn>
      </ModalBase>
    );
  }

  // preview stage
  return (
    <ModalBase title="📥 Review Import" onClose={onClose}>
      <Mute style={{marginBottom:10}}>📄 {fileName}</Mute>

      <div style={{background:"linear-gradient(135deg,#0F1923,#1A3A5C)",borderRadius:14,padding:"14px 16px",marginBottom:14}}>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          <div>
            <div style={{fontSize:10,color:"#E8C97E",textTransform:"uppercase",fontWeight:700}}>Invoices</div>
            <div style={{fontSize:20,fontWeight:900,color:"#fff"}}>{includedInvoices.length}</div>
          </div>
          <div>
            <div style={{fontSize:10,color:"#E8C97E",textTransform:"uppercase",fontWeight:700}}>Total Amount</div>
            <div style={{fontSize:20,fontWeight:900,color:"#fff"}}>₹{fmt(totalAmount)}</div>
          </div>
          <div>
            <div style={{fontSize:10,color:"#E8C97E",textTransform:"uppercase",fontWeight:700}}>Sale Lines</div>
            <div style={{fontSize:16,fontWeight:800,color:"#fff"}}>{lineCount}</div>
          </div>
          <div>
            <div style={{fontSize:10,color:"#E8C97E",textTransform:"uppercase",fontWeight:700}}>Customers</div>
            <div style={{fontSize:16,fontWeight:800,color:"#fff"}}>{uniqueCustomers.length}</div>
          </div>
        </div>
        {dateRange&&<div style={{fontSize:11,color:"rgba(255,255,255,0.5)",marginTop:8}}>{fmtD(dateRange.from)} → {fmtD(dateRange.to)}</div>}
      </div>

      {newCustomers.length>0&&(
        <div style={{background:"#FEF9E7",borderRadius:12,padding:"11px 13px",marginBottom:14,fontSize:12,color:"#946A00"}}>
          ✨ <b>{newCustomers.length} new customer{newCustomers.length===1?"":"s"}</b> will be added automatically: {newCustomers.slice(0,5).join(", ")}{newCustomers.length>5?` +${newCustomers.length-5} more`:""}
        </div>
      )}

      <SecTitle>Invoices ({invoices.length} found{invoices.length!==includedInvoices.length?`, ${invoices.length-includedInvoices.length} excluded`:""})</SecTitle>
      <div style={{maxHeight:280,overflowY:"auto",marginBottom:14,border:"1px solid #F0F4F8",borderRadius:12}}>
        {invoices.map((inv,idx)=>{
          const key=invKey(inv,idx);
          const isExcluded=!!excluded[key];
          const isNew = !existingNamesLower.has(inv.customer.trim().toLowerCase());
          return (
            <div key={key} onClick={()=>toggleExclude(key)}
              style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 13px",borderBottom:"1px solid #F7F9FB",cursor:"pointer",opacity:isExcluded?0.4:1,background:isExcluded?"#FAFAFA":"#fff"}}>
              <div style={{minWidth:0}}>
                <div style={{fontSize:13,fontWeight:700,color:"#0F1923",textDecoration:isExcluded?"line-through":"none"}}>{inv.customer} {isNew&&!isExcluded&&<span style={{fontSize:9,color:"#27AE60",fontWeight:700}}>NEW</span>}</div>
                <div style={{fontSize:11,color:"#aaa"}}>{fmtD(inv.date)}{!String(inv.vchno).startsWith("R")&&` · Vch #${inv.vchno}`} · {inv.items.length} item{inv.items.length===1?"":"s"}</div>
              </div>
              <div style={{textAlign:"right",flexShrink:0,marginLeft:8}}>
                <div style={{fontWeight:800,fontSize:13.5,color:"#1A3A5C"}}>₹{fmt(inv.total)}</div>
                <div style={{fontSize:10,color:isExcluded?"#27AE60":"#C0392B",fontWeight:700}}>{isExcluded?"Tap to include":"Tap to exclude"}</div>
              </div>
            </div>
          );
        })}
      </div>

      <SaveBtn color="#2980B9" onClick={doImport}>Import {includedInvoices.length} Invoice{includedInvoices.length===1?"":"s"} as Trading Sales</SaveBtn>
      <button onClick={()=>setStage("upload")} style={{width:"100%",background:"none",border:"none",color:"#888",fontSize:12.5,fontWeight:600,padding:"10px",cursor:"pointer"}}>Choose a different file</button>
    </ModalBase>
  );
}

// ─── REUSABLE COMPONENTS ──────────────────────────────────────
function TapCard({children,onDelete}) {
  const [open,setOpen]=useState(false);
  return (
    <div style={{background:"#fff",borderRadius:13,padding:"14px 15px",marginBottom:10,boxShadow:"0 1px 8px rgba(0,0,0,0.06)"}} onClick={()=>setOpen(!open)}>
      {children}
      {open&&<div style={{marginTop:11,display:"flex",gap:8}}>
        <button onClick={e=>{e.stopPropagation();onDelete();}} style={{background:"#FEE8E8",color:"#C0392B",border:"none",borderRadius:9,padding:"10px 18px",fontSize:13,fontWeight:700,cursor:"pointer",minHeight:42}}>🗑️ Delete</button>
        <button onClick={e=>{e.stopPropagation();setOpen(false);}} style={{background:"#F0F4F8",color:"#666",border:"none",borderRadius:9,padding:"10px 16px",fontSize:13,fontWeight:600,cursor:"pointer",minHeight:42}}>Cancel</button>
      </div>}
    </div>
  );
}

function SegCtrl({options,val,onChange}) {
  return (
    <div style={{display:"flex",background:"#fff",borderRadius:11,overflow:"hidden",border:"1px solid #E2EAF4"}}>
      {options.map(o=>(
        <button key={o.v} onClick={()=>onChange(o.v)}
          style={{flex:1,padding:"12px 4px",fontSize:12.5,fontWeight:val===o.v?700:500,color:val===o.v?"#E8C97E":"#777",background:val===o.v?"#0F1923":"transparent",border:"none",cursor:"pointer",whiteSpace:"nowrap",minHeight:46}}>
          {o.l}
        </button>
      ))}
    </div>
  );
}

const Row=({children,style})=><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",...style}}>{children}</div>;
const B=({children,style})=><div style={{fontWeight:700,fontSize:14,...style}}>{children}</div>;
const Mute=({children,style})=><div style={{fontSize:12.5,color:"#888",marginTop:2,...style}}>{children}</div>;
const SecTitle=({children})=><div style={{fontWeight:800,fontSize:14.5,color:"#0F1923",marginBottom:11}}>{children}</div>;
const Empty=({text})=><div style={{textAlign:"center",color:"#bbb",fontSize:13.5,padding:"40px 10px"}}>{text}</div>;
const Btn=({children,color,onClick,style})=><button onClick={onClick} style={{background:color,color:color==="#0F1923"?"#E8C97E":"#fff",border:"none",borderRadius:11,padding:"12px 18px",fontSize:13.5,fontWeight:700,cursor:"pointer",minHeight:46,...style}}>{children}</button>;
const IS={width:"100%",padding:"12px 14px",borderRadius:11,border:"1.5px solid #E2EAF4",fontSize:15,boxSizing:"border-box",outline:"none",background:"#fff",minHeight:46};
const hdrBtn=(color,bg)=>({background:`rgba(255,255,255,0.14)`,border:`1px solid rgba(255,255,255,0.25)`,borderRadius:9,padding:"8px 11px",color:"#fff",fontSize:13,fontWeight:700,cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:3,minHeight:44,minWidth:54});
