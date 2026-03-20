import React, { useState, useRef, useCallback, useEffect } from "react";
import "./App.css";
import { supabase, isCloud } from "./supabase.js";
import { downloadExcel, downloadZip } from "./exportOrder.js";

const C = {

  bg:"#ffffff", bg2:"#f5f5f7", bg3:"#e8e8ed",

  border:"#d2d2d7", text:"#1d1d1f", sub:"#6e6e73",

  green:"#34c759", amber:"#ff9f0a", red:"#ff3b30",

  purple:"#bf5af2", gray:"#8e8e93", white:"#ffffff",

};

const font = "-apple-system, 'SF Pro Display', 'Helvetica Neue', Arial, sans-serif";

const SIZES = ["XS","S","M","L","XL","2XL","3XL"];

const LOGO_PLACEMENTS = ["Front Left Chest","Front Center","Back Center","Back Neck","Left Sleeve","Right Sleeve","Bottom Hem"];

const BRAND_FILES = ["Logo Design","Neck Label","Washing / Care Label","Hang Tag","Packaging / Bag","Front Print","Back Print"];
const BRAND_FILE_HAS_NOTE = {"Front Print":true,"Back Print":true};

const BRAND_FILE_HINTS = {
  "Logo Design":           "Your main brand logo. AI or PDF gives the best result, but a clear PNG works too.",
  "Neck Label":            "The small label that sits inside the collar. Upload your design, or any reference you have.",
  "Washing / Care Label":  "The care tag inside the garment with washing instructions. If you don't have one yet, just leave a note and we'll sort it out.",
  "Hang Tag":              "The tag that hangs off the garment — usually has your brand name, price, or a barcode.",
  "Packaging / Bag":       "The bag, box, or wrapping your product comes in. Upload whatever packaging design you have.",
  "Front Print":           "Any design, logo, or text that goes on the front of the garment.",
  "Back Print":            "Any design, logo, or text that goes on the back of the garment.",
};

const STATUS = { Active:C.green, Pending:C.amber, Draft:C.gray, Archived:C.purple };

const ADMIN_PASS = "qwqw";

const totalUnits = items => items.reduce((s,it)=>s+SIZES.reduce((a,sz)=>a+(parseInt(it.sizes[sz])||0),0),0);

const emptyItem  = () => ({ style:"", colors:"", sizes:Object.fromEntries(SIZES.map(s=>[s,0])), logos:[], logoNote:"", catalogImage:null, brandingFiles:Object.fromEntries(BRAND_FILES.map(k=>[k,[]])), brandingFileNotes:{}, itemNotes:"" });

// Normalize brandingFiles from old single-object format to new array format
function normBF(bf) {
  return Object.fromEntries(BRAND_FILES.map(k=>{const v=bf?.[k];if(!v)return[k,[]];if(Array.isArray(v))return[k,v];return[k,[v]];}));
}

const emptyForm  = () => ({ notes:"", items:[emptyItem()] });

const formErrors = f => { const e=[]; f.items.forEach((it,i)=>{ if(!it.style.trim()) e.push(`Item ${i+1}: Style`); if(!it.colors.trim()) e.push(`Item ${i+1}: Colors`); }); return e; };

const formProgress = f => { const all=[...f.items.flatMap(it=>[it.style,it.colors])]; if(!all.length) return 0; return Math.round(all.filter(v=>v&&v.trim()).length/all.length*100); };

const nowDate = () => new Date().toISOString().split("T")[0];

// ── Storage helpers (localStorage) ────────────────────────────────────────

const storage = {

  get: (key) => { try { const v = localStorage.getItem(key); return v ? { value: v } : null; } catch(_) { return null; } },

  set: (key, value) => { try { localStorage.setItem(key, value); } catch(_) {} },

  delete: (key) => { try { localStorage.removeItem(key); } catch(_) {} },

};

function fileKey(orderId, itemIdx, fieldName) {

  return `file_${orderId}_${itemIdx}_${fieldName.replace(/[\s/]/g,"_")}`;

}

const fileDb = (() => {
  let _db = null;
  const open = () => new Promise((res, rej) => {
    if (_db) return res(_db);
    const req = indexedDB.open("garment-crm-files", 1);
    req.onupgradeneeded = e => e.target.result.createObjectStore("files");
    req.onsuccess = e => { _db = e.target.result; res(_db); };
    req.onerror = rej;
  });
  return {
    set: async (key, blob) => { const db = await open(); return new Promise((res,rej)=>{ const tx=db.transaction("files","readwrite"); tx.objectStore("files").put(blob,key); tx.oncomplete=res; tx.onerror=rej; }); },
    get: async (key) => { const db = await open(); return new Promise((res,rej)=>{ const tx=db.transaction("files","readonly"); const r=tx.objectStore("files").get(key); r.onsuccess=e=>res(e.target.result||null); r.onerror=rej; }); },
    delete: async (key) => { const db = await open(); return new Promise((res,rej)=>{ const tx=db.transaction("files","readwrite"); tx.objectStore("files").delete(key); tx.oncomplete=res; tx.onerror=rej; }); },
  };
})();

async function persistOrders(orders, prevOrders) {

  if (isCloud) {

    const prevIds = new Set((prevOrders||[]).map(o=>o.id));

    const newIds  = new Set(orders.map(o=>o.id));

    const deleted = [...prevIds].filter(id=>!newIds.has(id));

    if (deleted.length) await supabase.from("crm_orders").delete().in("id", deleted);

    if (orders.length) await supabase.from("crm_orders").upsert(orders.map(o=>({id:o.id,data:o})));

    return;

  }

  storage.set("crm-orders", JSON.stringify(orders));

}

async function fetchOrders() {

  if (isCloud) {

    const { data } = await supabase.from("crm_orders").select().order("id", {ascending:false});

    return data ? data.map(r=>r.data) : [];

  }

  try { const r = storage.get("crm-orders"); return r ? JSON.parse(r.value) : []; } catch(_) { return []; }

}

async function loadFileData(key) {

  if (isCloud) {

    const { data, error } = await supabase.storage.from("crm-files").download(key);

    return error ? null : data;

  }

  try { return await fileDb.get(key); } catch(_) { return null; }

}

// ── Atoms ──────────────────────────────────────────────────────────────────

const Badge = ({status}) => <span style={{background:STATUS[status]+"18",color:STATUS[status],borderRadius:20,padding:"3px 10px",fontSize:11,fontWeight:600,fontFamily:font}}>{status}</span>;

const PillBtn = ({children,active,onClick}) => <button onClick={onClick} style={{background:active?C.text:"transparent",color:active?C.white:C.sub,border:`1px solid ${active?C.text:C.border}`,borderRadius:20,padding:"5px 14px",fontSize:13,cursor:"pointer",fontFamily:font,fontWeight:active?600:400}}>{children}</button>;

const Inp = ({value,onChange,placeholder,type="text",style={}}) => (

  <input type={type} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder}

    style={{background:C.bg,border:`1px solid ${C.border}`,color:C.text,borderRadius:10,padding:"10px 14px",fontFamily:font,fontSize:15,width:"100%",boxSizing:"border-box",outline:"none",...style}}

    onFocus={e=>e.target.style.borderColor=C.gray} onBlur={e=>e.target.style.borderColor=C.border}/>

);

const PrimaryBtn = ({children,onClick,disabled,style={}}) => <button disabled={disabled} onClick={onClick} style={{background:disabled?C.bg3:C.text,color:disabled?C.gray:C.white,border:"none",borderRadius:10,padding:"11px 22px",fontFamily:font,fontWeight:600,fontSize:15,cursor:disabled?"not-allowed":"pointer",...style}}>{children}</button>;

const GhostBtn = ({children,onClick,style={}}) => <button onClick={onClick} style={{background:"transparent",color:C.text,border:"none",borderRadius:10,padding:"11px 22px",fontFamily:font,fontWeight:500,fontSize:15,cursor:"pointer",...style}}>{children}</button>;

const DestructBtn = ({children,onClick,style={}}) => <button onClick={onClick} style={{background:"transparent",color:C.red,border:`1px solid ${C.red}30`,borderRadius:10,padding:"9px 18px",fontFamily:font,fontSize:14,cursor:"pointer",...style}}>{children}</button>;

const TOAST_CFG = {
  success: { bg:"#22c55e", icon:"✓" },
  warn:    { bg:"#f97316", icon:"⚠" },
  error:   { bg:"#ef4444", icon:"✕" },
};

const Toast = ({toasts, onDismiss}) => (

  <div style={{position:"fixed",top:24,left:"50%",transform:"translateX(-50%)",zIndex:9999,display:"flex",flexDirection:"column",gap:8,alignItems:"center",pointerEvents:"none"}}>

    {toasts.map(t=>{
      const cfg = TOAST_CFG[t.type] || TOAST_CFG.success;
      return (
        <div key={t.id} className={`toast-item${t.exiting?" exiting":""}`}
          onClick={()=>onDismiss(t.id)}
          style={{background:cfg.bg,color:"#fff",padding:"12px 18px 14px 14px",borderRadius:16,fontSize:14,fontFamily:font,fontWeight:500,boxShadow:"0 6px 28px #0003",display:"flex",alignItems:"center",gap:10,pointerEvents:"all",cursor:"pointer",minWidth:220,maxWidth:340,position:"relative",overflow:"hidden",userSelect:"none"}}>
          <span style={{width:22,height:22,borderRadius:99,background:"#ffffff30",display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:800,flexShrink:0}}>{cfg.icon}</span>
          <span style={{flex:1,lineHeight:1.4}}>{t.msg}</span>
          <span style={{fontSize:14,opacity:.6,marginLeft:4,flexShrink:0}}>✕</span>
          <div style={{position:"absolute",bottom:0,left:0,height:3,background:"#ffffff40",animation:"toastProgress 3s linear forwards"}}/>
        </div>
      );
    })}

  </div>

);

const Modal = ({children,onClose}) => (

  <div onClick={onClose} style={{position:"fixed",inset:0,background:"#00000040",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",backdropFilter:"blur(4px)"}}>

    <div onClick={e=>e.stopPropagation()} style={{background:C.bg,borderRadius:18,padding:32,minWidth:320,maxWidth:460,width:"90%",fontFamily:font,boxShadow:"0 20px 60px #0002"}}>{children}</div>

  </div>

);

const Section = ({n,title,sub,children,grey}) => (

  <div style={{background:grey?C.bg2:C.bg,border:`1px solid ${C.border}`,borderRadius:16,padding:24,marginBottom:16}}>

    <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:20}}>

      <span style={{background:C.text,color:C.white,borderRadius:99,width:28,height:28,display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:700,flexShrink:0}}>{n}</span>

      <span style={{fontSize:18,fontWeight:700,color:C.text,flex:1}}>{title}</span>

      {sub}

    </div>

    {children}

  </div>

);

// ── UploadSlot ─────────────────────────────────────────────────────────────

function FilePreview({file, url}) {
  if(!file&&!url) return null;
  const name = file?.name||"";
  const isPdf = name.toLowerCase().endsWith(".pdf");
  if(isPdf||!url) return (
    <div style={{display:"inline-flex",alignItems:"center",gap:6,background:"#ff3b3018",border:"1px solid #ff3b3030",borderRadius:7,padding:"4px 10px",marginBottom:6}}>
      <span style={{fontSize:16}}>📄</span>
      <span style={{fontSize:11,color:C.red,fontWeight:600,maxWidth:160,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{name}</span>
    </div>
  );
  return <img src={url} alt="preview" style={{maxHeight:80,maxWidth:"100%",borderRadius:7,marginBottom:6,objectFit:"contain",display:"block"}}/>;
}

function UploadSlot({label, required, initial, onReady, showShareToggle, isShared, onToggleShare, lockedByShared}) {

  const [fileName, setFileName] = useState(initial?.name||null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [liveFile, setLiveFile] = useState(null);

  useEffect(()=>{
    if(lockedByShared||!initial?.key) return;
    const name=initial?.name||"";
    if(name.toLowerCase().endsWith(".pdf")) return;
    let url=null;
    loadFileData(initial.key).then(blob=>{
      if(blob){url=URL.createObjectURL(blob);setPreviewUrl(url);}
    });
    return ()=>{ if(url) URL.revokeObjectURL(url); };
  },[initial?.key,lockedByShared]);

  const handleChange = async (e) => {

    const f = e.target.files[0];

    if (!f) return;

    setFileName(f.name);
    setLiveFile(f);

    if(previewUrl) URL.revokeObjectURL(previewUrl);
    const isPdf = f.name.toLowerCase().endsWith(".pdf");
    if(!isPdf) setPreviewUrl(URL.createObjectURL(f));
    else setPreviewUrl(null);

    onReady(f);

    e.target.value = "";

  };

  const displayName = lockedByShared ? initial?.name : fileName;
  const displayFile = lockedByShared ? null : liveFile;

  return (

    <div style={{marginBottom:12}}>

      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6}}>

        <div style={{fontSize:12,fontWeight:600,color:C.sub,letterSpacing:.5,textTransform:"uppercase",display:"flex",alignItems:"center",gap:5}}>

          {label} {required&&<span style={{color:C.red}}>*</span>}

          {lockedByShared&&<span style={{background:C.green+"18",color:C.green,fontSize:10,fontWeight:700,borderRadius:99,padding:"1px 8px"}}>Shared</span>}

        </div>

        {showShareToggle&&(

          <button onClick={onToggleShare} style={{display:"flex",alignItems:"center",gap:6,background:"transparent",border:"none",cursor:"pointer",padding:0,fontFamily:font}}>

            <span style={{fontSize:12,color:isShared?C.green:C.sub,fontWeight:500}}>Apply to all items</span>

            <div style={{width:36,height:20,borderRadius:99,background:isShared?C.green:C.bg3,border:`1.5px solid ${isShared?C.green:C.border}`,position:"relative",flexShrink:0}}>

              <div style={{position:"absolute",top:2,left:isShared?16:2,width:14,height:14,borderRadius:99,background:C.white,transition:"left .2s"}}/>

            </div>

          </button>

        )}

      </div>

      <label style={{display:"block",border:`1.5px dashed ${displayName?C.green:C.border}`,borderRadius:10,cursor:lockedByShared?"default":"pointer",background:displayName?C.green+"06":C.bg2}}>

        <input type="file" disabled={lockedByShared} style={{display:"none"}} onChange={handleChange}/>

        <div style={{padding:"12px",textAlign:"center"}}>

          {displayName
            ? <>
                <FilePreview file={displayFile||{name:displayName}} url={previewUrl}/>
                <span style={{fontSize:11,color:C.green,fontWeight:600}}>✓ {displayName}</span>
                {!lockedByShared&&<div style={{fontSize:10,color:C.sub,marginTop:2}}>Tap to replace</div>}
              </>
            : <span style={{fontSize:13,color:C.sub}}>↑ Upload File</span>}

        </div>

      </label>

    </div>

  );

}

// ── CatalogSlot ────────────────────────────────────────────────────────────

function CatalogSlot({initial, onReady}) {

  const [fileName, setFileName] = useState(initial?.name||null);
  const [previewUrl, setPreviewUrl] = useState(null);

  useEffect(()=>{
    if(!initial?.key) return;
    let url=null;
    loadFileData(initial.key).then(blob=>{
      if(blob){url=URL.createObjectURL(blob);setPreviewUrl(url);}
    });
    return ()=>{ if(url) URL.revokeObjectURL(url); };
  },[initial?.key]);

  const handleChange = (e) => {

    const f = e.target.files[0];

    if (!f) return;

    setFileName(f.name);

    if(previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(URL.createObjectURL(f));

    onReady(f);

    e.target.value = "";

  };

  return (

    <div style={{marginBottom:16}}>

      <div style={{fontSize:12,fontWeight:600,color:C.sub,letterSpacing:.5,marginBottom:6,textTransform:"uppercase"}}>

        Item Catalog Image <span style={{color:C.sub,fontWeight:400,textTransform:"none",letterSpacing:0,fontSize:12}}>(screenshot from catalog — make sure the SKU code is visible in the image)</span>

      </div>

      <label style={{display:"block",border:`1.5px dashed ${fileName?C.green:C.border}`,borderRadius:10,cursor:"pointer",background:fileName?C.green+"08":C.bg2}}>

        <input type="file" accept="image/*" style={{display:"none"}} onChange={handleChange}/>

        <div style={{padding:"16px 20px",textAlign:"center"}}>

          {previewUrl
            ? <><img src={previewUrl} alt="preview" style={{maxHeight:120,maxWidth:"100%",borderRadius:8,marginBottom:6,objectFit:"contain"}}/><div style={{fontSize:11,color:C.green,fontWeight:600}}>{fileName}</div><div style={{fontSize:10,color:C.sub,marginTop:2}}>Tap to replace</div></>
            : fileName
              ? <><div style={{fontSize:22,marginBottom:6}}>✅</div><div style={{fontSize:13,color:C.green,fontWeight:600}}>{fileName}</div><div style={{fontSize:11,color:C.sub,marginTop:4}}>Tap to replace</div></>
              : <div style={{position:"relative",display:"inline-block",width:"100%"}}>
                  {/* Example catalog screenshot watermark */}
                  <svg viewBox="0 0 200 240" width="130" height="156" style={{opacity:0.18,display:"block",margin:"0 auto 8px"}} xmlns="http://www.w3.org/2000/svg">
                    {/* Green border frame */}
                    <rect x="0" y="0" width="200" height="240" rx="6" fill="#22c55e"/>
                    {/* White photo area */}
                    <rect x="8" y="8" width="184" height="185" rx="4" fill="#f5f5f5"/>
                    {/* Simple garment silhouette — bodysuit shape */}
                    <g fill="#888">
                      {/* shoulders/straps */}
                      <rect x="80" y="30" width="8" height="40" rx="4"/>
                      <rect x="112" y="30" width="8" height="40" rx="4"/>
                      {/* neck */}
                      <ellipse cx="100" cy="28" rx="12" ry="8" fill="#bbb"/>
                      {/* torso */}
                      <path d="M72 68 Q100 60 128 68 L132 140 Q100 148 68 140 Z" fill="#999"/>
                      {/* skirt/shorts */}
                      <path d="M68 138 Q100 148 132 138 L136 175 Q100 182 64 175 Z" fill="#888"/>
                    </g>
                    {/* Green SKU banner */}
                    <rect x="0" y="193" width="200" height="47" rx="0" fill="#22c55e"/>
                    <rect x="0" y="193" width="200" height="4" fill="#16a34a"/>
                    {/* SKU text */}
                    <text x="100" y="222" textAnchor="middle" fill="white" fontSize="18" fontWeight="bold" fontFamily="monospace">LAC2018-4</text>
                  </svg>
                  <div style={{fontSize:13,color:C.sub,fontWeight:500}}>Tap to upload catalog screenshot</div>
                  <div style={{fontSize:11,color:C.gray,marginTop:3}}>Include the SKU code in the screenshot</div>
                </div>}

        </div>

      </label>

    </div>

  );

}

// ── MultiBrandingSlot ───────────────────────────────────────────────────────
// Handles multiple file uploads + a note field for one branding file type.

function MultiBrandingSlot({label, hint, files=[], onChange, showShareToggle, isShared, onToggleShare, lockedByShared, noteValue, onNoteChange}) {

  const [previews, setPreviews] = useState({});

  const depsKey = files.map(f=>f.key||`_${f.name}`).join(",");

  useEffect(()=>{
    let mounted=true;
    const urls={};
    (async()=>{
      const next={};
      for(let fi=0;fi<files.length;fi++){
        const f=files[fi];
        const name=f.name||"";
        if(name.toLowerCase().endsWith(".pdf")) continue;
        let blob=null;
        if(f._file){blob=f._file;}
        else if(f.key){blob=await loadFileData(f.key);}
        if(blob&&mounted){const u=URL.createObjectURL(blob);urls[fi]=u;next[fi]=u;}
      }
      if(mounted) setPreviews(next);
    })();
    return()=>{mounted=false;Object.values(urls).forEach(u=>URL.revokeObjectURL(u));};
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[depsKey]);

  const handleAdd=(e)=>{
    const newFiles=Array.from(e.target.files);
    if(!newFiles.length) return;
    onChange([...files,...newFiles.map(f=>({name:f.name,_file:f}))]);
    e.target.value="";
  };

  return(
    <div style={{marginBottom:14}}>

      {/* Label + share toggle */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:hint?2:6}}>
        <div style={{fontSize:12,fontWeight:600,color:C.sub,letterSpacing:.5,textTransform:"uppercase",display:"flex",alignItems:"center",gap:5}}>
          {label}
          {lockedByShared&&<span style={{background:C.green+"18",color:C.green,fontSize:10,fontWeight:700,borderRadius:99,padding:"1px 8px"}}>Shared</span>}
        </div>
        {showShareToggle&&(
          <button onClick={onToggleShare} style={{display:"flex",alignItems:"center",gap:6,background:"transparent",border:"none",cursor:"pointer",padding:0,fontFamily:font}}>
            <span style={{fontSize:12,color:isShared?C.green:C.sub,fontWeight:500}}>Apply to all items</span>
            <div style={{width:36,height:20,borderRadius:99,background:isShared?C.green:C.bg3,border:`1.5px solid ${isShared?C.green:C.border}`,position:"relative",flexShrink:0}}>
              <div style={{position:"absolute",top:2,left:isShared?16:2,width:14,height:14,borderRadius:99,background:C.white,transition:"left .2s"}}/>
            </div>
          </button>
        )}
      </div>
      {hint&&<div style={{fontSize:11,color:C.gray,marginBottom:6,lineHeight:1.4}}>{hint}</div>}

      {/* Uploaded files list */}
      {files.length>0&&(
        <div style={{display:"flex",flexDirection:"column",gap:4,marginBottom:6}}>
          {files.map((f,fi)=>{
            const isPdf=(f.name||"").toLowerCase().endsWith(".pdf");
            return(
              <div key={fi} style={{background:C.green+"08",border:`1px solid ${C.green}22`,borderRadius:8,padding:"8px 10px"}}>
                {!isPdf&&previews[fi]&&<img src={previews[fi]} alt={f.name} style={{maxHeight:70,maxWidth:"100%",borderRadius:6,display:"block",marginBottom:5,objectFit:"contain"}}/>}
                {isPdf&&<div style={{display:"inline-flex",alignItems:"center",gap:5,background:"#ff3b3018",border:"1px solid #ff3b3030",borderRadius:6,padding:"3px 8px",marginBottom:4}}><span style={{fontSize:14}}>📄</span><span style={{fontSize:11,color:C.red,fontWeight:600,maxWidth:160,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{f.name}</span></div>}
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                  <span style={{fontSize:12,color:C.green,fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:"85%"}}>✓ {f.name}</span>
                  {!lockedByShared&&<button onClick={()=>onChange(files.filter((_,j)=>j!==fi))} style={{background:"transparent",border:"none",cursor:"pointer",color:C.red,fontSize:18,lineHeight:1,padding:"0 2px",fontFamily:font}}>×</button>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add file button */}
      {!lockedByShared&&(
        <label style={{display:"inline-flex",alignItems:"center",gap:6,background:C.bg2,border:`1.5px dashed ${C.border}`,borderRadius:8,padding:"7px 14px",cursor:"pointer",fontSize:13,color:C.sub,fontFamily:font,marginBottom:6}}>
          <input type="file" style={{display:"none"}} onChange={handleAdd} multiple/>
          ↑ {files.length>0?"Add Another File":"Upload File"}
        </label>
      )}

      {/* Note field (for all brand file types) */}
      <textarea
        value={noteValue||""}
        onChange={e=>onNoteChange(e.target.value)}
        placeholder={`${label} notes… (optional)`}
        rows={2}
        style={{width:"100%",boxSizing:"border-box",background:C.bg2,border:`1px solid ${C.border}`,color:C.text,borderRadius:10,padding:"9px 12px",fontFamily:font,fontSize:13,resize:"vertical",outline:"none",marginTop:4,marginBottom:2,display:"block"}}
      />

    </div>
  );
}

// ── ItemCard ───────────────────────────────────────────────────────────────

function ItemCard({it,idx,isAdmin,onDownload}) {

  const [previews,setPreviews]=useState({});

  useEffect(()=>{
    let mounted=true;
    const urls={};
    const load=async()=>{
      const next={};
      if(it.catalogImage?.key){
        const blob=await loadFileData(it.catalogImage.key);
        if(blob&&mounted){const u=URL.createObjectURL(blob);urls["__catalog__"]=u;next["__catalog__"]=u;}
      }
      if(it.brandingFiles){
        for(const [k,v] of Object.entries(it.brandingFiles)){
          const files=Array.isArray(v)?v:(v?[v]:[]);
          for(let fi=0;fi<files.length;fi++){
            const f=files[fi];
            if(!f?.key) continue;
            const name=f.name||"";
            if(name.toLowerCase().endsWith(".pdf")) continue;
            const blob=await loadFileData(f.key);
            if(blob&&mounted){const u=URL.createObjectURL(blob);const pk=`${k}_${fi}`;urls[pk]=u;next[pk]=u;}
          }
        }
      }
      if(mounted) setPreviews(next);
    };
    load();
    return ()=>{mounted=false;Object.values(urls).forEach(u=>URL.revokeObjectURL(u));};
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[it.catalogImage?.key, JSON.stringify(Object.entries(it.brandingFiles||{}).map(([k,v])=>[k,Array.isArray(v)?v.map(f=>f.key):v?.key]))]);

  return (

  <div style={{border:`1px solid ${C.border}`,borderRadius:14,padding:18,marginBottom:12}}>

    <div style={{fontSize:11,fontWeight:700,color:C.sub,letterSpacing:.5,textTransform:"uppercase",marginBottom:6}}>Item {idx+1}</div>

    {it.catalogImage?.name&&(

      <div style={{background:C.green+"10",border:`1px solid ${C.green}30`,borderRadius:8,padding:"10px 12px",marginBottom:10}}>

        {previews["__catalog__"]
          ? <img src={previews["__catalog__"]} alt={it.catalogImage.name} style={{maxHeight:140,maxWidth:"100%",borderRadius:7,display:"block",marginBottom:6,objectFit:"contain"}}/>
          : null}

        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <span style={{fontSize:13,color:C.green,fontWeight:500}}>🖼 {it.catalogImage.name}</span>
          {isAdmin&&it.catalogImage.key&&<button onClick={()=>onDownload(it.catalogImage.key,it.catalogImage.name)} style={{background:C.text,color:C.white,border:"none",borderRadius:6,padding:"3px 10px",fontSize:11,cursor:"pointer",fontFamily:font,fontWeight:600}}>Download</button>}
        </div>

      </div>

    )}

    <div style={{fontWeight:600,fontSize:15,marginBottom:8}}>{it.style} <span style={{color:C.sub,fontWeight:400}}>· {it.colors}</span></div>

    <div style={{display:"flex",flexWrap:"wrap",gap:7,marginBottom:6}}>

      {SIZES.map(sz=>(it.sizes[sz]>0)&&<span key={sz} style={{background:C.bg2,borderRadius:8,padding:"4px 10px",fontSize:12,fontWeight:500}}>{sz}: {it.sizes[sz]}</span>)}

      <span style={{background:C.bg3,borderRadius:8,padding:"4px 10px",fontSize:12,fontWeight:700}}>Total: {SIZES.reduce((s,sz)=>s+(it.sizes[sz]||0),0)}</span>

    </div>

    {it.logos?.length>0&&<div style={{fontSize:12,color:C.sub,marginBottom:it.logoNote?2:8}}>Logos: {it.logos.join(", ")}</div>}
    {it.logoNote&&<div style={{fontSize:12,color:C.sub,marginBottom:8,fontStyle:"italic"}}>Placement: {it.logoNote}</div>}

    {it.brandingFiles&&Object.entries(it.brandingFiles).some(([,v])=>(Array.isArray(v)?v:v?[v]:[]).length>0)&&(

      <div style={{marginTop:8,paddingTop:8,borderTop:`1px solid ${C.border}`}}>

        <div style={{fontSize:11,color:C.sub,fontWeight:600,letterSpacing:.4,marginBottom:8,textTransform:"uppercase"}}>Branding Files</div>

        <div style={{display:"flex",flexDirection:"column",gap:6}}>

          {Object.entries(it.brandingFiles).map(([k,v])=>{
            const files=Array.isArray(v)?v:(v?[v]:[]);
            if(!files.length) return null;
            return(
              <div key={k} style={{background:C.green+"08",border:`1px solid ${C.green}22`,borderRadius:8,padding:"8px 12px"}}>
                <div style={{fontSize:11,color:C.sub,fontWeight:700,textTransform:"uppercase",letterSpacing:.3,marginBottom:6}}>{k}</div>
                {files.map((f,fi)=>{
                  const isPdf=(f.name||"").toLowerCase().endsWith(".pdf");
                  const pk=`${k}_${fi}`;
                  return(
                    <div key={fi} style={{marginBottom:fi<files.length-1?6:0}}>
                      {isPdf
                        ?<div style={{display:"inline-flex",alignItems:"center",gap:6,background:"#ff3b3018",border:"1px solid #ff3b3030",borderRadius:7,padding:"4px 10px",marginBottom:4}}>
                            <span style={{fontSize:14}}>📄</span>
                            <span style={{fontSize:11,color:C.red,fontWeight:600}}>{f.name}</span>
                          </div>
                        :previews[pk]
                          ?<img src={previews[pk]} alt={f.name} style={{maxHeight:80,maxWidth:"100%",borderRadius:7,display:"block",marginBottom:4,objectFit:"contain"}}/>
                          :null}
                      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                        <span style={{fontSize:12,color:C.green,fontWeight:600}}>✓ {f.name}</span>
                        {isAdmin&&f.key&&<button onClick={()=>onDownload(f.key,f.name)} style={{background:C.text,color:C.white,border:"none",borderRadius:6,padding:"3px 10px",fontSize:11,cursor:"pointer",fontFamily:font,fontWeight:600}}>Download</button>}
                      </div>
                    </div>
                  );
                })}
                {it.brandingFileNotes?.[k]&&<div style={{fontSize:12,color:C.sub,marginTop:5,fontStyle:"italic"}}>{it.brandingFileNotes[k]}</div>}
              </div>
            );
          })}

        </div>

      </div>

    )}

    {it.itemNotes&&<div style={{fontSize:13,color:C.sub,marginTop:8,fontStyle:"italic"}}>{it.itemNotes}</div>}

  </div>

  );

}

// ── ProfileCard ────────────────────────────────────────────────────────────

function Avatar({logo,name,size=44}){
  const initials=(name||"?").split(" ").map(w=>w[0]).join("").slice(0,2).toUpperCase();
  return(
    <div style={{width:size,height:size,borderRadius:size/2,overflow:"hidden",background:C.bg3,border:`1px solid ${C.border}`,flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",fontSize:size*0.36,fontWeight:700,color:C.sub}}>
      {logo?<img src={logo} alt="logo" style={{width:"100%",height:"100%",objectFit:"cover"}}/>:initials}
    </div>
  );
}

function ProfileCard({profile,name,onSave}) {

  const [editing,setEditing]=useState(false);

  const [draft,setDraft]=useState(profile);

  const fileRef=useRef(null);

  useEffect(()=>setDraft(profile),[profile]);

  const f=(k,v)=>setDraft(p=>({...p,[k]:v}));

  const handleLogoChange=e=>{
    const file=e.target.files[0];
    if(!file)return;
    const reader=new FileReader();
    reader.onload=ev=>f("logo",ev.target.result);
    reader.readAsDataURL(file);
  };

  if(!editing) return(

    <div style={{background:C.bg,border:`1px solid ${C.border}`,borderRadius:16,padding:24,marginBottom:28}}>

      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>

        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <Avatar logo={profile.logo} name={name} size={44}/>
          <span style={{fontSize:15,fontWeight:700}}>My Info</span>
        </div>

        <button onClick={()=>setEditing(true)} style={{background:"transparent",color:C.sub,border:`1px solid ${C.border}`,borderRadius:8,padding:"5px 14px",fontSize:13,cursor:"pointer",fontFamily:font}}>Edit</button>

      </div>

      <div className="two-col" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>

        {[["Email",profile.email||"—"],["Phone",profile.phone||"—"],["Business Address",profile.address||"—","1/-1"],["Info / Note",profile.infoNote||"—","1/-1"]].map(([l,v,col])=>(

          <div key={l} style={{background:C.bg2,borderRadius:10,padding:"10px 14px",gridColumn:col||"auto"}}>

            <div style={{fontSize:11,color:C.sub,fontWeight:600,letterSpacing:.4,textTransform:"uppercase",marginBottom:3}}>{l}</div>

            <div style={{fontSize:14,color:v==="—"?C.gray:C.text}}>{v}</div>

          </div>

        ))}

      </div>

    </div>

  );

  return(

    <div style={{background:C.bg,border:`1.5px solid ${C.text}`,borderRadius:16,padding:24,marginBottom:28}}>

      <div style={{fontSize:15,fontWeight:700,marginBottom:16}}>Edit My Info</div>

      <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:20}}>
        <div style={{position:"relative",cursor:"pointer"}} onClick={()=>fileRef.current?.click()}>
          <Avatar logo={draft.logo} name={name} size={64}/>
          <div style={{position:"absolute",bottom:0,right:0,width:22,height:22,borderRadius:11,background:C.text,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12}}>
            <span style={{color:C.white,lineHeight:1}}>+</span>
          </div>
        </div>
        <div>
          <div style={{fontSize:13,fontWeight:600,color:C.text}}>Profile / Company Logo</div>
          <div style={{fontSize:12,color:C.sub,marginTop:2}}>Click the image to upload</div>
          {draft.logo&&<button onClick={()=>f("logo","")} style={{marginTop:4,background:"transparent",border:"none",color:C.red,fontSize:12,cursor:"pointer",padding:0,fontFamily:font}}>Remove</button>}
        </div>
        <input ref={fileRef} type="file" accept="image/*" onChange={handleLogoChange} style={{display:"none"}}/>
      </div>

      <div className="two-col" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:12}}>

        <div><div style={{fontSize:12,fontWeight:600,color:C.sub,letterSpacing:.5,marginBottom:6,textTransform:"uppercase"}}>Email</div><Inp value={draft.email||""} onChange={v=>f("email",v)} placeholder="email@company.com" type="email"/></div>

        <div><div style={{fontSize:12,fontWeight:600,color:C.sub,letterSpacing:.5,marginBottom:6,textTransform:"uppercase"}}>Phone</div><Inp value={draft.phone||""} onChange={v=>f("phone",v)} placeholder="+1 (555) 000-0000" type="tel"/></div>

        <div style={{gridColumn:"1/-1"}}><div style={{fontSize:12,fontWeight:600,color:C.sub,letterSpacing:.5,marginBottom:6,textTransform:"uppercase"}}>Business Address</div><Inp value={draft.address||""} onChange={v=>f("address",v)} placeholder="123 Main St, City, Country"/></div>

        <div style={{gridColumn:"1/-1"}}>

          <div style={{fontSize:12,fontWeight:600,color:C.sub,letterSpacing:.5,marginBottom:6,textTransform:"uppercase"}}>Info / Note</div>

          <textarea value={draft.infoNote||""} onChange={e=>f("infoNote",e.target.value)} placeholder="Any general info…" style={{border:`1px solid ${C.border}`,borderRadius:10,padding:"10px 14px",fontFamily:font,fontSize:14,width:"100%",boxSizing:"border-box",resize:"vertical",minHeight:70,outline:"none",color:C.text,background:C.bg}}/>

        </div>

      </div>

      <div style={{display:"flex",gap:10}}>

        <GhostBtn onClick={()=>setEditing(false)} style={{color:C.sub,padding:"9px 18px"}}>Cancel</GhostBtn>

        <PrimaryBtn onClick={()=>{onSave(draft);setEditing(false);}} style={{padding:"9px 22px"}}>Save</PrimaryBtn>

      </div>

    </div>

  );

}

// ── Order Form ─────────────────────────────────────────────────────────────

function OrderForm({initial, onSave, onCancel, editMode, orderId}) {

  const initItems = (initial?.items||[emptyItem()]).map(it=>({...emptyItem(),...it,brandingFiles:normBF(it.brandingFiles)}));

  const [items, setItems] = useState(initItems);

  const [notes, setNotes] = useState(initial?.notes||"");

  const [showErr, setShowErr] = useState(false);

  const [saving, setSaving] = useState(false);

  const [sharedToggles, setSharedToggles] = useState(Object.fromEntries(BRAND_FILES.map(k=>[k,initial?.sharedBrandingFiles?.[k]||false])));

  const sharedTogglesRef = useRef(sharedToggles);
  useEffect(()=>{ sharedTogglesRef.current=sharedToggles; },[sharedToggles]);

  const [sharedNotesOn, setSharedNotesOn] = useState(false);

  const [sharedNotes, setSharedNotes] = useState("");

  const pendingFiles = useRef({});

  const errs = formErrors({items,notes});

  const prog = formProgress({items,notes});

  const setItemField = useCallback((i,k,v) => setItems(p=>p.map((it,j)=>j===i?{...it,[k]:v}:it)),[]);

  const setSizeVal   = useCallback((i,sz,v) => setItems(p=>p.map((it,j)=>j===i?{...it,sizes:{...it.sizes,[sz]:Math.max(0,parseInt(v)||0)}}:it)),[]);

  const toggleLogo   = useCallback((i,l)    => setItems(p=>p.map((it,j)=>{if(j!==i)return it;const logos=it.logos.includes(l)?it.logos.filter(x=>x!==l):[...it.logos,l];return{...it,logos};})),[]);

  const addItem      = useCallback(()=>{
    setItems(p=>{
      const newItem=emptyItem();
      const src=p[0];
      BRAND_FILES.forEach(fname=>{
        if(sharedTogglesRef.current[fname]&&src?.brandingFiles?.[fname]?.length){
          newItem.brandingFiles[fname]=[...src.brandingFiles[fname]];
        }
      });
      return [...p,newItem];
    });
  },[]);

  const removeItem   = useCallback(i=>{

    const next={};

    Object.entries(pendingFiles.current).forEach(([k,v])=>{const ki=parseInt(k);if(ki<i)next[ki]=v;else if(ki>i)next[ki-1]=v;});

    pendingFiles.current=next;

    setItems(p=>p.filter((_,j)=>j!==i));

  },[]);

  const queueFile = (itemIdx, fieldName, file) => {

    if(!pendingFiles.current[itemIdx]) pendingFiles.current[itemIdx]={};

    pendingFiles.current[itemIdx][fieldName] = file;

  };

  const handleSave = async () => {

    setSaving(true);

    const oid = orderId || Date.now();

    const finalItems = await Promise.all(items.map(async (it, i) => {

      const pending = pendingFiles.current[i] || {};

      let catalogImage = it.catalogImage || null;

      if(pending["__catalog__"]) {

        const key = fileKey(oid, i, "catalog");

        if(isCloud){await supabase.storage.from("crm-files").upload(key,pending["__catalog__"],{upsert:true});}

        else{await fileDb.set(key, pending["__catalog__"]);}

        catalogImage = { name: pending["__catalog__"].name, key };

      }

      const brandingFiles = {};

      for(const fname of BRAND_FILES) {
        const fileList = it.brandingFiles?.[fname] || [];
        const saved = [];
        let pendingIdx = 0;
        for(const f of fileList) {
          if(f._file) {
            const key = `${fileKey(oid, i, fname)}_${Date.now()}_${pendingIdx++}`;
            if(isCloud){await supabase.storage.from("crm-files").upload(key,f._file,{upsert:true});}
            else{await fileDb.set(key, f._file);}
            saved.push({name:f.name, key});
          } else if(f.key) {
            saved.push({name:f.name, key:f.key});
          }
        }
        brandingFiles[fname] = saved;
      }

      return {...it, catalogImage, brandingFiles};

    }));

    setSaving(false);

    // Propagate item 0 files to all items for shared fields
    const item0BF = finalItems[0]?.brandingFiles||{};
    const propagated = finalItems.map((it,i)=>{
      if(i===0) return it;
      const bf={...it.brandingFiles};
      BRAND_FILES.forEach(fname=>{ if(sharedToggles[fname]&&item0BF[fname]?.length) bf[fname]=item0BF[fname]; });
      return {...it,brandingFiles:bf};
    });

    onSave({ notes, items: propagated, sharedBrandingFiles: sharedToggles, _tempOid: oid });

  };

  return(

    <div style={{fontFamily:font,color:C.text}}>

      <div style={{marginBottom:20,background:C.bg2,borderRadius:12,padding:"14px 18px"}}>

        <div style={{display:"flex",justifyContent:"space-between",fontSize:13,marginBottom:8}}>

          <span style={{color:C.sub,fontWeight:500}}>Form completion</span>

          <span style={{color:prog===100?C.green:C.text,fontWeight:700}}>{prog}%</span>

        </div>

        <div style={{background:C.border,borderRadius:99,height:4}}>

          <div style={{background:prog===100?C.green:C.text,borderRadius:99,height:4,width:`${prog}%`,transition:"width .4s"}}/>

        </div>

      </div>

      <Section n="1" title="Garment Items" grey={true} sub={

        <button onClick={addItem} style={{background:C.text,color:C.white,border:"none",borderRadius:8,padding:"6px 14px",fontSize:13,fontWeight:600,cursor:"pointer",fontFamily:font}}>+ Add Item</button>

      }>

        {items.map((it,i)=>(

          <div key={i} style={{border:`1px solid ${C.border}`,borderRadius:14,padding:20,marginBottom:14,background:C.bg}}>

            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>

              <span style={{background:C.bg2,color:C.sub,borderRadius:8,padding:"3px 12px",fontSize:12,fontWeight:700,letterSpacing:.5}}>ITEM {i+1}</span>

              {items.length>1&&<button onClick={()=>removeItem(i)} style={{background:"transparent",color:C.red,border:"none",fontSize:13,cursor:"pointer",fontFamily:font}}>Remove</button>}

            </div>

            <CatalogSlot initial={it.catalogImage} onReady={f=>queueFile(i,"__catalog__",f)}/>

            <div className="two-col" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:16}}>

              <div>

                <div style={{fontSize:12,fontWeight:600,color:C.sub,letterSpacing:.5,marginBottom:2,textTransform:"uppercase"}}>Model / SKU <span style={{color:C.red}}>*</span></div>
                <div style={{fontSize:11,color:C.gray,marginBottom:6}}>The item code from the catalog — usually found under the product photo (e.g. LAC2002-1)</div>

                <Inp value={it.style} onChange={v=>setItemField(i,"style",v)} placeholder="e.g. LAC2002-1"/>

              </div>

              <div>

                <div style={{fontSize:12,fontWeight:600,color:C.sub,letterSpacing:.5,marginBottom:2,textTransform:"uppercase"}}>Color(s) <span style={{color:C.red}}>*</span></div>
                <div style={{fontSize:11,color:C.gray,marginBottom:6}}>What color are you ordering?</div>

                <Inp value={it.colors} onChange={v=>setItemField(i,"colors",v)} placeholder="e.g. Navy Blue, White"/>

              </div>

            </div>

            <div style={{fontSize:12,fontWeight:600,color:C.sub,letterSpacing:.5,marginBottom:2,textTransform:"uppercase"}}>Quantity Per Size</div>
            <div style={{fontSize:11,color:C.gray,marginBottom:8}}>How many pieces do you want in each size? Leave a size at 0 if you don't need it</div>

            <div className="size-grid-scroll"><div style={{display:"grid",gridTemplateColumns:"repeat(8,minmax(44px,1fr))",gap:8,minWidth:340}}>

              {SIZES.map(sz=>(

                <div key={sz} style={{textAlign:"center"}}>

                  <div style={{fontSize:11,color:C.sub,marginBottom:4,fontWeight:500}}>{sz}</div>

                  <input type="number" min="0" value={it.sizes[sz]} onChange={e=>setSizeVal(i,sz,e.target.value)}

                    style={{width:"100%",border:`1px solid ${C.border}`,borderRadius:8,padding:"7px 2px",textAlign:"center",fontFamily:font,fontSize:13,color:C.text,background:C.bg,boxSizing:"border-box",outline:"none"}}/>

                </div>

              ))}

              <div style={{textAlign:"center"}}>

                <div style={{fontSize:11,color:C.gray,marginBottom:4,fontWeight:600}}>Total</div>

                <div style={{border:`1px solid ${C.border}`,background:C.bg2,borderRadius:8,padding:"7px 2px",textAlign:"center",fontWeight:700,fontSize:13}}>

                  {SIZES.reduce((s,sz)=>s+(parseInt(it.sizes[sz])||0),0)}

                </div>

              </div>

            </div></div>

            <div style={{fontSize:12,fontWeight:600,color:C.sub,letterSpacing:.5,marginBottom:2,textTransform:"uppercase"}}>Logo Placement <span style={{color:C.sub,fontWeight:400,textTransform:"none",letterSpacing:0}}>— select all that apply</span></div>
            <div style={{fontSize:11,color:C.gray,marginBottom:8}}>Tap all the spots where you'd like your logo or brand to appear on the garment</div>

            <div style={{display:"flex",flexWrap:"wrap",gap:7,marginBottom:20}}>

              {LOGO_PLACEMENTS.map(l=>(

                <button key={l} onClick={()=>toggleLogo(i,l)}

                  style={{background:it.logos.includes(l)?C.text:C.bg,color:it.logos.includes(l)?C.white:C.sub,border:`1px solid ${it.logos.includes(l)?C.text:C.border}`,borderRadius:20,padding:"5px 13px",fontSize:12,cursor:"pointer",fontFamily:font,fontWeight:it.logos.includes(l)?600:400}}>

                  {l}

                </button>

              ))}

            </div>

            <div style={{fontSize:11,color:C.gray,marginBottom:4}}>Any extra details about the placement — size, exact position, color, etc. Don't worry if you're unsure, we'll confirm with you (optional)</div>
            <textarea value={it.logoNote||""} onChange={e=>setItemField(i,"logoNote",e.target.value)} placeholder="e.g. logo 3″ wide, centered on chest, 2″ below collar…" rows={2} style={{width:"100%",boxSizing:"border-box",background:C.bg2,border:`1px solid ${C.border}`,color:C.text,borderRadius:10,padding:"9px 12px",fontFamily:font,fontSize:13,resize:"vertical",outline:"none",marginBottom:20}}/>

            <div style={{borderTop:`1px solid ${C.border}`,paddingTop:16}}>

              <div style={{marginBottom:14}}>
                <div style={{fontSize:15,fontWeight:700,color:C.text,marginBottom:3}}>Branding &amp; Label Files</div>
                <div style={{fontSize:11,color:C.gray}}>Upload the design files for your custom branding. Don't worry if you don't have everything — just upload what you have and leave a note if needed. You can add multiple files to each slot.</div>
              </div>

              {BRAND_FILES.map(fname=>{

                const isShared = sharedToggles[fname];
                const lockedByShared = i>0&&isShared;
                const displayFiles = lockedByShared ? (items[0]?.brandingFiles?.[fname]||[]) : (it.brandingFiles?.[fname]||[]);

                return(
                  <MultiBrandingSlot
                    key={`${i}-${fname}`}
                    label={fname}
                    hint={BRAND_FILE_HINTS[fname]}
                    files={displayFiles}
                    onChange={fileArr=>{
                      setItems(prev=>prev.map((it2,j)=>{
                        if(j===i) return {...it2,brandingFiles:{...it2.brandingFiles,[fname]:fileArr}};
                        if(i===0&&isShared) return {...it2,brandingFiles:{...it2.brandingFiles,[fname]:fileArr}};
                        return it2;
                      }));
                    }}
                    showShareToggle={i===0}
                    isShared={isShared}
                    onToggleShare={()=>setSharedToggles(p=>({...p,[fname]:!p[fname]}))}
                    lockedByShared={lockedByShared}
                    noteValue={it.brandingFileNotes?.[fname]||""}
                    onNoteChange={v=>setItemField(i,"brandingFileNotes",{...it.brandingFileNotes,[fname]:v})}
                  />
                );

              })}

              <div style={{marginTop:6}}>

                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6}}>

                  <div style={{fontSize:12,fontWeight:600,color:C.sub,letterSpacing:.5,textTransform:"uppercase"}}>Item Notes <span style={{fontWeight:400,textTransform:"none",letterSpacing:0,fontSize:12}}>(optional)</span></div>

                  {i===0&&items.length>1&&(

                    <button onClick={()=>setSharedNotesOn(p=>!p)} style={{display:"flex",alignItems:"center",gap:6,background:"transparent",border:"none",cursor:"pointer",padding:0,fontFamily:font}}>

                      <span style={{fontSize:12,color:sharedNotesOn?C.green:C.sub,fontWeight:500}}>Apply to all items</span>

                      <div style={{width:36,height:20,borderRadius:99,background:sharedNotesOn?C.green:C.bg3,border:`1.5px solid ${sharedNotesOn?C.green:C.border}`,position:"relative",flexShrink:0}}>

                        <div style={{position:"absolute",top:2,left:sharedNotesOn?16:2,width:14,height:14,borderRadius:99,background:C.white,transition:"left .2s"}}/>

                      </div>

                    </button>

                  )}

                </div>

                <textarea

                  value={i>0&&sharedNotesOn?sharedNotes:it.itemNotes}

                  disabled={i>0&&sharedNotesOn}

                  onChange={e=>{ if(i===0&&sharedNotesOn) setSharedNotes(e.target.value); else setItemField(i,"itemNotes",e.target.value); }}

                  placeholder="Any special instructions…"

                  style={{border:`1px solid ${C.border}`,borderRadius:10,padding:"10px 14px",fontFamily:font,fontSize:14,width:"100%",boxSizing:"border-box",resize:"vertical",minHeight:70,outline:"none",color:C.text,background:C.bg}}/>

              </div>

            </div>

          </div>

        ))}

      </Section>

      <Section n="2" title="Additional Notes" sub={<span style={{fontSize:14,color:C.sub}}>(optional)</span>}>

        <textarea value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Anything else we should know…"

          style={{border:`1px solid ${C.border}`,borderRadius:10,padding:"12px 14px",fontFamily:font,fontSize:14,width:"100%",boxSizing:"border-box",resize:"vertical",minHeight:90,outline:"none",color:C.text,background:C.bg}}/>

      </Section>

      <div style={{display:"flex",gap:10,alignItems:"center",paddingTop:8}}>

        <GhostBtn onClick={onCancel} style={{color:C.sub}}>Cancel</GhostBtn>

        <button onClick={()=>setShowErr(true)} style={{background:errs.length>0?C.amber+"15":"#34c75915",color:errs.length>0?C.amber:C.green,border:"none",borderRadius:10,padding:"11px 16px",cursor:"pointer",fontFamily:font,fontSize:13,fontWeight:600}}>

          {errs.length>0?`${errs.length} field${errs.length>1?"s":""} missing`:"All required fields filled"}

        </button>

        <PrimaryBtn disabled={errs.length>0||saving} onClick={handleSave} style={{flex:1}}>

          {saving?"Saving…":editMode?"Save Changes":"Submit Order"}

        </PrimaryBtn>

      </div>

      {showErr&&errs.length>0&&(

        <Modal onClose={()=>setShowErr(false)}>

          <div style={{fontSize:17,fontWeight:700,marginBottom:6}}>Missing required fields</div>

          <ul style={{color:C.red,paddingLeft:20,margin:"12px 0",fontSize:14}}>{errs.map((e,i)=><li key={i} style={{marginBottom:5}}>{e}</li>)}</ul>

          <PrimaryBtn onClick={()=>setShowErr(false)} style={{width:"100%"}}>Got it</PrimaryBtn>

        </Modal>

      )}

    </div>

  );

}

// ── Customer Card (admin) ───────────────────────────────────────────────────

function CustomerCard({username,u,prof,meta,userOrders,onToggleStar,onSaveNote,onDelete,onResetPassword}){
  const [noteVal,setNoteVal]=useState(meta.adminNote||"");
  const [showReset,setShowReset]=useState(false);
  const [newPw,setNewPw]=useState("");
  return(
    <div style={{background:C.bg,border:`1px solid ${meta.starred?C.amber:C.border}`,borderRadius:16,padding:20,boxShadow:meta.starred?"0 0 0 1px "+C.amber+"40":"none"}}>
      {showReset&&(
        <div style={{position:"fixed",inset:0,background:"#0008",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:24}} onClick={()=>{setShowReset(false);setNewPw("");}}>
          <div style={{background:C.bg,borderRadius:18,padding:28,width:"100%",maxWidth:340,boxShadow:"0 8px 40px #0004"}} onClick={e=>e.stopPropagation()}>
            <div style={{fontSize:17,fontWeight:700,color:C.text,marginBottom:6}}>Reset Password</div>
            <div style={{fontSize:13,color:C.sub,marginBottom:16}}>Set a new password for <strong>{u.name}</strong></div>
            <input value={newPw} onChange={e=>setNewPw(e.target.value)} placeholder="New password" style={{width:"100%",boxSizing:"border-box",background:C.bg2,border:`1px solid ${C.border}`,color:C.text,borderRadius:10,padding:"10px 14px",fontFamily:font,fontSize:14,outline:"none",marginBottom:14}}/>
            <div style={{display:"flex",gap:10}}>
              <button onClick={()=>{setShowReset(false);setNewPw("");}} style={{flex:1,background:"transparent",border:`1px solid ${C.border}`,borderRadius:10,padding:"10px",fontFamily:font,fontSize:14,cursor:"pointer",color:C.sub}}>Cancel</button>
              <button onClick={()=>{if(newPw.length>=4){onResetPassword(username,newPw);setShowReset(false);setNewPw("");}}} style={{flex:1,background:C.text,color:C.white,border:"none",borderRadius:10,padding:"10px",fontFamily:font,fontSize:14,fontWeight:600,cursor:"pointer"}}>Reset</button>
            </div>
          </div>
        </div>
      )}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:12}}>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <Avatar logo={prof.logo} name={u.name} size={40}/>
          <div>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:2}}>
              <span style={{fontSize:17,fontWeight:700,color:C.text}}>{u.name}</span>
              {meta.starred&&<span style={{fontSize:13}}>⭐</span>}
            </div>
            <div style={{fontSize:13,color:C.sub}}>@{username}</div>
          </div>
        </div>
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          <button onClick={()=>onToggleStar(username)} style={{background:meta.starred?C.amber+"20":"transparent",border:`1px solid ${meta.starred?C.amber:C.border}`,borderRadius:8,padding:"6px 12px",cursor:"pointer",fontSize:14,fontFamily:font,color:meta.starred?C.amber:C.sub}}>{meta.starred?"★ Starred":"☆ Star"}</button>
          <button onClick={()=>setShowReset(true)} style={{background:"transparent",color:C.sub,border:`1px solid ${C.border}`,borderRadius:8,padding:"6px 12px",fontSize:13,cursor:"pointer",fontFamily:font}}>🔑 Reset PW</button>
          <button onClick={()=>onDelete(username)} style={{background:"transparent",color:C.red,border:`1px solid ${C.red}30`,borderRadius:8,padding:"6px 12px",fontSize:13,cursor:"pointer",fontFamily:font}}>Delete</button>
        </div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))",gap:8,marginBottom:14}}>
        {[["Email",prof.email],["Phone",prof.phone],["Orders",userOrders.length],["Units",userOrders.reduce((s,o)=>s+totalUnits(o.items),0)]].map(([l,v])=>(
          <div key={l} style={{background:C.bg2,borderRadius:10,padding:"8px 12px"}}>
            <div style={{fontSize:10,color:C.sub,fontWeight:600,textTransform:"uppercase",letterSpacing:.3,marginBottom:2}}>{l}</div>
            <div style={{fontSize:13,fontWeight:500}}>{v||"—"}</div>
          </div>
        ))}
      </div>
      {prof.address&&<div style={{fontSize:13,color:C.sub,marginBottom:10}}>📍 {prof.address}</div>}
      <div>
        <div style={{fontSize:11,color:C.sub,fontWeight:600,textTransform:"uppercase",letterSpacing:.3,marginBottom:6}}>Admin Note</div>
        <div style={{display:"flex",gap:8}}>
          <input value={noteVal} onChange={e=>setNoteVal(e.target.value)} placeholder="Add a private note about this customer…" style={{background:C.bg2,border:`1px solid ${C.border}`,color:C.text,borderRadius:8,padding:"8px 12px",fontFamily:font,fontSize:13,flex:1,outline:"none"}}/>
          <button onClick={()=>onSaveNote(username,noteVal)} style={{background:C.text,color:C.white,border:"none",borderRadius:8,padding:"8px 14px",cursor:"pointer",fontFamily:font,fontSize:13,fontWeight:600,whiteSpace:"nowrap"}}>Save</button>
        </div>
      </div>
    </div>
  );
}

// ── Main App ───────────────────────────────────────────────────────────────

export default function App() {

  const [portal,setPortal]=useState("home");

  const [currentUser,setCurrentUser]=useState(null);

  const [users,setUsers]=useState({});

  const [orders,setOrders]=useState([]);

  const [profiles,setProfiles]=useState({});

  const [adminMeta,setAdminMeta]=useState({});

  const [adminSection,setAdminSection]=useState("orders");

  const [customerSearch,setCustomerSearch]=useState("");

  const [deleteUserTarget,setDeleteUserTarget]=useState(null);

  const [loaded,setLoaded]=useState(false);

  const [toasts,setToasts]=useState([]);

  const [deleteTarget,setDeleteTarget]=useState(null);

  const [zipLoading,setZipLoading]=useState(false);

  const [view,setView]=useState("list");

  const [selected,setSelected]=useState(null);

  const [search,setSearch]=useState("");

  const [statusFilter,setStatusFilter]=useState("All");

  const [sortBy,setSortBy]=useState("Newest");

  const [showArchived,setShowArchived]=useState(false);

  const [authMode,setAuthMode]=useState("login");

  const [authName,setAuthName]=useState("");

  const [authUser,setAuthUser]=useState("");

  const [authPass,setAuthPass]=useState("");

  const [adminPass,setAdminPass]=useState("");

  const [authErr,setAuthErr]=useState("");

  const [showChangePw,setShowChangePw]=useState(false);
  const [cpOld,setCpOld]=useState("");
  const [cpNew,setCpNew]=useState("");
  const [cpConfirm,setCpConfirm]=useState("");
  const [cpErr,setCpErr]=useState("");

  const dragIdx=useRef(null);

  const dragOver=useRef(null);

  const dismissToast=useCallback(id=>{
    setToasts(p=>p.map(t=>t.id===id?{...t,exiting:true}:t));
    setTimeout(()=>setToasts(p=>p.filter(t=>t.id!==id)),300);
  },[]);

  const toast=useCallback((msg,type="success")=>{
    const id=Date.now();
    setToasts(p=>[...p,{id,msg,type,exiting:false}]);
    setTimeout(()=>{
      setToasts(p=>p.map(t=>t.id===id?{...t,exiting:true}:t));
      setTimeout(()=>setToasts(p=>p.filter(t=>t.id!==id)),300);
    },3000);
  },[]);

  useEffect(()=>{

    (async()=>{

      if (isCloud) {

        const { data: ud } = await supabase.from("crm_users").select();

        if (ud) setUsers(Object.fromEntries(ud.map(r=>[r.username,{name:r.name,pass:r.pass}])));

        const { data: pd } = await supabase.from("crm_profiles").select();

        if (pd) {
          const profileMap = Object.fromEntries(pd.map(r=>[r.username,{email:r.email||"",phone:r.phone||"",address:r.address||"",infoNote:r.info_note||"",logo:""}]));
          // merge logos stored locally (base64 strings live in localStorage to avoid DB schema requirement)
          Object.keys(profileMap).forEach(u=>{
            try{const l=localStorage.getItem("crm-logo-"+u);if(l)profileMap[u].logo=l;}catch(_){}
          });
          setProfiles(profileMap);
        }

        const { data: md } = await supabase.from("crm_admin_meta").select();

        if (md) setAdminMeta(Object.fromEntries(md.map(r=>[r.username,{starred:r.starred||false,adminNote:r.admin_note||""}])));

      } else {

        try{const r=storage.get("crm-users");if(r)setUsers(JSON.parse(r.value));}catch(_){}

        try{const r=storage.get("crm-profiles");if(r){const pm=JSON.parse(r.value);Object.keys(pm).forEach(u=>{try{const l=localStorage.getItem("crm-logo-"+u);if(l)pm[u].logo=l;}catch(_){}});setProfiles(pm);}}catch(_){}

      }

      const loadedOrders=await fetchOrders();
      setOrders(loadedOrders);

      try{const s=localStorage.getItem("crm-session");if(s){const{portal:p,currentUser:cu,view:v,selectedId:sid}=JSON.parse(s);if(p&&cu){setPortal(p);setCurrentUser(cu);if(v)setView(v);if(sid&&loadedOrders){const o=loadedOrders.find(x=>x.id===sid);if(o)setSelected(o);}}}}catch(_){}

      setLoaded(true);

    })();

  },[]);

  const saveUsers=async u=>{

    setUsers(u);

    if(isCloud){

      const {error:ue}=await supabase.from("crm_users").upsert(Object.entries(u).map(([username,v])=>({username,name:v.name,pass:v.pass})));
      if(ue)console.error("crm_users upsert error:",ue);

    } else {

      storage.set("crm-users",JSON.stringify(u));

    }

  };

  const saveProfiles=async p=>{

    setProfiles(p);

    // always persist logos in localStorage (base64 strings; keeps DB schema simple)
    Object.entries(p).forEach(([username,v])=>{
      try{
        if(v.logo)localStorage.setItem("crm-logo-"+username,v.logo);
        else localStorage.removeItem("crm-logo-"+username);
      }catch(_){}
    });

    if(isCloud){

      // strip logo from DB payload — column not required in crm_profiles
      await supabase.from("crm_profiles").upsert(Object.entries(p).map(([username,v])=>({username,email:v.email||"",phone:v.phone||"",address:v.address||"",info_note:v.infoNote||""})));

    } else {

      storage.set("crm-profiles",JSON.stringify(p));

    }

  };

  const saveAdminMeta=async m=>{

    setAdminMeta(m);

    if(isCloud){

      await supabase.from("crm_admin_meta").upsert(Object.entries(m).map(([username,v])=>({username,starred:v.starred||false,admin_note:v.adminNote||""})));

    }

  };

  const handleToggleStar=async username=>{

    const cur=adminMeta[username]||{starred:false,adminNote:""};

    await saveAdminMeta({...adminMeta,[username]:{...cur,starred:!cur.starred}});

  };

  const handleSaveAdminNote=async (username,note)=>{

    const cur=adminMeta[username]||{starred:false,adminNote:""};

    await saveAdminMeta({...adminMeta,[username]:{...cur,adminNote:note}});

    toast("Note saved.");

  };

  const handleDeleteUser=async username=>{

    const u={...users}; delete u[username];

    const p={...profiles}; delete p[username];

    await saveUsers(u);

    await saveProfiles(p);

    if(isCloud){

      await supabase.from("crm_users").delete().eq("username",username);

      await supabase.from("crm_profiles").delete().eq("username",username);

      await supabase.from("crm_admin_meta").delete().eq("username",username);

      const userOrderIds=orders.filter(o=>o.owner===username).map(o=>o.id);

      if(userOrderIds.length) await supabase.from("crm_orders").delete().in("id",userOrderIds);

    }

    await saveOrders(orders.filter(o=>o.owner!==username));

    const m={...adminMeta}; delete m[username]; setAdminMeta(m);

    setDeleteUserTarget(null);

    toast("Customer deleted.");

  };

  const saveOrders=async (newOrders)=>{

    const prev=orders;

    setOrders(newOrders);

    await persistOrders(newOrders,prev);

  };

  const handleRegister=()=>{

    setAuthErr("");

    if(!authName.trim()||!authUser.trim()||!authPass.trim()){setAuthErr("All fields are required.");return;}

    if(users[authUser.toLowerCase()]){setAuthErr("Username already taken.");return;}

    const u={...users,[authUser.toLowerCase()]:{name:authName.trim(),pass:authPass}};

    const cu={username:authUser.toLowerCase(),name:authName.trim()};
    saveUsers(u); setCurrentUser(cu);
    localStorage.setItem("crm-session",JSON.stringify({portal:"customer",currentUser:cu}));
    setPortal("customer"); setView("list"); toast(`Welcome, ${authName.trim()}!`);

  };

  const handleLogin=()=>{

    setAuthErr(""); const u=users[authUser.toLowerCase()];

    if(!u||u.pass!==authPass){setAuthErr("Incorrect username or password.");return;}

    const cu={username:authUser.toLowerCase(),name:u.name};
    setCurrentUser(cu);
    localStorage.setItem("crm-session",JSON.stringify({portal:"customer",currentUser:cu}));
    setPortal("customer"); setView("list"); toast(`Welcome back, ${u.name}!`);

  };

  const handleAdminLogin=()=>{

    if(adminPass===ADMIN_PASS){localStorage.setItem("crm-session",JSON.stringify({portal:"admin",currentUser:{username:"admin",name:"Admin"},view:"list",selectedId:null}));setPortal("admin");setView("list");setAdminPass("");toast("Admin access granted.");}

    else setAuthErr("Incorrect admin password.");

  };

  const logout=()=>{localStorage.removeItem("crm-session");setPortal("home");setCurrentUser(null);setView("list");setAuthName("");setAuthUser("");setAuthPass("");setAuthErr("");};

  const handleChangePassword=async()=>{
    setCpErr("");
    const u=users[currentUser.username];
    if(!u){setCpErr("User not found.");return;}
    if(u.pass!==cpOld){setCpErr("Current password is incorrect.");return;}
    if(cpNew.length<4){setCpErr("New password must be at least 4 characters.");return;}
    if(cpNew!==cpConfirm){setCpErr("New passwords do not match.");return;}
    const updated={...users,[currentUser.username]:{...u,pass:cpNew}};
    await saveUsers(updated);
    setCpOld("");setCpNew("");setCpConfirm("");setCpErr("");setShowChangePw(false);
    toast("Password updated successfully!");
  };

  const handleAdminResetPassword=async(username,newPass)=>{
    const u=users[username];
    if(!u) return;
    const updated={...users,[username]:{...u,pass:newPass}};
    await saveUsers(updated);
    toast(`Password reset for ${u.name}.`);
  };

  useEffect(()=>{
    if(portal!=="home"&&currentUser){
      try{
        const s=JSON.parse(localStorage.getItem("crm-session")||"{}");
        localStorage.setItem("crm-session",JSON.stringify({...s,view,selectedId:selected?.id||null}));
      }catch(_){}
    }
  },[view,selected,portal,currentUser]);

  const nextId=()=>(orders.length?Math.max(...orders.map(o=>o.id))+1:1);

  const handleSaveNew=async form=>{

    const id=nextId();

    const items=form.items.map((it,i)=>({...it}));

    const o={...form,items,id,status:"Pending",created:nowDate(),lastEdited:nowDate(),owner:currentUser.username,ownerName:currentUser.name};

    delete o._tempOid;

    await saveOrders([o,...orders]); setView("list"); toast("Order submitted successfully.");

    if(isCloud){
      const customerEmail=profiles[currentUser.username]?.email||"";
      supabase.functions.invoke("send-order-email",{
        body:{order:o,customerEmail,customerName:currentUser.name}
      }).catch(()=>{});
    }

  };

  const handleSaveEdit=async form=>{

    const merged={...selected,...form,lastEdited:nowDate()};

    delete merged._tempOid;

    const updated=orders.map(o=>o.id===selected.id?merged:o);

    await saveOrders(updated); setSelected(merged); setView("detail"); toast("Order updated.");

  };

  const handleArchive=async order=>{

    const arch=order.status==="Archived";

    const updated=orders.map(o=>o.id===order.id?{...o,status:arch?"Pending":"Archived"}:o);

    await saveOrders(updated);

    if(selected?.id===order.id)setSelected(p=>({...p,status:arch?"Pending":"Archived"}));

    toast(arch?"Order restored.":"Order archived.");

    if(!arch&&view==="detail")setView("list");

  };

  const handleDelete=async id=>{

    await saveOrders(orders.filter(o=>o.id!==id)); setDeleteTarget(null);

    if(view==="detail")setView("list"); toast("Order deleted.","warn");

  };

  const handleActivate=async order=>{await saveOrders(orders.map(o=>o.id===order.id?{...o,status:"Active"}:o));toast("Order activated.");};

  const handleSaveProfile=(username,data)=>{const p={...profiles,[username]:data};saveProfiles(p);toast("Info saved.");};

  const handleDownload=async(key,name)=>{

    const blob=await loadFileData(key);

    if(!blob){toast("File not found.","warn");return;}

    const url=URL.createObjectURL(blob);
    const a=document.createElement("a");
    a.href=url; a.download=name;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);

  };

  if(!loaded) return <div style={{background:C.bg,minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",color:C.sub,fontFamily:font}}>Loading…</div>;

  if(portal==="home") return(

    <div style={{background:C.bg2,minHeight:"100vh",fontFamily:font,padding:"60px 24px 40px"}}>

      <div style={{textAlign:"center",marginBottom:48}}>

        <div style={{fontFamily:"'Barlow Semi Condensed', sans-serif",fontWeight:800,fontSize:64,color:"#000",letterSpacing:-1,lineHeight:1,marginBottom:6}}>SHUSHU</div>
        <div style={{fontSize:13,fontWeight:600,color:C.sub,letterSpacing:1,textTransform:"uppercase",marginBottom:20}}>GarmentCRM</div>

        <div className="login-hero" style={{fontSize:40,fontWeight:700,color:C.text,letterSpacing:-.5,lineHeight:1.1}}>Order management,<br/>done simply.</div>

      </div>

      <div style={{maxWidth:380,margin:"0 auto",display:"flex",flexDirection:"column",gap:16}}>

        <div style={{background:C.bg,borderRadius:18,padding:28,boxShadow:"0 2px 20px #0000000a"}}>

          <div style={{fontSize:13,fontWeight:600,color:C.sub,marginBottom:18,letterSpacing:.3}}>CUSTOMER</div>

          <div style={{display:"flex",background:C.bg2,borderRadius:10,padding:3,marginBottom:18}}>

            {["login","register"].map(m=>(

              <button key={m} onClick={()=>{setAuthMode(m);setAuthErr("");}}

                style={{flex:1,background:authMode===m?C.bg:"transparent",color:authMode===m?C.text:C.sub,border:"none",borderRadius:8,padding:"7px",cursor:"pointer",fontFamily:font,fontWeight:authMode===m?600:400,fontSize:13,boxShadow:authMode===m?"0 1px 4px #00000012":"none"}}>

                {m==="login"?"Sign In":"Register"}

              </button>

            ))}

          </div>

          <div style={{display:"flex",flexDirection:"column",gap:10}}>

            {authMode==="register"&&<Inp value={authName} onChange={setAuthName} placeholder="Full name"/>}

            <Inp value={authUser} onChange={setAuthUser} placeholder="Username"/>

            <Inp value={authPass} onChange={setAuthPass} placeholder="Password" type="password"/>

          </div>

          {authMode==="login"&&<div style={{textAlign:"right",marginTop:6}}>
            <button onClick={()=>setAuthMode("forgot")} style={{background:"none",border:"none",color:C.sub,fontSize:12,cursor:"pointer",fontFamily:font,padding:0}}>Forgot password?</button>
          </div>}

          {authMode==="forgot"&&<div style={{background:C.bg2,border:`1px solid ${C.border}`,borderRadius:10,padding:"12px 14px",marginTop:8,fontSize:13,color:C.sub,lineHeight:1.5}}>
            Please contact the admin to reset your password. The admin can reset it from the admin panel.
          </div>}

          {authErr&&!authErr.includes("admin")&&<div style={{color:C.red,fontSize:13,marginTop:10}}>{authErr}</div>}

          <PrimaryBtn onClick={authMode==="login"?handleLogin:handleRegister} style={{width:"100%",marginTop:14,padding:"12px"}}>{authMode==="login"?"Sign In":"Create Account"}</PrimaryBtn>

        </div>

        <div style={{background:C.bg,borderRadius:18,padding:24,boxShadow:"0 2px 20px #0000000a"}}>

          <div style={{fontSize:13,fontWeight:600,color:C.sub,marginBottom:14,letterSpacing:.3}}>ADMIN ACCESS</div>

          <div style={{display:"flex",gap:10}}>

            <Inp value={adminPass} onChange={setAdminPass} placeholder="Admin password" type="password" style={{flex:1}}/>

            <PrimaryBtn onClick={handleAdminLogin} style={{whiteSpace:"nowrap",padding:"10px 18px"}}>Enter</PrimaryBtn>

          </div>

          {authErr&&authErr.includes("admin")&&<div style={{color:C.red,fontSize:13,marginTop:8}}>{authErr}</div>}

        </div>

      </div>

    </div>

  );

  const Nav=({title,sub,right,avatar})=>(

    <div style={{borderBottom:`1px solid ${C.border}`,position:"sticky",top:0,background:C.bg+"ee",backdropFilter:"blur(20px)",zIndex:100}}>

      <div className="nav-inner" style={{maxWidth:960,margin:"0 auto",padding:"12px 24px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>

        <div style={{display:"flex",alignItems:"center",gap:20,flex:1}}>
          <div style={{lineHeight:1}}>
            <div style={{fontFamily:"'Barlow Semi Condensed', sans-serif",fontWeight:800,fontSize:22,color:C.text,letterSpacing:-.3,lineHeight:1}}>SHUSHU</div>
            <div style={{fontSize:9,fontWeight:600,color:C.sub,letterSpacing:1,textTransform:"uppercase",marginTop:1}}>GarmentCRM</div>
          </div>
          <div style={{width:1,height:32,background:C.border}}/>
          <div><div style={{fontSize:16,fontWeight:700,color:C.text,letterSpacing:-.3}}>{title}</div>{sub&&<div style={{fontSize:12,color:C.sub}}>{sub}</div>}</div>
          {avatar&&<div style={{marginLeft:"auto"}}>{avatar}</div>}
        </div>

        <div className="nav-right" style={{display:"flex",gap:8,alignItems:"center"}}>{right}</div>

      </div>

    </div>

  );

  const Wrap=({children})=><div className="wrap-inner" style={{maxWidth:960,margin:"0 auto",padding:"32px 24px"}}>{children}</div>;

  if(portal==="customer"){

    const myOrders=orders.filter(o=>o.owner===currentUser.username);

    const profile=profiles[currentUser.username]||{email:"",phone:"",address:"",infoNote:""};

    return(

      <div style={{background:C.bg,minHeight:"100vh",fontFamily:font}}>

        {/* Change Password Modal */}
        {showChangePw&&(
          <div style={{position:"fixed",inset:0,background:"#0008",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:24}} onClick={()=>{setShowChangePw(false);setCpErr("");}}>
            <div style={{background:C.bg,borderRadius:18,padding:28,width:"100%",maxWidth:380,boxShadow:"0 8px 40px #0004"}} onClick={e=>e.stopPropagation()}>
              <div style={{fontSize:18,fontWeight:700,color:C.text,marginBottom:20}}>Change Password</div>
              <div style={{display:"flex",flexDirection:"column",gap:12}}>
                <Inp value={cpOld} onChange={setCpOld} placeholder="Current password" type="password"/>
                <Inp value={cpNew} onChange={setCpNew} placeholder="New password"/>
                <Inp value={cpConfirm} onChange={setCpConfirm} placeholder="Confirm new password" type="password"/>
              </div>
              {cpErr&&<div style={{color:C.red,fontSize:13,marginTop:10}}>{cpErr}</div>}
              <div style={{display:"flex",gap:10,marginTop:18}}>
                <GhostBtn onClick={()=>{setShowChangePw(false);setCpErr("");}} style={{flex:1}}>Cancel</GhostBtn>
                <PrimaryBtn onClick={handleChangePassword} style={{flex:1}}>Save Password</PrimaryBtn>
              </div>
            </div>
          </div>
        )}

        <Nav title="My Orders" sub={currentUser.name} right={
          <div style={{display:"flex",width:"100%",alignItems:"center"}}>
            {view==="list"&&<PrimaryBtn onClick={()=>setView("new")} style={{padding:"8px 18px",fontSize:14,marginLeft:"20%"}}>+ New Order</PrimaryBtn>}
            {view!=="list"&&<GhostBtn onClick={()=>setView("list")} style={{padding:"8px 14px",fontSize:14,color:C.sub,marginLeft:"20%"}}>← Back</GhostBtn>}
            <div style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:4}}>
              <GhostBtn onClick={()=>{setShowChangePw(true);setCpOld("");setCpNew("");setCpConfirm("");setCpErr("");}} style={{padding:"8px 10px",fontSize:14,color:C.sub}}>🔑</GhostBtn>
              <GhostBtn onClick={logout} style={{padding:"8px 14px",fontSize:14,color:C.sub}}>Sign Out</GhostBtn>
            </div>
          </div>
        } avatar={<Avatar logo={profile.logo} name={currentUser.name} size={40}/>}/>

        <Wrap>

          {view==="list"&&(<>

            <ProfileCard profile={profile} name={currentUser.name} onSave={data=>handleSaveProfile(currentUser.username,data)}/>

            {myOrders.length===0

              ?<div style={{textAlign:"center",padding:"60px 0",color:C.sub}}>

                  <div style={{fontSize:48,marginBottom:12}}>📦</div>

                  <div style={{fontSize:20,fontWeight:600,color:C.text,marginBottom:8}}>No orders yet</div>

                  <PrimaryBtn onClick={()=>setView("new")} style={{marginTop:8}}>Place an Order</PrimaryBtn>

                </div>

              :<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))",gap:14}}>

                {myOrders.map(o=>(

                  <div key={o.id} onClick={()=>{setSelected(o);setView("detail");}}

                    style={{background:C.bg,border:`1px solid ${C.border}`,borderRadius:16,padding:22,cursor:"pointer"}}

                    onMouseEnter={e=>e.currentTarget.style.boxShadow="0 4px 20px #0000000e"}

                    onMouseLeave={e=>e.currentTarget.style.boxShadow="none"}>

                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:14}}>

                      <div><div style={{fontWeight:700,fontSize:16}}>Order #{o.id}</div><div style={{color:C.sub,fontSize:13,marginTop:2}}>{o.items.length} item{o.items.length>1?"s":""} · {totalUnits(o.items)} pcs</div></div>

                      <Badge status={o.status}/>

                    </div>

                    <div style={{height:1,background:C.border,marginBottom:14}}/>

                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>

                      <div><div style={{fontSize:11,color:C.sub,fontWeight:500,marginBottom:2}}>Placed</div><div style={{fontSize:13,fontWeight:500}}>{o.created}</div></div>

                      <div><div style={{fontSize:11,color:C.sub,fontWeight:500,marginBottom:2}}>Last Edited</div><div style={{fontSize:13,fontWeight:500}}>{o.lastEdited||o.created}</div></div>

                    </div>

                  </div>

                ))}

              </div>

            }

          </>)}

          {view==="new"&&<div style={{maxWidth:700,margin:"0 auto"}}><div style={{fontSize:26,fontWeight:700,letterSpacing:-.3,marginBottom:28}}>New Order</div><OrderForm onSave={handleSaveNew} onCancel={()=>setView("list")} editMode={false}/></div>}

          {view==="detail"&&selected&&(()=>{

            const o=orders.find(x=>x.id===selected.id)||selected;

            return(

              <div style={{maxWidth:640,margin:"0 auto"}}>

                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:24}}>

                  <div style={{display:"flex",alignItems:"center",gap:16}}>
                    <Avatar logo={profile.logo} name={currentUser.name} size={52}/>
                    <div><div style={{fontSize:26,fontWeight:700,letterSpacing:-.3}}>Order #{o.id}</div><div style={{color:C.sub,marginTop:4}}>{o.ownerName}</div></div>
                  </div>

                  <Badge status={o.status}/>

                </div>

                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:24}}>

                  {[["Email",profile.email||o.email],["Phone",profile.phone||o.phone]].map(([l,v])=>(

                    <div key={l} style={{background:C.bg2,borderRadius:12,padding:"12px 16px"}}>

                      <div style={{fontSize:11,color:C.sub,fontWeight:600,marginBottom:4,textTransform:"uppercase",letterSpacing:.4}}>{l}</div>

                      <div style={{fontSize:14,fontWeight:500}}>{v||"—"}</div>

                    </div>

                  ))}

                </div>

                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>

                  <div style={{fontSize:13,fontWeight:600,color:C.sub,letterSpacing:.4,textTransform:"uppercase"}}>Garment Items</div>

                  {o.status!=="Archived"&&<PrimaryBtn onClick={()=>setView("edit")} style={{padding:"6px 16px",fontSize:13}}>Edit Order</PrimaryBtn>}

                </div>

                {o.items.map((it,i)=><ItemCard key={i} it={it} idx={i} isAdmin={false} onDownload={()=>{}}/>)}

                {o.notes&&<div style={{background:C.bg2,borderRadius:12,padding:"14px 16px",marginTop:8}}><div style={{fontSize:11,color:C.sub,fontWeight:600,marginBottom:4,textTransform:"uppercase",letterSpacing:.4}}>Notes</div><div style={{fontSize:14}}>{o.notes}</div></div>}

                <div style={{marginTop:16}}>
                  <button onClick={()=>downloadExcel(o)} style={{background:"#e8f5e9",color:"#2e7d32",border:"1px solid #a5d6a7",borderRadius:10,padding:"11px 18px",cursor:"pointer",fontFamily:font,fontSize:14,fontWeight:600}}>⬇ Export Excel</button>
                </div>

              </div>

            );

          })()}

          {view==="edit"&&selected&&<div style={{maxWidth:700,margin:"0 auto"}}><div style={{fontSize:26,fontWeight:700,letterSpacing:-.3,marginBottom:28}}>Edit Order</div><OrderForm initial={selected} orderId={selected.id} onSave={handleSaveEdit} onCancel={()=>setView("detail")} editMode={true}/></div>}

        </Wrap>

        {deleteTarget&&<Modal onClose={()=>setDeleteTarget(null)}><div style={{fontSize:18,fontWeight:700,marginBottom:8}}>Delete this order?</div><div style={{color:C.sub,fontSize:14,marginBottom:24}}>This will be permanently removed.</div><div style={{display:"flex",gap:10}}><GhostBtn onClick={()=>setDeleteTarget(null)} style={{flex:1,color:C.sub}}>Cancel</GhostBtn><button onClick={()=>handleDelete(deleteTarget.id)} style={{flex:1,background:C.red,color:C.white,border:"none",borderRadius:10,padding:"11px",cursor:"pointer",fontFamily:font,fontWeight:600,fontSize:15}}>Delete</button></div></Modal>}

        <Toast toasts={toasts} onDismiss={dismissToast}/>

      </div>

    );

  }

  const activeOrders=orders.filter(o=>o.status!=="Archived");

  const archivedOrders=orders.filter(o=>o.status==="Archived");

  const base=showArchived?archivedOrders:activeOrders;

  const displayed=base.filter(o=>{

    const q=search.toLowerCase();

    return(!q||o.ownerName?.toLowerCase().includes(q)||o.company?.toLowerCase().includes(q)||o.contact?.toLowerCase().includes(q))&&(statusFilter==="All"||o.status===statusFilter);

  }).sort((a,b)=>{

    if(sortBy==="Newest") return new Date(b.created)-new Date(a.created);

    if(sortBy==="Oldest") return new Date(a.created)-new Date(b.created);

    if(sortBy==="Company A-Z") return (a.ownerName||"").localeCompare(b.ownerName||"");

    if(sortBy==="Most Units") return totalUnits(b.items)-totalUnits(a.items);

    return 0;

  });

  const Stat=({label,value,color})=>(

    <div style={{background:C.bg,border:`1px solid ${C.border}`,borderRadius:16,padding:"20px 24px",flex:1,minWidth:120}}>

      <div style={{fontSize:12,color:C.sub,fontWeight:600,letterSpacing:.4,textTransform:"uppercase",marginBottom:6}}>{label}</div>

      <div style={{fontSize:30,fontWeight:700,color:color||C.text,letterSpacing:-.5}}>{value}</div>

    </div>

  );

  return(

    <div style={{background:C.bg2,minHeight:"100vh",fontFamily:font}}>

      <Nav title={<span>GarmentCRM <span style={{fontSize:12,fontWeight:600,color:C.sub,background:C.bg3,borderRadius:99,padding:"2px 9px",marginLeft:6}}>Admin</span></span>} sub={adminSection==="orders"?"All orders":"Customers"}

        right={<>{view!=="list"&&<GhostBtn onClick={()=>{setView("list");setAdminSection("orders");}} style={{padding:"8px 14px",fontSize:14,color:C.sub}}>← Dashboard</GhostBtn>}<GhostBtn onClick={logout} style={{padding:"8px 14px",fontSize:14,color:C.sub}}>Sign Out</GhostBtn></>}/>

      <Wrap>

        {view==="list"&&<div style={{display:"flex",gap:8,marginBottom:24}}>
          <PillBtn active={adminSection==="orders"} onClick={()=>setAdminSection("orders")}>Orders</PillBtn>
          <PillBtn active={adminSection==="customers"} onClick={()=>setAdminSection("customers")}>Customers ({Object.keys(users).length})</PillBtn>
        </div>}

        {view==="list"&&adminSection==="customers"&&(()=>{
          const allUsers=Object.entries(users).filter(([username])=>username!=="admin");
          const starred=allUsers.filter(([u])=>adminMeta[u]?.starred);
          const unstarred=allUsers.filter(([u])=>!adminMeta[u]?.starred);
          const sorted=[...starred,...unstarred];
          const filtered=sorted.filter(([u,v])=>{
            const q=customerSearch.toLowerCase();
            return !q||u.includes(q)||v.name?.toLowerCase().includes(q)||(profiles[u]?.email||"").toLowerCase().includes(q);
          });
          return(<>
            <div style={{display:"flex",gap:12,marginBottom:20,alignItems:"center"}}>
              <input value={customerSearch} onChange={e=>setCustomerSearch(e.target.value)} placeholder="Search customers…" style={{background:C.bg,border:`1px solid ${C.border}`,color:C.text,borderRadius:10,padding:"9px 14px",fontFamily:font,fontSize:14,flex:1,outline:"none"}}/>
            </div>
            {filtered.length===0&&<div style={{textAlign:"center",color:C.sub,padding:"60px 0",fontSize:15}}>No customers found.</div>}
            <div style={{display:"flex",flexDirection:"column",gap:14}}>
              {filtered.map(([username,u])=>(
                <CustomerCard key={username} username={username} u={u}
                  prof={profiles[username]||{}}
                  meta={adminMeta[username]||{starred:false,adminNote:""}}
                  userOrders={orders.filter(o=>o.owner===username)}
                  onToggleStar={handleToggleStar}
                  onSaveNote={handleSaveAdminNote}
                  onDelete={setDeleteUserTarget}
                  onResetPassword={handleAdminResetPassword}/>
              ))}
            </div>
          </>);
        })()}

        {view==="list"&&adminSection==="orders"&&(<>

          <div className="stat-row" style={{display:"flex",gap:12,marginBottom:28,flexWrap:"wrap"}}>

            <Stat label="Total Orders" value={activeOrders.length}/>

            <Stat label="Active" value={activeOrders.filter(o=>o.status==="Active").length} color={C.green}/>

            <Stat label="Pending" value={activeOrders.filter(o=>o.status==="Pending").length} color={C.amber}/>

            <Stat label="Total Units" value={activeOrders.reduce((s,o)=>s+totalUnits(o.items),0)}/>

          </div>

          <div className="filter-bar" style={{background:C.bg,borderRadius:16,padding:"16px 20px",marginBottom:20,display:"flex",flexDirection:"column",gap:12,border:`1px solid ${C.border}`}}>

            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search orders…" style={{background:C.bg2,border:`1px solid ${C.border}`,color:C.text,borderRadius:10,padding:"9px 14px",fontFamily:font,fontSize:14,width:"100%",boxSizing:"border-box",outline:"none"}}/>

            <select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)} style={{background:C.bg2,border:`1px solid ${C.border}`,color:C.text,borderRadius:10,padding:"9px 12px",fontFamily:font,fontSize:14,width:"100%",boxSizing:"border-box"}}>

              {["All","Active","Pending","Draft"].map(s=><option key={s}>{s}</option>)}

            </select>

            <select value={sortBy} onChange={e=>setSortBy(e.target.value)} style={{background:C.bg2,border:`1px solid ${C.border}`,color:C.text,borderRadius:10,padding:"9px 12px",fontFamily:font,fontSize:14,width:"100%",boxSizing:"border-box"}}>

              {["Newest","Oldest","Company A-Z","Most Units"].map(s=><option key={s}>{s}</option>)}

            </select>

            <div style={{display:"flex",gap:6}}>

              <PillBtn active={!showArchived} onClick={()=>setShowArchived(false)}>Active</PillBtn>

              <PillBtn active={showArchived} onClick={()=>setShowArchived(true)}>Archived ({archivedOrders.length})</PillBtn>

            </div>

          </div>

          {displayed.length===0&&<div style={{textAlign:"center",color:C.sub,padding:"60px 0",fontSize:15}}>No orders found.</div>}

          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(300px,1fr))",gap:14}}>

            {displayed.map((o,i)=>(

              <div key={o.id} draggable

                onDragStart={()=>{dragIdx.current=i;}} onDragEnter={()=>{dragOver.current=i;}}

                onDragEnd={()=>{

                  if(dragIdx.current===null||dragOver.current===null||dragIdx.current===dragOver.current){dragIdx.current=null;return;}

                  const r=[...displayed];const[m]=r.splice(dragIdx.current,1);r.splice(dragOver.current,0,m);

                  const ids=new Set(r.map(x=>x.id));const rest=orders.filter(x=>!ids.has(x.id));saveOrders([...r,...rest]);

                  dragIdx.current=null;dragOver.current=null;

                }}

                onClick={()=>{setSelected(o);setView("detail");}}

                style={{background:C.bg,border:`1px solid ${C.border}`,borderRadius:16,padding:22,cursor:"pointer"}}

                onMouseEnter={e=>e.currentTarget.style.boxShadow="0 4px 20px #0000000e"}

                onMouseLeave={e=>e.currentTarget.style.boxShadow="none"}>

                <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>

                  <div><div style={{fontWeight:600,fontSize:15}}>{o.ownerName||"—"}</div><div style={{color:C.sub,fontSize:13}}>{o.company||o.contact||""}</div></div>

                  <Badge status={o.status}/>

                </div>

                <div style={{fontSize:12,color:C.gray,marginBottom:12}}>Order #{o.id}</div>

                <div style={{height:1,background:C.border,marginBottom:14}}/>

                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:16}}>

                  {[["Items",o.items.length],["Units",totalUnits(o.items)],["Placed",o.created],["Last Edited",o.lastEdited||o.created]].map(([l,v])=>(

                    <div key={l}><div style={{fontSize:10,color:C.sub,fontWeight:600,textTransform:"uppercase",letterSpacing:.3,marginBottom:2}}>{l}</div><div style={{fontSize:13,fontWeight:500}}>{v}</div></div>

                  ))}

                </div>

                <div onClick={e=>e.stopPropagation()} style={{display:"flex",gap:6,flexWrap:"wrap"}}>

                  {[{label:"Edit",action:()=>{setSelected(o);setView("edit");}},{label:o.status==="Archived"?"Restore":"Archive",action:()=>handleArchive(o)},{label:"Delete",action:()=>setDeleteTarget(o)},...(o.status!=="Active"&&o.status!=="Archived"?[{label:"Activate",action:()=>handleActivate(o)}]:[])].map(({label,action})=>(

                    <button key={label} onClick={action} style={{background:C.bg2,color:label==="Delete"?C.red:C.text,border:`1px solid ${C.border}`,borderRadius:8,padding:"5px 12px",fontSize:12,cursor:"pointer",fontFamily:font,fontWeight:500}}>{label}</button>

                  ))}

                </div>

              </div>

            ))}

          </div>

        </>)}

        {view==="edit"&&selected&&<div style={{maxWidth:700,margin:"0 auto"}}><div style={{fontSize:26,fontWeight:700,letterSpacing:-.3,marginBottom:28}}>Edit Order</div><OrderForm initial={selected} orderId={selected.id} onSave={handleSaveEdit} onCancel={()=>setView("detail")} editMode={true}/></div>}

        {view==="detail"&&selected&&(()=>{

          const _o=orders.find(x=>x.id===selected.id)||selected;
          const _prof=profiles[_o.owner]||{};
          const o={..._o,email:_prof.email||_o.email||"",phone:_prof.phone||_o.phone||""};

          return(

            <div style={{maxWidth:640,margin:"0 auto"}}>

              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:24}}>

                <div><div style={{fontSize:26,fontWeight:700,letterSpacing:-.3}}>{o.ownerName}</div><div style={{color:C.gray,fontSize:13,marginTop:4}}>Order #{o.id}</div></div>

                <Badge status={o.status}/>

              </div>

              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:24}}>

                {[["Email",o.email],["Phone",o.phone],["Placed",o.created],["Last Edited",o.lastEdited||o.created]].map(([l,v])=>(

                  <div key={l} style={{background:C.bg2,borderRadius:12,padding:"12px 16px"}}>

                    <div style={{fontSize:11,color:C.sub,fontWeight:600,marginBottom:4,textTransform:"uppercase",letterSpacing:.4}}>{l}</div>

                    <div style={{fontSize:14,fontWeight:500}}>{v||"—"}</div>

                  </div>

                ))}

              </div>

              <div style={{fontSize:13,fontWeight:600,color:C.sub,letterSpacing:.4,textTransform:"uppercase",marginBottom:10}}>Garment Items</div>

              {o.items.map((it,i)=><ItemCard key={i} it={it} idx={i} isAdmin={true} onDownload={handleDownload}/>)}

              {o.notes&&<div style={{background:C.bg2,borderRadius:12,padding:"14px 16px",marginTop:8,marginBottom:24}}><div style={{fontSize:11,color:C.sub,fontWeight:600,marginBottom:4,textTransform:"uppercase",letterSpacing:.4}}>Notes</div><div style={{fontSize:14}}>{o.notes}</div></div>}

              <div style={{display:"flex",gap:10,marginTop:16,flexWrap:"wrap"}}>

                <PrimaryBtn onClick={()=>setView("edit")}>Edit</PrimaryBtn>

                <button onClick={()=>handleArchive(o)} style={{background:C.bg2,color:C.text,border:`1px solid ${C.border}`,borderRadius:10,padding:"11px 18px",cursor:"pointer",fontFamily:font,fontSize:14}}>{o.status==="Archived"?"Restore":"Archive"}</button>

                <DestructBtn onClick={()=>setDeleteTarget(o)}>Delete</DestructBtn>

              </div>

              <div style={{display:"flex",gap:10,marginTop:10,flexWrap:"wrap"}}>

                <button onClick={async()=>downloadExcel(o)} style={{background:"#e8f5e9",color:"#2e7d32",border:"1px solid #a5d6a7",borderRadius:10,padding:"11px 18px",cursor:"pointer",fontFamily:font,fontSize:14,fontWeight:600}}>⬇ Export Excel</button>

                <button disabled={zipLoading} onClick={async()=>{setZipLoading(true);try{await downloadZip(o,loadFileData,(done,total)=>{});}finally{setZipLoading(false);}}} style={{background:zipLoading?"#e0e0e0":"#e3f2fd",color:zipLoading?C.gray:"#1565c0",border:`1px solid ${zipLoading?"#bdbdbd":"#90caf9"}`,borderRadius:10,padding:"11px 18px",cursor:zipLoading?"not-allowed":"pointer",fontFamily:font,fontSize:14,fontWeight:600}}>{zipLoading?"Preparing ZIP…":"⬇ Download ZIP"}</button>

              </div>

            </div>

          );

        })()}

      </Wrap>

      {deleteTarget&&<Modal onClose={()=>setDeleteTarget(null)}><div style={{fontSize:18,fontWeight:700,marginBottom:8}}>Delete this order?</div><div style={{color:C.sub,fontSize:14,marginBottom:24}}>Order #{deleteTarget.id} from <strong>{deleteTarget.ownerName}</strong> will be permanently removed.</div><div style={{display:"flex",gap:10}}><GhostBtn onClick={()=>setDeleteTarget(null)} style={{flex:1,color:C.sub}}>Cancel</GhostBtn><button onClick={()=>handleDelete(deleteTarget.id)} style={{flex:1,background:C.red,color:C.white,border:"none",borderRadius:10,padding:"11px",cursor:"pointer",fontFamily:font,fontWeight:600,fontSize:15}}>Delete</button></div></Modal>}

      {deleteUserTarget&&<Modal onClose={()=>setDeleteUserTarget(null)}><div style={{fontSize:18,fontWeight:700,marginBottom:8}}>Delete customer?</div><div style={{color:C.sub,fontSize:14,marginBottom:24}}><strong>{users[deleteUserTarget]?.name}</strong> (@{deleteUserTarget}) and all their orders will be permanently removed.</div><div style={{display:"flex",gap:10}}><GhostBtn onClick={()=>setDeleteUserTarget(null)} style={{flex:1,color:C.sub}}>Cancel</GhostBtn><button onClick={()=>handleDeleteUser(deleteUserTarget)} style={{flex:1,background:C.red,color:C.white,border:"none",borderRadius:10,padding:"11px",cursor:"pointer",fontFamily:font,fontWeight:600,fontSize:15}}>Delete</button></div></Modal>}

      <Toast toasts={toasts} onDismiss={dismissToast}/>

    </div>

  );

}

