import { useState, useEffect, useRef } from "react";
import * as XLSX from "xlsx";
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";

// ─── STORAGE ────────────────────────────────────────────────────
const SK = "fabric-sales-v2";
const EMPTY = {
  customers:[],suppliers:[],products:[],
  tradingSales:[],agencySales:[],
  tradingPayments:[],agencyPayments:[],
};
async function loadData(){try{const r=localStorage.getItem(SK);if(r)return{...EMPTY,...JSON.parse(r)};}catch(e){}return{...EMPTY};}
async function saveData(d){try{localStorage.setItem(SK,JSON.stringify(d));}catch(e){}}

// ─── UTILS ──────────────────────────────────────────────────────
const fmt   = n => Number(n||0).toLocaleString("en-IN",{maximumFractionDigits:2});
const fmtD  = d => d?new Date(d).toLocaleDateString("en-IN"):"—";
const today = () => new Date().toISOString().split("T")[0];
const uid   = () => Date.now()+"-"+Math.random().toString(36).slice(2,6);
const daysBetween=(d1,d2)=>Math.floor((new Date(d2)-new Date(d1))/86400000);

function getCDPct(days){if(days<=10)return 4;if(days<=50)return 3;if(days<=60)return 2;return 0;}
function getCDLabel(days){if(days<=10)return"4% CD (0-10d)";if(days<=50)return"3% CD (11-50d)";if(days<=60)return"2% CD (51-60d)";if(days<=120)return"0% CD (61-120d)";return"No CD (120d+)";}

function waOpen(phone,msg){const n=phone?"91"+String(phone).replace(/\D/g,"").slice(-10):"";window.open(`https://wa.me/${n}?text=${encodeURIComponent(msg)}`,"_blank");}

const tradingCommission=(m)=>Number(m||0)*1.5;
const agencyCommission=(n)=>Number(n||0)*0.005;

function exportBackup(data){
  const b=new Blob([JSON.stringify(data,null,2)],{type:"application/json"});
  const a=document.createElement("a");
  a.href=URL.createObjectURL(b);
  a.download=`FabricSales_${today()}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(a.href);
}

function exportCSV(rows,fn){
  const csv=rows.map(r=>r.map(c=>`"${String(c||"").replace(/"/g,'""')}"`).join(",")).join("\n");
  const b=new Blob(["\uFEFF"+csv],{type:"text/csv"});
  const a=document.createElement("a");
  a.href=URL.createObjectURL(b);
  a.download=fn;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(a.href);
}

// ─── DESIGN TOKENS ──────────────────────────────────────────────
const C = {
  navy:"#0F1923", navyMid:"#1A3A5C", gold:"#E8C97E",
  blue:"#2980B9", green:"#27AE60", red:"#E74C3C",
  orange:"#E67E22", purple:"#8E44AD", teal:"#16A085",
  bg:"#F0F4F8", card:"#FFFFFF", border:"#E2EAF4",
  text:"#1A2A3A", muted:"#7A8A9A",
};

// ─── SHARED COMPONENTS ──────────────────────────────────────────
const Row=({children,style})=><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",...style}}>{children}</div>;
const B=({children,style})=><div style={{fontWeight:700,fontSize:14,...style}}>{children}</div>;
const Mute=({children,style})=><div style={{fontSize:12.5,color:C.muted,marginTop:2,...style}}>{children}</div>;
const SecTitle=({children})=><div style={{fontWeight:800,fontSize:15,color:C.navy,marginBottom:12}}>{children}</div>;
const Empty=({text})=><div style={{textAlign:"center",color:"#bbb",fontSize:13.5,padding:"44px 10px"}}>{text}</div>;
const Btn=({children,color,onClick,style})=><button onClick={onClick} style={{background:color,color:color===C.navy?"#E8C97E":"#fff",border:"none",borderRadius:11,padding:"12px 18px",fontSize:13.5,fontWeight:700,cursor:"pointer",minHeight:46,...style}}>{children}</button>;
const IS={width:"100%",padding:"12px 14px",borderRadius:11,border:`1.5px solid ${C.border}`,fontSize:15,boxSizing:"border-box",outline:"none",background:"#fff",minHeight:46};
const hdrBtn=()=>({background:"rgba(255,255,255,0.13)",border:"1px solid rgba(255,255,255,0.22)",borderRadius:9,padding:"8px 11px",color:"#fff",fontSize:13,fontWeight:700,cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:3,minHeight:44,minWidth:54});

function KpiCard({icon,label,val,color,sub}){return(
  <div style={{background:C.card,borderRadius:14,padding:"14px",borderLeft:`4px solid ${color}`,boxShadow:"0 1px 8px rgba(0,0,0,0.06)"}}>
    <div style={{fontSize:20}}>{icon}</div>
    <div style={{fontSize:10.5,color:C.muted,marginTop:4,fontWeight:600,textTransform:"uppercase",letterSpacing:0.5}}>{label}</div>
    <div style={{fontSize:17,fontWeight:900,color,marginTop:2}}>{val}</div>
    {sub&&<div style={{fontSize:10.5,color:C.muted,marginTop:2}}>{sub}</div>}
  </div>
);}

function SegCtrl({options,val,onChange}){return(
  <div style={{display:"flex",background:"#fff",borderRadius:11,overflow:"hidden",border:`1px solid ${C.border}`}}>
    {options.map(o=>(
      <button key={o.v} onClick={()=>onChange(o.v)}
        style={{flex:1,padding:"12px 4px",fontSize:12.5,fontWeight:val===o.v?700:500,color:val===o.v?"#E8C97E":C.muted,background:val===o.v?C.navy:"transparent",border:"none",cursor:"pointer",whiteSpace:"nowrap",minHeight:46}}>
        {o.l}
      </button>
    ))}
  </div>
);}

function TapCard({children,onDelete}){const[open,setOpen]=useState(false);return(
  <div style={{background:C.card,borderRadius:13,padding:"14px 15px",marginBottom:10,boxShadow:"0 1px 8px rgba(0,0,0,0.06)"}} onClick={()=>setOpen(!open)}>
    {children}
    {open&&<div style={{marginTop:11,display:"flex",gap:8}}>
      <button onClick={e=>{e.stopPropagation();onDelete();}} style={{background:"#FEE8E8",color:C.red,border:"none",borderRadius:9,padding:"10px 18px",fontSize:13,fontWeight:700,cursor:"pointer",minHeight:42}}>🗑️ Delete</button>
      <button onClick={e=>{e.stopPropagation();setOpen(false);}} style={{background:"#F0F4F8",color:"#666",border:"none",borderRadius:9,padding:"10px 16px",fontSize:13,fontWeight:600,cursor:"pointer",minHeight:42}}>Cancel</button>
    </div>}
  </div>
);}

function ModalBase({title,onClose,children}){return(
  <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",zIndex:200,display:"flex",alignItems:"flex-end"}} onClick={onClose}>
    <div style={{background:"#fff",width:"100%",maxWidth:600,margin:"0 auto",borderRadius:"20px 20px 0 0",padding:"18px 16px calc(env(safe-area-inset-bottom,0px) + 28px)",maxHeight:"92vh",overflowY:"auto"}} onClick={e=>e.stopPropagation()}>
      <Row style={{marginBottom:16}}>
        <B style={{fontSize:16.5,color:C.navy}}>{title}</B>
        <button onClick={onClose} style={{background:"#F0F4F8",border:"none",borderRadius:20,width:38,height:38,fontSize:16,cursor:"pointer",color:"#555",flexShrink:0}}>✕</button>
      </Row>
      {children}
    </div>
  </div>
);}

function F({label,children}){return <div style={{marginBottom:13}}><label style={{fontSize:12.5,color:"#666",fontWeight:600,display:"block",marginBottom:5}}>{label}</label>{children}</div>;}
function SaveBtn({color,onClick,children}){return <button onClick={onClick} style={{background:color,color:"#fff",border:"none",borderRadius:12,padding:"15px",fontSize:15.5,fontWeight:800,cursor:"pointer",width:"100%",marginTop:10,minHeight:50}}>{children}</button>;}

function SmartInput({value,onChange,placeholder,list,idPrefix}){const id=`${idPrefix}-dl`;return(<>
  <input value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} list={id} style={IS} autoComplete="off"/>
  <datalist id={id}>{list.map(l=><option key={l} value={l}/>)}</datalist>
</>);}

// ─── TABS CONFIG ─────────────────────────────────────────────────
const TABS=[
  {id:"Dashboard",  icon:"📊", label:"Dashboard"},
  {id:"Trading",    icon:"🏪", label:"Trading"},
  {id:"Agency",     icon:"🤝", label:"Agency"},
  {id:"Outstanding",icon:"⏳", label:"Outstanding"},
  {id:"Aging",      icon:"📅", label:"Ageing"},
  {id:"Analytics",  icon:"📈", label:"Analytics"},
  {id:"Reminders",  icon:"🔔", label:"Reminders"},
  {id:"Commission", icon:"💰", label:"Commission"},
  {id:"Masters",    icon:"⚙️",  label:"Masters"},
  {id:"Reports",    icon:"📋", label:"Reports"},
];

// ─── APP ROOT ────────────────────────────────────────────────────
export default function App(){
  const[tab,setTab]=useState("Dashboard");
  const[data,setData]=useState(null);
  const[modal,setModal]=useState(null);
  const[toast,setToast]=useState(null);
  const restoreRef=useRef(null);

  const triggerRestore=()=>restoreRef.current&&restoreRef.current.click();

  useEffect(()=>{loadData().then(setData);},[]);
  useEffect(()=>{if(data)saveData(data);},[data]);

  const showToast=(msg,err)=>{setToast({msg,err});setTimeout(()=>setToast(null),2800);};
  const add=(section,rec)=>{setData(p=>({...p,[section]:[...p[section],{...rec,id:uid()}]}));showToast("✅ Saved!");setModal(null);};
  const bulkAdd=(newC,newS)=>{setData(p=>({...p,customers:[...p.customers,...newC.map(c=>({...c,id:c.id||uid()}))],tradingSales:[...p.tradingSales,...newS.map(s=>({...s,id:uid()}))]}));showToast(`✅ Imported ${newS.length} sales!`);setModal(null);};
  const del=(section,id)=>{setData(p=>({...p,[section]:p[section].filter(r=>r.id!==id)}));showToast("🗑️ Deleted",true);};
  
  const importBackup=(e)=>{
    const f=e.target.files[0];
    if(!f)return;
    const r=new FileReader();
    r.onload=ev=>{
      try{
        const p=JSON.parse(ev.target.result);
        if(!p.tradingSales&&!p.customers)throw new Error("Not a valid backup");
        setData({...EMPTY,...p});
        showToast("✅ Backup restored!");
      }catch(err){
        showToast("❌ Invalid backup file",true);
      }
      if(restoreRef.current)restoreRef.current.value="";
    };
    r.onerror=()=>{showToast("❌ Could not read file",true);if(restoreRef.current)restoreRef.current.value="";};
    r.readAsText(f);
  };

  if(!data)return(<div style={{display:"flex",alignItems:"center",justifyContent:"center",minHeight:"100vh",background:C.navy,flexDirection:"column",gap:12}}><div style={{fontSize:48}}>🧵</div><div style={{color:C.gold,fontWeight:800,fontSize:16,letterSpacing:1}}>Loading…</div></div>);

  // ── Computed values ──────────────────────────────────────────
  const tradingOut={};
  data.tradingSales.forEach(s=>{if(!tradingOut[s.customerId])tradingOut[s.customerId]={name:s.customerName,due:0,paid:0};tradingOut[s.customerId].due+=+s.amount||0;});
  data.tradingPayments.forEach(p=>{if(!tradingOut[p.customerId])tradingOut[p.customerId]={name:p.customerName,due:0,paid:0};tradingOut[p.customerId].paid+=+p.amount||0;});

  const agencyOut={};
  data.agencySales.forEach(s=>{if(!agencyOut[s.customerId])agencyOut[s.customerId]={name:s.customerName,due:0,paid:0,cdGiven:0};agencyOut[s.customerId].due+=+s.amount||0;});
  data.agencyPayments.forEach(p=>{if(!agencyOut[p.customerId])agencyOut[p.customerId]={name:p.customerName,due:0,paid:0,cdGiven:0};agencyOut[p.customerId].paid+=+p.netAmount||0;agencyOut[p.customerId].cdGiven+=+p.cdAmount||0;});

  const totTradingSale=data.tradingSales.reduce((a,s)=>a+(+s.amount||0),0);
  const totAgencySale=data.agencySales.reduce((a,s)=>a+(+s.amount||0),0);
  const totTradingOut=Object.values(tradingOut).reduce((a,v)=>a+Math.max(0,v.due-v.paid),0);
  const totAgencyOut=Object.values(agencyOut).reduce((a,v)=>a+Math.max(0,v.due-v.paid-v.cdGiven),0);
  const totTradingComm=data.tradingSales.reduce((a,s)=>a+tradingCommission(s.meters),0);
  const totAgencyComm=data.agencyPayments.reduce((a,p)=>a+(+p.commission||0),0);
  const totComm=totTradingComm+totAgencyComm;

  // ── Overdue detection for reminders ─────────────────────────
  const todayMs=new Date().setHours(0,0,0,0);
  const phoneMap={};data.customers.forEach(c=>{phoneMap[c.id]=c.phone;});

  function buildOverdue(sales,payments,type){
    const map={};
    sales.forEach(s=>{if(!map[s.customerId])map[s.customerId]={id:s.customerId,name:s.customerName,invoices:[]};map[s.customerId].invoices.push({date:s.date,amount:+s.amount||0,id:s.id});});
    const paid={};payments.forEach(p=>{paid[p.customerId]=(paid[p.customerId]||0)+(+p.amount||+p.netAmount||0);});
    return Object.values(map).map(v=>{
      let rem=paid[v.id]||0;let maxDays=0;let outstanding=0;
      [...v.invoices].sort((a,b)=>new Date(a.date)-new Date(b.date)).forEach(inv=>{
        let amt=inv.amount;const d=Math.min(amt,rem);amt-=d;rem-=d;
        if(amt>0){const days=Math.floor((todayMs-new Date(inv.date).setHours(0,0,0,0))/86400000);if(days>maxDays)maxDays=days;outstanding+=amt;}
      });
      return{...v,outstanding,maxDays,type};
    }).filter(v=>v.outstanding>0&&v.maxDays>30);
  }

  const tradingOverdue=buildOverdue(data.tradingSales,data.tradingPayments,"Trading");
  const agencyOverdue=buildOverdue(data.agencySales,data.agencyPayments,"Agency");

  const navTo=(t)=>{setTab(t);setSideOpen(false);};

  // ── Sidebar (desktop) / Bottom bar (mobile) ─────────────────
  const Sidebar=()=>(
    <div style={{width:220,background:C.navy,minHeight:"100vh",position:"fixed",left:0,top:0,zIndex:150,display:"flex",flexDirection:"column",padding:"20px 0"}}>
      <div style={{padding:"0 20px 24px"}}>
        <div style={{fontSize:10,letterSpacing:2.5,color:C.gold,textTransform:"uppercase",fontWeight:700}}>🧵 Fabric Business</div>
        <div style={{fontSize:20,fontWeight:900,color:"#fff",marginTop:4}}>Sales Manager</div>
      </div>
      {TABS.map(t=>(
        <button key={t.id} onClick={()=>navTo(t.id)} style={{background:tab===t.id?"rgba(232,201,126,0.12)":"transparent",border:"none",borderLeft:tab===t.id?`3px solid ${C.gold}`:"3px solid transparent",padding:"12px 20px",textAlign:"left",color:tab===t.id?C.gold:"rgba(255,255,255,0.65)",fontSize:13.5,fontWeight:tab===t.id?700:400,cursor:"pointer",display:"flex",alignItems:"center",gap:10,transition:"all 0.15s"}}>
          <span>{t.icon}</span>{t.label}
          {t.id==="Reminders"&&(tradingOverdue.length+agencyOverdue.length)>0&&(
            <span style={{background:C.red,color:"#fff",borderRadius:20,fontSize:10,fontWeight:800,padding:"2px 7px",marginLeft:"auto"}}>{tradingOverdue.length+agencyOverdue.length}</span>
          )}
        </button>
      ))}
      <div style={{marginTop:"auto",padding:"16px 20px",borderTop:"1px solid rgba(255,255,255,0.08)"}}>
        <button onClick={()=>exportBackup(data)} style={{...hdrBtn(),flexDirection:"row",gap:8,width:"100%",justifyContent:"flex-start",padding:"10px 12px"}}>📤 <span style={{fontSize:12}}>Backup</span></button>
        <button onClick={triggerRestore} style={{...hdrBtn(),flexDirection:"row",gap:8,width:"100%",justifyContent:"flex-start",padding:"10px 12px",marginTop:8}}>📥 <span style={{fontSize:12}}>Restore</span></button>
      </div>
    </div>
  );

  const overdueCount=tradingOverdue.length+agencyOverdue.length;

  return(
    <div style={{fontFamily:"'Segoe UI',system-ui,sans-serif",background:C.bg,minHeight:"100vh",WebkitTextSizeAdjust:"100%",touchAction:"manipulation"}}>
      <style>{`
        @media(min-width:768px){.mobile-nav{display:none!important}.desktop-sidebar{display:flex!important}.main-content{margin-left:220px!important}}
        @media(max-width:767px){.mobile-nav{display:flex!important}.desktop-sidebar{display:none!important}.main-content{margin-left:0!important;padding-bottom:80px!important}}
        .main-content{max-width:860px;padding:18px 16px 40px;}
      `}</style>

      {/* Desktop sidebar */}
      <div className="desktop-sidebar" style={{display:"none"}}><Sidebar/></div>

      {/* Mobile header */}
      <div className="mobile-nav" style={{display:"none",background:C.navy,padding:"calc(env(safe-area-inset-top,0px)+12px) 16px 10px",position:"sticky",top:0,zIndex:100,boxShadow:"0 2px 20px rgba(0,0,0,0.4)",alignItems:"center",justifyContent:"space-between",gap:8}}>
        <div>
          <div style={{fontSize:9,letterSpacing:2,color:C.gold,textTransform:"uppercase",fontWeight:700}}>🧵 Fabric Business</div>
          <div style={{fontSize:18,fontWeight:900,color:"#fff"}}>Sales Manager</div>
        </div>
        <div style={{display:"flex",gap:7}}>
          <button onClick={()=>exportBackup(data)} style={hdrBtn()}>📤<span style={{fontSize:9}}>Backup</span></button>
          <button onClick={triggerRestore} style={hdrBtn()}>📥<span style={{fontSize:9}}>Restore</span></button>
        </div>
      </div>

      {/* Mobile scrollable tab bar */}
      <div className="mobile-nav" style={{display:"none",background:C.navyMid,overflowX:"auto",WebkitOverflowScrolling:"touch",scrollbarWidth:"none",position:"sticky",top:72,zIndex:99,boxShadow:"0 2px 8px rgba(0,0,0,0.15)"}}>
        {TABS.map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)} style={{flex:"0 0 auto",padding:"12px 14px",fontSize:12,fontWeight:tab===t.id?800:500,color:tab===t.id?C.gold:"rgba(255,255,255,0.6)",background:"none",border:"none",borderBottom:tab===t.id?`3px solid ${C.gold}`:"3px solid transparent",cursor:"pointer",whiteSpace:"nowrap",minHeight:44,position:"relative"}}>
            {t.icon} {t.label}
            {t.id==="Reminders"&&overdueCount>0&&<span style={{position:"absolute",top:6,right:4,background:C.red,color:"#fff",borderRadius:10,fontSize:9,fontWeight:800,padding:"1px 5px"}}>{overdueCount}</span>}
          </button>
        ))}
      </div>

      {/* Page content */}
      <div className="main-content" style={{marginLeft:0,padding:"18px 16px 40px",maxWidth:860}}>
        {tab==="Dashboard"   &&<DashboardTab data={data} tots={{totTradingSale,totAgencySale,totTradingOut,totAgencyOut,totTradingComm,totAgencyComm,totComm}} onNav={navTo}/>}
        {tab==="Trading"     &&<TradingTab data={data} onAdd={()=>setModal({type:"tradingSale"})} onAddPay={()=>setModal({type:"tradingPayment"})} onDel={del} tradingOut={tradingOut}/>}
        {tab==="Agency"      &&<AgencyTab data={data} onAdd={()=>setModal({type:"agencySale"})} onAddPay={()=>setModal({type:"agencyPayment"})} onDel={del} agencyOut={agencyOut}/>}
        {tab==="Outstanding" &&<OutstandingTab tradingOut={tradingOut} agencyOut={agencyOut} data={data} onTradingPay={()=>setModal({type:"tradingPayment"})} onAgencyPay={()=>setModal({type:"agencyPayment"})}/>}
        {tab==="Aging"       &&<AgingTab data={data}/>}
        {tab==="Analytics"   &&<AnalyticsTab data={data} tradingOut={tradingOut} agencyOut={agencyOut}/>}
        {tab==="Reminders"   &&<RemindersTab tradingOverdue={tradingOverdue} agencyOverdue={agencyOverdue} phoneMap={phoneMap}/>}
        {tab==="Commission"  &&<CommissionTab data={data} totTradingComm={totTradingComm} totAgencyComm={totAgencyComm}/>}
        {tab==="Masters"     &&<MastersTab data={data} onAdd={setModal} onDel={del}/>}
        {tab==="Reports"     &&<ReportsTab data={data} tradingOut={tradingOut} agencyOut={agencyOut} tots={{totTradingSale,totAgencySale}}/>}
      </div>

      {/* Modals */}
      {modal?.type==="tradingSale"    &&<TradingSaleModal    data={data} onSave={r=>add("tradingSales",r)}    onClose={()=>setModal(null)}/>}
      {modal?.type==="agencySale"     &&<AgencySaleModal     data={data} onSave={r=>add("agencySales",r)}     onClose={()=>setModal(null)}/>}
      {modal?.type==="tradingPayment" &&<TradingPaymentModal data={data} onSave={r=>add("tradingPayments",r)} onClose={()=>setModal(null)} preCustomer={modal.preCustomer}/>}
      {modal?.type==="agencyPayment"  &&<AgencyPaymentModal  data={data} onSave={r=>add("agencyPayments",r)}  onClose={()=>setModal(null)} preCustomer={modal.preCustomer}/>}
      {modal?.type==="customer"       &&<CustomerModal       data={data} onSave={r=>add("customers",r)}       onClose={()=>setModal(null)}/>}
      {modal?.type==="supplier"       &&<SupplierModal       data={data} onSave={r=>add("suppliers",r)}       onClose={()=>setModal(null)}/>}
      {modal?.type==="product"        &&<ProductModal        data={data} onSave={r=>add("products",r)}        onClose={()=>setModal(null)}/>}
      {modal?.type==="tallyImport"    &&<TallyImportModal    data={data} onImport={bulkAdd}                   onClose={()=>setModal(null)}/>}

      {/* Hidden restore input — single instance for all restore buttons */}
      <input ref={restoreRef} type="file" accept=".json" onChange={importBackup} style={{display:"none"}}/>

      {toast&&<div style={{position:"fixed",bottom:"calc(env(safe-area-inset-bottom,0px) + 24px)",left:"50%",transform:"translateX(-50%)",background:toast.err?"#B03A2E":C.navy,color:C.gold,padding:"11px 24px",borderRadius:24,fontSize:13.5,fontWeight:700,zIndex:999,boxShadow:"0 4px 20px rgba(0,0,0,0.4)",whiteSpace:"nowrap",border:"1px solid rgba(232,201,126,0.3)",maxWidth:"90%",textAlign:"center"}}>{toast.msg}</div>}
    </div>
  );
}

// ─── DASHBOARD ───────────────────────────────────────────────────
function DashboardTab({data,tots,onNav}){
  const{totTradingSale,totAgencySale,totTradingOut,totAgencyOut,totTradingComm,totAgencyComm,totComm}=tots;
  const recent=[...data.tradingSales.map(s=>({...s,_t:"Trading"})),...data.agencySales.map(s=>({...s,_t:"Agency"}))]
    .sort((a,b)=>new Date(b.date)-new Date(a.date)).slice(0,8);
  return(
    <div>
      <div style={{background:`linear-gradient(135deg,${C.navy},${C.navyMid})`,borderRadius:16,padding:"18px 20px",marginBottom:16,border:"1px solid rgba(232,201,126,0.25)"}}>
        <div style={{fontSize:10.5,color:C.gold,letterSpacing:2,textTransform:"uppercase",fontWeight:700}}>Total Commission Earned</div>
        <div style={{fontSize:34,fontWeight:900,color:C.gold,marginTop:6}}>₹{fmt(totComm)}</div>
        <div style={{fontSize:12,color:"rgba(255,255,255,0.45)",marginTop:4}}>Trading ₹{fmt(totTradingComm)} + Agency ₹{fmt(totAgencyComm)}</div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(155px,1fr))",gap:10,marginBottom:16}}>
        <KpiCard icon="🏪" label="Trading Sales"  val={`₹${fmt(totTradingSale)}`} color={C.blue}/>
        <KpiCard icon="🤝" label="Agency Sales"   val={`₹${fmt(totAgencySale)}`}  color={C.green}/>
        <KpiCard icon="⏳" label="Trading Due"    val={`₹${fmt(totTradingOut)}`}  color={C.red}/>
        <KpiCard icon="⏳" label="Agency Due"     val={`₹${fmt(totAgencyOut)}`}   color={C.orange}/>
        <KpiCard icon="💰" label="Trading Comm"   val={`₹${fmt(totTradingComm)}`} color={C.purple}/>
        <KpiCard icon="💰" label="Agency Comm"    val={`₹${fmt(totAgencyComm)}`}  color={C.teal}/>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(140px,1fr))",gap:10,marginBottom:16}}>
        {[{icon:"📈",label:"Analytics",t:"Analytics",bg:C.blue},{icon:"🔔",label:"Reminders",t:"Reminders",bg:C.red},{icon:"📅",label:"Ageing",t:"Aging",bg:C.orange},{icon:"📋",label:"Reports",t:"Reports",bg:C.purple}].map(q=>(
          <button key={q.t} onClick={()=>onNav(q.t)} style={{background:q.bg,color:"#fff",border:"none",borderRadius:13,padding:"14px 10px",fontSize:13,fontWeight:700,cursor:"pointer",textAlign:"center"}}>
            <div style={{fontSize:22,marginBottom:4}}>{q.icon}</div>{q.label}
          </button>
        ))}
      </div>
      <div style={{background:C.card,borderRadius:14,padding:16,boxShadow:"0 1px 8px rgba(0,0,0,0.06)"}}>
        <div style={{fontWeight:800,fontSize:14,color:C.navy,marginBottom:12}}>🕐 Recent Transactions</div>
        {recent.length===0&&<Empty text="No transactions yet. Add a sale to get started."/>}
        {recent.map(item=>(
          <div key={item.id} style={{display:"flex",justifyContent:"space-between",padding:"10px 0",borderBottom:"1px solid #F5F7FA"}}>
            <div><div style={{fontSize:13.5,fontWeight:600}}>{item.customerName}</div><div style={{fontSize:11.5,color:C.muted}}>{item.productName} · {fmtD(item.date)}</div></div>
            <div style={{textAlign:"right"}}><div style={{fontSize:14,fontWeight:800,color:item._t==="Trading"?C.blue:C.green}}>₹{fmt(item.amount)}</div><div style={{fontSize:10.5,color:C.muted}}>{item._t}</div></div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── TRADING TAB ─────────────────────────────────────────────────
function TradingTab({data,onAdd,onAddPay,onDel,tradingOut}){
  const[view,setView]=useState("sales");const[search,setSearch]=useState("");
  const sales=[...data.tradingSales].filter(s=>!search||s.customerName?.toLowerCase().includes(search.toLowerCase())||s.productName?.toLowerCase().includes(search.toLowerCase())).sort((a,b)=>new Date(b.date)-new Date(a.date));
  const payments=[...data.tradingPayments].sort((a,b)=>new Date(b.date)-new Date(a.date));
  return(<div>
    <div style={{display:"flex",gap:8,marginBottom:12,flexWrap:"wrap"}}>
      <Btn color={C.blue} onClick={onAdd}>+ Sale Entry</Btn>
      <Btn color={C.green} onClick={onAddPay}>+ Payment</Btn>
    </div>
    <SegCtrl options={[{v:"sales",l:`🏪 Sales (${data.tradingSales.length})`},{v:"payments",l:`💰 Payments (${data.tradingPayments.length})`}]} val={view} onChange={setView}/>
    {view==="sales"&&<><input placeholder="Search customer or product…" value={search} onChange={e=>setSearch(e.target.value)} style={{...IS,margin:"10px 0"}}/>
      {sales.length===0&&<Empty text="No trading sales yet."/>}
      {sales.map(s=><TapCard key={s.id} onDelete={()=>onDel("tradingSales",s.id)}>
        <Row><B>{s.customerName}</B><span style={{fontWeight:900,color:C.blue,fontSize:14}}>₹{fmt(s.amount)}</span></Row>
        <Mute>{s.productName} · {s.supplierName}</Mute>
        <Mute>{fmt(s.meters)} m @ ₹{fmt(s.rate)}/m · {fmtD(s.date)}</Mute>
        <div style={{marginTop:4,fontSize:11,color:C.purple,fontWeight:600}}>💰 Comm: ₹{fmt(tradingCommission(s.meters))}</div>
      </TapCard>)}</>}
    {view==="payments"&&<>{payments.length===0&&<Empty text="No payments yet."/>}
      {payments.map(p=><TapCard key={p.id} onDelete={()=>onDel("tradingPayments",p.id)}>
        <Row><B>{p.customerName}</B><span style={{fontWeight:900,color:C.green}}>₹{fmt(p.amount)}</span></Row>
        <Mute>{p.mode} · {fmtD(p.date)}</Mute>
        {p.remarks&&<Mute>📝 {p.remarks}</Mute>}
      </TapCard>)}</>}
  </div>);
}

// ─── AGENCY TAB ──────────────────────────────────────────────────
function AgencyTab({data,onAdd,onAddPay,onDel,agencyOut}){
  const[view,setView]=useState("sales");const[search,setSearch]=useState("");
  const sales=[...data.agencySales].filter(s=>!search||s.customerName?.toLowerCase().includes(search.toLowerCase())||s.productName?.toLowerCase().includes(search.toLowerCase())).sort((a,b)=>new Date(b.date)-new Date(a.date));
  const payments=[...data.agencyPayments].sort((a,b)=>new Date(b.date)-new Date(a.date));
  return(<div>
    <div style={{display:"flex",gap:8,marginBottom:12,flexWrap:"wrap"}}>
      <Btn color={C.green} onClick={onAdd}>+ Sale Entry</Btn>
      <Btn color={C.teal} onClick={onAddPay}>+ Payment + CD</Btn>
    </div>
    <SegCtrl options={[{v:"sales",l:`🤝 Sales (${data.agencySales.length})`},{v:"payments",l:`💰 Payments (${data.agencyPayments.length})`}]} val={view} onChange={setView}/>
    {view==="sales"&&<><input placeholder="Search customer or product…" value={search} onChange={e=>setSearch(e.target.value)} style={{...IS,margin:"10px 0"}}/>
      {sales.length===0&&<Empty text="No agency sales yet."/>}
      {sales.map(s=><TapCard key={s.id} onDelete={()=>onDel("agencySales",s.id)}>
        <Row><B>{s.customerName}</B><span style={{fontWeight:900,color:C.green,fontSize:14}}>₹{fmt(s.amount)}</span></Row>
        <Mute>{s.productName} · {s.supplierName}</Mute>
        <Mute>{fmt(s.meters)} m @ ₹{fmt(s.rate)}/m · {fmtD(s.date)}</Mute>
        <div style={{marginTop:4,fontSize:11,color:C.teal,fontWeight:600}}>CD Rate: {s.cdRate}%</div>
      </TapCard>)}</>}
    {view==="payments"&&<>{payments.length===0&&<Empty text="No payments yet."/>}
      {payments.map(p=><TapCard key={p.id} onDelete={()=>onDel("agencyPayments",p.id)}>
        <Row><B>{p.customerName}</B><span style={{fontWeight:900,color:C.green}}>₹{fmt(p.netAmount)}</span></Row>
        <Mute>Gross: ₹{fmt(p.grossAmount)} · CD {p.cdPct}%: ₹{fmt(p.cdAmount)} · {p.cdDays}d</Mute>
        <div style={{fontSize:11,color:C.teal,fontWeight:600,marginTop:3}}>💰 Comm: ₹{fmt(p.commission)}</div>
        <Mute>{p.mode} · {fmtD(p.date)}</Mute>
      </TapCard>)}</>}
  </div>);
}

// ─── OUTSTANDING TAB ─────────────────────────────────────────────
function OutstandingTab({tradingOut,agencyOut,data,onTradingPay,onAgencyPay}){
  const[view,setView]=useState("trading");
  const phoneMap={};data.customers.forEach(c=>{phoneMap[c.id]=c.phone;});
  const tradingEntries=Object.entries(tradingOut).map(([id,v])=>({id,...v,net:Math.max(0,v.due-v.paid)})).filter(e=>e.net>0).sort((a,b)=>b.net-a.net);
  const agencyEntries=Object.entries(agencyOut).map(([id,v])=>({id,...v,net:Math.max(0,v.due-v.paid-v.cdGiven)})).filter(e=>e.net>0).sort((a,b)=>b.net-a.net);
  const buildWA=(entries,type)=>{const d=new Date().toLocaleDateString("en-IN");const lines=entries.map(e=>`• ${e.name}: ₹${fmt(e.net)}`).join("\n");return`🧵 *Fabric Business — ${type} Outstanding*\n📅 ${d}\n\n${lines}\n\n*Total: ₹${fmt(entries.reduce((a,e)=>a+e.net,0))}*`;};
  const buildPartyWA=(e,type)=>{const d=new Date().toLocaleDateString("en-IN");return`🧵 *Fabric Business*\n📅 ${d}\n\nDear *${e.name}*,\n\nYour ${type} outstanding:\n💰 Total Due: ₹${fmt(e.due)}\n✅ Paid: ₹${fmt(e.paid)}${type==="Agency"?`\n🎁 CD Given: ₹${fmt(e.cdGiven||0)}`:""}\n⚠️ *Balance: ₹${fmt(e.net)}*\n\nKindly arrange payment 🙏`;};
  return(<div>
    <SegCtrl options={[{v:"trading",l:"🏪 Trading"},{v:"agency",l:"🤝 Agency"}]} val={view} onChange={setView}/>
    <div style={{margin:"12px 0 8px",display:"flex",gap:8,flexWrap:"wrap"}}>
      {view==="trading"?<><Btn color={C.blue} onClick={onTradingPay}>+ Trading Payment</Btn><Btn color="#25D366" onClick={()=>waOpen("",buildWA(tradingEntries,"Trading"))}>📲 WA Summary</Btn></>
        :<><Btn color={C.green} onClick={onAgencyPay}>+ Agency Payment</Btn><Btn color="#25D366" onClick={()=>waOpen("",buildWA(agencyEntries,"Agency"))}>📲 WA Summary</Btn></>}
    </div>
    <div style={{background:C.card,borderRadius:12,padding:14,marginBottom:14,boxShadow:"0 1px 8px rgba(0,0,0,0.06)",borderLeft:`4px solid ${view==="trading"?C.blue:C.green}`}}>
      <Mute>Total {view==="trading"?"Trading":"Agency"} Outstanding</Mute>
      <div style={{fontSize:24,fontWeight:900,color:view==="trading"?C.blue:C.green}}>₹{fmt(view==="trading"?tradingEntries.reduce((a,e)=>a+e.net,0):agencyEntries.reduce((a,e)=>a+e.net,0))}</div>
    </div>
    {view==="trading"&&<>{tradingEntries.length===0&&<Empty text="No trading outstanding! ✅"/>}
      {tradingEntries.map(e=><div key={e.id} style={{background:C.card,borderRadius:13,padding:"13px 15px",marginBottom:10,boxShadow:"0 1px 8px rgba(0,0,0,0.06)",borderLeft:`4px solid ${C.blue}`}}>
        <Row><B style={{fontSize:15}}>{e.name}</B><span style={{fontWeight:900,fontSize:16,color:C.red}}>₹{fmt(e.net)}</span></Row>
        <Mute>Due: ₹{fmt(e.due)} · Paid: ₹{fmt(e.paid)}</Mute>
        <button onClick={()=>waOpen(phoneMap[e.id]||"",buildPartyWA(e,"Trading"))} style={{marginTop:9,background:"#E8FBF0",color:"#25D366",border:"1px solid #25D366",borderRadius:9,padding:"9px 16px",fontSize:13,fontWeight:700,cursor:"pointer",minHeight:42}}>📲 WhatsApp</button>
      </div>)}</>}
    {view==="agency"&&<>{agencyEntries.length===0&&<Empty text="No agency outstanding! ✅"/>}
      {agencyEntries.map(e=><div key={e.id} style={{background:C.card,borderRadius:13,padding:"13px 15px",marginBottom:10,boxShadow:"0 1px 8px rgba(0,0,0,0.06)",borderLeft:`4px solid ${C.green}`}}>
        <Row><B style={{fontSize:15}}>{e.name}</B><span style={{fontWeight:900,fontSize:16,color:C.red}}>₹{fmt(e.net)}</span></Row>
        <Mute>Due: ₹{fmt(e.due)} · Paid: ₹{fmt(e.paid)} · CD: ₹{fmt(e.cdGiven)}</Mute>
        <button onClick={()=>waOpen(phoneMap[e.id]||"",buildPartyWA(e,"Agency"))} style={{marginTop:9,background:"#E8FBF0",color:"#25D366",border:"1px solid #25D366",borderRadius:9,padding:"9px 16px",fontSize:13,fontWeight:700,cursor:"pointer",minHeight:42}}>📲 WhatsApp</button>
      </div>)}</>}
  </div>);
}

// ─── AGING TAB ───────────────────────────────────────────────────
function AgingTab({data}){
  const[view,setView]=useState("all");const[search,setSearch]=useState("");const[expanded,setExpanded]=useState(null);
  const todayMs=new Date().setHours(0,0,0,0);
  function buildAging(sales,payments,label){
    const map={};sales.forEach(s=>{if(!map[s.customerId])map[s.customerId]={name:s.customerName,invoices:[]};map[s.customerId].invoices.push({date:s.date,amount:+s.amount||0,id:s.id,productName:s.productName});});
    const paid={};payments.forEach(p=>{paid[p.customerId]=(paid[p.customerId]||0)+(+p.amount||+p.netAmount||0);});
    return Object.entries(map).map(([id,v])=>{
      let rem=paid[id]||0;const buckets={b0:0,b30:0,b60:0,b90:0,b120:0};const openInvoices=[];
      [...v.invoices].sort((a,b)=>new Date(a.date)-new Date(b.date)).forEach(inv=>{
        let amt=inv.amount;const d=Math.min(amt,rem);amt-=d;rem-=d;if(amt<=0)return;
        const days=Math.floor((todayMs-new Date(inv.date).setHours(0,0,0,0))/86400000);
        let bucket;
        if(days<=30){buckets.b0+=amt;bucket="0–30d";}else if(days<=60){buckets.b30+=amt;bucket="31–60d";}else if(days<=90){buckets.b60+=amt;bucket="61–90d";}else if(days<=120){buckets.b90+=amt;bucket="91–120d";}else{buckets.b120+=amt;bucket="120d+";}
        openInvoices.push({...inv,outstanding:amt,days,bucket,type:label});
      });
      const total=Object.values(buckets).reduce((a,b)=>a+b,0);
      return{id,name:v.name,...buckets,total,openInvoices};
    }).filter(e=>e.total>0);
  }
  const tradingAging=buildAging(data.tradingSales,data.tradingPayments,"Trading");
  const agencyAging=buildAging(data.agencySales,data.agencyPayments,"Agency");
  const combinedMap={};
  tradingAging.forEach(e=>{combinedMap[e.id]=combinedMap[e.id]||{id:e.id,name:e.name,b0:0,b30:0,b60:0,b90:0,b120:0,total:0,openInvoices:[],hasTrading:false,hasAgency:false};const c=combinedMap[e.id];c.b0+=e.b0;c.b30+=e.b30;c.b60+=e.b60;c.b90+=e.b90;c.b120+=e.b120;c.total+=e.total;c.openInvoices.push(...e.openInvoices);c.hasTrading=true;});
  agencyAging.forEach(e=>{combinedMap[e.id]=combinedMap[e.id]||{id:e.id,name:e.name,b0:0,b30:0,b60:0,b90:0,b120:0,total:0,openInvoices:[],hasTrading:false,hasAgency:false};const c=combinedMap[e.id];c.b0+=e.b0;c.b30+=e.b30;c.b60+=e.b60;c.b90+=e.b90;c.b120+=e.b120;c.total+=e.total;c.openInvoices.push(...e.openInvoices);c.hasAgency=true;});
  const allEntries=Object.values(combinedMap).sort((a,b)=>b.total-a.total);
  const sourceEntries=view==="trading"?tradingAging.sort((a,b)=>b.total-a.total):view==="agency"?agencyAging.sort((a,b)=>b.total-a.total):allEntries;
  const entries=sourceEntries.filter(e=>!search||e.name?.toLowerCase().includes(search.toLowerCase()));
  const phoneMap={};data.customers.forEach(c=>{phoneMap[c.id]=c.phone;});
  const buckets=[{key:"b0",label:"0–30d",color:"#27AE60",bg:"#E9F7EF"},{key:"b30",label:"31–60d",color:"#F39C12",bg:"#FEF9E7"},{key:"b60",label:"61–90d",color:"#E67E22",bg:"#FEF3E7"},{key:"b90",label:"91–120d",color:"#C0392B",bg:"#FADBD8"},{key:"b120",label:"120d+",color:"#922B21",bg:"#F5B7B1"}];
  const totals=entries.reduce((acc,e)=>{buckets.forEach(b=>acc[b.key]=(acc[b.key]||0)+e[b.key]);acc.total=(acc.total||0)+e.total;return acc;},{});
  const buildAgingWA=()=>{const d=new Date().toLocaleDateString("en-IN");const lines=entries.map(e=>`• ${e.name}: ₹${fmt(e.total)} (120d+: ₹${fmt(e.b120)})`).join("\n");const label=view==="trading"?"Trading":view==="agency"?"Agency":"All";return`🧵 *${label} Outstanding & Ageing*\n📅 ${d}\n\n${lines}\n\n*Total: ₹${fmt(totals.total||0)}*`;};
  const buildPartyWA=(e)=>{const d=new Date().toLocaleDateString("en-IN");const lines=buckets.filter(b=>e[b.key]>0).map(b=>`${b.label}: ₹${fmt(e[b.key])}`).join("\n");return`🧵 *Fabric Business*\n📅 ${d}\n\nDear *${e.name}*,\n\nYour outstanding ageing:\n${lines}\n\n⚠️ *Total Due: ₹${fmt(e.total)}*\n\nKindly arrange payment 🙏`;};
  return(<div>
    <SecTitle>Customer-wise Outstanding &amp; Ageing</SecTitle>
    <SegCtrl options={[{v:"all",l:"👥 All"},{v:"trading",l:"🏪 Trading"},{v:"agency",l:"🤝 Agency"}]} val={view} onChange={setView}/>
    <input placeholder="🔎 Search customer…" value={search} onChange={e=>setSearch(e.target.value)} style={{...IS,margin:"10px 0"}}/>
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:9,margin:"4px 0 12px"}}>
      {buckets.map(b=><div key={b.key} style={{background:b.bg,borderRadius:12,padding:"11px 12px",borderLeft:`4px solid ${b.color}`}}>
        <div style={{fontSize:10.5,color:b.color,fontWeight:700,textTransform:"uppercase"}}>{b.label}</div>
        <div style={{fontSize:16,fontWeight:900,color:b.color,marginTop:3}}>₹{fmt(totals[b.key]||0)}</div>
      </div>)}
    </div>
    <div style={{background:`linear-gradient(135deg,${C.navy},${C.navyMid})`,borderRadius:14,padding:"14px 16px",marginBottom:16,display:"flex",justifyContent:"space-between",alignItems:"center",gap:10}}>
      <div><div style={{fontSize:10.5,color:C.gold,textTransform:"uppercase",letterSpacing:1,fontWeight:600}}>Total Outstanding ({entries.length} customers)</div><div style={{fontSize:24,fontWeight:900,color:"#fff"}}>₹{fmt(totals.total||0)}</div></div>
      <button onClick={()=>waOpen("",buildAgingWA())} style={{background:"#25D366",color:"#fff",border:"none",borderRadius:10,padding:"11px 16px",fontSize:13,fontWeight:700,cursor:"pointer",flexShrink:0,minHeight:44}}>📲 Share</button>
    </div>
    {entries.length===0&&<Empty text="No outstanding found."/>}
    {entries.map(e=>{const isOpen=expanded===e.id;return(
      <div key={e.id} style={{background:C.card,borderRadius:14,padding:"14px 15px",marginBottom:11,boxShadow:"0 1px 8px rgba(0,0,0,0.07)"}}>
        <div onClick={()=>setExpanded(isOpen?null:e.id)} style={{cursor:"pointer"}}>
          <Row><div><B style={{fontSize:15}}>{e.name}</B>{view==="all"&&<div style={{display:"flex",gap:5,marginTop:4}}>{e.hasTrading&&<span style={{fontSize:9.5,padding:"2px 8px",borderRadius:20,background:"#EAF4FC",color:C.blue,fontWeight:700}}>🏪 Trading</span>}{e.hasAgency&&<span style={{fontSize:9.5,padding:"2px 8px",borderRadius:20,background:"#E9F7EF",color:C.green,fontWeight:700}}>🤝 Agency</span>}</div>}</div><span style={{fontWeight:900,fontSize:17,color:C.red}}>₹{fmt(e.total)}</span></Row>
        </div>
        <div style={{marginTop:10}}>{buckets.map(b=>e[b.key]>0&&<div key={b.key} style={{display:"flex",alignItems:"center",gap:8,marginBottom:5}}><div style={{fontSize:10.5,color:b.color,fontWeight:700,width:64,flexShrink:0}}>{b.label}</div><div style={{flex:1,background:"#F0F4F8",borderRadius:5,height:7}}><div style={{width:`${Math.min(100,e[b.key]/e.total*100)}%`,background:b.color,height:7,borderRadius:5}}/></div><div style={{fontSize:12,fontWeight:700,color:b.color,width:78,textAlign:"right",flexShrink:0}}>₹{fmt(e[b.key])}</div></div>)}</div>
        {isOpen&&<div style={{marginTop:10,paddingTop:10,borderTop:"1px solid #F0F4F8"}}><Mute style={{marginBottom:6,fontWeight:700}}>Open Invoices ({e.openInvoices.length})</Mute>{e.openInvoices.sort((a,b)=>b.days-a.days).map(inv=><div key={inv.id+inv.type} style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:"1px solid #F7F9FB"}}><div><div style={{fontSize:12.5,fontWeight:600}}>{inv.productName||"—"} <span style={{color:"#bbb"}}>· {inv.type}</span></div><div style={{fontSize:10.5,color:"#bbb"}}>{fmtD(inv.date)} · {inv.days}d · {inv.bucket}</div></div><div style={{fontWeight:800,fontSize:12.5,color:C.red,alignSelf:"center"}}>₹{fmt(inv.outstanding)}</div></div>)}</div>}
        <div style={{display:"flex",gap:8,marginTop:11,flexWrap:"wrap"}}>
          <button onClick={()=>waOpen(phoneMap[e.id]||"",buildPartyWA(e))} style={{background:"#E8FBF0",color:"#25D366",border:"1px solid #25D366",borderRadius:9,padding:"9px 14px",fontSize:12,fontWeight:700,cursor:"pointer",minHeight:40}}>📲 WhatsApp</button>
          {e.b120>0&&<button onClick={()=>waOpen(phoneMap[e.id]||"",`🧵 Dear ${e.name},\n\n⚠️ Payment of ₹${fmt(e.b120)} overdue 120+ days.\n\nTotal: ₹${fmt(e.total)}\n\nKindly arrange immediately 🙏`)} style={{background:"#FADBD8",color:"#922B21",border:"1px solid #922B21",borderRadius:9,padding:"9px 14px",fontSize:12,fontWeight:700,cursor:"pointer",minHeight:40}}>⚠️ Urgent</button>}
        </div>
      </div>
    );})}
  </div>);
}

// ─── ANALYTICS TAB ───────────────────────────────────────────────
function AnalyticsTab({data,tradingOut,agencyOut}){
  const[view,setView]=useState("trading");const[chartType,setChartType]=useState("bar");

  function monthlyData(sales){
    const map={};
    sales.forEach(s=>{
      const d=new Date(s.date);const key=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
      const label=d.toLocaleDateString("en-IN",{month:"short",year:"2-digit"});
      if(!map[key])map[key]={key,label,amount:0,count:0};
      map[key].amount+=+s.amount||0;map[key].count++;
    });
    return Object.values(map).sort((a,b)=>a.key.localeCompare(b.key)).slice(-12);
  }

  function customerData(sales,out){
    return Object.entries(out).map(([id,v])=>{
      const paid=v.paid||0;const net=Math.max(0,v.due-(v.paid||0)-(v.cdGiven||0));
      return{name:v.name.length>14?v.name.slice(0,14)+"…":v.name,sales:v.due,outstanding:net};
    }).sort((a,b)=>b.sales-a.sales).slice(0,8);
  }

  function productData(sales){
    const map={};
    sales.forEach(s=>{const p=s.productName||"Unknown";if(!map[p])map[p]={name:p,value:0};map[p].value+=+s.amount||0;});
    return Object.values(map).sort((a,b)=>b.value-a.value).slice(0,7);
  }

  const isTrading=view==="trading";
  const sales=isTrading?data.tradingSales:data.agencySales;
  const out=isTrading?tradingOut:agencyOut;
  const color=isTrading?C.blue:C.green;
  const monthly=monthlyData(sales);
  const customers=customerData(sales,out);
  const products=productData(sales);
  const PIE_COLORS=[C.blue,C.green,C.orange,C.purple,C.teal,C.red,"#F39C12","#1ABC9C"];

  const totalSales=sales.reduce((a,s)=>a+(+s.amount||0),0);
  const totalOut=Object.values(out).reduce((a,v)=>a+Math.max(0,v.due-(v.paid||0)-(v.cdGiven||0)),0);
  const topCustomer=customers[0];
  const topProduct=products[0];

  return(<div>
    <SegCtrl options={[{v:"trading",l:"🏪 Trading"},{v:"agency",l:"🤝 Agency"}]} val={view} onChange={setView}/>
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(140px,1fr))",gap:10,margin:"14px 0"}}>
      <KpiCard icon="💼" label="Total Sales" val={`₹${fmt(totalSales)}`} color={color}/>
      <KpiCard icon="⏳" label="Outstanding" val={`₹${fmt(totalOut)}`} color={C.red}/>
      <KpiCard icon="🏆" label="Top Customer" val={topCustomer?.name||"—"} color={C.orange} sub={topCustomer?`₹${fmt(topCustomer.sales)}`:""}/>
      <KpiCard icon="📦" label="Top Product" val={topProduct?.name||"—"} color={C.purple} sub={topProduct?`₹${fmt(topProduct.value)}`:""}/>
    </div>

    {/* Chart type selector */}
    <div style={{display:"flex",gap:8,marginBottom:16,flexWrap:"wrap"}}>
      {[{v:"bar",l:"📊 Monthly Bar"},{v:"line",l:"📈 Trend Line"},{v:"pie",l:"🥧 Product Split"},{v:"customer",l:"👥 Customer"}].map(ct=>(
        <button key={ct.v} onClick={()=>setChartType(ct.v)} style={{flex:"0 0 auto",padding:"9px 14px",borderRadius:20,fontSize:12.5,fontWeight:chartType===ct.v?700:500,border:`1.5px solid ${chartType===ct.v?C.navy:C.border}`,background:chartType===ct.v?C.navy:"#fff",color:chartType===ct.v?C.gold:"#666",cursor:"pointer",minHeight:40}}>
          {ct.l}
        </button>
      ))}
    </div>

    {/* Monthly Bar */}
    {chartType==="bar"&&<div style={{background:C.card,borderRadius:14,padding:"16px",boxShadow:"0 1px 8px rgba(0,0,0,0.06)"}}>
      <div style={{fontWeight:700,fontSize:14,color:C.navy,marginBottom:16}}>Monthly Sales — Last 12 Months</div>
      {monthly.length===0?<Empty text="No sales data yet."/>:<ResponsiveContainer width="100%" height={240}>
        <BarChart data={monthly} margin={{top:4,right:8,left:0,bottom:4}}>
          <CartesianGrid strokeDasharray="3 3" stroke="#F0F4F8"/>
          <XAxis dataKey="label" tick={{fontSize:10}} tickLine={false}/>
          <YAxis tickFormatter={v=>v>=100000?`₹${(v/100000).toFixed(1)}L`:`₹${(v/1000).toFixed(0)}K`} tick={{fontSize:10}} tickLine={false} axisLine={false}/>
          <Tooltip formatter={v=>`₹${fmt(v)}`} labelStyle={{fontWeight:700}}/>
          <Bar dataKey="amount" fill={color} radius={[5,5,0,0]} name="Sales Amount"/>
        </BarChart>
      </ResponsiveContainer>}
    </div>}

    {/* Line Trend */}
    {chartType==="line"&&<div style={{background:C.card,borderRadius:14,padding:"16px",boxShadow:"0 1px 8px rgba(0,0,0,0.06)"}}>
      <div style={{fontWeight:700,fontSize:14,color:C.navy,marginBottom:16}}>Sales Trend — Last 12 Months</div>
      {monthly.length===0?<Empty text="No sales data yet."/>:<ResponsiveContainer width="100%" height={240}>
        <LineChart data={monthly} margin={{top:4,right:8,left:0,bottom:4}}>
          <CartesianGrid strokeDasharray="3 3" stroke="#F0F4F8"/>
          <XAxis dataKey="label" tick={{fontSize:10}} tickLine={false}/>
          <YAxis tickFormatter={v=>v>=100000?`₹${(v/100000).toFixed(1)}L`:`₹${(v/1000).toFixed(0)}K`} tick={{fontSize:10}} tickLine={false} axisLine={false}/>
          <Tooltip formatter={v=>`₹${fmt(v)}`} labelStyle={{fontWeight:700}}/>
          <Line type="monotone" dataKey="amount" stroke={color} strokeWidth={2.5} dot={{r:4,fill:color}} name="Sales"/>
        </LineChart>
      </ResponsiveContainer>}
    </div>}

    {/* Pie — Product */}
    {chartType==="pie"&&<div style={{background:C.card,borderRadius:14,padding:"16px",boxShadow:"0 1px 8px rgba(0,0,0,0.06)"}}>
      <div style={{fontWeight:700,fontSize:14,color:C.navy,marginBottom:16}}>Sales by Product</div>
      {products.length===0?<Empty text="No sales data yet."/>:<>
        <ResponsiveContainer width="100%" height={220}>
          <PieChart><Pie data={products} cx="50%" cy="50%" outerRadius={85} dataKey="value" nameKey="name" label={({name,percent})=>`${name} ${(percent*100).toFixed(0)}%`} labelLine={false} fontSize={10}>
            {products.map((_,i)=><Cell key={i} fill={PIE_COLORS[i%PIE_COLORS.length]}/>)}
          </Pie><Tooltip formatter={v=>`₹${fmt(v)}`}/></PieChart>
        </ResponsiveContainer>
        <div style={{display:"flex",flexWrap:"wrap",gap:8,marginTop:10}}>
          {products.map((p,i)=><div key={p.name} style={{display:"flex",alignItems:"center",gap:5,fontSize:11}}><div style={{width:10,height:10,borderRadius:3,background:PIE_COLORS[i%PIE_COLORS.length],flexShrink:0}}/>{p.name}: ₹{fmt(p.value)}</div>)}
        </div>
      </>}
    </div>}

    {/* Customer bar */}
    {chartType==="customer"&&<div style={{background:C.card,borderRadius:14,padding:"16px",boxShadow:"0 1px 8px rgba(0,0,0,0.06)"}}>
      <div style={{fontWeight:700,fontSize:14,color:C.navy,marginBottom:16}}>Top Customers — Sales vs Outstanding</div>
      {customers.length===0?<Empty text="No customer data yet."/>:<ResponsiveContainer width="100%" height={260}>
        <BarChart data={customers} layout="vertical" margin={{top:0,right:8,left:60,bottom:0}}>
          <CartesianGrid strokeDasharray="3 3" stroke="#F0F4F8" horizontal={false}/>
          <XAxis type="number" tickFormatter={v=>v>=100000?`₹${(v/100000).toFixed(1)}L`:`₹${(v/1000).toFixed(0)}K`} tick={{fontSize:9}} tickLine={false}/>
          <YAxis type="category" dataKey="name" tick={{fontSize:10}} width={60} tickLine={false} axisLine={false}/>
          <Tooltip formatter={v=>`₹${fmt(v)}`}/>
          <Legend iconSize={10} wrapperStyle={{fontSize:11}}/>
          <Bar dataKey="sales" fill={color} radius={[0,4,4,0]} name="Total Sales" barSize={10}/>
          <Bar dataKey="outstanding" fill={C.red} radius={[0,4,4,0]} name="Outstanding" barSize={10}/>
        </BarChart>
      </ResponsiveContainer>}
    </div>}
  </div>);
}

// ─── REMINDERS TAB ───────────────────────────────────────────────
function RemindersTab({tradingOverdue,agencyOverdue,phoneMap}){
  const[view,setView]=useState("all");const[minDays,setMinDays]=useState(30);
  const all=[...tradingOverdue,...agencyOverdue];
  const source=view==="trading"?tradingOverdue:view==="agency"?agencyOverdue:all;
  const filtered=source.filter(e=>e.maxDays>=minDays).sort((a,b)=>b.maxDays-a.maxDays);

  const urgency=(days)=>{if(days>120)return{label:"Critical 🔴",color:"#922B21",bg:"#F5B7B1"};if(days>90)return{label:"High ⚠️",color:C.red,bg:"#FADBD8"};if(days>60)return{label:"Medium 🟠",color:C.orange,bg:"#FEF3E7"};return{label:"Follow up 🟡",color:"#B7950B",bg:"#FEF9E7"};};

  const buildWA=(e,customMsg)=>{
    const d=new Date().toLocaleDateString("en-IN");
    if(customMsg)return customMsg;
    if(e.maxDays>120)return`🧵 *URGENT — Fabric Business*\n📅 ${d}\n\nDear *${e.name}*,\n\n⚠️ Your payment of *₹${fmt(e.outstanding)}* has been overdue for *${e.maxDays} days*.\n\nThis requires your immediate attention.\n\nPlease arrange payment today or contact us to discuss.\n\nThank you 🙏`;
    if(e.maxDays>60)return`🧵 *Fabric Business — Payment Reminder*\n📅 ${d}\n\nDear *${e.name}*,\n\nThis is a gentle reminder that your outstanding payment of *₹${fmt(e.outstanding)}* is now ${e.maxDays} days overdue.\n\nKindly arrange payment at the earliest 🙏`;
    return`🧵 *Fabric Business*\n📅 ${d}\n\nDear *${e.name}*,\n\nYour payment of *₹${fmt(e.outstanding)}* (${e.type}) is due since ${e.maxDays} days.\n\nKindly arrange payment 🙏`;
  };

  const sendAll=()=>{filtered.forEach((e,i)=>{setTimeout(()=>waOpen(phoneMap[e.id]||"",buildWA(e)),i*800);});};

  return(<div>
    <SecTitle>Payment Reminders</SecTitle>
    <SegCtrl options={[{v:"all",l:`👥 All (${all.length})`},{v:"trading",l:`🏪 Trading (${tradingOverdue.length})`},{v:"agency",l:`🤝 Agency (${agencyOverdue.length})`}]} val={view} onChange={setView}/>

    {/* Filter strip */}
    <div style={{display:"flex",gap:8,margin:"12px 0",flexWrap:"wrap"}}>
      {[{d:30,l:"30d+"},{d:60,l:"60d+"},{d:90,l:"90d+"},{d:120,l:"120d+"}].map(f=>(
        <button key={f.d} onClick={()=>setMinDays(f.d)} style={{flex:"0 0 auto",padding:"9px 16px",borderRadius:20,fontSize:12.5,fontWeight:minDays===f.d?700:500,border:`1.5px solid ${minDays===f.d?C.red:C.border}`,background:minDays===f.d?C.red:"#fff",color:minDays===f.d?"#fff":C.muted,cursor:"pointer",minHeight:40}}>
          {f.l}
        </button>
      ))}
    </div>

    {/* Summary */}
    <div style={{background:`linear-gradient(135deg,${C.navy},${C.navyMid})`,borderRadius:14,padding:"14px 16px",marginBottom:16,display:"flex",justifyContent:"space-between",alignItems:"center",gap:10}}>
      <div>
        <div style={{fontSize:10.5,color:C.gold,textTransform:"uppercase",letterSpacing:1,fontWeight:600}}>{filtered.length} customers overdue {minDays}+ days</div>
        <div style={{fontSize:22,fontWeight:900,color:"#fff"}}>₹{fmt(filtered.reduce((a,e)=>a+e.outstanding,0))}</div>
      </div>
      {filtered.length>0&&<button onClick={sendAll} style={{background:"#25D366",color:"#fff",border:"none",borderRadius:10,padding:"11px 14px",fontSize:12.5,fontWeight:700,cursor:"pointer",flexShrink:0,minHeight:44}}>📲 Send All</button>}
    </div>

    {filtered.length===0&&<Empty text={`No customers overdue ${minDays}+ days. ✅`}/>}
    {filtered.map(e=>{const u=urgency(e.maxDays);return(
      <div key={e.id+e.type} style={{background:C.card,borderRadius:14,padding:"14px 15px",marginBottom:11,boxShadow:"0 1px 8px rgba(0,0,0,0.07)",borderLeft:`4px solid ${u.color}`}}>
        <Row>
          <div><B style={{fontSize:15}}>{e.name}</B><Mute>{e.type} · {e.maxDays} days overdue</Mute></div>
          <div style={{textAlign:"right"}}>
            <div style={{fontWeight:900,fontSize:16,color:C.red}}>₹{fmt(e.outstanding)}</div>
            <span style={{fontSize:10,background:u.bg,color:u.color,borderRadius:10,padding:"2px 8px",fontWeight:700}}>{u.label}</span>
          </div>
        </Row>
        <div style={{display:"flex",gap:8,marginTop:12,flexWrap:"wrap"}}>
          <button onClick={()=>waOpen(phoneMap[e.id]||"",buildWA(e))} style={{background:"#E8FBF0",color:"#25D366",border:"1px solid #25D366",borderRadius:9,padding:"9px 14px",fontSize:12,fontWeight:700,cursor:"pointer",minHeight:40,flex:1}}>📲 WhatsApp</button>
          {e.maxDays>90&&<button onClick={()=>waOpen(phoneMap[e.id]||"",buildWA(e,`🧵 *FINAL NOTICE — Fabric Business*\n\nDear *${e.name}*,\n\n🚨 Your outstanding of ₹${fmt(e.outstanding)} is ${e.maxDays} days overdue.\n\nKindly pay within 48 hours or contact us immediately.\n\n⚠️ Further credit will be stopped.`))} style={{background:"#FADBD8",color:"#922B21",border:"1px solid #922B21",borderRadius:9,padding:"9px 14px",fontSize:12,fontWeight:700,cursor:"pointer",minHeight:40,flex:1}}>🚨 Final Notice</button>}
        </div>
      </div>
    );})}
  </div>);
}

// ─── COMMISSION TAB ──────────────────────────────────────────────
function CommissionTab({data,totTradingComm,totAgencyComm}){
  const[view,setView]=useState("trading");
  const exportTradingCSV=()=>exportCSV([["Date","Customer","Product","Meters","Rate","Sale Amount","Commission"],
    ...data.tradingSales.map(s=>[fmtD(s.date),s.customerName,s.productName,s.meters,s.rate,s.amount,tradingCommission(s.meters)])],`Trading_Commission_${today()}.csv`);
  const exportAgencyCSV=()=>exportCSV([["Date","Customer","Gross","CD%","CD Amt","Net","Commission"],
    ...data.agencyPayments.map(p=>[fmtD(p.date),p.customerName,p.grossAmount,p.cdPct,p.cdAmount,p.netAmount,p.commission])],`Agency_Commission_${today()}.csv`);
  return(<div>
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:14}}>
      <KpiCard icon="🏪" label="Trading Comm" val={`₹${fmt(totTradingComm)}`} color={C.blue} sub={`${data.tradingSales.length} sales × ₹1.5/m`}/>
      <KpiCard icon="🤝" label="Agency Comm" val={`₹${fmt(totAgencyComm)}`} color={C.green} sub="0.5% of net amount"/>
    </div>
    <div style={{background:`linear-gradient(135deg,${C.navy},${C.navyMid})`,borderRadius:14,padding:"14px 16px",marginBottom:16}}>
      <div style={{fontSize:10.5,color:C.gold,textTransform:"uppercase",letterSpacing:1,fontWeight:600}}>Total Commission</div>
      <div style={{fontSize:28,fontWeight:900,color:"#fff"}}>₹{fmt(totTradingComm+totAgencyComm)}</div>
    </div>
    <SegCtrl options={[{v:"trading",l:"🏪 Trading"},{v:"agency",l:"🤝 Agency"}]} val={view} onChange={setView}/>
    {view==="trading"&&<><div style={{margin:"12px 0 8px"}}><button onClick={exportTradingCSV} style={{background:C.green,color:"#fff",border:"none",borderRadius:9,padding:"9px 15px",fontSize:12.5,fontWeight:700,cursor:"pointer",minHeight:40}}>📊 Export CSV</button></div>
      {data.tradingSales.length===0&&<Empty text="No trading sales."/>}
      {[...data.tradingSales].sort((a,b)=>new Date(b.date)-new Date(a.date)).map(s=><div key={s.id} style={{background:C.card,borderRadius:12,padding:"12px 14px",marginBottom:9,boxShadow:"0 1px 6px rgba(0,0,0,0.06)",borderLeft:`3px solid ${C.blue}`}}>
        <Row><B style={{fontSize:13.5}}>{s.customerName}</B><span style={{fontWeight:900,color:C.purple}}>₹{fmt(tradingCommission(s.meters))}</span></Row>
        <Mute>{s.productName} · {fmt(s.meters)}m · {fmtD(s.date)}</Mute>
      </div>)}</>}
    {view==="agency"&&<><div style={{margin:"12px 0 8px"}}><button onClick={exportAgencyCSV} style={{background:C.green,color:"#fff",border:"none",borderRadius:9,padding:"9px 15px",fontSize:12.5,fontWeight:700,cursor:"pointer",minHeight:40}}>📊 Export CSV</button></div>
      {data.agencyPayments.length===0&&<Empty text="No agency payments."/>}
      {[...data.agencyPayments].sort((a,b)=>new Date(b.date)-new Date(a.date)).map(p=><div key={p.id} style={{background:C.card,borderRadius:12,padding:"12px 14px",marginBottom:9,boxShadow:"0 1px 6px rgba(0,0,0,0.06)",borderLeft:`3px solid ${C.green}`}}>
        <Row><B style={{fontSize:13.5}}>{p.customerName}</B><span style={{fontWeight:900,color:C.teal}}>₹{fmt(p.commission)}</span></Row>
        <Mute>Net ₹{fmt(p.netAmount)} · CD {p.cdPct}% · {fmtD(p.date)}</Mute>
      </div>)}</>}
  </div>);
}

// ─── MASTERS TAB ─────────────────────────────────────────────────
function MastersTab({data,onAdd,onDel}){
  const[view,setView]=useState("customers");
  return(<div>
    <button onClick={()=>onAdd({type:"tallyImport"})} style={{width:"100%",background:`linear-gradient(135deg,${C.navyMid},${C.navy})`,color:C.gold,border:"1px solid rgba(232,201,126,0.4)",borderRadius:12,padding:"13px",fontSize:13.5,fontWeight:800,cursor:"pointer",marginBottom:14,minHeight:48}}>
      📥 Import Sales (Tally / Excel)
    </button>
    <SegCtrl options={[{v:"customers",l:`👤 Customers (${data.customers.length})`},{v:"suppliers",l:`🏭 Suppliers (${data.suppliers.length})`},{v:"products",l:`📦 Products (${data.products.length})`}]} val={view} onChange={setView}/>
    {view==="customers"&&<>
      <div style={{margin:"12px 0 8px"}}><Btn color={C.navy} onClick={()=>onAdd({type:"customer"})}>+ Add Customer</Btn></div>
      {data.customers.length===0&&<Empty text="No customers yet."/>}
      {data.customers.map(c=><TapCard key={c.id} onDelete={()=>onDel("customers",c.id)}>
        <Row><B>{c.name}</B><span style={{fontSize:11,background:"#F0F4F8",padding:"3px 9px",borderRadius:10,color:C.muted,fontWeight:600}}>{c.type}</span></Row>
        {c.phone&&<Mute>📞 {c.phone}</Mute>}{c.city&&<Mute>📍 {c.city}</Mute>}{c.gstin&&<Mute>GST: {c.gstin}</Mute>}
      </TapCard>)}
    </>}
    {view==="suppliers"&&<>
      <div style={{margin:"12px 0 8px"}}><Btn color={C.navy} onClick={()=>onAdd({type:"supplier"})}>+ Add Supplier</Btn></div>
      {data.suppliers.length===0&&<Empty text="No suppliers yet."/>}
      {data.suppliers.map(s=><TapCard key={s.id} onDelete={()=>onDel("suppliers",s.id)}>
        <B>{s.name}</B>{s.phone&&<Mute>📞 {s.phone}</Mute>}{s.city&&<Mute>📍 {s.city}</Mute>}
      </TapCard>)}
    </>}
    {view==="products"&&<>
      <div style={{margin:"12px 0 8px"}}><Btn color={C.navy} onClick={()=>onAdd({type:"product"})}>+ Add Product</Btn></div>
      {data.products.length===0&&<Empty text="No products yet."/>}
      {data.products.map(p=><TapCard key={p.id} onDelete={()=>onDel("products",p.id)}>
        <Row><B>{p.name}</B><span style={{fontSize:11,color:C.muted}}>{p.unit}</span></Row>
        <Mute>{p.supplierName}</Mute>
      </TapCard>)}
    </>}
  </div>);
}

// ─── REPORTS TAB ─────────────────────────────────────────────────
function ReportsTab({data,tradingOut,agencyOut,tots}){
  const[rep,setRep]=useState("trading");
  const repOptions=[{v:"trading",l:"🏪 Trading Sales"},{v:"agency",l:"🤝 Agency Sales"},{v:"outstanding",l:"⏳ Outstanding"},{v:"commission",l:"💰 Commission"}];
  const exportTradingCSV=()=>exportCSV([["Date","Customer","Product","Supplier","Meters","Rate","Amount","Remarks"],...data.tradingSales.map(s=>[fmtD(s.date),s.customerName,s.productName,s.supplierName,s.meters,s.rate,s.amount,s.remarks])],`Trading_Sales_${today()}.csv`);
  const exportAgencyCSV=()=>exportCSV([["Date","Customer","Product","Meters","Rate","Amount","CD Rate","Remarks"],...data.agencySales.map(s=>[fmtD(s.date),s.customerName,s.productName,s.meters,s.rate,s.amount,s.cdRate,s.remarks])],`Agency_Sales_${today()}.csv`);
  const exportOutstandingCSV=()=>exportCSV([["Customer","Type","Total Due","Paid","Outstanding"],
    ...Object.entries(tradingOut).map(([,v])=>[v.name,"Trading",v.due,v.paid,Math.max(0,v.due-v.paid)]),
    ...Object.entries(agencyOut).map(([,v])=>[v.name,"Agency",v.due,v.paid,Math.max(0,v.due-v.paid-v.cdGiven)])],`Outstanding_${today()}.csv`);
  const exportCommCSV=()=>exportCSV([["Date","Customer","Product","Meters","Commission"],...data.tradingSales.map(s=>[fmtD(s.date),s.customerName,s.productName,s.meters,tradingCommission(s.meters)])],`Commission_${today()}.csv`);
  return(<div>
    <div style={{display:"flex",overflowX:"auto",WebkitOverflowScrolling:"touch",gap:8,marginBottom:14,scrollbarWidth:"none"}}>
      {repOptions.map(r=><button key={r.v} onClick={()=>setRep(r.v)} style={{flex:"0 0 auto",padding:"10px 16px",borderRadius:20,fontSize:13,fontWeight:rep===r.v?700:500,border:`1.5px solid ${rep===r.v?C.navy:C.border}`,background:rep===r.v?C.navy:"#fff",color:rep===r.v?C.gold:"#666",cursor:"pointer",minHeight:42}}>{r.l}</button>)}
    </div>
    {rep==="trading"&&<><Row style={{marginBottom:10}}><SecTitle>Trading Sales</SecTitle><button onClick={exportTradingCSV} style={{background:C.green,color:"#fff",border:"none",borderRadius:9,padding:"9px 15px",fontSize:12.5,fontWeight:700,cursor:"pointer",minHeight:40}}>📊 Export CSV</button></Row>
      <div style={{background:C.card,borderRadius:12,padding:14,marginBottom:12,boxShadow:"0 1px 6px rgba(0,0,0,0.06)"}}><Mute>Total</Mute><div style={{fontSize:22,fontWeight:900,color:C.blue}}>₹{fmt(tots.totTradingSale)}</div></div>
      {data.tradingSales.length===0&&<Empty text="No trading sales."/>}
      {[...data.tradingSales].sort((a,b)=>new Date(b.date)-new Date(a.date)).map(s=><div key={s.id} style={{background:C.card,borderRadius:11,padding:"12px 14px",marginBottom:8,boxShadow:"0 1px 6px rgba(0,0,0,0.05)"}}>
        <Row><B style={{fontSize:13.5}}>{s.customerName}</B><span style={{fontWeight:900,color:C.blue}}>₹{fmt(s.amount)}</span></Row>
        <Mute>{s.productName} · {fmt(s.meters)}m · {fmtD(s.date)}</Mute>
      </div>)}</>}
    {rep==="agency"&&<><Row style={{marginBottom:10}}><SecTitle>Agency Sales</SecTitle><button onClick={exportAgencyCSV} style={{background:C.green,color:"#fff",border:"none",borderRadius:9,padding:"9px 15px",fontSize:12.5,fontWeight:700,cursor:"pointer",minHeight:40}}>📊 Export CSV</button></Row>
      <div style={{background:C.card,borderRadius:12,padding:14,marginBottom:12,boxShadow:"0 1px 6px rgba(0,0,0,0.06)"}}><Mute>Total</Mute><div style={{fontSize:22,fontWeight:900,color:C.green}}>₹{fmt(tots.totAgencySale)}</div></div>
      {data.agencySales.length===0&&<Empty text="No agency sales."/>}
      {[...data.agencySales].sort((a,b)=>new Date(b.date)-new Date(a.date)).map(s=><div key={s.id} style={{background:C.card,borderRadius:11,padding:"12px 14px",marginBottom:8,boxShadow:"0 1px 6px rgba(0,0,0,0.05)"}}>
        <Row><B style={{fontSize:13.5}}>{s.customerName}</B><span style={{fontWeight:900,color:C.green}}>₹{fmt(s.amount)}</span></Row>
        <Mute>{s.productName} · {fmt(s.meters)}m · {fmtD(s.date)}</Mute>
      </div>)}</>}
    {rep==="outstanding"&&<><Row style={{marginBottom:10}}><SecTitle>Outstanding</SecTitle><button onClick={exportOutstandingCSV} style={{background:C.green,color:"#fff",border:"none",borderRadius:9,padding:"9px 15px",fontSize:12.5,fontWeight:700,cursor:"pointer",minHeight:40}}>📊 Export CSV</button></Row>
      {[...Object.entries(tradingOut).map(([id,v])=>({id,type:"Trading",color:C.blue,...v,net:Math.max(0,v.due-v.paid)})),...Object.entries(agencyOut).map(([id,v])=>({id,type:"Agency",color:C.green,...v,net:Math.max(0,v.due-v.paid-v.cdGiven)}))].filter(e=>e.net>0).sort((a,b)=>b.net-a.net).map(e=><div key={e.id+e.type} style={{background:C.card,borderRadius:11,padding:"12px 14px",marginBottom:8,borderLeft:`3px solid ${e.color}`}}>
        <Row><B style={{fontSize:13.5}}>{e.name}</B><span style={{fontWeight:900,color:C.red}}>₹{fmt(e.net)}</span></Row>
        <Mute>{e.type} · Due ₹{fmt(e.due)} · Paid ₹{fmt(e.paid)}</Mute>
      </div>)}</>}
    {rep==="commission"&&<><Row style={{marginBottom:10}}><SecTitle>Commission</SecTitle><button onClick={exportCommCSV} style={{background:C.green,color:"#fff",border:"none",borderRadius:9,padding:"9px 15px",fontSize:12.5,fontWeight:700,cursor:"pointer",minHeight:40}}>📊 Export CSV</button></Row>
      {data.tradingSales.length===0&&<Empty text="No commission data."/>}
      {[...data.tradingSales].sort((a,b)=>new Date(b.date)-new Date(a.date)).map(s=><div key={s.id} style={{background:C.card,borderRadius:11,padding:"12px 14px",marginBottom:8}}>
        <Row><B style={{fontSize:13.5}}>{s.customerName}</B><span style={{fontWeight:900,color:C.purple}}>₹{fmt(tradingCommission(s.meters))}</span></Row>
        <Mute>{s.productName} · {fmt(s.meters)}m · {fmtD(s.date)}</Mute>
      </div>)}</>}
  </div>);
}

// ─── MODALS ──────────────────────────────────────────────────────
function TradingSaleModal({data,onSave,onClose}){
  const[f,sf]=useState({date:today(),customerId:"",customerName:"",productId:"",productName:"",supplierName:"",meters:"",rate:"",amount:"",remarks:""});
  const s=(k,v)=>sf({...f,[k]:v});
  const selectCust=(name)=>{const c=data.customers.find(c=>c.name===name);sf(p=>({...p,customerId:c?.id||"",customerName:name}));};
  const selectProd=(name)=>{const p=data.products.find(p=>p.name===name);sf(pr=>({...pr,productId:p?.id||"",productName:name,supplierName:p?.supplierName||pr.supplierName}));};
  useEffect(()=>{if(f.meters&&f.rate)s("amount",(parseFloat(f.meters)*parseFloat(f.rate)).toFixed(2));},[f.meters,f.rate]);
  const custNames=data.customers.map(c=>c.name);const prodNames=data.products.map(p=>p.name);const supNames=data.suppliers.map(s=>s.name);
  return(<ModalBase title="🏪 Add Trading Sale" onClose={onClose}>
    <F label="Date *"><input type="date" value={f.date} onChange={e=>s("date",e.target.value)} style={IS}/></F>
    <F label="Customer *"><SmartInput value={f.customerName} onChange={selectCust} placeholder="Customer name" list={custNames} idPrefix="ts-c"/></F>
    <F label="Product *"><SmartInput value={f.productName} onChange={selectProd} placeholder="Product / quality" list={prodNames} idPrefix="ts-p"/></F>
    <F label="Supplier"><SmartInput value={f.supplierName} onChange={v=>s("supplierName",v)} placeholder="Supplier name" list={supNames} idPrefix="ts-s"/></F>
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
      <F label="Meters"><input type="number" value={f.meters} onChange={e=>s("meters",e.target.value)} placeholder="0" style={IS}/></F>
      <F label="Rate (₹/m)"><input type="number" value={f.rate} onChange={e=>s("rate",e.target.value)} placeholder="0" style={IS}/></F>
    </div>
    <F label="Amount (₹) *"><input type="number" value={f.amount} onChange={e=>s("amount",e.target.value)} placeholder="Auto-calculated" style={{...IS,fontWeight:700}}/></F>
    {f.meters&&<div style={{fontSize:12,color:C.purple,fontWeight:600,marginBottom:10}}>💰 Commission: ₹{fmt(tradingCommission(f.meters))}</div>}
    <F label="Remarks"><input value={f.remarks} onChange={e=>s("remarks",e.target.value)} placeholder="Optional note" style={IS}/></F>
    <SaveBtn color={C.blue} onClick={()=>{if(!f.customerName||!f.amount)return alert("Fill required fields");onSave(f);}}>Save Trading Sale</SaveBtn>
  </ModalBase>);
}

function TradingPaymentModal({data,onSave,onClose,preCustomer}){
  const[f,sf]=useState({date:today(),customerId:"",customerName:preCustomer||"",amount:"",mode:"NEFT",remarks:""});
  const s=(k,v)=>sf({...f,[k]:v});
  const selectCust=(name)=>{const c=data.customers.find(c=>c.name===name);sf(p=>({...p,customerId:c?.id||"",customerName:name}));};
  const custNames=data.customers.map(c=>c.name);
  return(<ModalBase title="💰 Trading Payment" onClose={onClose}>
    <F label="Date *"><input type="date" value={f.date} onChange={e=>s("date",e.target.value)} style={IS}/></F>
    <F label="Customer *"><SmartInput value={f.customerName} onChange={selectCust} placeholder="Customer name" list={custNames} idPrefix="tp-c"/></F>
    <F label="Amount (₹) *"><input type="number" value={f.amount} onChange={e=>s("amount",e.target.value)} placeholder="0" style={{...IS,fontWeight:700}}/></F>
    <F label="Payment Mode"><select value={f.mode} onChange={e=>s("mode",e.target.value)} style={IS}><option>NEFT</option><option>RTGS</option><option>Cheque</option><option>Cash</option><option>UPI</option></select></F>
    <F label="Remarks"><input value={f.remarks} onChange={e=>s("remarks",e.target.value)} placeholder="Ref no, cheque no…" style={IS}/></F>
    <SaveBtn color={C.green} onClick={()=>{if(!f.customerName||!f.amount)return alert("Fill required fields");onSave(f);}}>Save Payment</SaveBtn>
  </ModalBase>);
}

function AgencySaleModal({data,onSave,onClose}){
  const[f,sf]=useState({date:today(),customerId:"",customerName:"",productId:"",productName:"",supplierName:"",meters:"",rate:"",amount:"",cdRate:2,remarks:""});
  const s=(k,v)=>sf({...f,[k]:v});
  const selectCust=(name)=>{const c=data.customers.find(c=>c.name===name);sf(p=>({...p,customerId:c?.id||"",customerName:name,cdRate:c?.cdRate||2}));};
  const selectProd=(name)=>{const p=data.products.find(p=>p.name===name);sf(pr=>({...pr,productId:p?.id||"",productName:name,supplierName:p?.supplierName||pr.supplierName}));};
  useEffect(()=>{if(f.meters&&f.rate)s("amount",(parseFloat(f.meters)*parseFloat(f.rate)).toFixed(2));},[f.meters,f.rate]);
  const custNames=data.customers.map(c=>c.name);const prodNames=data.products.map(p=>p.name);const supNames=data.suppliers.map(s=>s.name);
  return(<ModalBase title="🤝 Add Agency Sale" onClose={onClose}>
    <F label="Date *"><input type="date" value={f.date} onChange={e=>s("date",e.target.value)} style={IS}/></F>
    <F label="Customer *"><SmartInput value={f.customerName} onChange={selectCust} placeholder="Customer name" list={custNames} idPrefix="as-c"/></F>
    <F label="Product *"><SmartInput value={f.productName} onChange={selectProd} placeholder="Product / quality" list={prodNames} idPrefix="as-p"/></F>
    <F label="Supplier"><SmartInput value={f.supplierName} onChange={v=>s("supplierName",v)} placeholder="Supplier name" list={supNames} idPrefix="as-s"/></F>
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
      <F label="Meters"><input type="number" value={f.meters} onChange={e=>s("meters",e.target.value)} placeholder="0" style={IS}/></F>
      <F label="Rate (₹/m)"><input type="number" value={f.rate} onChange={e=>s("rate",e.target.value)} placeholder="0" style={IS}/></F>
    </div>
    <F label="Amount (₹) *"><input type="number" value={f.amount} onChange={e=>s("amount",e.target.value)} style={{...IS,fontWeight:700}}/></F>
    <F label="CD Rate (%)"><select value={f.cdRate} onChange={e=>s("cdRate",parseFloat(e.target.value))} style={IS}><option value={4}>4%</option><option value={3}>3%</option><option value={2}>2%</option><option value={0}>0%</option></select></F>
    <F label="Remarks"><input value={f.remarks} onChange={e=>s("remarks",e.target.value)} placeholder="Optional" style={IS}/></F>
    <SaveBtn color={C.green} onClick={()=>{if(!f.customerName||!f.amount)return alert("Fill required fields");onSave(f);}}>Save Agency Sale</SaveBtn>
  </ModalBase>);
}

function AgencyPaymentModal({data,onSave,onClose,preCustomer}){
  const[f,sf]=useState({date:today(),customerId:"",customerName:preCustomer||"",grossAmount:"",cdDays:"",cdPct:0,cdAmount:0,netAmount:"",commission:0,mode:"NEFT",remarks:""});
  const s=(k,v)=>sf(p=>({...p,[k]:v}));
  const selectCust=(name)=>{const c=data.customers.find(c=>c.name===name);sf(p=>({...p,customerId:c?.id||"",customerName:name}));};
  useEffect(()=>{
    if(f.grossAmount&&f.cdDays){
      const pct=getCDPct(parseInt(f.cdDays)||0);const gross=parseFloat(f.grossAmount)||0;
      const cdAmt=parseFloat((gross*pct/100).toFixed(2));const net=parseFloat((gross-cdAmt).toFixed(2));
      const comm=parseFloat(agencyCommission(net).toFixed(2));
      sf(p=>({...p,cdPct:pct,cdAmount:cdAmt,netAmount:net,commission:comm}));
    }
  },[f.grossAmount,f.cdDays]);
  const custNames=data.customers.map(c=>c.name);
  return(<ModalBase title="🤝 Agency Payment + CD" onClose={onClose}>
    <F label="Date *"><input type="date" value={f.date} onChange={e=>s("date",e.target.value)} style={IS}/></F>
    <F label="Customer *"><SmartInput value={f.customerName} onChange={selectCust} placeholder="Customer name" list={custNames} idPrefix="ap-c"/></F>
    <F label="Gross Amount (₹) *"><input type="number" value={f.grossAmount} onChange={e=>s("grossAmount",e.target.value)} placeholder="Invoice total" style={IS}/></F>
    <F label="Payment Days"><input type="number" value={f.cdDays} onChange={e=>s("cdDays",e.target.value)} placeholder="Days from invoice date" style={IS}/></F>
    {f.cdDays&&<div style={{background:"#F0F8FF",borderRadius:10,padding:12,marginBottom:12,fontSize:13}}>
      <div style={{fontWeight:700,color:C.blue,marginBottom:4}}>{getCDLabel(parseInt(f.cdDays)||0)}</div>
      <div>CD Amount: <b>₹{fmt(f.cdAmount)}</b></div>
      <div>Net Payable: <b style={{color:C.green}}>₹{fmt(f.netAmount)}</b></div>
      <div>Commission (0.5%): <b style={{color:C.purple}}>₹{fmt(f.commission)}</b></div>
    </div>}
    <F label="Payment Mode"><select value={f.mode} onChange={e=>s("mode",e.target.value)} style={IS}><option>NEFT</option><option>RTGS</option><option>Cheque</option><option>Cash</option><option>UPI</option></select></F>
    <F label="Remarks"><input value={f.remarks} onChange={e=>s("remarks",e.target.value)} placeholder="Optional" style={IS}/></F>
    <SaveBtn color={C.teal} onClick={()=>{if(!f.customerName||!f.grossAmount)return alert("Fill required fields");onSave(f);}}>Save Payment</SaveBtn>
  </ModalBase>);
}

function CustomerModal({data,onSave,onClose}){
  const[f,sf]=useState({name:"",type:"Trading",phone:"",city:"",cdRate:2,gstin:""});
  const s=(k,v)=>sf({...f,[k]:v});
  return(<ModalBase title="👤 Add Customer" onClose={onClose}>
    <F label="Name *"><input value={f.name} onChange={e=>s("name",e.target.value)} placeholder="Customer name" style={IS}/></F>
    <F label="Type"><select value={f.type} onChange={e=>s("type",e.target.value)} style={IS}><option>Trading</option><option>Agency</option><option>Both</option></select></F>
    <F label="Phone"><input type="tel" value={f.phone} onChange={e=>s("phone",e.target.value)} placeholder="10-digit mobile" style={IS}/></F>
    <F label="City"><input value={f.city} onChange={e=>s("city",e.target.value)} placeholder="City" style={IS}/></F>
    <F label="Default CD Rate (%)"><select value={f.cdRate} onChange={e=>s("cdRate",parseFloat(e.target.value))} style={IS}><option value={4}>4%</option><option value={3}>3%</option><option value={2}>2%</option><option value={0}>0%</option></select></F>
    <F label="GSTIN"><input value={f.gstin} onChange={e=>s("gstin",e.target.value)} placeholder="GST number" style={IS}/></F>
    <SaveBtn color={C.navy} onClick={()=>{if(!f.name)return alert("Name required");onSave(f);}}>Save Customer</SaveBtn>
  </ModalBase>);
}

function SupplierModal({data,onSave,onClose}){
  const[f,sf]=useState({name:"",phone:"",city:""});
  const s=(k,v)=>sf({...f,[k]:v});
  return(<ModalBase title="🏭 Add Supplier" onClose={onClose}>
    <F label="Name *"><input value={f.name} onChange={e=>s("name",e.target.value)} placeholder="Supplier name" style={IS}/></F>
    <F label="Phone"><input type="tel" value={f.phone} onChange={e=>s("phone",e.target.value)} placeholder="Phone" style={IS}/></F>
    <F label="City"><input value={f.city} onChange={e=>s("city",e.target.value)} placeholder="City" style={IS}/></F>
    <SaveBtn color={C.navy} onClick={()=>{if(!f.name)return alert("Name required");onSave(f);}}>Save Supplier</SaveBtn>
  </ModalBase>);
}

function ProductModal({data,onSave,onClose}){
  const[f,sf]=useState({name:"",supplierId:"",supplierName:"",unit:"Mtr"});
  const s=(k,v)=>sf({...f,[k]:v});
  const selectSupplier=(name)=>{const sup=data.suppliers.find(s=>s.name===name);sf(p=>({...p,supplierId:sup?.id||"",supplierName:name}));};
  const supNames=data.suppliers.map(s=>s.name);const prodNames=data.products.map(p=>p.name);
  return(<ModalBase title="📦 Add Product" onClose={onClose}>
    <F label="Product Name *"><SmartInput value={f.name} onChange={v=>s("name",v)} placeholder="Product name" list={prodNames} idPrefix="prod"/></F>
    <F label="Supplier *"><SmartInput value={f.supplierName} onChange={selectSupplier} placeholder="Supplier name" list={supNames} idPrefix="prodsup"/></F>
    <F label="Unit"><select value={f.unit} onChange={e=>s("unit",e.target.value)} style={IS}><option>Mtr</option><option>Kg</option><option>Pcs</option></select></F>
    <SaveBtn color={C.navy} onClick={()=>{if(!f.name||!f.supplierName)return alert("Fill required fields");onSave(f);}}>Save Product</SaveBtn>
  </ModalBase>);
}

// ─── TALLY IMPORT ────────────────────────────────────────────────
const TALLY_NON_PRODUCT=new Set(["IGST 5%","IGST 12%","IGST 18%","IGST 28%","CGST 2.5%","CGST 6%","CGST 9%","CGST 14%","SGST 2.5%","SGST 6%","SGST 9%","SGST 14%","ROUND OF","ROUND OFF","FREIGHT EXPENSES","FREIGHT","COOLIE & CARTAGE","CARTAGE","SALES RETURN","OFFICE EXPENSE","DISCOUNT","PACKING CHARGES"]);

function excelDateToJS(v){if(v instanceof Date)return v;if(typeof v==="number"){return new Date(Math.round((v-25569)*86400*1000));}if(typeof v==="string"){const d=new Date(v);if(!isNaN(d))return d;}return null;}

function parseTallySalesRegister(rows){
  const invoices=[];let cur=null;
  for(const row of rows){
    const date=row[0],part=row[1],qty=row[2],rate=row[3],c4=row[4],c5=row[5],c6=row[6];
    const jsDate=(date!==undefined&&date!==null&&date!=="")? excelDateToJS(date):null;
    if(jsDate&&!isNaN(jsDate)){if(cur)invoices.push(cur);cur={date:jsDate,customer:String(part||"").trim(),vchno:c5,total:typeof c6==="number"?c6:parseFloat(c6),items:[]};}
    else if(part!==undefined&&part!==null&&String(part).trim()!==""){
      const p=String(part).trim();if(p==="Sales Accounts"||p==="Particulars")continue;
      const isProduct=!TALLY_NON_PRODUCT.has(p.toUpperCase())&&(qty!==undefined&&qty!==null&&qty!==""&&!isNaN(parseFloat(qty)));
      if(isProduct&&cur)cur.items.push({product:p,qty:parseFloat(qty)||0,rate:parseFloat(rate)||0,amount:typeof c4==="number"?c4:parseFloat(c4)||0});
    }
  }
  if(cur)invoices.push(cur);
  return invoices.filter(inv=>inv.customer&&inv.customer.toLowerCase()!=="(cancelled)"&&inv.items.length>0&&!isNaN(inv.total));
}

function detectFlatColumns(headerRow){
  const norm=(s)=>String(s||"").trim().toLowerCase();const idx={};
  headerRow.forEach((cell,i)=>{const c=norm(cell);if(c==="date")idx.date=i;else if(c.includes("customer"))idx.customer=i;else if(c==="product"||c.includes("item")||c.includes("description"))idx.product=i;else if(c==="qty"||c.includes("quantity"))idx.qty=i;else if(c==="rate"||c.includes("price"))idx.rate=i;else if(c==="amount"||c.includes("total"))idx.amount=i;});
  if(["date","customer","product","amount"].every(k=>idx[k]!==undefined))return idx;return null;
}

function parseFlatSalesSheet(rows,colIdx){
  const invoices=[];
  for(let r=1;r<rows.length;r++){
    const row=rows[r];if(!row||row.every(c=>c===null||c===undefined||c===""))continue;
    const jsDate=(row[colIdx.date]!==undefined&&row[colIdx.date]!==null&&row[colIdx.date]!=="")? excelDateToJS(row[colIdx.date]):null;
    const customer=String(row[colIdx.customer]||"").trim();const product=String(row[colIdx.product]||"").trim();
    const amount=parseFloat(row[colIdx.amount]);
    if(!jsDate||isNaN(jsDate)||!customer||!product||isNaN(amount))continue;
    const qty=colIdx.qty!==undefined?parseFloat(row[colIdx.qty])||0:0;const rate=colIdx.rate!==undefined?parseFloat(row[colIdx.rate])||0:0;
    invoices.push({date:jsDate,customer,vchno:`R${r}`,total:amount,items:[{product,qty,rate,amount}]});
  }
  return invoices;
}

function parseSalesFile(rows){
  if(rows.length>1){const fc=detectFlatColumns(rows[0]);if(fc){const flat=parseFlatSalesSheet(rows,fc);if(flat.length>0)return flat;}}
  return parseTallySalesRegister(rows);
}

function TallyImportModal({data,onImport,onClose}){
  const[stage,setStage]=useState("upload");const[fileName,setFileName]=useState("");const[invoices,setInvoices]=useState([]);const[errorMsg,setErrorMsg]=useState("");const[excluded,setExcluded]=useState({});
  const fileRef=useRef(null);
  const existingNamesLower=new Set(data.customers.map(c=>c.name.trim().toLowerCase()));
  const handleFile=(e)=>{const file=e.target.files[0];if(!file)return;setFileName(file.name);const reader=new FileReader();
    reader.onload=(ev)=>{try{const wb=XLSX.read(ev.target.result,{type:"array",cellDates:true});let sheetName=wb.SheetNames.find(n=>/sales/i.test(n))||wb.SheetNames[0];const ws=wb.Sheets[sheetName];const rows=XLSX.utils.sheet_to_json(ws,{header:1,raw:true,defval:null});const parsed=parseSalesFile(rows);
      if(parsed.length===0){setErrorMsg("Couldn't find sales rows. Use a Tally Sales Register export or a sheet with columns Date, Customer Name, Product, Qty, Rate, Amount.");setStage("error");return;}
      setInvoices(parsed);setExcluded({});setStage("preview");}catch(err){setErrorMsg("File couldn't be read. Please upload a valid .xlsx file.");setStage("error");}
    };reader.readAsArrayBuffer(file);};
  const invKey=(inv,idx)=>`${idx}-${inv.vchno}`;
  const toggleExclude=(key)=>setExcluded(p=>({...p,[key]:!p[key]}));
  const includedInvoices=invoices.filter((inv,idx)=>!excluded[invKey(inv,idx)]);
  const totalAmount=includedInvoices.reduce((a,inv)=>a+(inv.total||0),0);
  const uniqueCustomers=[...new Set(includedInvoices.map(inv=>inv.customer))];
  const newCustomers=uniqueCustomers.filter(n=>!existingNamesLower.has(n.trim().toLowerCase()));
  const lineCount=includedInvoices.reduce((a,inv)=>a+inv.items.length,0);
  const dateRange=includedInvoices.length?{from:includedInvoices.reduce((m,i)=>i.date<m?i.date:m,includedInvoices[0].date),to:includedInvoices.reduce((m,i)=>i.date>m?i.date:m,includedInvoices[0].date)}:null;
  const doImport=()=>{
    const custByLower={};data.customers.forEach(c=>{custByLower[c.name.trim().toLowerCase()]=c;});
    const newCustRecs=newCustomers.map(name=>({id:uid(),name,type:"Trading",phone:"",city:"",cdRate:0,gstin:""}));
    newCustRecs.forEach(c=>{custByLower[c.name.trim().toLowerCase()]=c;});
    const saleRows=[];
    includedInvoices.forEach(inv=>{const cust=custByLower[inv.customer.trim().toLowerCase()];const dateStr=inv.date.toISOString().split("T")[0];
      inv.items.forEach(item=>{saleRows.push({date:dateStr,customerId:cust?.id||"",customerName:inv.customer,productId:"",productName:item.product,supplierName:"",meters:item.qty||"",rate:item.rate||"",amount:item.amount,remarks:`Imported (Ref ${inv.vchno})`});});
    });
    onImport(newCustRecs,saleRows);
  };
  if(stage==="upload")return(<ModalBase title="📥 Import Sales (Tally / Excel)" onClose={onClose}>
    <div style={{background:"#EAF4FC",borderRadius:12,padding:"13px 14px",marginBottom:16,fontSize:12.5,color:C.navyMid,lineHeight:1.6}}>
      Works with: <b>Tally Sales Register</b> (Gateway → Display More Reports → Sales Register → Alt+E → Excel) or a <b>structured Excel sheet</b> with columns Date, Customer Name, Product, Qty, Rate, Amount.
    </div>
    <label style={{display:"block",border:"2px dashed #C7D6E8",borderRadius:14,padding:"36px 16px",textAlign:"center",cursor:"pointer",background:"#FAFBFD"}}>
      <div style={{fontSize:36,marginBottom:10}}>📄</div>
      <div style={{fontWeight:700,fontSize:14.5,color:C.navyMid,marginBottom:4}}>Tap to choose Excel file</div>
      <div style={{fontSize:12,color:C.muted}}>.xlsx or .xls exported from Tally or Excel</div>
      <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={handleFile} style={{display:"none"}}/>
    </label>
  </ModalBase>);
  if(stage==="error")return(<ModalBase title="📥 Import Sales" onClose={onClose}>
    <div style={{background:"#FADBD8",borderRadius:12,padding:"14px",marginBottom:14,fontSize:13,color:"#922B21",lineHeight:1.5}}>⚠️ {errorMsg}</div>
    <Btn color={C.navy} onClick={()=>setStage("upload")} style={{width:"100%"}}>Try Another File</Btn>
  </ModalBase>);
  return(<ModalBase title="📥 Review Import" onClose={onClose}>
    <Mute style={{marginBottom:10}}>📄 {fileName}</Mute>
    <div style={{background:`linear-gradient(135deg,${C.navy},${C.navyMid})`,borderRadius:14,padding:"14px 16px",marginBottom:14}}>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
        <div><div style={{fontSize:10,color:C.gold,textTransform:"uppercase",fontWeight:700}}>Invoices</div><div style={{fontSize:20,fontWeight:900,color:"#fff"}}>{includedInvoices.length}</div></div>
        <div><div style={{fontSize:10,color:C.gold,textTransform:"uppercase",fontWeight:700}}>Total Amount</div><div style={{fontSize:20,fontWeight:900,color:"#fff"}}>₹{fmt(totalAmount)}</div></div>
        <div><div style={{fontSize:10,color:C.gold,textTransform:"uppercase",fontWeight:700}}>Sale Lines</div><div style={{fontSize:16,fontWeight:800,color:"#fff"}}>{lineCount}</div></div>
        <div><div style={{fontSize:10,color:C.gold,textTransform:"uppercase",fontWeight:700}}>Customers</div><div style={{fontSize:16,fontWeight:800,color:"#fff"}}>{uniqueCustomers.length}</div></div>
      </div>
      {dateRange&&<div style={{fontSize:11,color:"rgba(255,255,255,0.5)",marginTop:8}}>{fmtD(dateRange.from)} → {fmtD(dateRange.to)}</div>}
    </div>
    {newCustomers.length>0&&<div style={{background:"#FEF9E7",borderRadius:12,padding:"11px 13px",marginBottom:14,fontSize:12,color:"#946A00"}}>✨ <b>{newCustomers.length} new customer{newCustomers.length===1?"":"s"}</b> will be added: {newCustomers.slice(0,5).join(", ")}{newCustomers.length>5?` +${newCustomers.length-5} more`:""}</div>}
    <SecTitle>Invoices ({invoices.length} found)</SecTitle>
    <div style={{maxHeight:280,overflowY:"auto",marginBottom:14,border:`1px solid ${C.border}`,borderRadius:12}}>
      {invoices.map((inv,idx)=>{const key=invKey(inv,idx);const isExcluded=!!excluded[key];const isNew=!existingNamesLower.has(inv.customer.trim().toLowerCase());return(
        <div key={key} onClick={()=>toggleExclude(key)} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 13px",borderBottom:`1px solid ${C.border}`,cursor:"pointer",opacity:isExcluded?0.4:1,background:isExcluded?"#FAFAFA":"#fff"}}>
          <div style={{minWidth:0}}><div style={{fontSize:13,fontWeight:700,color:C.navy,textDecoration:isExcluded?"line-through":"none"}}>{inv.customer} {isNew&&!isExcluded&&<span style={{fontSize:9,color:C.green,fontWeight:700}}>NEW</span>}</div><div style={{fontSize:11,color:C.muted}}>{fmtD(inv.date)}{!String(inv.vchno).startsWith("R")&&` · Vch #${inv.vchno}`} · {inv.items.length} item{inv.items.length===1?"":"s"}</div></div>
          <div style={{textAlign:"right",flexShrink:0,marginLeft:8}}><div style={{fontWeight:800,fontSize:13.5,color:C.navyMid}}>₹{fmt(inv.total)}</div><div style={{fontSize:10,color:isExcluded?C.green:C.red,fontWeight:700}}>{isExcluded?"Include":"Tap to exclude"}</div></div>
        </div>
      );})}
    </div>
    <SaveBtn color={C.blue} onClick={doImport}>Import {includedInvoices.length} Invoice{includedInvoices.length===1?"":"s"} as Trading Sales</SaveBtn>
    <button onClick={()=>setStage("upload")} style={{width:"100%",background:"none",border:"none",color:C.muted,fontSize:12.5,fontWeight:600,padding:"10px",cursor:"pointer"}}>Choose a different file</button>
  </ModalBase>);
}
