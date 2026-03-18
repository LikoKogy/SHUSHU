
import { useState, useRef, useCallback, useEffect } from "react";

const C = {

  bg:"#ffffff", bg2:"#f5f5f7", bg3:"#e8e8ed",

  border:"#d2d2d7", text:"#1d1d1f", sub:"#6e6e73",

  green:"#34c759", amber:"#ff9f0a", red:"#ff3b30",

  purple:"#bf5af2", gray:"#8e8e93", white:"#ffffff",

};

const font = "-apple-system, 'SF Pro Display', 'Helvetica Neue', Arial, sans-serif";

const SIZES = ["XS","S","M","L","XL","2XL","3XL"];

const LOGO_PLACEMENTS = ["Front Left Chest","Front Center","Back Center","Back Neck","Left Sleeve","Right Sleeve","Bottom Hem"];

const BRAND_FILES = ["Logo Design","Neck Label","Washing / Care Label","Hang Tag","Packaging / Bag"];

const STATUS = { Active:C.green, Pending:C.amber, Draft:C.gray, Archived:C.purple };

const ADMIN_PASS = "Shushu1881";

const totalUnits = items => items.reduce((s,it)=>s+SIZES.reduce((a,sz)=>a+(parseInt(it.sizes[sz])||0),0),0);

const emptyItem  = () => ({ style:"", colors:"", sizes:Object.fromEntries(SIZES.map(s=>[s,0])), logos:[], catalogImage:null, brandingFiles:Object.fromEntries(BRAND_FILES.map(k=>[k,null])), itemNotes:"" });

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

async function readFileAsDataURL(file) {

  return new Promise((res, rej) => {

    const r = new FileReader();

    r.onloadend = () => res(r.result);

    r.onerror = rej;

    r.readAsDataURL(file);

  });

}

async function persistOrders(orders) {

  storage.set("crm-orders", JSON.stringify(orders));

}

async function fetchOrders() {

  try { const r = storage.get("crm-orders"); return r ? JSON.parse(r.value) : []; } catch(_) { return []; }

}

async function loadFileData(key) {

  try { const r = storage.get(key); return r ? r.value : null; } catch(_) { return null; }

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

const Toast = ({toasts}) => (

  <div style={{position:"fixed",bottom:28,left:"50%",transform:"translateX(-50%)",zIndex:9999,display:"flex",flexDirection:"column",gap:8,alignItems:"center",pointerEvents:"none"}}>

    {toasts.map(t=><div key={t.id} style={{background:t.type==="warn"?"#ff9f0a":"#1d1d1f",color:C.white,padding:"11px 22px",borderRadius:22,fontSize:14,fontFamily:font,fontWeight:500,boxShadow:"0 4px 24px #0002"}}>{t.msg}</div>)}

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

function UploadSlot({label, required, initial, onReady, showShareToggle, isShared, onToggleShare, lockedByShared}) {

  const [fileName, setFileName] = useState(initial?.name||null);

  const handleChange = async (e) => {

    const f = e.target.files[0];

    if (!f) return;

    setFileName(f.name);

    onReady(f);

    e.target.value = "";

  };

  const displayName = lockedByShared ? initial?.name : fileName;

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

            ? <span style={{fontSize:13,color:C.green,fontWeight:600}}>✓ {displayName}</span>

            : <span style={{fontSize:13,color:C.sub}}>↑ Upload File</span>}

        </div>

      </label>

    </div>

  );

}

// ── CatalogSlot ────────────────────────────────────────────────────────────

function CatalogSlot({initial, onReady}) {

  const [fileName, setFileName] = useState(initial?.name||null);

  const handleChange = (e) => {

    const f = e.target.files[0];

    if (!f) return;

    setFileName(f.name);

    onReady(f);

    e.target.value = "";

  };

  return (

    <div style={{marginBottom:16}}>

      <div style={{fontSize:12,fontWeight:600,color:C.sub,letterSpacing:.5,marginBottom:6,textTransform:"uppercase"}}>

        Item Catalog Image <span style={{color:C.sub,fontWeight:400,textTransform:"none",letterSpacing:0,fontSize:12}}>(screenshot from catalog)</span>

      </div>

      <label style={{display:"block",border:`1.5px dashed ${fileName?C.green:C.border}`,borderRadius:10,cursor:"pointer",background:fileName?C.green+"08":C.bg2}}>

        <input type="file" accept="image/*" style={{display:"none"}} onChange={handleChange}/>

        <div style={{padding:"20px",textAlign:"center"}}>

          {fileName

            ? <><div style={{fontSize:22,marginBottom:6}}>✅</div><div style={{fontSize:13,color:C.green,fontWeight:600}}>{fileName}</div><div style={{fontSize:11,color:C.sub,marginTop:4}}>Tap to replace</div></>

            : <><div style={{fontSize:22,marginBottom:6}}>🖼</div><div style={{fontSize:13,color:C.sub,fontWeight:500}}>Tap to upload catalog screenshot</div><div style={{fontSize:11,color:C.gray,marginTop:3}}>Any image format</div></>}

        </div>

      </label>

    </div>

  );

}

// ── ItemCard ───────────────────────────────────────────────────────────────

const ItemCard = ({it,idx,isAdmin,onDownload}) => (

  <div style={{border:`1px solid ${C.border}`,borderRadius:14,padding:18,marginBottom:12}}>

    <div style={{fontSize:11,fontWeight:700,color:C.sub,letterSpacing:.5,textTransform:"uppercase",marginBottom:6}}>Item {idx+1}</div>

    {it.catalogImage?.name&&(

      <div style={{background:C.green+"10",border:`1px solid ${C.green}30`,borderRadius:8,padding:"8px 12px",marginBottom:10,fontSize:13,display:"flex",alignItems:"center",justifyContent:"space-between"}}>

        <span style={{color:C.green,fontWeight:500}}>🖼 {it.catalogImage.name}</span>

        {isAdmin&&it.catalogImage.key&&<button onClick={()=>onDownload(it.catalogImage.key,it.catalogImage.name)} style={{background:C.text,color:C.white,border:"none",borderRadius:6,padding:"3px 10px",fontSize:11,cursor:"pointer",fontFamily:font,fontWeight:600}}>Download</button>}

      </div>

    )}

    <div style={{fontWeight:600,fontSize:15,marginBottom:8}}>{it.style} <span style={{color:C.sub,fontWeight:400}}>· {it.colors}</span></div>

    <div style={{display:"flex",flexWrap:"wrap",gap:7,marginBottom:6}}>

      {SIZES.map(sz=>(it.sizes[sz]>0)&&<span key={sz} style={{background:C.bg2,borderRadius:8,padding:"4px 10px",fontSize:12,fontWeight:500}}>{sz}: {it.sizes[sz]}</span>)}

      <span style={{background:C.bg3,borderRadius:8,padding:"4px 10px",fontSize:12,fontWeight:700}}>Total: {SIZES.reduce((s,sz)=>s+(it.sizes[sz]||0),0)}</span>

    </div>

    {it.logos?.length>0&&<div style={{fontSize:12,color:C.sub,marginBottom:8}}>Logos: {it.logos.join(", ")}</div>}

    {it.brandingFiles&&Object.entries(it.brandingFiles).some(([,v])=>v)&&(

      <div style={{marginTop:8,paddingTop:8,borderTop:`1px solid ${C.border}`}}>

        <div style={{fontSize:11,color:C.sub,fontWeight:600,letterSpacing:.4,marginBottom:8,textTransform:"uppercase"}}>Branding Files</div>

        <div style={{display:"flex",flexDirection:"column",gap:6}}>

          {Object.entries(it.brandingFiles).filter(([,v])=>v).map(([k,v])=>(

            <div key={k} style={{display:"flex",alignItems:"center",justifyContent:"space-between",background:C.green+"08",border:`1px solid ${C.green}22`,borderRadius:8,padding:"6px 12px"}}>

              <span style={{fontSize:12,color:C.green,fontWeight:600}}>✓ {k}: {v.name}</span>

              {isAdmin&&v.key&&<button onClick={()=>onDownload(v.key,v.name)} style={{background:C.text,color:C.white,border:"none",borderRadius:6,padding:"3px 10px",fontSize:11,cursor:"pointer",fontFamily:font,fontWeight:600}}>Download</button>}

            </div>

          ))}

        </div>

      </div>

    )}

    {it.itemNotes&&<div style={{fontSize:13,color:C.sub,marginTop:8,fontStyle:"italic"}}>{it.itemNotes}</div>}

  </div>

);

// ── ProfileCard ────────────────────────────────────────────────────────────

function ProfileCard({profile,onSave}) {

  const [editing,setEditing]=useState(false);

  const [draft,setDraft]=useState(profile);

  useEffect(()=>setDraft(profile),[profile]);

  const f=(k,v)=>setDraft(p=>({...p,[k]:v}));

  if(!editing) return(

    <div style={{background:C.bg,border:`1px solid ${C.border}`,borderRadius:16,padding:24,marginBottom:28}}>

      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>

        <span style={{fontSize:15,fontWeight:700}}>My Info</span>

        <button onClick={()=>setEditing(true)} style={{background:"transparent",color:C.sub,border:`1px solid ${C.border}`,borderRadius:8,padding:"5px 14px",fontSize:13,cursor:"pointer",fontFamily:font}}>Edit</button>

      </div>

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>

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

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:12}}>

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

  const initItems = (initial?.items||[emptyItem()]).map(it=>({...emptyItem(),...it}));

  const [items, setItems] = useState(initItems);

  const [notes, setNotes] = useState(initial?.notes||"");

  const [showErr, setShowErr] = useState(false);

  const [saving, setSaving] = useState(false);

  const [sharedToggles, setSharedToggles] = useState(Object.fromEntries(BRAND_FILES.map(k=>[k,false])));

  const [sharedNotesOn, setSharedNotesOn] = useState(false);

  const [sharedNotes, setSharedNotes] = useState("");

  const pendingFiles = useRef({});

  const errs = formErrors({items,notes});

  const prog = formProgress({items,notes});

  const setItemField = useCallback((i,k,v) => setItems(p=>p.map((it,j)=>j===i?{...it,[k]:v}:it)),[]);

  const setSizeVal   = useCallback((i,sz,v) => setItems(p=>p.map((it,j)=>j===i?{...it,sizes:{...it.sizes,[sz]:Math.max(0,parseInt(v)||0)}}:it)),[]);

  const toggleLogo   = useCallback((i,l)    => setItems(p=>p.map((it,j)=>{if(j!==i)return it;const logos=it.logos.includes(l)?it.logos.filter(x=>x!==l):[...it.logos,l];return{...it,logos};})),[]);

  const addItem      = useCallback(()=>{ pendingFiles.current[items.length]={}; setItems(p=>[...p,emptyItem()]); },[items.length]);

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

        const dataUrl = await readFileAsDataURL(pending["__catalog__"]);

        storage.set(key, dataUrl);

        catalogImage = { name: pending["__catalog__"].name, key };

      }

      const brandingFiles = {...(it.brandingFiles||{})};

      for(const fname of BRAND_FILES) {

        if(pending[fname]) {

          const key = fileKey(oid, i, fname);

          const dataUrl = await readFileAsDataURL(pending[fname]);

          storage.set(key, dataUrl);

          brandingFiles[fname] = { name: pending[fname].name, key };

        }

      }

      return {...it, catalogImage, brandingFiles};

    }));

    setSaving(false);

    onSave({ notes, items: finalItems, _tempOid: oid });

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

            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:16}}>

              <div>

                <div style={{fontSize:12,fontWeight:600,color:C.sub,letterSpacing:.5,marginBottom:6,textTransform:"uppercase"}}>Model / Style Name <span style={{color:C.red}}>*</span></div>

                <Inp value={it.style} onChange={v=>setItemField(i,"style",v)} placeholder="e.g. Polo Classic #PC-200"/>

              </div>

              <div>

                <div style={{fontSize:12,fontWeight:600,color:C.sub,letterSpacing:.5,marginBottom:6,textTransform:"uppercase"}}>Color(s) <span style={{color:C.red}}>*</span></div>

                <Inp value={it.colors} onChange={v=>setItemField(i,"colors",v)} placeholder="e.g. Navy Blue, White"/>

              </div>

            </div>

            <div style={{fontSize:12,fontWeight:600,color:C.sub,letterSpacing:.5,marginBottom:6,textTransform:"uppercase"}}>Quantity Per Size</div>

            <div style={{display:"grid",gridTemplateColumns:"repeat(8,1fr)",gap:8,marginBottom:16}}>

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

            </div>

            <div style={{fontSize:12,fontWeight:600,color:C.sub,letterSpacing:.5,marginBottom:8,textTransform:"uppercase"}}>Logo Placement <span style={{color:C.sub,fontWeight:400,textTransform:"none",letterSpacing:0}}>— select all that apply</span></div>

            <div style={{display:"flex",flexWrap:"wrap",gap:7,marginBottom:20}}>

              {LOGO_PLACEMENTS.map(l=>(

                <button key={l} onClick={()=>toggleLogo(i,l)}

                  style={{background:it.logos.includes(l)?C.text:C.bg,color:it.logos.includes(l)?C.white:C.sub,border:`1px solid ${it.logos.includes(l)?C.text:C.border}`,borderRadius:20,padding:"5px 13px",fontSize:12,cursor:"pointer",fontFamily:font,fontWeight:it.logos.includes(l)?600:400}}>

                  {l}

                </button>

              ))}

            </div>

            <div style={{borderTop:`1px solid ${C.border}`,paddingTop:16}}>

              <div style={{fontSize:15,fontWeight:700,color:C.text,marginBottom:14}}>Branding &amp; Label Files</div>

              {BRAND_FILES.map(fname=>{

                const isShared = sharedToggles[fname];

                return(

                  <UploadSlot

                    key={`${i}-${fname}`}

                    label={fname} required={true}

                    initial={it.brandingFiles?.[fname]||null}

                    showShareToggle={i===0&&items.length>1}

                    isShared={isShared}

                    onToggleShare={()=>setSharedToggles(p=>({...p,[fname]:!p[fname]}))}

                    lockedByShared={i>0&&isShared}

                    onReady={f=>{

                      queueFile(i,fname,f);

                      if(i===0&&isShared){

                        items.forEach((_,j)=>{ if(j!==0) queueFile(j,fname,f); });

                      }

                    }}

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

// ── Main App ───────────────────────────────────────────────────────────────

export default function App() {

  const [portal,setPortal]=useState("home");

  const [currentUser,setCurrentUser]=useState(null);

  const [users,setUsers]=useState({});

  const [orders,setOrders]=useState([]);

  const [profiles,setProfiles]=useState({});

  const [loaded,setLoaded]=useState(false);

  const [toasts,setToasts]=useState([]);

  const [deleteTarget,setDeleteTarget]=useState(null);

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

  const dragIdx=useRef(null);

  const dragOver=useRef(null);

  const toast=useCallback((msg,type="success")=>{

    const id=Date.now(); setToasts(p=>[...p,{id,msg,type}]);

    setTimeout(()=>setToasts(p=>p.filter(t=>t.id!==id)),3000);

  },[]);

  useEffect(()=>{

    (async()=>{

      try{const r=storage.get("crm-users");if(r)setUsers(JSON.parse(r.value));}catch(_){}

      try{const r=storage.get("crm-profiles");if(r)setProfiles(JSON.parse(r.value));}catch(_){}

      setOrders(await fetchOrders());

      setLoaded(true);

    })();

  },[]);

  const saveUsers=u=>{setUsers(u);storage.set("crm-users",JSON.stringify(u));};

  const saveProfiles=p=>{setProfiles(p);storage.set("crm-profiles",JSON.stringify(p));};

  const saveOrders=async o=>{setOrders(o);await persistOrders(o);};

  const handleRegister=()=>{

    setAuthErr("");

    if(!authName.trim()||!authUser.trim()||!authPass.trim()){setAuthErr("All fields are required.");return;}

    if(users[authUser.toLowerCase()]){setAuthErr("Username already taken.");return;}

    const u={...users,[authUser.toLowerCase()]:{name:authName.trim(),pass:authPass}};

    saveUsers(u); setCurrentUser({username:authUser.toLowerCase(),name:authName.trim()});

    setPortal("customer"); setView("list"); toast(`Welcome, ${authName.trim()}!`);

  };

  const handleLogin=()=>{

    setAuthErr(""); const u=users[authUser.toLowerCase()];

    if(!u||u.pass!==authPass){setAuthErr("Incorrect username or password.");return;}

    setCurrentUser({username:authUser.toLowerCase(),name:u.name});

    setPortal("customer"); setView("list"); toast(`Welcome back, ${u.name}!`);

  };

  const handleAdminLogin=()=>{

    if(adminPass===ADMIN_PASS){setPortal("admin");setView("list");setAdminPass("");toast("Admin access granted.");}

    else setAuthErr("Incorrect admin password.");

  };

  const logout=()=>{setPortal("home");setCurrentUser(null);setView("list");setAuthName("");setAuthUser("");setAuthPass("");setAuthErr("");};

  const nextId=()=>(orders.length?Math.max(...orders.map(o=>o.id))+1:1);

  const handleSaveNew=async form=>{

    const id=nextId();

    const items=form.items.map((it,i)=>{

      const catalogImage=it.catalogImage?.key?{...it.catalogImage,key:it.catalogImage.key.replace(String(form._tempOid),String(id))}:it.catalogImage;

      const brandingFiles=Object.fromEntries(Object.entries(it.brandingFiles||{}).map(([k,v])=>[k,v?.key?{...v,key:v.key.replace(String(form._tempOid),String(id))}:v]));

      return {...it,catalogImage,brandingFiles};

    });

    const o={...form,items,id,status:"Pending",created:nowDate(),lastEdited:nowDate(),owner:currentUser.username,ownerName:currentUser.name};

    delete o._tempOid;

    await saveOrders([o,...orders]); setView("list"); toast("Order submitted successfully.");

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

    const data=await loadFileData(key);

    if(!data){toast("File not found.","warn");return;}

    const a=document.createElement("a");

    a.href=data; a.download=name; a.click();

  };

  if(!loaded) return <div style={{background:C.bg,minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",color:C.sub,fontFamily:font}}>Loading…</div>;

  if(portal==="home") return(

    <div style={{background:C.bg2,minHeight:"100vh",fontFamily:font,padding:"60px 24px 40px"}}>

      <div style={{textAlign:"center",marginBottom:48}}>

        <div style={{fontSize:13,fontWeight:600,color:C.sub,letterSpacing:1,textTransform:"uppercase",marginBottom:10}}>GarmentCRM</div>

        <div style={{fontSize:40,fontWeight:700,color:C.text,letterSpacing:-.5,lineHeight:1.1}}>Order management,<br/>done simply.</div>

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

  const Nav=({title,sub,right})=>(

    <div style={{borderBottom:`1px solid ${C.border}`,position:"sticky",top:0,background:C.bg+"ee",backdropFilter:"blur(20px)",zIndex:100}}>

      <div style={{maxWidth:960,margin:"0 auto",padding:"16px 24px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>

        <div><div style={{fontSize:20,fontWeight:700,color:C.text,letterSpacing:-.3}}>{title}</div>{sub&&<div style={{fontSize:13,color:C.sub}}>{sub}</div>}</div>

        <div style={{display:"flex",gap:8,alignItems:"center"}}>{right}</div>

      </div>

    </div>

  );

  const Wrap=({children})=><div style={{maxWidth:960,margin:"0 auto",padding:"32px 24px"}}>{children}</div>;

  if(portal==="customer"){

    const myOrders=orders.filter(o=>o.owner===currentUser.username);

    const profile=profiles[currentUser.username]||{email:"",phone:"",address:"",infoNote:""};

    return(

      <div style={{background:C.bg,minHeight:"100vh",fontFamily:font}}>

        <Nav title="My Orders" sub={currentUser.name} right={<>

          {view==="list"&&<PrimaryBtn onClick={()=>setView("new")} style={{padding:"8px 18px",fontSize:14}}>+ New Order</PrimaryBtn>}

          {view!=="list"&&<GhostBtn onClick={()=>setView("list")} style={{padding:"8px 14px",fontSize:14,color:C.sub}}>← Back</GhostBtn>}

          <GhostBtn onClick={logout} style={{padding:"8px 14px",fontSize:14,color:C.sub}}>Sign Out</GhostBtn>

        </>}/>

        <Wrap>

          {view==="list"&&(<>

            <ProfileCard profile={profile} onSave={data=>handleSaveProfile(currentUser.username,data)}/>

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

                  <div><div style={{fontSize:26,fontWeight:700,letterSpacing:-.3}}>Order #{o.id}</div><div style={{color:C.sub,marginTop:4}}>{o.ownerName}</div></div>

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

              </div>

            );

          })()}

          {view==="edit"&&selected&&<div style={{maxWidth:700,margin:"0 auto"}}><div style={{fontSize:26,fontWeight:700,letterSpacing:-.3,marginBottom:28}}>Edit Order</div><OrderForm initial={selected} orderId={selected.id} onSave={handleSaveEdit} onCancel={()=>setView("detail")} editMode={true}/></div>}

        </Wrap>

        {deleteTarget&&<Modal onClose={()=>setDeleteTarget(null)}><div style={{fontSize:18,fontWeight:700,marginBottom:8}}>Delete this order?</div><div style={{color:C.sub,fontSize:14,marginBottom:24}}>This will be permanently removed.</div><div style={{display:"flex",gap:10}}><GhostBtn onClick={()=>setDeleteTarget(null)} style={{flex:1,color:C.sub}}>Cancel</GhostBtn><button onClick={()=>handleDelete(deleteTarget.id)} style={{flex:1,background:C.red,color:C.white,border:"none",borderRadius:10,padding:"11px",cursor:"pointer",fontFamily:font,fontWeight:600,fontSize:15}}>Delete</button></div></Modal>}

        <Toast toasts={toasts}/>

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

      <Nav title={<span>GarmentCRM <span style={{fontSize:12,fontWeight:600,color:C.sub,background:C.bg3,borderRadius:99,padding:"2px 9px",marginLeft:6}}>Admin</span></span>} sub="All orders"

        right={<>{view!=="list"&&<GhostBtn onClick={()=>setView("list")} style={{padding:"8px 14px",fontSize:14,color:C.sub}}>← Dashboard</GhostBtn>}<GhostBtn onClick={logout} style={{padding:"8px 14px",fontSize:14,color:C.sub}}>Sign Out</GhostBtn></>}/>

      <Wrap>

        {view==="list"&&(<>

          <div style={{display:"flex",gap:12,marginBottom:28,flexWrap:"wrap"}}>

            <Stat label="Total Orders" value={activeOrders.length}/>

            <Stat label="Active" value={activeOrders.filter(o=>o.status==="Active").length} color={C.green}/>

            <Stat label="Pending" value={activeOrders.filter(o=>o.status==="Pending").length} color={C.amber}/>

            <Stat label="Total Units" value={activeOrders.reduce((s,o)=>s+totalUnits(o.items),0)}/>

          </div>

          <div style={{background:C.bg,borderRadius:16,padding:"16px 20px",marginBottom:20,display:"flex",gap:12,flexWrap:"wrap",alignItems:"center",border:`1px solid ${C.border}`}}>

            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search orders…" style={{background:C.bg2,border:`1px solid ${C.border}`,color:C.text,borderRadius:10,padding:"9px 14px",fontFamily:font,fontSize:14,flex:1,minWidth:160,outline:"none"}}/>

            <select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)} style={{background:C.bg2,border:`1px solid ${C.border}`,color:C.text,borderRadius:10,padding:"9px 12px",fontFamily:font,fontSize:14}}>

              {["All","Active","Pending","Draft"].map(s=><option key={s}>{s}</option>)}

            </select>

            <select value={sortBy} onChange={e=>setSortBy(e.target.value)} style={{background:C.bg2,border:`1px solid ${C.border}`,color:C.text,borderRadius:10,padding:"9px 12px",fontFamily:font,fontSize:14}}>

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

          const o=orders.find(x=>x.id===selected.id)||selected;

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

              <div style={{display:"flex",gap:10,marginTop:16}}>

                <PrimaryBtn onClick={()=>setView("edit")}>Edit</PrimaryBtn>

                <button onClick={()=>handleArchive(o)} style={{background:C.bg2,color:C.text,border:`1px solid ${C.border}`,borderRadius:10,padding:"11px 18px",cursor:"pointer",fontFamily:font,fontSize:14}}>{o.status==="Archived"?"Restore":"Archive"}</button>

                <DestructBtn onClick={()=>setDeleteTarget(o)}>Delete</DestructBtn>

              </div>

            </div>

          );

        })()}

      </Wrap>

      {deleteTarget&&<Modal onClose={()=>setDeleteTarget(null)}><div style={{fontSize:18,fontWeight:700,marginBottom:8}}>Delete this order?</div><div style={{color:C.sub,fontSize:14,marginBottom:24}}>Order #{deleteTarget.id} from <strong>{deleteTarget.ownerName}</strong> will be permanently removed.</div><div style={{display:"flex",gap:10}}><GhostBtn onClick={()=>setDeleteTarget(null)} style={{flex:1,color:C.sub}}>Cancel</GhostBtn><button onClick={()=>handleDelete(deleteTarget.id)} style={{flex:1,background:C.red,color:C.white,border:"none",borderRadius:10,padding:"11px",cursor:"pointer",fontFamily:font,fontWeight:600,fontSize:15}}>Delete</button></div></Modal>}

      <Toast toasts={toasts}/>

    </div>

  );

}
