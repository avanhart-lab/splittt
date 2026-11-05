import { useState, useEffect, useRef, useCallback } from "react";

// ── HEIC CONVERSION ───────────────────────────────────────────────────────────
// Converts HEIC/HEIF files (iPhone default format) to JPEG before use.
// Falls back gracefully if heic2any isn't available or file isn't HEIC.
async function convertToJpegIfNeeded(file) {
  const isHeic = file.type === "image/heic" || file.type === "image/heif"
    || file.name?.toLowerCase().endsWith(".heic")
    || file.name?.toLowerCase().endsWith(".heif");
  if (!isHeic) return file;
  try {
    // Lazy-load heic2any from CDN
    if (!window._heic2any) {
      await new Promise((res, rej) => {
        const s = document.createElement("script");
        s.src = "https://cdnjs.cloudflare.com/ajax/libs/heic2any/0.0.4/heic2any.min.js";
        s.onload = res; s.onerror = rej;
        document.head.appendChild(s);
      });
      window._heic2any = window.heic2any;
    }
    const blob = await window._heic2any({ blob: file, toType: "image/jpeg", quality: 0.85 });
    return new File([blob], file.name.replace(/\.heic$/i, ".jpg").replace(/\.heif$/i, ".jpg"), { type: "image/jpeg" });
  } catch (e) {
    // If conversion fails, return original and let the browser try
    console.warn("HEIC conversion failed, using original:", e);
    return file;
  }
}

// ── THEMES ────────────────────────────────────────────────────────────────────
const THEMES = {
  dark: {
    bg:"#111110", surface:"#1A1A18", surfaceHover:"#222220", border:"#2A2A28",
    borderStrong:"#3A3A38", text:"#F2F0EB", textSecondary:"#888880", textMuted:"#484844",
    accent:"#E8FF47", accentText:"#111110", venmo:"#3D95CE", navBg:"rgba(17,17,16,0.95)",
    inputBg:"#1A1A18", tag:"#222220", tagText:"#888880", positive:"#4ADE80", negative:"#F87171",
    cardHighlight:"#1E1E1C",
  },
  light: {
    bg:"#F7F6F2", surface:"#FFFFFF", surfaceHover:"#F2F1ED", border:"#E8E6E0",
    borderStrong:"#D4D2CA", text:"#1A1A18", textSecondary:"#7A7870", textMuted:"#B8B6B0",
    accent:"#1A1A18", accentText:"#F7F6F2", venmo:"#3D95CE", navBg:"rgba(247,246,242,0.95)",
    inputBg:"#F2F1ED", tag:"#F2F1ED", tagText:"#7A7870", positive:"#16A34A", negative:"#DC2626",
    cardHighlight:"#FAFAF7",
  }
};

// ── GEOMETRIC ICONS ───────────────────────────────────────────────────────────
const ICON_SHAPES = [
  { id:"circle",   render:(c,s=32)=><svg width={s} height={s} viewBox="0 0 32 32"><circle cx="16" cy="16" r="11" fill={c}/></svg> },
  { id:"square",   render:(c,s=32)=><svg width={s} height={s} viewBox="0 0 32 32"><rect x="5" y="5" width="22" height="22" rx="3" fill={c}/></svg> },
  { id:"triangle", render:(c,s=32)=><svg width={s} height={s} viewBox="0 0 32 32"><polygon points="16,4 29,27 3,27" fill={c}/></svg> },
  { id:"diamond",  render:(c,s=32)=><svg width={s} height={s} viewBox="0 0 32 32"><polygon points="16,3 29,16 16,29 3,16" fill={c}/></svg> },
  { id:"hexagon",  render:(c,s=32)=><svg width={s} height={s} viewBox="0 0 32 32"><polygon points="16,2 28,9 28,23 16,30 4,23 4,9" fill={c}/></svg> },
  { id:"star",     render:(c,s=32)=><svg width={s} height={s} viewBox="0 0 32 32"><polygon points="16,2 19.5,12 30,12 21.5,18.5 24.5,29 16,23 7.5,29 10.5,18.5 2,12 12.5,12" fill={c}/></svg> },
  { id:"cross",    render:(c,s=32)=><svg width={s} height={s} viewBox="0 0 32 32"><rect x="12" y="4" width="8" height="24" rx="2" fill={c}/><rect x="4" y="12" width="24" height="8" rx="2" fill={c}/></svg> },
  { id:"ring",     render:(c,s=32)=><svg width={s} height={s} viewBox="0 0 32 32"><circle cx="16" cy="16" r="11" fill="none" stroke={c} strokeWidth="5"/></svg> },
  { id:"wave",     render:(c,s=32)=><svg width={s} height={s} viewBox="0 0 32 32"><path d="M2,16 C6,8 10,8 14,16 C18,24 22,24 26,16 C28,12 30,12 30,12 L30,28 L2,28 Z" fill={c}/></svg> },
  { id:"bolt",     render:(c,s=32)=><svg width={s} height={s} viewBox="0 0 32 32"><polygon points="18,2 8,18 15,18 14,30 24,14 17,14" fill={c}/></svg> },
];
const ICON_COLORS = ["#E8FF47","#FF6B47","#47B8FF","#B847FF","#47FFB8","#FF47A3","#FFB847","#FFFFFF","#C8C8C0","#1A1A18"];

function TripIcon({ icon, size=28 }) {
  if (!icon) return null;
  const s = ICON_SHAPES.find(x=>x.id===icon.shape)||ICON_SHAPES[0];
  return s.render(icon.color, size);
}

// ── DATA ──────────────────────────────────────────────────────────────────────
const NOW_RECEIPTS = [];
const ARCHIVED_RECEIPTS = [];
const INITIAL_TRIPS = [];
const ARCHIVED_TRIPS = [];
const FRIENDS_DATA = [];
let ALL_FRIENDS = ["EJ","Della"]; // updated at runtime from friends state

// ── STYLES ────────────────────────────────────────────────────────────────────
const STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;500;600;700;800&family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600&display=swap');
  * { box-sizing:border-box; margin:0; padding:0; }
  ::-webkit-scrollbar { display:none; }
  @keyframes fadeUp { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
  @keyframes slideUp { from{transform:translateY(100%)} to{transform:translateY(0)} }
  @keyframes scaleIn { from{transform:scale(0.97);opacity:0} to{transform:scale(1);opacity:1} }
  @keyframes fadeIn { from{opacity:0} to{opacity:1} }
  .fu { animation:fadeUp 0.32s cubic-bezier(0.16,1,0.3,1) forwards; opacity:0; }
  .su { animation:slideUp 0.38s cubic-bezier(0.16,1,0.3,1) forwards; }
  .si { animation:scaleIn 0.22s cubic-bezier(0.16,1,0.3,1) forwards; }
  .fi { animation:fadeIn 0.2s ease forwards; }
  .press { transition:transform 0.1s ease,opacity 0.1s ease; cursor:pointer; -webkit-tap-highlight-color:transparent; }
  .press:active { transform:scale(0.96); }
  input,textarea,button { font-family:'DM Sans',sans-serif; }
  input:focus,button:focus,textarea:focus { outline:none; }
`;

// ── SMALL COMPONENTS ──────────────────────────────────────────────────────────
function Avatar({ name, size=28, t }) {
  return <div style={{ width:size, height:size, borderRadius:size*0.32, background:t.border, border:`1.5px solid ${t.borderStrong}`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:size*0.38, fontWeight:600, color:t.textSecondary, flexShrink:0, fontFamily:"'Syne',sans-serif" }}>{name[0].toUpperCase()}</div>;
}

function AvatarStack({ people, size=22, t }) {
  return (
    <div style={{ display:"flex" }}>
      {people.slice(0,4).map((p,i)=>(
        <div key={p} style={{ marginLeft:i>0?-size*0.3:0, zIndex:people.length-i, width:size, height:size, borderRadius:size*0.32, background:t.surface, border:`1.5px solid ${t.bg}`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:size*0.38, fontWeight:600, color:t.textSecondary }}>{p[0].toUpperCase()}</div>
      ))}
      {people.length>4&&<div style={{ marginLeft:-size*0.3, width:size, height:size, borderRadius:size*0.32, background:t.tag, border:`1.5px solid ${t.bg}`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:size*0.32, color:t.textMuted }}>+{people.length-4}</div>}
    </div>
  );
}

function Label({ children, t }) {
  return <div style={{ fontSize:11, fontWeight:600, color:t.textMuted, letterSpacing:0.8, textTransform:"uppercase", marginBottom:9 }}>{children}</div>;
}

function Pill({ children, active, color, t, onClick }) {
  return <button onClick={onClick} className="press" style={{ padding:"6px 12px", borderRadius:8, background:active?(color||t.accent)+"22":t.inputBg, border:`1px solid ${active?(color||t.accent):t.border}`, fontSize:12, fontWeight:active?600:400, color:active?(color||t.accent):t.textSecondary }}>{children}</button>;
}

function SheetHandle({ t }) {
  return <div style={{ display:"flex", justifyContent:"center", padding:"12px 0 0" }}><div style={{ width:36, height:4, background:t.border, borderRadius:2 }} /></div>;
}

function Overlay({ children, onClose, t }) {
  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.48)", zIndex:300, display:"flex", flexDirection:"column", justifyContent:"flex-end" }} onClick={onClose}>
      <div className="su" onClick={e=>e.stopPropagation()} style={{ background:t.bg, borderRadius:"20px 20px 0 0", border:`1px solid ${t.border}`, maxHeight:"92vh", overflowY:"auto", paddingBottom:48 }}>
        {children}
      </div>
    </div>
  );
}

function SheetHeader({ title, sub, onClose, t }) {
  return (
    <div style={{ padding:"16px 22px 0", display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:22 }}>
      <div>
        <div style={{ fontSize:18, fontWeight:700, fontFamily:"'Syne',sans-serif", color:t.text }}>{title}</div>
        {sub && <div style={{ fontSize:12, color:t.textSecondary, marginTop:2 }}>{sub}</div>}
      </div>
      <button onClick={onClose} className="press" style={{ background:t.surface, border:`1px solid ${t.border}`, color:t.textSecondary, width:30, height:30, borderRadius:8, fontSize:13, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>✕</button>
    </div>
  );
}

function InputField({ label, value, onChange, placeholder, type="text", prefix, large, t }) {
  const base = { width:"100%", background:t.inputBg, border:`1px solid ${t.border}`, borderRadius:10, padding:"12px 14px", color:t.text, fontSize:large?20:14, fontFamily:"'DM Sans',sans-serif", fontWeight:large?600:400 };
  return (
    <div>
      {label && <Label t={t}>{label}</Label>}
      <div style={{ position:"relative" }}>
        {prefix&&<span style={{ position:"absolute", left:14, top:"50%", transform:"translateY(-50%)", color:t.textSecondary, fontSize:15 }}>{prefix}</span>}
        <input value={value} onChange={onChange} type={type} placeholder={placeholder} style={{...base, paddingLeft:prefix?28:14}} />
      </div>
    </div>
  );
}

function ActionBtn({ onClick, children, secondary, t, style={} }) {
  return <button onClick={onClick} className="press" style={{ width:"100%", padding:"14px", background:secondary?t.surface:t.accent, border:`1px solid ${secondary?t.border:t.accent}`, borderRadius:12, color:secondary?t.text:t.accentText, fontSize:14, fontWeight:600, fontFamily:"'Syne',sans-serif", ...style }}>{children}</button>;
}

function IconPicker({ value, onChange, t }) {
  return (
    <div>
      <div style={{ display:"flex", gap:7, flexWrap:"wrap", marginBottom:12 }}>
        {ICON_SHAPES.map(s=>(
          <button key={s.id} className="press" onClick={()=>onChange({...value,shape:s.id})} style={{ width:42, height:42, borderRadius:10, background:value.shape===s.id?t.accent+"22":t.inputBg, border:`1.5px solid ${value.shape===s.id?t.accent:t.border}`, display:"flex", alignItems:"center", justifyContent:"center" }}>
            {s.render(value.shape===s.id?value.color:t.textSecondary, 22)}
          </button>
        ))}
      </div>
      <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
        {ICON_COLORS.map(c=>(
          <button key={c} className="press" onClick={()=>onChange({...value,color:c})} style={{ width:26, height:26, borderRadius:6, background:c, border:value.color===c?`2.5px solid ${t.text}`:`2px solid ${t.border}` }} />
        ))}
      </div>
    </div>
  );
}


// ── AI RECEIPT SCANNER ────────────────────────────────────────────────────────
// Resize image to max 1600px and convert to JPEG before sending to API
async function resizeImageToBase64(dataUrl, maxPx = 1600, quality = 0.82) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w; canvas.height = h;
      canvas.getContext("2d").drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => resolve(dataUrl); // fallback: use original
    img.src = dataUrl;
  });
}

async function scanReceiptWithAI(base64Image) {
  // Always resize + normalise to JPEG before sending
  const resized = await resizeImageToBase64(base64Image);
  const b64 = resized.split(",")[1];

  const prompt = `You are a receipt parser. Analyze this receipt image and extract all line items.
Return ONLY valid JSON, no markdown, no explanation, no code fences. Use this exact schema:
{
  "restaurantName": "string",
  "items": [
    { "id": "1", "name": "string", "price": 0.00, "quantity": 1 }
  ],
  "subtotal": 0.00,
  "tax": 0.00,
  "tip": 0.00,
  "total": 0.00
}
Rules:
- "price" is the UNIT price for ONE of that item, NOT the line total
- "quantity" is the number of that item ordered
- Example: "2x Latte à 4.50 CHF 9.00" → name:"Latte", price:4.50, quantity:2
- Example: "3 Beers 6.00" (total) → name:"Beer", price:2.00, quantity:3
- European receipts often show: [qty]x [name] à [unit price] [currency] [line total] — always use the unit price
- If only a line total is shown with no unit price, divide by quantity to get unit price
- Include every line item you can read
- If you cannot determine tip separately, set tip to 0
- If tax is embedded, estimate it
- Keep item names concise (max 30 chars)
- Ignore header info, table numbers, server names, addresses
- If the image is not a receipt or is unreadable, return { "error": "Could not read receipt" }
- Your entire response must be valid JSON and nothing else`;

  let response;
  try {
    response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": (import.meta.env.VITE_ANTHROPIC_KEY || window.__ANTHROPIC_KEY__ || ""),
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5",
        max_tokens: 1024,
        messages: [{
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: "image/jpeg", data: b64 } },
            { type: "text", text: prompt }
          ]
        }]
      })
    });
  } catch (networkErr) {
    throw new Error("Network error — check your connection");
  }

  if (!response.ok) {
    const errBody = await response.text().catch(() => "");
    throw new Error(`API error ${response.status}: ${errBody.slice(0, 120)}`);
  }

  const data = await response.json();

  if (!data.content || data.content.length === 0) {
    throw new Error("Empty response from AI");
  }

  const raw = data.content.map(b => b.text || "").join("").trim();

  // Strip any accidental markdown fences or leading/trailing whitespace
  const clean = raw
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();

  // Find the JSON object even if there's surrounding text
  const jsonMatch = clean.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("No JSON found in response");

  try {
    return JSON.parse(jsonMatch[0]);
  } catch {
    throw new Error("Could not parse receipt data");
  }
}

// ── ITEMIZED SPLIT FLOW ───────────────────────────────────────────────────────
// Person colors — all readable on both dark and light bg, none yellow
const PERSON_COLORS = ["#60A5FA","#F97316","#A78BFA","#34D399","#F472B6","#FB923C"];

function ItemizedSplitter({ scanResult, people, onConfirm, onBack, tripCurrency="USD", t }) {
  const currSymbol = CURRENCIES.find(c=>c.code===tripCurrency)?.symbol || tripCurrency + " ";
  const [items, setItems] = useState(
    (scanResult.items || []).map((item, i) => ({
      ...item,
      id: item.id || String(i),
      assignedTo: new Set(),
      editing: false,
      editName: item.name,
      editPrice: String(item.price)
    }))
  );
  const [tax, setTax] = useState(scanResult.tax || 0);
  const [tip, setTip] = useState(scanResult.tip || 0);
  const [editingTax, setEditingTax] = useState(false);
  const [editingTip, setEditingTip] = useState(false);
  const [editTaxVal, setEditTaxVal] = useState(String(scanResult.tax || 0));
  const [editTipVal, setEditTipVal] = useState(String(scanResult.tip || 0));

  const toggleItemForPerson = (itemId, person) => {
    setItems(prev => prev.map(it => {
      if (it.id !== itemId) return it;
      const next = new Set(it.assignedTo);
      next.has(person) ? next.delete(person) : next.add(person);
      return { ...it, assignedTo: next };
    }));
  };

  const saveItemEdit = (itemId) => {
    setItems(prev => prev.map(it => {
      if (it.id !== itemId) return it;
      return { ...it, name: it.editName, price: parseFloat(it.editPrice) || it.price, editing: false };
    }));
  };

  const addManualItem = () => {
    const id = String(Date.now());
    setItems(prev => [...prev, { id, name: "New item", price: 0, quantity: 1, assignedTo: new Set(), editing: true, editName: "New item", editPrice: "0" }]);
  };

  const removeItem = (itemId) => setItems(prev => prev.filter(it => it.id !== itemId));

  const subtotal = items.reduce((a, it) => a + it.price * it.quantity, 0);
  const grandTotal = subtotal + tax + tip;

  // Tax and tip split EVENLY across all people regardless of what they ordered
  const taxPerPerson = people.length > 0 ? tax / people.length : 0;
  const tipPerPerson = people.length > 0 ? tip / people.length : 0;

  const personTotals = people.reduce((acc, person) => {
    const mine = items.filter(it => it.assignedTo.has(person));
    const itemSub = mine.reduce((a, it) => a + (it.price * it.quantity) / it.assignedTo.size, 0);
    acc[person] = itemSub + taxPerPerson + tipPerPerson;
    return acc;
  }, {});

  // Per-person item subtotal (before tax/tip) for the breakdown display
  const personItemSubs = people.reduce((acc, person) => {
    const mine = items.filter(it => it.assignedTo.has(person));
    acc[person] = mine.reduce((a, it) => a + (it.price * it.quantity) / it.assignedTo.size, 0);
    return acc;
  }, {});

  const unassigned = items.filter(it => it.assignedTo.size === 0);
  const myTotal = personTotals["you"] || 0;

  const handleConfirm = () => {
    onConfirm({
      items: items.map(it => ({ id:it.id, name:it.name, price:it.price, quantity:it.quantity, assignedTo:[...it.assignedTo] })),
      tax, tip, subtotal, total:grandTotal, personTotals, yourShare:personTotals["you"]||0
    });
  };

  return (
    <div style={{ display:"flex", flexDirection:"column", flex:1, minHeight:0 }}>
      {/* Legend strip */}
      <div style={{ padding:"10px 22px 12px", borderBottom:`1px solid ${t.border}`, display:"flex", gap:10, overflowX:"auto" }}>
        {people.map((p, i) => (
          <div key={p} style={{ flexShrink:0, display:"flex", alignItems:"center", gap:6 }}>
            <div style={{ width:10, height:10, borderRadius:3, background:PERSON_COLORS[i % PERSON_COLORS.length] }}/>
            <span style={{ fontSize:12, color:t.textSecondary }}>{p==="you"?"you":`${p}`}</span>
            {personTotals[p]>0&&<span style={{ fontSize:11, fontWeight:600, color:t.text }}>{currSymbol}{personTotals[p].toFixed(2)}</span>}
          </div>
        ))}
      </div>

      {/* Items list */}
      <div style={{ flex:1, overflowY:"auto", padding:"12px 22px" }}>
        {unassigned.length > 0 && (
          <div style={{ background:"#F8717122", border:"1px solid #F8717155", borderRadius:9, padding:"8px 12px", marginBottom:10, fontSize:12, color:"#F87171", display:"flex", alignItems:"center", gap:6 }}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><circle cx="6" cy="6" r="5" stroke="#F87171" strokeWidth="1.2"/><path d="M6 4v3M6 8.5v.5" stroke="#F87171" strokeWidth="1.2" strokeLinecap="round"/></svg>
            {unassigned.length} item{unassigned.length>1?"s":""} unclaimed
          </div>
        )}

        {items.map((item) => {
          const assignedArr = [...item.assignedTo];
          const claimed = assignedArr.length > 0;
          const perPersonAmt = claimed ? (item.price * item.quantity) / assignedArr.length : item.price * item.quantity;

          return (
            <div key={item.id} style={{
              background: claimed ? t.surface : t.inputBg,
              border: `1px solid ${claimed ? t.border : t.border}`,
              borderRadius:12, padding:"11px 12px", marginBottom:7,
              opacity: item.editing ? 1 : 1,
            }}>
              {item.editing ? (
                <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                  <input value={item.editName} onChange={e=>setItems(prev=>prev.map(it=>it.id===item.id?{...it,editName:e.target.value}:it))}
                    style={{ background:t.bg, border:`1px solid ${t.border}`, borderRadius:8, padding:"8px 10px", color:t.text, fontSize:13, width:"100%" }} autoFocus/>
                  <div style={{ display:"flex", gap:8 }}>
                    <div style={{ position:"relative", flex:1 }}>
                      <span style={{ position:"absolute", left:10, top:"50%", transform:"translateY(-50%)", color:t.textSecondary, fontSize:13 }}>$</span>
                      <input value={item.editPrice} onChange={e=>setItems(prev=>prev.map(it=>it.id===item.id?{...it,editPrice:e.target.value}:it))}
                        type="number" style={{ background:t.bg, border:`1px solid ${t.border}`, borderRadius:8, padding:"8px 10px 8px 22px", color:t.text, fontSize:13, width:"100%" }}/>
                    </div>
                    <button className="press" onClick={()=>saveItemEdit(item.id)} style={{ padding:"8px 14px", background:t.text, border:"none", borderRadius:8, color:t.bg, fontSize:12, fontWeight:600 }}>Save</button>
                    <button className="press" onClick={()=>removeItem(item.id)} style={{ padding:"8px 10px", background:"none", border:`1px solid ${t.border}`, borderRadius:8, color:"#F87171", fontSize:12 }}>✕</button>
                  </div>
                </div>
              ) : (
                <>
                  {/* Top row: name + price + edit */}
                  <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", marginBottom:9 }}>
                    <div style={{ flex:1, minWidth:0, paddingRight:10 }}>
                      <div style={{ fontSize:13, fontWeight:500, color:t.text, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                        {item.quantity>1?`${item.quantity}× `:""}{item.name}
                      </div>
                      {assignedArr.length>1&&(
                        <div style={{ fontSize:11, color:t.textSecondary, marginTop:2 }}>
                          {currSymbol}{perPersonAmt.toFixed(2)} each · split {assignedArr.length} ways
                        </div>
                      )}
                    </div>
                    <div style={{ display:"flex", alignItems:"center", gap:6, flexShrink:0 }}>
                      <span style={{ fontSize:13, fontWeight:600, color:t.text, fontFamily:"'Syne',sans-serif" }}>{currSymbol}{(item.price*item.quantity).toFixed(2)}</span>
                      <button className="press" onClick={()=>setItems(prev=>prev.map(it=>it.id===item.id?{...it,editing:true,editName:it.name,editPrice:String(it.price)}:it))}
                        style={{ width:22, height:22, borderRadius:6, background:t.bg, border:`1px solid ${t.border}`, color:t.textMuted, fontSize:10, display:"flex", alignItems:"center", justifyContent:"center" }}>✎</button>
                    </div>
                  </div>

                  {/* Per-person toggle buttons — one per person, tap to claim */}
                  <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                    {people.map((p, pi) => {
                      const sel = item.assignedTo.has(p);
                      const color = PERSON_COLORS[pi % PERSON_COLORS.length];
                      return (
                        <button key={p} className="press" onClick={()=>toggleItemForPerson(item.id, p)} style={{
                          display:"flex", alignItems:"center", gap:5,
                          padding:"5px 10px", borderRadius:20,
                          background: sel ? color : "transparent",
                          border: `1.5px solid ${sel ? color : t.borderStrong}`,
                          transition:"all 0.12s ease",
                        }}>
                          {sel && (
                            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                              <path d="M2 5l2 2 4-4" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          )}
                          <span style={{ fontSize:11, fontWeight:sel?600:400, color:sel?"#fff":t.textSecondary }}>
                            {p==="you"?"you":p}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          );
        })}

        <button className="press" onClick={addManualItem} style={{ width:"100%", padding:"10px", background:"none", border:`1px dashed ${t.borderStrong}`, borderRadius:10, color:t.textSecondary, fontSize:12, fontWeight:500, display:"flex", alignItems:"center", justifyContent:"center", gap:6, marginTop:2 }}>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M6 1v10M1 6h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
          Add item
        </button>

        {/* Tax & Tip */}
        <div style={{ marginTop:14, background:t.surface, border:`1px solid ${t.border}`, borderRadius:12, overflow:"hidden" }}>
          {[
            { label:"Subtotal", value:subtotal },
            { label:"Tax", value:tax, editable:true, editing:editingTax, onEdit:()=>{setEditingTax(true);setEditTaxVal(String(tax));}, editVal:editTaxVal, setEditVal:setEditTaxVal, onSave:()=>{setTax(parseFloat(editTaxVal)||0);setEditingTax(false);}, split: people.length > 0 ? `÷${people.length} = ${currSymbol}{taxPerPerson.toFixed(2)} each` : null },
            { label:"Tip", value:tip, editable:true, editing:editingTip, onEdit:()=>{setEditingTip(true);setEditTipVal(String(tip));}, editVal:editTipVal, setEditVal:setEditTipVal, onSave:()=>{setTip(parseFloat(editTipVal)||0);setEditingTip(false);}, split: people.length > 0 ? `÷${people.length} = ${currSymbol}{tipPerPerson.toFixed(2)} each` : null },
            { label:"Total", value:grandTotal, bold:true },
          ].map((row, i, arr) => (
            <div key={row.label} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"10px 14px", borderBottom:i<arr.length-1?`1px solid ${t.border}`:"none" }}>
              <div>
                <span style={{ fontSize:13, color:row.bold?t.text:t.textSecondary, fontWeight:row.bold?600:400 }}>{row.label}</span>
                {row.split && !row.editing && (
                  <div style={{ fontSize:10, color:t.textMuted, marginTop:2 }}>{row.split}</div>
                )}
              </div>
              {row.editable && row.editing ? (
                <div style={{ display:"flex", gap:6, alignItems:"center" }}>
                  <div style={{ position:"relative" }}>
                    <span style={{ position:"absolute", left:7, top:"50%", transform:"translateY(-50%)", color:t.textSecondary, fontSize:12 }}>{currSymbol}</span>
                    <input autoFocus value={row.editVal} onChange={e=>row.setEditVal(e.target.value)} type="number"
                      style={{ width:80, background:t.inputBg, border:`1px solid ${t.border}`, borderRadius:7, padding:"5px 8px 5px 18px", color:t.text, fontSize:13, fontWeight:600 }}/>
                  </div>
                  <button className="press" onClick={row.onSave} style={{ padding:"5px 10px", background:t.text, border:"none", borderRadius:7, color:t.bg, fontSize:11, fontWeight:600 }}>OK</button>
                </div>
              ) : (
                <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                  <span style={{ fontSize:13, fontWeight:row.bold?700:500, color:t.text, fontFamily:"'Syne',sans-serif" }}>{currSymbol}{row.value.toFixed(2)}</span>
                  {row.editable && <button className="press" onClick={row.onEdit} style={{ width:20, height:20, borderRadius:5, background:t.inputBg, border:`1px solid ${t.border}`, color:t.textMuted, fontSize:10, display:"flex", alignItems:"center", justifyContent:"center" }}>✎</button>}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Per-person breakdown — shows items + tax share + tip share */}
        <div style={{ marginTop:10, background:t.surface, border:`1px solid ${t.border}`, borderRadius:12, overflow:"hidden" }}>
          <div style={{ padding:"10px 14px", borderBottom:`1px solid ${t.border}`, fontSize:11, fontWeight:600, color:t.textMuted, letterSpacing:0.8, textTransform:"uppercase" }}>Your breakdown</div>
          {people.map((p, i) => {
            const itemSub = personItemSubs[p] || 0;
            const total = personTotals[p] || 0;
            const color = PERSON_COLORS[i % PERSON_COLORS.length];
            return (
              <div key={p} style={{ borderBottom:i<people.length-1?`1px solid ${t.border}`:"none" }}>
                {/* Person header row */}
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"11px 14px 4px" }}>
                  <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                    <div style={{ width:10, height:10, borderRadius:3, background:color, flexShrink:0 }}/>
                    <span style={{ fontSize:13, fontWeight:600, color:t.text }}>{p==="you"?"you":`${p}`}</span>
                  </div>
                  <span style={{ fontSize:14, fontWeight:700, color:t.text, fontFamily:"'Syne',sans-serif" }}>{currSymbol}{total.toFixed(2)}</span>
                </div>
                {/* Math breakdown */}
                <div style={{ padding:"0 14px 11px 32px", display:"flex", flexDirection:"column", gap:3 }}>
                  <div style={{ display:"flex", justifyContent:"space-between" }}>
                    <span style={{ fontSize:11, color:t.textMuted }}>Items</span>
                    <span style={{ fontSize:11, color:t.textSecondary }}>{currSymbol}{itemSub.toFixed(2)}</span>
                  </div>
                  {tax > 0 && (
                    <div style={{ display:"flex", justifyContent:"space-between" }}>
                      <span style={{ fontSize:11, color:t.textMuted }}>Tax (÷{people.length})</span>
                      <span style={{ fontSize:11, color:t.textSecondary }}>+ {currSymbol}{taxPerPerson.toFixed(2)}</span>
                    </div>
                  )}
                  {tip > 0 && (
                    <div style={{ display:"flex", justifyContent:"space-between" }}>
                      <span style={{ fontSize:11, color:t.textMuted }}>Tip (÷{people.length})</span>
                      <span style={{ fontSize:11, color:t.textSecondary }}>+ {currSymbol}{tipPerPerson.toFixed(2)}</span>
                    </div>
                  )}
                  <div style={{ display:"flex", justifyContent:"space-between", borderTop:`1px solid ${t.border}`, paddingTop:4, marginTop:2 }}>
                    <span style={{ fontSize:11, fontWeight:600, color:t.textSecondary }}>Total</span>
                    <span style={{ fontSize:11, fontWeight:600, color:t.text }}>{currSymbol}{total.toFixed(2)}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <div style={{ height:20 }}/>
      </div>

      {/* Footer */}
      <div style={{ padding:"13px 22px", borderTop:`1px solid ${t.border}`, background:t.bg, display:"flex", gap:10 }}>
        <button className="press" onClick={onBack} style={{ flex:1, padding:"13px", background:t.surface, border:`1px solid ${t.border}`, borderRadius:11, color:t.text, fontSize:13, fontWeight:500 }}>Back</button>
        <button className="press" onClick={handleConfirm} style={{ flex:2, padding:"13px", background:t.accent, border:"none", borderRadius:11, color:t.accentText, fontSize:13, fontWeight:600, fontFamily:"'Syne',sans-serif" }}>
          Confirm — you owe {currSymbol}{myTotal.toFixed(2)}
        </button>
      </div>
    </div>
  );
}

// ── PAY STEP ─────────────────────────────────────────────────────────────────
function PayStep({ receipt, onClose, onBack, venmoHandle="", zelleHandle="", t }) {
  const [method, setMethod] = useState("venmo");
  const VENMO_COLOR = "#3D95CE";
  const ZELLE_COLOR = "#6D1ED4";
  const activeColor = method === "venmo" ? VENMO_COLOR : ZELLE_COLOR;

  const payers = Array.isArray(receipt.payer) ? receipt.payer : [receipt.payer || "you"];
  const youArePayer = payers.includes("you");
  const personTotals = receipt.personTotals || null;
  const allPeople = receipt.people || [];
  const total = receipt.total || 0;
  const yourShare = receipt.yourShare || 0;
  const note = receipt.name || "sp/itt.";
  const nonPayers = allPeople.filter(p => !payers.includes(p));
  const payersToPayBack = payers.filter(p => p !== "you");

  // Request link: send to YOUR venmo handle so others know where to pay
  // Pay link: send to the payer's handle stored on the receipt, fallback to their name
  const myVenmo = venmoHandle.replace(/^@/, "") || "me";
  const myZelle = zelleHandle || "";

  const venmoPayLink = (recipientHandle, amount, n) => {
    const clean = (recipientHandle || "").replace(/^@/, "");
    return clean ? `https://venmo.com/u/${encodeURIComponent(clean)}` : "https://venmo.com/";
  };
  const venmoRequestLink = (amount, n) =>
    `https://venmo.com/u/${encodeURIComponent(myVenmo)}`;
  const zellePayLink = (recipientHandle, amount) => {
    const clean = (recipientHandle || "").replace(/^@/, "");
    return `zelle://send?recipients=${encodeURIComponent(clean)}&amount=${amount.toFixed(2)}`;
  };
  const zelleRequestLink = (amount) =>
    `zelle://request?recipients=${encodeURIComponent(myZelle)}&amount=${amount.toFixed(2)}`;

  const MethodToggle = () => (
    <div style={{ display:"flex", gap:6, background:t.surface, border:`1px solid ${t.border}`, borderRadius:12, padding:4 }}>
      {[
        { id:"venmo", label:"Venmo", color:VENMO_COLOR, logo:<svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M12.5 2C11.3 4.5 9.5 7.4 8 9.2L6.2 4H2.5L5.5 14h3.8C11.5 11 14 6.5 14 4c0-1-.5-1.8-1.5-2z" fill="#fff"/></svg> },
        { id:"zelle", label:"Zelle",  color:ZELLE_COLOR, logo:<svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M3 3h10v2.5L6.5 10H13v3H3v-2.5L9.5 6H3V3z" fill="#fff"/></svg> },
      ].map(opt => (
        <button key={opt.id} className="press" onClick={()=>setMethod(opt.id)} style={{ flex:1, padding:"10px", borderRadius:9, border:"none", background:method===opt.id?opt.color:"transparent", display:"flex", alignItems:"center", justifyContent:"center", gap:7, transition:"all 0.18s ease" }}>
          {method===opt.id && opt.logo}
          <span style={{ fontSize:14, fontWeight:600, color:method===opt.id?"#fff":t.textSecondary }}>{opt.label}</span>
        </button>
      ))}
    </div>
  );

  const SavedBadge = () => (
    <div style={{ display:"flex", alignItems:"center", gap:6, background:"#34D39922", borderRadius:8, padding:"5px 10px" }}>
      <svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M2 6l2.5 2.5 5.5-5" stroke="#34D399" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
      <span style={{ fontSize:11, fontWeight:600, color:"#34D399" }}>Saved</span>
    </div>
  );

  // ── You owe someone else ────────────────────────────────────────────────────
  if (!youArePayer) {
    const perPayer = payersToPayBack.length > 0 ? yourShare / payersToPayBack.length : yourShare;
    return (
      <div className="su" style={{ background:t.bg, borderRadius:"20px 20px 0 0", border:`1px solid ${t.border}`, maxHeight:"92vh", display:"flex", flexDirection:"column" }}>
        <SheetHandle t={t}/>
        <div style={{ padding:"14px 22px", borderBottom:`1px solid ${t.border}`, display:"flex", justifyContent:"space-between", alignItems:"center", flexShrink:0 }}>
          <div>
            <div style={{ fontSize:17, fontWeight:700, fontFamily:"'Syne',sans-serif", color:t.text }}>Pay your share</div>
            <div style={{ fontSize:12, color:t.textSecondary, marginTop:2 }}>{receipt.name}</div>
          </div>
          <SavedBadge/>
        </div>
        <div style={{ overflowY:"auto", flex:1, padding:"16px 22px 0" }}>
          <div style={{ display:"flex", flexDirection:"column", gap:14, paddingBottom:32 }}>
            <div style={{ background:t.surface, border:`1px solid ${t.border}`, borderRadius:14, padding:"22px", textAlign:"center" }}>
              <div style={{ fontSize:12, color:t.textSecondary, marginBottom:6 }}>
                {payers.length > 1
                  ? `Covered by ${payers.map(p => p==="you"?"you":`${p}`).join(" & ")}`
                  : `${payersToPayBack[0]} covered the bill`}
              </div>
              <div style={{ fontSize:48, fontWeight:800, fontFamily:"'Syne',sans-serif", color:t.text, lineHeight:1 }}>${yourShare.toFixed(2)}</div>
              <div style={{ fontSize:13, color:t.textSecondary, marginTop:8 }}>your share</div>
            </div>
            <MethodToggle/>
            <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
              {payersToPayBack.map(p => (
                <button key={p} className="press" onClick={()=>window.open(method==="venmo"?venmoPayLink(p, perPayer, note):zellePayLink(p, perPayer), "_blank")} style={{ width:"100%", padding:"15px", background:activeColor, border:"none", borderRadius:12, color:"#fff", fontSize:15, fontWeight:700, fontFamily:"'Syne',sans-serif", display:"flex", alignItems:"center", justifyContent:"center", gap:8 }}>
                  {method==="venmo" ? <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M12.5 2C11.3 4.5 9.5 7.4 8 9.2L6.2 4H2.5L5.5 14h3.8C11.5 11 14 6.5 14 4c0-1-.5-1.8-1.5-2z" fill="#fff"/></svg> : <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 3h10v2.5L6.5 10H13v3H3v-2.5L9.5 6H3V3z" fill="#fff"/></svg>}
                  Pay @{p} ${perPayer.toFixed(2)}
                </button>
              ))}
            </div>
            <div style={{ display:"flex", gap:10 }}>
              {onBack && <button className="press" onClick={onBack} style={{ flex:1, padding:"12px", background:"none", border:`1px solid ${t.border}`, borderRadius:11, color:t.textSecondary, fontSize:13, fontWeight:500, display:"flex", alignItems:"center", justifyContent:"center", gap:5 }}>
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M7.5 2L3.5 6l4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
                Back
              </button>}
              <button className="press" onClick={onClose} style={{ flex:2, padding:"12px", background:"none", border:`1px solid ${t.border}`, borderRadius:11, color:t.textSecondary, fontSize:13, fontWeight:500 }}>I'll pay later</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── You paid — request from everyone else ───────────────────────────────────
  const yourCut = personTotals?.["you"] || (allPeople.length > 0 ? total / allPeople.length : total);

  return (
    <div className="su" style={{ background:t.bg, borderRadius:"20px 20px 0 0", border:`1px solid ${t.border}`, maxHeight:"92vh", display:"flex", flexDirection:"column" }}>
      <SheetHandle t={t}/>
      <div style={{ padding:"14px 22px", borderBottom:`1px solid ${t.border}`, display:"flex", justifyContent:"space-between", alignItems:"center", flexShrink:0 }}>
        <div>
          <div style={{ fontSize:17, fontWeight:700, fontFamily:"'Syne',sans-serif", color:t.text }}>Request payment</div>
          <div style={{ fontSize:12, color:t.textSecondary, marginTop:2 }}>{receipt.name}</div>
        </div>
        <SavedBadge/>
      </div>
      <div style={{ overflowY:"auto", flex:1, padding:"14px 22px 0" }}>
        <div style={{ display:"flex", flexDirection:"column", gap:14, paddingBottom:32 }}>

          {/* Breakdown table */}
          <div style={{ background:t.surface, border:`1px solid ${t.border}`, borderRadius:14, overflow:"hidden" }}>
            <div style={{ padding:"11px 16px", borderBottom:`1px solid ${t.border}`, fontSize:11, fontWeight:600, color:t.textMuted, letterSpacing:0.8, textTransform:"uppercase" }}>Breakdown</div>
            {payers.map(p => {
              const cut = personTotals?.[p] || (allPeople.length > 0 ? total / allPeople.length : 0);
              return (
                <div key={p} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"13px 16px", borderBottom:`1px solid ${t.border}`, background:t.accent+"0A" }}>
                  <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                    <div style={{ width:34, height:34, borderRadius:9, background:t.accent, display:"flex", alignItems:"center", justifyContent:"center", fontSize:13, fontWeight:700, color:t.accentText }}>
                      {p==="you" ? "✓" : p[0].toUpperCase()}
                    </div>
                    <div>
                      <div style={{ fontSize:13, fontWeight:600, color:t.text }}>{p==="you"?"you 💳":`${p} 💳`}</div>
                      <div style={{ fontSize:11, color:t.textMuted }}>paid</div>
                    </div>
                  </div>
                  <span style={{ fontSize:15, fontWeight:700, fontFamily:"'Syne',sans-serif", color:t.accent }}>${cut.toFixed(2)}</span>
                </div>
              );
            })}
            {nonPayers.map((p, i) => {
              const amt = personTotals?.[p] || (allPeople.length > 0 ? total / allPeople.length : 0);
              const color = PERSON_COLORS[i % PERSON_COLORS.length];
              const venmoUrl = `https://venmo.com/u/${encodeURIComponent(p)}`;
              const zelleUrl = `https://enroll.zellepay.com/`;
              return (
                <div key={p} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"13px 16px", borderBottom:i < nonPayers.length-1 ? `1px solid ${t.border}` : "none" }}>
                  <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                    <div style={{ width:34, height:34, borderRadius:9, background:color+"22", border:`1.5px solid ${color}`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:13, fontWeight:700, color }}>{p[0].toUpperCase()}</div>
                    <div>
                      <div style={{ fontSize:13, fontWeight:500, color:t.text }}>{p}</div>
                      <div style={{ fontSize:11, color:t.textMuted }}>owes you</div>
                    </div>
                  </div>
                  <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                    <span style={{ fontSize:15, fontWeight:700, fontFamily:"'Syne',sans-serif", color:t.text }}>${amt.toFixed(2)}</span>
                    <button className="press" onClick={()=>window.open(venmoUrl, "_blank")} style={{ width:28, height:28, borderRadius:7, background:"#3D95CE", border:"none", display:"flex", alignItems:"center", justifyContent:"center" }}>
                      <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M12.5 2C11.3 4.5 9.5 7.4 8 9.2L6.2 4H2.5L5.5 14h3.8C11.5 11 14 6.5 14 4c0-1-.5-1.8-1.5-2z" fill="#fff"/></svg>
                    </button>
                    <button className="press" onClick={()=>window.open(zelleUrl, "_blank")} style={{ width:28, height:28, borderRadius:7, background:"#6D1ED4", border:"none", display:"flex", alignItems:"center", justifyContent:"center" }}>
                      <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M3 3h10v2.5L6.5 10H13v3H3v-2.5L9.5 6H3V3z" fill="#fff"/></svg>
                    </button>
                  </div>
                </div>
              );
            })}
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"13px 16px", borderTop:`1px solid ${t.border}`, background:t.inputBg }}>
              <span style={{ fontSize:13, fontWeight:600, color:t.textSecondary }}>Bill total</span>
              <span style={{ fontSize:15, fontWeight:700, fontFamily:"'Syne',sans-serif", color:t.text }}>${total.toFixed(2)}</span>
            </div>
          </div>

          {nonPayers.length === 0 && (
            <div style={{ textAlign:"center", padding:"12px 0", color:t.textMuted, fontSize:13 }}>Just you on this one!</div>
          )}

          <div style={{ display:"flex", gap:10 }}>
            {onBack && <button className="press" onClick={onBack} style={{ flex:1, padding:"12px", background:"none", border:`1px solid ${t.border}`, borderRadius:11, color:t.textSecondary, fontSize:13, fontWeight:500, display:"flex", alignItems:"center", justifyContent:"center", gap:5 }}>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M7.5 2L3.5 6l4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
              Back
            </button>}
            <button className="press" onClick={onClose} style={{ flex:2, padding:"12px", background:"none", border:`1px solid ${t.border}`, borderRadius:11, color:t.textSecondary, fontSize:13, fontWeight:500 }}>Done</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── ADD RECEIPT SHEET ─────────────────────────────────────────────────────────
// Flow: capture → scanning → itemize → confirm → pay
//       (manual fallback: form → pay)
function AddReceiptSheet({ trips, onClose, onAdd, t, defaultTrip=null, venmoHandle="", zelleHandle="", homeCurrency="USD", tripCurrency="USD", exchangeRate=null }) {
  const [mode, setMode] = useState("capture"); // capture|scanning|itemize|confirm|pay|manual
  const [photo, setPhoto] = useState(null);
  const [scanResult, setScanResult] = useState(null);
  const [scanError, setScanError] = useState(null);
  const [splitResult, setSplitResult] = useState(null);
  const [savedReceipt, setSavedReceipt] = useState(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [totalManual, setTotalManual] = useState("");
  const [people, setPeople] = useState(["you"]);
  const [payer, setPayer] = useState(["you"]);
  const [trip, setTrip] = useState(defaultTrip);
  const [itemizeReady, setItemizeReady] = useState(false); // user must press Continue before item claiming
  const fileRef = useRef();

  const togglePerson = (p) => {
    if (p === "you") return;
    setPeople(prev => {
      const next = prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p];
      // if removed from people, also remove from payers
      if (!next.includes(p)) setPayer(pr => pr.filter(x => x !== p).length ? pr.filter(x => x !== p) : ["you"]);
      return next;
    });
  };

  const togglePayer = (p) => {
    setPayer(prev => {
      const next = prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p];
      return next.length ? next : [p]; // always keep at least one
    });
  };

  const tripObj = trips.find(x => x.name === trip);

  const handleFile = useCallback(async (e) => {
    let file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    file = await convertToJpegIfNeeded(file);
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const dataUrl = ev.target.result;
      setPhoto(dataUrl);
      setMode("scanning");
      setScanError(null);
      try {
        const result = await scanReceiptWithAI(dataUrl);
        if (result.error) throw new Error(result.error);
        setScanResult(result);
        setName(result.restaurantName || "");
        setMode("itemize");
      } catch (err) {
        setScanError(err.message || "Could not read receipt");
        setMode("manual");
      }
    };
    reader.readAsDataURL(file);
  }, []);

  const handleSplitConfirm = (result) => {
    setSplitResult(result);
    setItemizeReady(false);
    setMode("confirm");
  };

  const handleSave = () => {
    const rawTotal = splitResult?.total || parseFloat(totalManual) || 0;
    // Apply exchange rate if trip currency differs from home currency
    const rate = (tripCurrency !== homeCurrency && exchangeRate) ? exchangeRate : 1;
    const totalNum = rawTotal * rate;
    const yourShare = (splitResult?.yourShare ?? (people.length ? rawTotal / people.length : 0)) * rate;
    const dateStr = new Date().toLocaleDateString("en-US", { month:"short", day:"numeric" });
    const convertedPersonTotals = splitResult?.personTotals
      ? Object.fromEntries(Object.entries(splitResult.personTotals).map(([k,v]) => [k, v * rate]))
      : null;
    const newReceipt = {
      id: Date.now(), name: name || "Receipt", trip, total: totalNum, date: dateStr,
      people, yourShare, paid: false, archived: false, photoUrl: photo || null,
      tripIcon: tripObj?.icon || null, itemized: splitResult || null,
      payer, personTotals: convertedPersonTotals,
      description: description || null,
      originalTotal: rate !== 1 ? rawTotal : null,
      originalCurrency: rate !== 1 ? tripCurrency : null,
    };
    onAdd(newReceipt);
    setSavedReceipt(newReceipt);
    setMode("pay");
  };

  const canSaveManual = parseFloat(totalManual) > 0;
  const perPersonManual = people.length && parseFloat(totalManual) ? parseFloat(totalManual) / people.length : 0;

  // ── TRIP CONFIRM (saved from trip — show breakdown only, no pay) ─────────────
  if (mode === "tripconfirm" && savedReceipt) {
    const payers = Array.isArray(savedReceipt.payer) ? savedReceipt.payer : [savedReceipt.payer || "you"];
    const pt = savedReceipt.personTotals;
    const allPeople = savedReceipt.people || [];
    return (
      <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.5)", zIndex:300, display:"flex", flexDirection:"column", justifyContent:"flex-end" }}>
        <div className="su" style={{ background:t.bg, borderRadius:"20px 20px 0 0", border:`1px solid ${t.border}`, maxHeight:"85vh", display:"flex", flexDirection:"column" }}>
          <SheetHandle t={t}/>
          <div style={{ padding:"14px 22px", borderBottom:`1px solid ${t.border}`, display:"flex", justifyContent:"space-between", alignItems:"center", flexShrink:0 }}>
            <div>
              <div style={{ fontSize:17, fontWeight:700, fontFamily:"'Syne',sans-serif", color:t.text }}>{savedReceipt.name}</div>
              {savedReceipt.description && <div style={{ fontSize:13, color:t.textSecondary, marginTop:2 }}>{savedReceipt.description}</div>}
            </div>
            <div style={{ display:"flex", alignItems:"center", gap:6, background:"#34D39922", borderRadius:8, padding:"5px 10px" }}>
              <svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M2 6l2.5 2.5 5.5-5" stroke="#34D399" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
              <span style={{ fontSize:11, fontWeight:600, color:"#34D399" }}>Saved</span>
            </div>
          </div>
          <div style={{ overflowY:"auto", flex:1, padding:"16px 22px 0" }}>
            <div style={{ display:"flex", flexDirection:"column", gap:14, paddingBottom:32 }}>
              {/* Cost breakdown */}
              <div style={{ background:t.surface, border:`1px solid ${t.border}`, borderRadius:14, overflow:"hidden" }}>
                <div style={{ padding:"11px 16px", borderBottom:`1px solid ${t.border}`, fontSize:11, fontWeight:600, color:t.textMuted, letterSpacing:0.8, textTransform:"uppercase" }}>Cost breakdown</div>
                {allPeople.map((p, i) => {
                  const amt = pt?.[p] || savedReceipt.total / allPeople.length;
                  const isPayer = payers.includes(p);
                  const color = PERSON_COLORS[i % PERSON_COLORS.length];
                  return (
                    <div key={p} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"12px 16px", borderBottom:i < allPeople.length-1 ? `1px solid ${t.border}` : "none", background:isPayer?t.accent+"08":"transparent" }}>
                      <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                        <div style={{ width:32, height:32, borderRadius:9, background:isPayer?t.accent:color+"22", border:isPayer?"none":`1.5px solid ${color}`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:12, fontWeight:700, color:isPayer?t.accentText:color }}>
                          {p==="you" ? "✓" : p[0].toUpperCase()}
                        </div>
                        <div>
                          <div style={{ fontSize:13, fontWeight:isPayer?600:400, color:t.text }}>{p==="you"?"you":`${p}`}{isPayer?" 💳":""}</div>
                          <div style={{ fontSize:11, color:t.textMuted }}>{isPayer?"paid":"owes"}</div>
                        </div>
                      </div>
                      <span style={{ fontSize:15, fontWeight:700, fontFamily:"'Syne',sans-serif", color:isPayer?t.accent:t.text }}>${amt.toFixed(2)}</span>
                    </div>
                  );
                })}
                <div style={{ display:"flex", justifyContent:"space-between", padding:"11px 16px", borderTop:`1px solid ${t.border}`, background:t.inputBg }}>
                  <span style={{ fontSize:13, fontWeight:600, color:t.textSecondary }}>Total</span>
                  <span style={{ fontSize:14, fontWeight:700, fontFamily:"'Syne',sans-serif", color:t.text }}>${savedReceipt.total.toFixed(2)}</span>
                </div>
              </div>
            </div>
          </div>
          <div style={{ padding:"12px 22px 34px", borderTop:`1px solid ${t.border}`, background:t.bg, flexShrink:0 }}>
            <button className="press" onClick={onClose} style={{ width:"100%", padding:"14px", background:t.accent, border:"none", borderRadius:11, color:t.accentText, fontSize:14, fontWeight:700, fontFamily:"'Syne',sans-serif" }}>Done</button>
          </div>
        </div>
      </div>
    );
  }

  // ── PAY ──────────────────────────────────────────────────────────────────────
  if (mode === "pay" && savedReceipt) return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.5)", zIndex:300, display:"flex", flexDirection:"column", justifyContent:"flex-end" }}>
      <PayStep receipt={savedReceipt} onClose={onClose} onBack={()=>setMode("confirm")} venmoHandle={venmoHandle} zelleHandle={zelleHandle} t={t}/>
    </div>
  );

  // ── SCANNING ─────────────────────────────────────────────────────────────────
  if (mode === "scanning") return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.5)", zIndex:300, display:"flex", flexDirection:"column", justifyContent:"flex-end" }}>
      <div className="su" style={{ background:t.bg, borderRadius:"20px 20px 0 0", border:`1px solid ${t.border}` }}>
        <SheetHandle t={t}/>
        <div style={{ padding:"20px 22px 0", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <button className="press" onClick={()=>setMode("capture")} style={{ background:"none", border:"none", color:t.textSecondary, fontSize:13, fontWeight:500, display:"flex", alignItems:"center", gap:5, padding:0 }}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M9 3L5 7 9 11" stroke={t.textSecondary} strokeWidth="1.5" strokeLinecap="round"/></svg>
            Back
          </button>
        </div>
        <div style={{ padding:"16px 22px 52px", display:"flex", flexDirection:"column", alignItems:"center", gap:16 }}>
          {photo && <img src={photo} alt="" style={{ width:"100%", maxHeight:160, objectFit:"cover", borderRadius:12, border:`1px solid ${t.border}` }}/>}
          <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:10, paddingTop:4 }}>
            <div style={{ position:"relative", width:36, height:36 }}>
              <svg viewBox="0 0 40 40" style={{ position:"absolute", inset:0, animation:"spin 1s linear infinite", width:36, height:36 }}>
                <style>{"@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}"}</style>
                <circle cx="20" cy="20" r="16" fill="none" stroke={t.accent} strokeWidth="3" strokeDasharray="60 40" strokeLinecap="round"/>
              </svg>
            </div>
            <div style={{ fontSize:14, color:t.textSecondary, textAlign:"center", lineHeight:1.7 }}>
              Reading your receipt…<br/><span style={{ fontSize:12, color:t.textMuted }}>AI is itemizing everything</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  // ── ITEMIZE ──────────────────────────────────────────────────────────────────
  if (mode === "itemize") return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.5)", zIndex:300, display:"flex", flexDirection:"column", justifyContent:"flex-end" }}>
      <div className="su" style={{ background:t.bg, borderRadius:"20px 20px 0 0", border:`1px solid ${t.border}`, height:"94vh", display:"flex", flexDirection:"column", overflow:"hidden" }}>
        <SheetHandle t={t}/>
        <div style={{ padding:"12px 22px 14px", display:"flex", justifyContent:"space-between", alignItems:"center", borderBottom:`1px solid ${t.border}`, flexShrink:0 }}>
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            <button className="press" onClick={()=>setMode("capture")} style={{ background:"none", border:"none", color:t.textSecondary, display:"flex", alignItems:"center", gap:4, padding:0, fontSize:13 }}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M9 3L5 7 9 11" stroke={t.textSecondary} strokeWidth="1.5" strokeLinecap="round"/></svg>
            </button>
            <div>
              <div style={{ fontSize:16, fontWeight:700, fontFamily:"'Syne',sans-serif", color:t.text }}>{name || "Itemized split"}</div>
              <div style={{ fontSize:12, color:t.textSecondary, marginTop:2 }}>Select who was there, then claim items</div>
            </div>
          </div>
          <button onClick={onClose} className="press" style={{ background:t.surface, border:`1px solid ${t.border}`, color:t.textSecondary, width:30, height:30, borderRadius:8, fontSize:13, display:"flex", alignItems:"center", justifyContent:"center" }}>✕</button>
        </div>

        {/* Always show people selector first — user presses Continue to go to item claiming */}
        {!itemizeReady ? (
          <>
            <div style={{ overflowY:"auto", flex:1, padding:"16px 22px 0" }}>
              <div style={{ display:"flex", flexDirection:"column", gap:16, paddingBottom:8 }}>

                {scanResult && (
                  <div style={{ background:t.surface, border:`1px solid ${t.border}`, borderRadius:10, padding:"11px 14px", display:"flex", justifyContent:"space-between" }}>
                    <span style={{ fontSize:13, color:t.textSecondary }}>{(scanResult.items||[]).length} items · {name}</span>
                    <span style={{ fontSize:13, fontWeight:700, color:t.text }}>
                      {CURRENCIES.find(c=>c.code===tripCurrency)?.symbol || tripCurrency+" "}{(scanResult.total||0).toFixed(2)}
                    </span>
                  </div>
                )}

                {tripCurrency !== homeCurrency && exchangeRate && (
                  <div style={{ background:"#3D95CE12", border:`1px solid #3D95CE33`, borderRadius:9, padding:"9px 12px", fontSize:12, color:t.text }}>
                    Amounts in <strong>{tripCurrency}</strong> — will convert to <strong>{homeCurrency}</strong> at {exchangeRate.toFixed(4)} on save
                  </div>
                )}

                <div>
                  <Label t={t}>Who was there?</Label>
                  <div style={{ display:"flex", gap:7, flexWrap:"wrap" }}>
                    {["you",...ALL_FRIENDS].map(p => {
                      const sel = people.includes(p);
                      return <Pill key={p} active={sel} t={t} onClick={()=>togglePerson(p)}>{p==="you"?"you":`${p}`}</Pill>;
                    })}
                  </div>
                </div>

                <div>
                  <Label t={t}>Who paid the bill?</Label>
                  <div style={{ fontSize:11, color:t.textMuted, marginBottom:8, marginTop:2 }}>Tap to toggle — select all who paid</div>
                  <div style={{ display:"flex", gap:7, flexWrap:"wrap" }}>
                    {people.map(p => (
                      <button key={p} className="press" onClick={()=>togglePayer(p)} style={{ display:"flex", alignItems:"center", gap:6, padding:"7px 13px", borderRadius:9, background:payer.includes(p)?t.accent:t.inputBg, border:`1.5px solid ${payer.includes(p)?t.accent:t.border}` }}>
                        <span style={{ fontSize:12, fontWeight:600, color:payer.includes(p)?t.accentText:t.textSecondary }}>{p==="you"?"you":`${p}`}</span>
                        {payer.includes(p) && <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M2 5.5l2.5 2.5 4.5-5" stroke={t.accentText} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                      </button>
                    ))}
                  </div>
                </div>

                <div style={{ paddingBottom:8 }}/>
              </div>
            </div>

            {/* Sticky footer */}
            <div style={{ padding:"12px 22px 34px", borderTop:`1px solid ${t.border}`, background:t.bg, display:"flex", flexDirection:"column", gap:8, flexShrink:0 }}>
              <button className="press" onClick={()=>setItemizeReady(true)} disabled={people.length < 2} style={{ width:"100%", padding:"14px", background:people.length>=2?t.accent:t.border, border:"none", borderRadius:11, color:people.length>=2?t.accentText:t.textMuted, fontSize:14, fontWeight:700, fontFamily:"'Syne',sans-serif", display:"flex", alignItems:"center", justifyContent:"center", gap:8 }}>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 4h10M2 7h7M2 10h9" stroke={people.length>=2?t.accentText:t.textMuted} strokeWidth="1.5" strokeLinecap="round"/></svg>
                {people.length < 2 ? "Add at least one person to split" : `Claim items for ${people.length} people →`}
              </button>
            </div>
          </>
        ) : (
          <ItemizedSplitter
            scanResult={scanResult}
            people={people}
            onConfirm={handleSplitConfirm}
            onBack={() => setItemizeReady(false)}
            tripCurrency={tripCurrency}
            t={t}
          />
        )}
      </div>
    </div>
  );

  // ── CONFIRM ──────────────────────────────────────────────────────────────────
  if (mode === "confirm" && splitResult) return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.5)", zIndex:300, display:"flex", flexDirection:"column", justifyContent:"flex-end" }}>
      <div className="su" style={{ background:t.bg, borderRadius:"20px 20px 0 0", border:`1px solid ${t.border}`, maxHeight:"90vh", display:"flex", flexDirection:"column" }}>
        <SheetHandle t={t}/>
        <SheetHeader title="Confirm & save" sub="Review the split — then pay" onClose={onClose} t={t}/>
        <div style={{ overflowY:"auto", flex:1, padding:"12px 22px 0" }}>
          <div style={{ display:"flex", flexDirection:"column", gap:14, paddingBottom:16 }}>

            {/* Name */}
            <div>
              <Label t={t}>Receipt name</Label>
              <input value={name} onChange={e=>setName(e.target.value)} placeholder="Restaurant, hotel, Uber…" style={{ width:"100%", background:t.inputBg, border:`1px solid ${t.border}`, borderRadius:10, padding:"11px 13px", color:t.text, fontSize:14, fontFamily:"'DM Sans',sans-serif" }}/>
            </div>

            {/* Currency conversion notice */}
            {tripCurrency !== homeCurrency && exchangeRate && (
              <div style={{ background:"#3D95CE12", border:`1px solid #3D95CE33`, borderRadius:10, padding:"11px 14px", fontSize:12, color:t.text, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                <span>
                  {CURRENCIES.find(c=>c.code===tripCurrency)?.symbol || tripCurrency+" "}{splitResult.total.toFixed(2)} {tripCurrency}
                  <span style={{ color:t.textMuted }}> → </span>
                  ${(splitResult.total * exchangeRate).toFixed(2)} {homeCurrency}
                </span>
                <span style={{ fontSize:11, color:t.textMuted }}>@ {exchangeRate.toFixed(4)}</span>
              </div>
            )}

            {/* Per-person breakdown with inline payer toggle */}
            <div style={{ background:t.surface, border:`1px solid ${t.border}`, borderRadius:12, overflow:"hidden" }}>
              <div style={{ padding:"10px 14px", borderBottom:`1px solid ${t.border}`, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                <span style={{ fontSize:11, fontWeight:600, color:t.textMuted, letterSpacing:0.8, textTransform:"uppercase" }}>Split</span>
                <span style={{ fontSize:11, color:t.textMuted }}>Tap name to set payer</span>
              </div>
              {Object.entries(splitResult.personTotals).map(([p, amt], i, arr) => {
                const isPayer = payer.includes(p);
                return (
                  <button key={p} className="press" onClick={()=>togglePayer(p)} style={{ width:"100%", display:"flex", justifyContent:"space-between", alignItems:"center", padding:"12px 14px", borderBottom:i<arr.length-1?`1px solid ${t.border}`:"none", background:isPayer?t.accent+"0A":"transparent", border:"none", textAlign:"left" }}>
                    <div style={{ display:"flex", alignItems:"center", gap:9 }}>
                      <div style={{ width:28, height:28, borderRadius:8, background:isPayer?t.accent:t.inputBg, display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, fontWeight:700, color:isPayer?t.accentText:t.textSecondary }}>
                        {isPayer ? "✓" : p[0].toUpperCase()}
                      </div>
                      <div>
                        <div style={{ fontSize:13, fontWeight:isPayer?600:400, color:t.text }}>{p==="you"?"you":p}</div>
                        <div style={{ fontSize:11, color:isPayer?t.accent:t.textMuted }}>{isPayer?"paid 💳":"owes"}</div>
                      </div>
                    </div>
                    <div style={{ textAlign:"right" }}>
                      <div style={{ fontSize:14, fontWeight:700, fontFamily:"'Syne',sans-serif", color:isPayer?t.accent:t.text }}>
                        {CURRENCIES.find(c=>c.code===tripCurrency)?.symbol||"$"}{amt.toFixed(2)}
                      </div>
                      {tripCurrency !== homeCurrency && exchangeRate && (
                        <div style={{ fontSize:10, color:t.textMuted }}>${(amt * exchangeRate).toFixed(2)} {homeCurrency}</div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Trip */}
            <div>
              <Label t={t}>Trip (optional)</Label>
              <div style={{ display:"flex", gap:7, flexWrap:"wrap" }}>
                <Pill active={!trip} t={t} onClick={()=>setTrip(null)}>None</Pill>
                {(trips||[]).map(tr=>(
                  <button key={tr.id} className="press" onClick={()=>setTrip(tr.name)} style={{ display:"flex", alignItems:"center", gap:6, padding:"6px 12px", borderRadius:8, background:trip===tr.name?t.accent+"22":t.inputBg, border:`1px solid ${trip===tr.name?t.accent:t.border}` }}>
                    <TripIcon icon={tr.icon} size={12}/>
                    <span style={{ fontSize:12, fontWeight:trip===tr.name?600:400, color:trip===tr.name?t.accent:t.textSecondary }}>{tr.name}</span>
                  </button>
                ))}
              </div>
            </div>
            <div style={{ paddingBottom:8 }}/>
          </div>
        </div>
        <div style={{ padding:"12px 22px 34px", borderTop:`1px solid ${t.border}`, background:t.bg, display:"flex", gap:10, flexShrink:0 }}>
          <button className="press" onClick={()=>setMode("itemize")} style={{ flex:1, padding:"13px", background:t.surface, border:`1px solid ${t.border}`, borderRadius:11, color:t.text, fontSize:13, fontWeight:500, display:"flex", alignItems:"center", justifyContent:"center", gap:5 }}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M7.5 2L3.5 6l4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
            Back
          </button>
          <button className="press" onClick={handleSave} style={{ flex:2, padding:"13px", background:t.accent, border:"none", borderRadius:11, color:t.accentText, fontSize:14, fontWeight:700, fontFamily:"'Syne',sans-serif", display:"flex", alignItems:"center", justifyContent:"center", gap:7 }}>
            {payer.includes("you") ? "Save & Request" : "Save & Pay"}
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M5 2.5l4 4-4 4" stroke={t.accentText} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </button>
        </div>
      </div>
    </div>
  );

  // ── MANUAL FALLBACK ──────────────────────────────────────────────────────────
  if (mode === "manual") return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.5)", zIndex:300, display:"flex", flexDirection:"column", justifyContent:"flex-end" }}>
      <div className="su" style={{ background:t.bg, borderRadius:"20px 20px 0 0", border:`1px solid ${t.border}`, maxHeight:"92vh", display:"flex", flexDirection:"column" }}>
        <SheetHandle t={t}/>
        <SheetHeader title="Enter manually" sub={scanError ? `⚠ ${scanError}` : "Add the details below"} onClose={onClose} t={t}/>
        <div style={{ overflowY:"auto", flex:1, padding:"4px 22px 0" }}>
          <div style={{ display:"flex", flexDirection:"column", gap:14, paddingBottom:8 }}>
            <div>
              <Label t={t}>Title</Label>
              <input value={name} onChange={e=>setName(e.target.value)} placeholder="Dinner, hotel, Uber…" autoFocus style={{ width:"100%", background:t.inputBg, border:`1px solid ${t.border}`, borderRadius:10, padding:"11px 13px", color:t.text, fontSize:15, fontWeight:600, fontFamily:"'DM Sans',sans-serif" }}/>
            </div>
            <div>
              <Label t={t}>Description <span style={{ color:t.textMuted, fontWeight:400 }}>(optional)</span></Label>
              <input value={description} onChange={e=>setDescription(e.target.value)} placeholder="Add any notes…" style={{ width:"100%", background:t.inputBg, border:`1px solid ${t.border}`, borderRadius:10, padding:"11px 13px", color:t.text, fontSize:14, fontFamily:"'DM Sans',sans-serif" }}/>
            </div>
            <div>
              <Label t={t}>Amount</Label>
              <div style={{ position:"relative" }}>
                <span style={{ position:"absolute", left:14, top:"50%", transform:"translateY(-50%)", color:t.textSecondary, fontSize:22, fontWeight:700 }}>$</span>
                <input value={totalManual} onChange={e=>setTotalManual(e.target.value)} type="number" placeholder="0.00" style={{ width:"100%", background:t.inputBg, border:`1px solid ${t.border}`, borderRadius:12, padding:"14px 14px 14px 32px", color:t.text, fontSize:28, fontWeight:800, fontFamily:"'Syne',sans-serif" }}/>
              </div>
            </div>
            <div>
              <Label t={t}>Who was there?</Label>
              <div style={{ display:"flex", gap:7, flexWrap:"wrap" }}>
                {["you",...ALL_FRIENDS].map(p => {
                  const sel = people.includes(p);
                  return <Pill key={p} active={sel} t={t} onClick={()=>togglePerson(p)}>{p==="you"?"you":`${p}`}</Pill>;
                })}
              </div>
              {perPersonManual > 0 && <div style={{ marginTop:8, fontSize:12, color:t.textSecondary }}>Each pays <span style={{ fontWeight:600, color:t.text }}>${perPersonManual.toFixed(2)}</span></div>}
            </div>
            <div>
              <Label t={t}>Who paid?</Label>
              <div style={{ fontSize:11, color:t.textMuted, marginBottom:8, marginTop:2 }}>Select everyone who paid — tap to toggle</div>
              <div style={{ display:"flex", gap:7, flexWrap:"wrap" }}>
                {people.map(p => (
                  <button key={p} className="press" onClick={()=>togglePayer(p)} style={{ display:"flex", alignItems:"center", gap:6, padding:"7px 13px", borderRadius:9, background:payer.includes(p)?t.accent:t.inputBg, border:`1.5px solid ${payer.includes(p)?t.accent:t.border}` }}>
                    <span style={{ fontSize:12, fontWeight:600, color:payer.includes(p)?t.accentText:t.textSecondary }}>{p==="you"?"you":`${p}`}</span>
                    {payer.includes(p) && <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M2 5.5l2.5 2.5 4.5-5" stroke={t.accentText} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <Label t={t}>Trip (optional)</Label>
              <div style={{ display:"flex", gap:7, flexWrap:"wrap" }}>
                <Pill active={!trip} t={t} onClick={()=>setTrip(null)}>None</Pill>
                {trips.map(tr=>(
                  <button key={tr.id} className="press" onClick={()=>setTrip(tr.name)} style={{ display:"flex", alignItems:"center", gap:6, padding:"6px 12px", borderRadius:8, background:trip===tr.name?t.accent+"22":t.inputBg, border:`1px solid ${trip===tr.name?t.accent:t.border}` }}>
                    <TripIcon icon={tr.icon} size={12}/>
                    <span style={{ fontSize:12, fontWeight:trip===tr.name?600:400, color:trip===tr.name?t.accent:t.textSecondary }}>{tr.name}</span>
                  </button>
                ))}
              </div>
            </div>
            <div style={{ paddingBottom:8 }}/>
          </div>
        </div>
        <div style={{ padding:"12px 22px 34px", borderTop:`1px solid ${t.border}`, background:t.bg, display:"flex", gap:10, flexShrink:0 }}>
          <button className="press" onClick={()=>setMode("capture")} style={{ flex:1, padding:"13px", background:t.surface, border:`1px solid ${t.border}`, borderRadius:11, color:t.text, fontSize:13, fontWeight:500 }}>Back</button>
          <button className="press" onClick={handleSave} disabled={!canSaveManual} style={{ flex:2, padding:"13px", background:canSaveManual?t.accent:t.border, border:"none", borderRadius:11, color:canSaveManual?t.accentText:t.textMuted, fontSize:14, fontWeight:700, fontFamily:"'Syne',sans-serif", display:"flex", alignItems:"center", justifyContent:"center", gap:7 }}>
            {payer.includes("you") ? "Save & Request" : "Save & Pay"}
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M5 2.5l4 4-4 4" stroke={canSaveManual?t.accentText:t.textMuted} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </button>
        </div>
      </div>
    </div>
  );

  // ── CAPTURE (default) ────────────────────────────────────────────────────────
  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.5)", zIndex:300, display:"flex", flexDirection:"column", justifyContent:"flex-end" }}>
      <div className="su" style={{ background:t.bg, borderRadius:"20px 20px 0 0", border:`1px solid ${t.border}`, display:"flex", flexDirection:"column" }}>
        <SheetHandle t={t}/>
        <SheetHeader title="Upload receipt" sub="AI reads and itemizes everything" onClose={onClose} t={t}/>
        <div style={{ padding:"0 22px 36px", display:"flex", flexDirection:"column", gap:12 }}>
          <input ref={fileRef} type="file" accept="image/*,.heic,.heif" style={{ display:"none" }} onChange={handleFile}/>
          <div style={{ display:"flex", gap:8 }}>
            <button className="press" onClick={()=>{ fileRef.current.removeAttribute("capture"); fileRef.current.click(); }} style={{ flex:1, padding:"13px", background:t.surface, border:`1px dashed ${t.borderStrong}`, borderRadius:11, color:t.textSecondary, fontSize:13, fontWeight:500, display:"flex", alignItems:"center", justifyContent:"center", gap:6 }}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 1v8M4 6l3 3 3-3M2 10v2a1 1 0 001 1h8a1 1 0 001-1v-2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>
              Upload photo
            </button>
            <button className="press" onClick={()=>{ fileRef.current.setAttribute("capture","environment"); fileRef.current.click(); }} style={{ flex:1, padding:"13px", background:t.accent, border:"none", borderRadius:11, color:t.accentText, fontSize:13, fontWeight:600, display:"flex", alignItems:"center", justifyContent:"center", gap:6 }}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="1" y="3" width="12" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.3"/><circle cx="7" cy="7" r="2.5" stroke="currentColor" strokeWidth="1.3"/></svg>
              Scan receipt
            </button>
          </div>
          <button className="press" onClick={()=>setMode("manual")} style={{ width:"100%", padding:"13px", background:t.surface, border:`1px solid ${t.border}`, borderRadius:11, color:t.text, fontSize:13, fontWeight:600, display:"flex", alignItems:"center", justifyContent:"center", gap:7 }}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 4h10M2 7h7M2 10h9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>
            Enter manually
          </button>
        </div>
      </div>
    </div>
  );
}

// ── ADD TRIP SHEET ────────────────────────────────────────────────────────────
function AddTripSheet({ onClose, onAdd, t }) {
  const [name, setName] = useState("");
  const [dates, setDates] = useState("");
  const [people, setPeople] = useState(["you"]);
  const [icon, setIcon] = useState({shape:"circle",color:"#E8FF47"});
  const [customInput, setCustomInput] = useState("");
  const toggle = (p)=>{ if(p==="you")return; setPeople(prev=>prev.includes(p)?prev.filter(x=>x!==p):[...prev,p]); };
  const addCustom = () => {
    const clean = customInput.trim().replace(/^@/,"");
    if (!clean || people.includes(clean)) { setCustomInput(""); return; }
    setPeople(prev=>[...prev, clean]);
    setCustomInput("");
  };
  const handleAdd = ()=>{ if(!name)return; onAdd({id:Date.now(),name,memberNames:people,dates:dates||"Upcoming",icon}); onClose(); };

  return (
    <Overlay onClose={onClose} t={t}>
      <SheetHandle t={t}/>
      <SheetHeader title="New trip" sub="Create a shared receipt log" onClose={onClose} t={t}/>
      <div style={{ padding:"0 22px", display:"flex", flexDirection:"column", gap:16 }}>
        {/* Preview */}
        <div style={{ background:t.surface, border:`1px solid ${t.border}`, borderRadius:12, padding:"14px 16px", display:"flex", alignItems:"center", gap:14 }}>
          <div style={{ width:48, height:48, borderRadius:12, background:t.inputBg, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
            <TripIcon icon={icon} size={28}/>
          </div>
          <div>
            <div style={{ fontSize:14, fontWeight:600, fontFamily:"'Syne',sans-serif", color:t.text }}>{name||"Trip name"}</div>
            <div style={{ fontSize:12, color:t.textSecondary, marginTop:2 }}>{dates||"Dates TBD"} · {people.length} people</div>
          </div>
        </div>
        <div><Label t={t}>Icon</Label><IconPicker value={icon} onChange={setIcon} t={t}/></div>
        <InputField label="Name" value={name} onChange={e=>setName(e.target.value)} placeholder="Summer in Italy..." t={t}/>
        <InputField label="Dates" value={dates} onChange={e=>setDates(e.target.value)} placeholder="Jun 1–10" t={t}/>

        <div>
          <Label t={t}>Crew</Label>
          {/* Known friends as pills */}
          <div style={{ display:"flex", gap:7, flexWrap:"wrap", marginBottom:10 }}>
            {["you",...ALL_FRIENDS].map(p=>{
              const sel=people.includes(p);
              return <Pill key={p} active={sel} t={t} onClick={()=>toggle(p)}>{p==="you"?"you":`${p}`}</Pill>;
            })}
          </div>
          {/* Custom person input */}
          <div style={{ display:"flex", gap:8 }}>
            <input
              value={customInput}
              onChange={e=>setCustomInput(e.target.value)}
              onKeyDown={e=>{ if(e.key==="Enter"){ e.preventDefault(); addCustom(); }}}
              placeholder="Add someone else… @name"
              style={{ flex:1, background:t.inputBg, border:`1px solid ${t.border}`, borderRadius:10, padding:"10px 13px", color:t.text, fontSize:14, fontFamily:"'DM Sans',sans-serif" }}
            />
            <button className="press" onClick={addCustom} style={{ padding:"10px 14px", background:t.accent, border:"none", borderRadius:10, color:t.accentText, fontSize:13, fontWeight:600, flexShrink:0 }}>Add</button>
          </div>
          {/* Show custom-added people (not in ALL_FRIENDS) with remove option */}
          {people.filter(p=>p!=="you"&&!ALL_FRIENDS.includes(p)).length > 0 && (
            <div style={{ display:"flex", gap:7, flexWrap:"wrap", marginTop:10 }}>
              {people.filter(p=>p!=="you"&&!ALL_FRIENDS.includes(p)).map(p=>(
                <div key={p} style={{ display:"flex", alignItems:"center", gap:5, padding:"6px 10px 6px 12px", borderRadius:9, background:t.accent, border:`1.5px solid ${t.accent}` }}>
                  <span style={{ fontSize:12, fontWeight:600, color:t.accentText }}>{p}</span>
                  <button onClick={()=>setPeople(prev=>prev.filter(x=>x!==p))} style={{ background:"none", border:"none", color:t.accentText, fontSize:13, lineHeight:1, padding:"0 2px", cursor:"pointer", opacity:0.7 }}>✕</button>
                </div>
              ))}
            </div>
          )}
        </div>

        <ActionBtn onClick={handleAdd} t={t}>Create Trip</ActionBtn>
      </div>
    </Overlay>
  );
}

// ── RECEIPT MODAL (view + edit) ───────────────────────────────────────────────
function ReceiptModal({ r, onClose, onVenmo, onUpdate, onDelete, trips, friends=[], t }) {
  const [mode, setMode] = useState("view");
  const [confirmDelete, setConfirmDelete] = useState(false); // "view" | "edit"

  // edit state — initialized from receipt
  const [editName, setEditName] = useState(r.name);
  const [editDescription, setEditDescription] = useState(r.description || "");
  const [editTotal, setEditTotal] = useState(String(r.total));
  const [editPeople, setEditPeople] = useState([...r.people]);
  const [editPayer, setEditPayer] = useState(Array.isArray(r.payer) ? r.payer : [r.payer || "you"]);
  const [editTrip, setEditTrip] = useState(r.trip || null);
  const [editPaid, setEditPaid] = useState(r.paid);

  const togglePerson = (p) => {
    if (p === "you") return;
    setEditPeople(prev => prev.includes(p) ? prev.filter(x=>x!==p) : [...prev,p]);
  };

  const handleSave = () => {
    const total = parseFloat(editTotal) || r.total;
    const yourShare = editPeople.length ? total / editPeople.length : 0;
    const tripObj = trips?.find(x=>x.name===editTrip);
    onUpdate({
      ...r,
      name: editName,
      description: editDescription || null,
      total,
      people: editPeople,
      yourShare,
      payer: editPayer,
      trip: editTrip,
      tripIcon: tripObj?.icon || r.tripIcon || null,
      paid: editPaid,
    });
    setMode("view");
  };

  // view mode values
  const payer = Array.isArray(r.payer) ? r.payer : [r.payer || "you"];
  const youArePayer = payer.includes("you");
  const personTotals = r.personTotals || null;

  const inputStyle = { width:"100%", background:t.inputBg, border:`1px solid ${t.border}`, borderRadius:10, padding:"11px 13px", color:t.text, fontSize:14, fontFamily:"'DM Sans',sans-serif" };

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.5)", zIndex:400, display:"flex", flexDirection:"column", justifyContent:"flex-end" }} onClick={onClose}>
      <div className="su" onClick={e=>e.stopPropagation()} style={{ background:t.bg, borderRadius:"20px 20px 0 0", border:`1px solid ${t.border}`, maxHeight:"90vh", display:"flex", flexDirection:"column" }}>
        <SheetHandle t={t}/>

        {/* Header */}
        <div style={{ padding:"16px 22px 14px", display:"flex", justifyContent:"space-between", alignItems:"center", borderBottom:`1px solid ${t.border}`, flexShrink:0 }}>
          <div style={{ flex:1, minWidth:0, paddingRight:10 }}>
            <div style={{ fontSize:17, fontWeight:700, fontFamily:"'Syne',sans-serif", color:t.text }}>
              {mode==="edit" ? "Edit receipt" : r.name}
            </div>
            {mode==="view" && (
              <>
                {r.description && <div style={{ fontSize:13, color:t.text, marginTop:3, opacity:0.75 }}>{r.description}</div>}
                <div style={{ fontSize:12, color:t.textSecondary, marginTop:2 }}>{r.date}{r.trip ? ` · ${r.trip}` : ""}{r.originalCurrency ? ` · originally ${r.originalCurrency} ${r.originalTotal?.toFixed(2)}` : ""}</div>
              </>
            )}
          </div>
          <div style={{ display:"flex", gap:8, alignItems:"center" }}>
            {mode==="view" && (
              <button onClick={()=>setMode("edit")} className="press" style={{ background:t.surface, border:`1px solid ${t.border}`, borderRadius:8, padding:"5px 12px", fontSize:12, fontWeight:500, color:t.text, display:"flex", alignItems:"center", gap:5 }}>
                <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M7.5 1.5l2 2-6 6H1.5v-2l6-6z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/></svg>
                Edit
              </button>
            )}
            <button onClick={onClose} className="press" style={{ background:t.surface, border:`1px solid ${t.border}`, color:t.textSecondary, width:30, height:30, borderRadius:8, fontSize:13, display:"flex", alignItems:"center", justifyContent:"center" }}>✕</button>
          </div>
        </div>

        {/* ── VIEW MODE ── */}
        {mode === "view" && (
          <div style={{ overflowY:"auto", flex:1 }}>
            {r.photoUrl && <img src={r.photoUrl} alt="receipt" style={{ width:"100%", maxHeight:160, objectFit:"cover", display:"block" }}/>}
            <div style={{ padding:"16px 22px 36px", display:"flex", flexDirection:"column", gap:14 }}>

              {/* Breakdown — payer first, then everyone else */}
              <div style={{ background:t.surface, border:`1px solid ${t.border}`, borderRadius:14, overflow:"hidden" }}>

                {/* Payer section */}
                <div style={{ padding:"10px 14px 8px", background:t.accent+"0D" }}>
                  <div style={{ fontSize:10, fontWeight:700, color:t.accent, letterSpacing:1, textTransform:"uppercase", marginBottom:8 }}>Paid by</div>
                  {payer.map(p => {
                    const amt = personTotals?.[p] || r.total / r.people.length;
                    return (
                      <div key={p} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:4 }}>
                        <div style={{ display:"flex", alignItems:"center", gap:9 }}>
                          <div style={{ width:30, height:30, borderRadius:8, background:t.accent, display:"flex", alignItems:"center", justifyContent:"center", fontSize:12, fontWeight:700, color:t.accentText }}>
                            {p==="you" ? "✓" : p[0].toUpperCase()}
                          </div>
                          <span style={{ fontSize:14, fontWeight:600, color:t.text }}>{p==="you"?"you":`${p}`}</span>
                        </div>
                        <span style={{ fontSize:15, fontWeight:700, fontFamily:"'Syne',sans-serif", color:t.accent }}>${amt.toFixed(2)}</span>
                      </div>
                    );
                  })}
                </div>

                {/* Divider */}
                <div style={{ height:1, background:t.border }}/>

                {/* Everyone else */}
                <div style={{ padding:"8px 14px 12px" }}>
                  <div style={{ fontSize:10, fontWeight:700, color:t.textMuted, letterSpacing:1, textTransform:"uppercase", marginBottom:10 }}>Owes</div>
                  {r.people.filter(p => !payer.includes(p)).length === 0 ? (
                    <div style={{ fontSize:13, color:t.textMuted, paddingBottom:4 }}>No one — just you</div>
                  ) : r.people.filter(p => !payer.includes(p)).map((p, i, arr) => {
                    const amt = personTotals?.[p] || r.total / r.people.length;
                    const isYou = p === "you";
                    const venmoNote = encodeURIComponent(r.name || "sp/itt.");
                    return (
                      <div key={p} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", borderTop: i===0?"none":`1px solid ${t.border}`, paddingTop:i===0?0:10, paddingBottom:i<arr.length-1?10:0 }}>
                        <span style={{ fontSize:14, color:t.text, fontWeight:500 }}>{p==="you"?"you":p}</span>
                        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                          <span style={{ fontSize:14, fontWeight:700, fontFamily:"'Syne',sans-serif", color:t.text }}>${amt.toFixed(2)}</span>
                          {!r.paid && !isYou && (
                            <button className="press" onClick={()=>{
                              const friend = friends.find(f=>f.name===p);
                              const handle = friend?.venmo ? encodeURIComponent(friend.venmo) : "";
                              const url = handle
                                ? `https://venmo.com/u/${handle}`
                                : `https://venmo.com/`;
                              window.open(url, "_blank");
                            }} style={{ width:26, height:26, borderRadius:7, background:"#3D95CE", border:"none", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                              <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M12.5 2C11.3 4.5 9.5 7.4 8 9.2L6.2 4H2.5L5.5 14h3.8C11.5 11 14 6.5 14 4c0-1-.5-1.8-1.5-2z" fill="#fff"/></svg>
                            </button>
                          )}
                          {!r.paid && isYou && (
                            <button onClick={()=>onVenmo({name:payer.filter(x=>x!=="you")[0]||payer[0], yourShare:amt, receipt:r})} className="press" style={{ padding:"4px 10px", background:"#3D95CE", border:"none", borderRadius:6, color:"#fff", fontSize:11, fontWeight:600 }}>Pay</button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Total row */}
                <div style={{ borderTop:`1px solid ${t.border}`, padding:"11px 14px", display:"flex", justifyContent:"space-between", alignItems:"center", background:t.inputBg }}>
                  <span style={{ fontSize:13, fontWeight:600, color:t.textSecondary }}>Total</span>
                  <span style={{ fontSize:15, fontWeight:700, fontFamily:"'Syne',sans-serif", color:t.text }}>${r.total.toFixed(2)}</span>
                </div>
              </div>

              {/* Paid toggle */}
              <div style={{ background:t.surface, border:`1px solid ${t.border}`, borderRadius:11, padding:"12px 14px", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                <div>
                  <div style={{ fontSize:13, fontWeight:500, color:t.text }}>Marked as settled</div>
                  <div style={{ fontSize:11, color:t.textMuted, marginTop:2 }}>{r.paid ? "All paid up" : "Still outstanding"}</div>
                </div>
                <button className="press" onClick={()=>onUpdate({...r, paid:!r.paid})} style={{ width:44, height:24, borderRadius:12, background:r.paid?t.accent:t.border, border:"none", position:"relative", transition:"background 0.2s ease" }}>
                  <div style={{ position:"absolute", top:3, left:r.paid?21:3, width:18, height:18, borderRadius:"50%", background:r.paid?t.accentText:t.textSecondary, transition:"left 0.2s ease" }}/>
                </button>
              </div>

              {r.archived && <div style={{ textAlign:"center", fontSize:12, color:t.textMuted }}>Archived receipt</div>}
            </div>
          </div>
        )}

        {/* ── EDIT MODE ── */}
        {mode === "edit" && (
          <div style={{ overflowY:"auto", flex:1, padding:"16px 22px 0" }}>
            <div style={{ display:"flex", flexDirection:"column", gap:16, paddingBottom:36 }}>

              <div>
                <Label t={t}>Name</Label>
                <input value={editName} onChange={e=>setEditName(e.target.value)} style={inputStyle} placeholder="Receipt name"/>
              </div>

              <div>
                <Label t={t}>Description <span style={{ color:t.textMuted, fontWeight:400 }}>(optional)</span></Label>
                <input value={editDescription} onChange={e=>setEditDescription(e.target.value)} style={inputStyle} placeholder="Add any notes…"/>
              </div>

              <div>
                <Label t={t}>Total</Label>
                <div style={{ position:"relative" }}>
                  <span style={{ position:"absolute", left:13, top:"50%", transform:"translateY(-50%)", color:t.textSecondary, fontSize:15 }}>$</span>
                  <input value={editTotal} onChange={e=>setEditTotal(e.target.value)} type="number" style={{...inputStyle, paddingLeft:26, fontSize:20, fontWeight:700, fontFamily:"'Syne',sans-serif"}}/>
                </div>
                {editPeople.length>0 && parseFloat(editTotal)>0 && (
                  <div style={{ fontSize:12, color:t.textSecondary, marginTop:7 }}>Each pays <span style={{ fontWeight:600, color:t.text }}>${(parseFloat(editTotal)/editPeople.length).toFixed(2)}</span></div>
                )}
              </div>

              <div>
                <Label t={t}>Split with</Label>
                <div style={{ display:"flex", gap:7, flexWrap:"wrap" }}>
                  {["you",...ALL_FRIENDS].map(p=>{
                    const sel = editPeople.includes(p);
                    return <Pill key={p} active={sel} t={t} onClick={()=>togglePerson(p)}>{p==="you"?"you":`${p}`}</Pill>;
                  })}
                </div>
              </div>

              <div>
                <Label t={t}>Who paid</Label>
                <div style={{ display:"flex", gap:7, flexWrap:"wrap" }}>
                  {editPeople.map(p=>(
                    <button key={p} className="press" onClick={()=>setEditPayer(p)} style={{
                      display:"flex", alignItems:"center", gap:6, padding:"7px 13px", borderRadius:9,
                      background: editPayer===p ? t.accent : t.inputBg,
                      border:`1.5px solid ${editPayer===p ? t.accent : t.border}`,
                    }}>
                      <span style={{ fontSize:12, fontWeight:600, color:editPayer===p?t.accentText:t.textSecondary }}>{p==="you"?"you":`${p}`}</span>
                      {editPayer===p && <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M2 5.5l2.5 2.5 4.5-5" stroke={t.accentText} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <Label t={t}>Trip</Label>
                <div style={{ display:"flex", gap:7, flexWrap:"wrap" }}>
                  <Pill active={!editTrip} t={t} onClick={()=>setEditTrip(null)}>None</Pill>
                  {(trips||[]).map(tr=>(
                    <button key={tr.id} className="press" onClick={()=>setEditTrip(tr.name)} style={{ display:"flex", alignItems:"center", gap:6, padding:"6px 12px", borderRadius:8, background:editTrip===tr.name?t.accent+"22":t.inputBg, border:`1px solid ${editTrip===tr.name?t.accent:t.border}` }}>
                      <TripIcon icon={tr.icon} size={12}/>
                      <span style={{ fontSize:12, fontWeight:editTrip===tr.name?600:400, color:editTrip===tr.name?t.accent:t.textSecondary }}>{tr.name}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ background:t.surface, border:`1px solid ${t.border}`, borderRadius:11, padding:"12px 14px", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                <div>
                  <div style={{ fontSize:13, fontWeight:500, color:t.text }}>Mark as settled</div>
                  <div style={{ fontSize:11, color:t.textMuted, marginTop:2 }}>All shares have been paid</div>
                </div>
                <button className="press" onClick={()=>setEditPaid(p=>!p)} style={{ width:44, height:24, borderRadius:12, background:editPaid?t.accent:t.border, border:"none", position:"relative", transition:"background 0.2s ease" }}>
                  <div style={{ position:"absolute", top:3, left:editPaid?21:3, width:18, height:18, borderRadius:"50%", background:editPaid?t.accentText:t.textSecondary, transition:"left 0.2s ease" }}/>
                </button>
              </div>

              <div style={{ display:"flex", gap:10, paddingBottom:8 }}>
                <button onClick={()=>setMode("view")} className="press" style={{ flex:1, padding:"13px", background:t.surface, border:`1px solid ${t.border}`, borderRadius:11, color:t.text, fontSize:14, fontWeight:500 }}>Cancel</button>
                <button onClick={handleSave} className="press" style={{ flex:2, padding:"13px", background:t.accent, border:"none", borderRadius:11, color:t.accentText, fontSize:14, fontWeight:600, fontFamily:"'Syne',sans-serif" }}>Save changes</button>
              </div>
              {confirmDelete ? (
                <div style={{ background:"#F8717110", border:`1px solid #F8717144`, borderRadius:11, padding:"14px", display:"flex", flexDirection:"column", gap:10 }}>
                  <div style={{ fontSize:13, fontWeight:600, color:"#F87171", textAlign:"center" }}>Delete this transaction?</div>
                  <div style={{ display:"flex", gap:8 }}>
                    <button className="press" onClick={()=>setConfirmDelete(false)} style={{ flex:1, padding:"11px", background:t.surface, border:`1px solid ${t.border}`, borderRadius:9, color:t.text, fontSize:13, fontWeight:500 }}>Cancel</button>
                    <button className="press" onClick={()=>onDelete?.(r)} style={{ flex:1, padding:"11px", background:"#F87171", border:"none", borderRadius:9, color:"#fff", fontSize:13, fontWeight:600 }}>Delete</button>
                  </div>
                </div>
              ) : (
                <button onClick={()=>setConfirmDelete(true)} className="press" style={{ width:"100%", padding:"13px", background:"none", border:`1px solid #F8717155`, borderRadius:11, color:"#F87171", fontSize:13, fontWeight:500, marginBottom:8 }}>
                  Delete transaction
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── PAYMENT MODAL (Venmo + Zelle) ────────────────────────────────────────────
function VenmoModal({ data, onClose, venmoHandle="", zelleHandle="", t }) {
  const isReminder = data.remind;
  const [method, setMethod] = useState("venmo");
  const VENMO_COLOR = "#3D95CE";
  const ZELLE_COLOR = "#6D1ED4";
  const activeColor = method === "venmo" ? VENMO_COLOR : ZELLE_COLOR;

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.5)", zIndex:500, display:"flex", flexDirection:"column", justifyContent:"flex-end" }} onClick={onClose}>
      <div className="su" onClick={e=>e.stopPropagation()} style={{ background:t.bg, borderRadius:"20px 20px 0 0", border:`1px solid ${t.border}`, maxHeight:"85vh", display:"flex", flexDirection:"column" }}>
        <SheetHandle t={t}/>

        {/* Method toggle */}
        <div style={{ padding:"16px 22px 18px", flexShrink:0 }}>
          <div style={{ fontSize:11, fontWeight:600, color:t.textMuted, letterSpacing:0.8, textTransform:"uppercase", marginBottom:12, textAlign:"center" }}>
            {isReminder ? "Request via" : "Pay via"}
          </div>
          <div style={{ display:"flex", gap:6, background:t.surface, border:`1px solid ${t.border}`, borderRadius:12, padding:4 }}>
            {[
              { id:"venmo", label:"Venmo", color:VENMO_COLOR,
                logo:<svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M12.5 2C11.3 4.5 9.5 7.4 8 9.2L6.2 4H2.5L5.5 14h3.8C11.5 11 14 6.5 14 4c0-1-.5-1.8-1.5-2z" fill="#fff"/></svg> },
              { id:"zelle", label:"Zelle", color:ZELLE_COLOR,
                logo:<svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M3 3h10v2.5L6.5 10H13v3H3v-2.5L9.5 6H3V3z" fill="#fff"/></svg> },
            ].map(opt=>(
              <button key={opt.id} className="press" onClick={()=>setMethod(opt.id)} style={{
                flex:1, padding:"11px", borderRadius:9, border:"none",
                background: method===opt.id ? opt.color : "transparent",
                display:"flex", alignItems:"center", justifyContent:"center", gap:7,
                transition:"all 0.18s ease",
              }}>
                {method===opt.id && opt.logo}
                <span style={{ fontSize:14, fontWeight:600, color:method===opt.id?"#fff":t.textSecondary }}>{opt.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div style={{ overflowY:"auto", flex:1, padding:"0 22px 34px" }}>
        {isReminder ? (
          <div>
            <div style={{ background:t.surface, border:`1px solid ${t.border}`, borderRadius:12, overflow:"hidden", marginBottom:14 }}>
              <div style={{ padding:"10px 14px", borderBottom:`1px solid ${t.border}`, fontSize:11, fontWeight:600, color:t.textMuted, letterSpacing:0.8, textTransform:"uppercase" }}>Pending from</div>
              {(data.people||[]).map((p,i,arr)=>(
                <div key={p} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"11px 14px", borderBottom:i<arr.length-1?`1px solid ${t.border}`:"none" }}>
                  <div style={{ display:"flex", alignItems:"center", gap:9 }}>
                    <div style={{ width:26, height:26, borderRadius:7, background:t.border, display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, fontWeight:700, color:t.textSecondary }}>{p[0].toUpperCase()}</div>
                    <span style={{ fontSize:13, color:t.text }}>{p}</span>
                  </div>
                  {data.personTotals&&<span style={{ fontSize:13, fontWeight:600, color:t.text, fontFamily:"'Syne',sans-serif" }}>${(data.personTotals[p]||0).toFixed(2)}</span>}
                </div>
              ))}
            </div>
            {method==="venmo" && !venmoHandle && (
              <div style={{ background:"#F9731618", border:"1px solid #F9731644", borderRadius:10, padding:"10px 13px", fontSize:12, color:"#F97316", marginBottom:12 }}>
                Add your Venmo handle in Settings so others know where to pay you.
              </div>
            )}
            <div style={{ display:"flex", gap:10 }}>
              <button onClick={onClose} className="press" style={{ flex:1, padding:"14px", background:t.surface, border:`1px solid ${t.border}`, borderRadius:11, color:t.text, fontSize:14, fontWeight:500 }}>Cancel</button>
              <button onClick={()=>{
                const myHandle = method==="venmo" ? (venmoHandle||"").replace(/^@/,"") : (zelleHandle||"");
                const note = encodeURIComponent(data.receipt?.name || "sp/itt.");
                if (method==="venmo" && myHandle) {
                  (data.people||[]).forEach(p => {
                    const amt = (data.personTotals?.[p]||0).toFixed(2);
                    window.open(myHandle ? `https://venmo.com/u/${encodeURIComponent(myHandle)}` : "https://venmo.com/", "_blank");
                  });
                } else if (method==="zelle" && myHandle) {
                  window.open(`zelle://request?recipients=${encodeURIComponent(myHandle)}`, "_blank");
                }
                onClose();
              }} className="press" style={{ flex:2, padding:"14px", background:activeColor, border:"none", borderRadius:11, color:"#fff", fontSize:14, fontWeight:600 }}>
                Request via {method==="venmo"?"Venmo":"Zelle"} →
              </button>
            </div>
          </div>
        ) : (
          <>
            <div style={{ background:t.surface, border:`1px solid ${t.border}`, borderRadius:12, padding:"20px", textAlign:"center", marginBottom:18 }}>
              <div style={{ fontSize:40, fontWeight:800, fontFamily:"'Syne',sans-serif", color:t.text }}>${(data.yourShare||0).toFixed(2)}</div>
              {data.name && <div style={{ fontSize:13, color:t.textSecondary, marginTop:5 }}>
                to {data.name}
              </div>}
            </div>
            <div style={{ display:"flex", gap:10 }}>
              <button onClick={onClose} className="press" style={{ flex:1, padding:"14px", background:t.surface, border:`1px solid ${t.border}`, borderRadius:11, color:t.text, fontSize:14, fontWeight:500 }}>Cancel</button>
              <button onClick={()=>{
                const amt = (data.yourShare||0).toFixed(2);
                const note = encodeURIComponent(data.receipt?.name || "sp/itt.");
                if (method==="venmo") {
                  // Open Venmo pay — if we have a handle use it, otherwise open Venmo home
                  window.open("https://venmo.com/", "_blank");
                } else {
                  window.open(`https://enroll.zellepay.com/`, "_blank");
                }
                onClose();
              }} className="press" style={{ flex:2, padding:"14px", background:activeColor, border:"none", borderRadius:11, color:"#fff", fontSize:14, fontWeight:600 }}>
                Open {method==="venmo"?"Venmo":"Zelle"} →
              </button>
            </div>
          </>
        )}
        </div>
      </div>
    </div>
  );
}

// ── RECEIPT CARD ──────────────────────────────────────────────────────────────
function ReceiptCard({ r, onClick, onVenmo, t, delay=0 }) {
  const payer = Array.isArray(r.payer) ? r.payer : [r.payer || "you"];
  const youArePayer = payer.includes("you");
  return (
    <div className="fu press" onClick={onClick} style={{ background:t.surface, border:`1px solid ${t.border}`, borderRadius:14, padding:"14px 16px", marginBottom:8, animationDelay:`${delay}s` }}>
      {r.photoUrl&&<div style={{ width:"100%", height:80, borderRadius:8, overflow:"hidden", marginBottom:10 }}><img src={r.photoUrl} alt="" style={{ width:"100%", height:"100%", objectFit:"cover" }}/></div>}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:10 }}>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontSize:14, fontWeight:600, fontFamily:"'Syne',sans-serif", color:t.text, marginBottom:3, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{r.name}</div>
          <div style={{ display:"flex", alignItems:"center", gap:6, flexWrap:"wrap" }}>
            <span style={{ fontSize:12, color:t.textMuted }}>{r.date}</span>
            {r.trip&&<div style={{ display:"flex", alignItems:"center", gap:4, background:t.tag, borderRadius:5, padding:"1px 7px" }}>{r.tripIcon&&<TripIcon icon={r.tripIcon} size={9}/>}<span style={{ fontSize:11, color:t.textSecondary }}>{r.trip}</span></div>}
            {!youArePayer&&!r.paid&&<span style={{ fontSize:10, color:t.venmo, background:t.venmo+"18", borderRadius:5, padding:"1px 7px" }}>→ @{payer}</span>}
            {r.archived&&<span style={{ fontSize:10, color:t.textMuted, background:t.tag, borderRadius:5, padding:"1px 7px" }}>archived</span>}
          </div>
        </div>
        <div style={{ textAlign:"right", flexShrink:0, marginLeft:12 }}>
          <div style={{ fontSize:15, fontWeight:700, fontFamily:"'Syne',sans-serif", color:r.paid?t.textMuted:t.text }}>${r.yourShare.toFixed(2)}</div>
          <div style={{ fontSize:11, color:t.textMuted }}>of ${r.total.toFixed(2)}</div>
        </div>
      </div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
        <AvatarStack people={r.people} size={20} t={t}/>
        {r.paid && <span style={{ fontSize:11, color:t.textMuted }}>Settled</span>}
      </div>
    </div>
  );
}

// ── TRIP DETAIL (with add receipt button) ─────────────────────────────────────
function TripDetail({ trip, allReceipts, onBack, onVenmo, onAddReceipt, onUpdateReceipt, onUpdateTrip, t }) {
  const [showReceipt, setShowReceipt] = useState(null);
  const [showAddReceipt, setShowAddReceipt] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [tripTab, setTripTab] = useState("receipts");
  const [selectedPerson, setSelectedPerson] = useState(null); // "receipts" | "people"

  // Edit state
  const [editName, setEditName] = useState(trip.name);
  const [editDates, setEditDates] = useState(trip.dates);
  const [editPeople, setEditPeople] = useState(trip.memberNames);
  const [editIcon, setEditIcon] = useState(trip.icon);
  const [editCustomInput, setEditCustomInput] = useState("");

  const active = allReceipts.filter(r=>r.trip===trip.name&&!r.archived);
  const archived = allReceipts.filter(r=>r.trip===trip.name&&r.archived);
  const shown = showArchived ? [...active,...archived] : active;
  const total = active.reduce((a,r)=>a+r.total,0);
  const yourTotal = active.reduce((a,r) => {
    const payers = Array.isArray(r.payer) ? r.payer : [r.payer || "you"];
    if (r.paid || payers.includes("you")) return a;
    return a + r.yourShare;
  }, 0);
  const settled = active.filter(r=>r.paid).length;
  const perPerson = trip.memberNames.length ? total/trip.memberNames.length : 0;

  return (
    <div style={{ fontFamily:"'DM Sans',sans-serif", background:t.bg, height:"100vh", overflowY:"auto", overflowX:"hidden", color:t.text, maxWidth:430, width:"100%", margin:"0 auto", position:"relative", transform:"translateZ(0)", willChange:"transform" }}>
      {/* Header */}
      <div style={{ padding:"52px 20px 0" }}>
        <button onClick={onBack} className="press" style={{ background:"none", border:"none", color:t.textSecondary, fontSize:13, fontWeight:500, display:"flex", alignItems:"center", gap:5, marginBottom:22, padding:0 }}>
          <svg width="15" height="15" viewBox="0 0 15 15" fill="none"><path d="M9 3L5 7.5 9 12" stroke={t.textSecondary} strokeWidth="1.5" strokeLinecap="round"/></svg>
          Back
        </button>
        <div style={{ display:"flex", alignItems:"center", gap:14, marginBottom:22 }}>
          <div style={{ width:54, height:54, borderRadius:14, background:t.surface, border:`1px solid ${t.border}`, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
            <TripIcon icon={trip.icon} size={30}/>
          </div>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:22, fontWeight:700, fontFamily:"'Syne',sans-serif" }}>{trip.name}</div>
            <div style={{ fontSize:13, color:t.textSecondary, marginTop:2 }}>{trip.dates} · {trip.memberNames.length} people</div>
          </div>
          <button className="press" onClick={()=>setShowEdit(true)} style={{ background:t.surface, border:`1px solid ${t.border}`, borderRadius:9, padding:"6px 13px", fontSize:12, fontWeight:500, color:t.text, display:"flex", alignItems:"center", gap:5 }}>
            <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M7.5 1.5l2 2-6 6H1.5v-2l6-6z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/></svg>
            Edit
          </button>
        </div>

        {/* Stats — Total and You owe only */}
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:18 }}>
          {[{l:"Total",v:`$${total.toFixed(2)}`},{l:"You owe",v:`$${yourTotal.toFixed(2)}`}].map(s=>(
            <div key={s.l} style={{ background:t.surface, border:`1px solid ${t.border}`, borderRadius:11, padding:"11px 10px" }}>
              <div style={{ fontSize:16, fontWeight:700, fontFamily:"'Syne',sans-serif", color:t.text }}>{s.v}</div>
              <div style={{ fontSize:11, color:t.textSecondary, marginTop:2 }}>{s.l}</div>
            </div>
          ))}
        </div>

        {/* Progress */}
        <div style={{ marginBottom:18 }}>
          <div style={{ display:"flex", justifyContent:"space-between", marginBottom:5 }}>
            <span style={{ fontSize:12, color:t.textSecondary }}>Settlement</span>
            <span style={{ fontSize:12, fontWeight:600, color:t.text }}>{settled}/{active.length}</span>
          </div>
          <div style={{ height:4, background:t.border, borderRadius:3 }}>
            <div style={{ height:"100%", width:`${active.length?(settled/active.length)*100:0}%`, background:t.accent, borderRadius:3, transition:"width 0.5s ease" }}/>
          </div>
        </div>

        {/* Tab switcher */}
        <div style={{ display:"flex", gap:6, marginBottom:22 }}>
          {["receipts","people"].map(tab=>(
            <button key={tab} className="press" onClick={()=>setTripTab(tab)} style={{ flex:1, padding:"9px 0", borderRadius:9, background:tripTab===tab?t.accent:t.surface, border:`1px solid ${tripTab===tab?t.accent:t.border}`, color:tripTab===tab?t.accentText:t.textSecondary, fontSize:13, fontWeight:600 }}>
              {tab[0].toUpperCase()+tab.slice(1)}
            </button>
          ))}
        </div>

        {/* Add payment CTA */}
        <button className="press fu" onClick={()=>setShowAddReceipt(true)} style={{ width:"100%", padding:"13px", background:t.accent, border:"none", borderRadius:11, color:t.accentText, fontSize:13, fontWeight:600, fontFamily:"'Syne',sans-serif", display:"flex", alignItems:"center", justifyContent:"center", gap:8, marginBottom:22 }}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 2v10M2 7h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
          Add payment
        </button>

        {tripTab === "receipts" && (
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
            <Label t={t}>Receipts</Label>
            {archived.length>0&&(
              <button className="press" onClick={()=>setShowArchived(x=>!x)} style={{ background:"none", border:"none", fontSize:12, color:t.textSecondary, fontWeight:500, padding:0 }}>
                {showArchived?"Hide archived":"Show archived"} ({archived.length})
              </button>
            )}
          </div>
        )}
      </div>

      <div style={{ padding:"0 20px 140px" }}>
        {/* RECEIPTS TAB */}
        {tripTab === "receipts" && (
          <>
            {shown.length===0 ? (
              <div style={{ textAlign:"center", padding:"44px 0", color:t.textMuted }}>
                <svg width="30" height="30" viewBox="0 0 30 30" fill="none" style={{ margin:"0 auto 10px", display:"block" }}><rect x="5" y="3" width="20" height="24" rx="3" stroke={t.textMuted} strokeWidth="1.4"/><path d="M10 10h10M10 15h6" stroke={t.textMuted} strokeWidth="1.4" strokeLinecap="round"/></svg>
                <div style={{ fontSize:13 }}>No receipts yet</div>
              </div>
            ) : shown.map((r,i)=>(
              <ReceiptCard key={r.id} r={r} onClick={()=>setShowReceipt(r)} onVenmo={onVenmo} t={t} delay={i*0.04}/>
            ))}
          </>
        )}

        {/* PEOPLE TAB */}
        {tripTab === "people" && (
          <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
            {trip.memberNames.filter(m=>m!=="you").length === 0 && (
              <div style={{ textAlign:"center", padding:"44px 0", color:t.textMuted }}>
                <div style={{ fontSize:13 }}>No other people on this trip yet</div>
              </div>
            )}
            {trip.memberNames.filter(m=>m!=="you").map((person, i) => {
              const color = PERSON_COLORS[i % PERSON_COLORS.length];
              // Calculate what this person owes you across all unsettled receipts where you paid
              const owesYou = active.filter(r => {
                const payers = Array.isArray(r.payer) ? r.payer : [r.payer || "you"];
                return payers.includes("you") && r.people.includes(person) && !r.paid;
              }).reduce((sum, r) => {
                const amt = r.personTotals?.[person] || r.total / r.people.length;
                return sum + amt;
              }, 0);
              // Calculate what you owe this person
              const youOwe = active.filter(r => {
                const payers = Array.isArray(r.payer) ? r.payer : [r.payer || "you"];
                return payers.includes(person) && !r.paid;
              }).reduce((sum, r) => sum + r.yourShare, 0);

              const net = owesYou - youOwe;
              const receiptsInvolved = active.filter(r => r.people.includes(person)).length;

              return (
                <button key={person} className="press fu" onClick={()=>setSelectedPerson(person)} style={{ background:t.surface, border:`1px solid ${t.border}`, borderRadius:14, padding:"16px", animationDelay:`${i*0.05}s`, width:"100%", textAlign:"left" }}>
                  <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:12 }}>
                    <div style={{ width:44, height:44, borderRadius:12, background:color+"22", border:`1.5px solid ${color}`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:16, fontWeight:700, color, flexShrink:0 }}>
                      {person[0].toUpperCase()}
                    </div>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:15, fontWeight:600, color:t.text }}>{person}</div>
                      <div style={{ fontSize:12, color:t.textMuted, marginTop:2 }}>{receiptsInvolved} receipt{receiptsInvolved!==1?"s":""} together</div>
                    </div>
                    <div style={{ textAlign:"right" }}>
                      <div style={{ fontSize:18, fontWeight:800, fontFamily:"'Syne',sans-serif", color: net > 0 ? t.accent : net < 0 ? "#F97316" : t.textMuted }}>
                        {net > 0 ? `+$${net.toFixed(2)}` : net < 0 ? `-$${Math.abs(net).toFixed(2)}` : "$0.00"}
                      </div>
                      <div style={{ fontSize:11, color:t.textMuted, marginTop:2 }}>
                        {net > 0 ? "owes you" : net < 0 ? "you owe" : "settled"}
                      </div>
                    </div>
                  </div>

                  {/* Breakdown rows */}
                  {owesYou > 0 && (
                    <div style={{ background:t.inputBg, borderRadius:9, padding:"9px 12px", marginBottom:8, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                      <span style={{ fontSize:12, color:t.textSecondary }}>Owes you</span>
                      <span style={{ fontSize:13, fontWeight:600, color:t.text }}>${owesYou.toFixed(2)}</span>
                    </div>
                  )}
                  {youOwe > 0 && (
                    <div style={{ background:t.inputBg, borderRadius:9, padding:"9px 12px", marginBottom:8, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                      <span style={{ fontSize:12, color:t.textSecondary }}>You owe</span>
                      <span style={{ fontSize:13, fontWeight:600, color:"#F97316" }}>${youOwe.toFixed(2)}</span>
                    </div>
                  )}

                  {/* Bulk request button */}

                  {net === 0 && receiptsInvolved > 0 && (
                    <div style={{ textAlign:"center", fontSize:12, color:t.textMuted, paddingTop:4 }}>All settled up ✓</div>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {showAddReceipt&&<AddReceiptSheet trips={[trip]} onClose={()=>setShowAddReceipt(false)} onAdd={onAddReceipt} t={t} defaultTrip={trip.name}/>}
      {showReceipt&&<ReceiptModal
        r={showReceipt}
        trips={[trip]}
        onClose={()=>setShowReceipt(null)}
        onVenmo={r=>{setShowReceipt(null);onVenmo(r);}}
        onUpdate={updated=>{
          if(onUpdateReceipt) onUpdateReceipt(updated);
          setShowReceipt(updated);
        }}
        onDelete={r=>{ if(onUpdateReceipt) onUpdateReceipt({...r, _deleted:true}); setShowReceipt(null); }}
        t={t}
      />}

      {/* Person breakdown sheet — screenshottable */}
      {selectedPerson && (() => {
        const person = selectedPerson;
        const color = PERSON_COLORS[trip.memberNames.filter(m=>m!=="you").indexOf(person) % PERSON_COLORS.length];
        const personReceipts = active.filter(r => r.people.includes(person));
        const owesYou = active.filter(r => {
          const payers = Array.isArray(r.payer) ? r.payer : [r.payer || "you"];
          return payers.includes("you") && r.people.includes(person) && !r.paid;
        }).reduce((sum, r) => sum + (r.personTotals?.[person] || r.total / r.people.length), 0);
        const youOwe = active.filter(r => {
          const payers = Array.isArray(r.payer) ? r.payer : [r.payer || "you"];
          return payers.includes(person) && !r.paid;
        }).reduce((sum, r) => sum + r.yourShare, 0);
        const net = owesYou - youOwe;

        return (
          <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.5)", zIndex:400, display:"flex", flexDirection:"column", justifyContent:"flex-end" }} onClick={()=>setSelectedPerson(null)}>
            <div className="su" onClick={e=>e.stopPropagation()} style={{ background:t.bg, borderRadius:"20px 20px 0 0", border:`1px solid ${t.border}`, maxHeight:"92vh", display:"flex", flexDirection:"column" }}>
              <SheetHandle t={t}/>

              {/* Screenshot-friendly header */}
              <div style={{ padding:"18px 22px 16px", borderBottom:`1px solid ${t.border}`, flexShrink:0 }}>
                <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                  <div style={{ width:46, height:46, borderRadius:13, background:color+"22", border:`2px solid ${color}`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:18, fontWeight:700, color }}>
                    {person[0].toUpperCase()}
                  </div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:18, fontWeight:700, fontFamily:"'Syne',sans-serif", color:t.text }}>{person}</div>
                    <div style={{ fontSize:12, color:t.textSecondary, marginTop:2 }}>{trip.name} · {personReceipts.length} payments</div>
                  </div>
                  <div style={{ textAlign:"right" }}>
                    <div style={{ fontSize:22, fontWeight:800, fontFamily:"'Syne',sans-serif", color: net > 0 ? t.accent : net < 0 ? "#F97316" : t.textMuted }}>
                      {net > 0 ? `+$${net.toFixed(2)}` : net < 0 ? `-$${Math.abs(net).toFixed(2)}` : "$0.00"}
                    </div>
                    <div style={{ fontSize:11, color:t.textMuted }}>{net > 0 ? "owes you" : net < 0 ? "you owe" : "all clear"}</div>
                  </div>
                </div>
              </div>

              <div style={{ overflowY:"auto", flex:1, padding:"16px 22px 0" }}>
                <div style={{ display:"flex", flexDirection:"column", gap:10, paddingBottom:32 }}>

                  {personReceipts.length === 0 && (
                    <div style={{ textAlign:"center", padding:"32px 0", color:t.textMuted, fontSize:13 }}>No shared payments yet</div>
                  )}

                  {personReceipts.map((r, i) => {
                    const payers = Array.isArray(r.payer) ? r.payer : [r.payer || "you"];
                    const personAmt = r.personTotals?.[person] || r.total / r.people.length;
                    const theyPaid = payers.includes(person);
                    const youPaid = payers.includes("you");
                    const settled = r.paid;
                    return (
                      <div key={r.id} style={{ background:t.surface, border:`1px solid ${t.border}`, borderRadius:13, overflow:"hidden", opacity:settled?0.6:1 }}>
                        {/* Receipt row */}
                        <div style={{ padding:"13px 16px", display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
                          <div style={{ flex:1, minWidth:0, paddingRight:12 }}>
                            <div style={{ fontSize:14, fontWeight:600, color:t.text, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{r.name}</div>
                            {r.description && <div style={{ fontSize:12, color:t.textSecondary, marginTop:2 }}>{r.description}</div>}
                            <div style={{ fontSize:11, color:t.textMuted, marginTop:3 }}>{r.date}</div>
                          </div>
                          <div style={{ textAlign:"right", flexShrink:0 }}>
                            <div style={{ fontSize:15, fontWeight:700, fontFamily:"'Syne',sans-serif", color:t.text }}>${personAmt.toFixed(2)}</div>
                            <div style={{ fontSize:11, color: theyPaid?"#34D399":youPaid?t.accent:t.textMuted, marginTop:2, fontWeight:500 }}>
                              {settled ? "settled" : theyPaid ? "they paid 💳" : youPaid ? "you paid 💳" : "split"}
                            </div>
                          </div>
                        </div>

                        {/* Itemized breakdown if available */}
                        {r.itemized?.items && r.itemized.items.length > 0 && (() => {
                          const theirItems = r.itemized.items.filter(it => {
                            const assigned = Array.isArray(it.assignedTo) ? it.assignedTo : [...(it.assignedTo||[])];
                            return assigned.includes(person);
                          });
                          if (theirItems.length === 0) return null;
                          return (
                            <div style={{ borderTop:`1px solid ${t.border}`, padding:"10px 16px", background:t.inputBg }}>
                              {theirItems.map((it, j) => {
                                const assigned = Array.isArray(it.assignedTo) ? it.assignedTo : [...(it.assignedTo||[])];
                                const perPerson = (it.price * (it.quantity||1)) / assigned.length;
                                return (
                                  <div key={j} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:j<theirItems.length-1?6:0 }}>
                                    <span style={{ fontSize:12, color:t.textSecondary }}>{it.name}{assigned.length>1?` (shared ×${assigned.length})`:""}</span>
                                    <span style={{ fontSize:12, fontWeight:500, color:t.text }}>${perPerson.toFixed(2)}</span>
                                  </div>
                                );
                              })}
                            </div>
                          );
                        })()}
                      </div>
                    );
                  })}

                  {/* Summary footer — the screenshottable total */}
                  {personReceipts.length > 0 && (
                    <div style={{ background:t.surface, border:`1px solid ${t.border}`, borderRadius:13, padding:"16px", marginTop:4 }}>
                      <div style={{ fontSize:11, fontWeight:600, color:t.textMuted, letterSpacing:0.8, textTransform:"uppercase", marginBottom:12 }}>Summary</div>
                      {owesYou > 0 && (
                        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:youOwe>0?10:0 }}>
                          <span style={{ fontSize:13, color:t.textSecondary }}>{person} owes you</span>
                          <span style={{ fontSize:15, fontWeight:700, fontFamily:"'Syne',sans-serif", color:t.text }}>${owesYou.toFixed(2)}</span>
                        </div>
                      )}
                      {youOwe > 0 && (
                        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                          <span style={{ fontSize:13, color:t.textSecondary }}>You owe {person}</span>
                          <span style={{ fontSize:15, fontWeight:700, fontFamily:"'Syne',sans-serif", color:"#F97316" }}>${youOwe.toFixed(2)}</span>
                        </div>
                      )}
                      {owesYou === 0 && youOwe === 0 && (
                        <div style={{ fontSize:13, color:t.textMuted, textAlign:"center" }}>All settled up ✓</div>
                      )}
                      <div style={{ height:1, background:t.border, margin:"12px 0 10px" }}/>
                      <div style={{ fontSize:11, color:t.textMuted, textAlign:"center", marginBottom: owesYou > 0 ? 12 : 0 }}>sp/itt. · {trip.name}</div>
                      {owesYou > 0 && (
                        <button className="press" onClick={()=>window.open(`https://venmo.com/u/${encodeURIComponent(person)}`, "_blank")} style={{ width:"100%", padding:"11px", background:"#3D95CE", border:"none", borderRadius:9, color:"#fff", fontSize:13, fontWeight:600, display:"flex", alignItems:"center", justifyContent:"center", gap:7 }}>
                          <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M12.5 2C11.3 4.5 9.5 7.4 8 9.2L6.2 4H2.5L5.5 14h3.8C11.5 11 14 6.5 14 4c0-1-.5-1.8-1.5-2z" fill="#fff"/></svg>
                          Request ${owesYou.toFixed(2)} from {person}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div style={{ padding:"12px 22px 34px", borderTop:`1px solid ${t.border}`, background:t.bg, flexShrink:0 }}>
                <button className="press" onClick={()=>setSelectedPerson(null)} style={{ width:"100%", padding:"13px", background:t.surface, border:`1px solid ${t.border}`, borderRadius:11, color:t.text, fontSize:13, fontWeight:500 }}>Close</button>
              </div>
            </div>
          </div>
        );
      })()}
      {/* Edit trip sheet */}
      {showEdit && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.5)", zIndex:400, display:"flex", flexDirection:"column", justifyContent:"flex-end" }} onClick={()=>setShowEdit(false)}>
          <div className="su" onClick={e=>e.stopPropagation()} style={{ background:t.bg, borderRadius:"20px 20px 0 0", border:`1px solid ${t.border}`, maxHeight:"90vh", display:"flex", flexDirection:"column" }}>
            <SheetHandle t={t}/>
            <SheetHeader title="Edit trip" sub="Update trip details" onClose={()=>setShowEdit(false)} t={t}/>
            <div style={{ overflowY:"auto", flex:1, padding:"4px 22px 0" }}>
              <div style={{ display:"flex", flexDirection:"column", gap:16, paddingBottom:8 }}>
                <div><Label t={t}>Icon</Label><IconPicker value={editIcon} onChange={setEditIcon} t={t}/></div>
                <div>
                  <Label t={t}>Trip name</Label>
                  <input value={editName} onChange={e=>setEditName(e.target.value)} placeholder="Trip name…" style={{ width:"100%", background:t.inputBg, border:`1px solid ${t.border}`, borderRadius:10, padding:"11px 13px", color:t.text, fontSize:14, fontFamily:"'DM Sans',sans-serif" }}/>
                </div>
                <div>
                  <Label t={t}>Dates</Label>
                  <input value={editDates} onChange={e=>setEditDates(e.target.value)} placeholder="Mar 7–10, Upcoming…" style={{ width:"100%", background:t.inputBg, border:`1px solid ${t.border}`, borderRadius:10, padding:"11px 13px", color:t.text, fontSize:14, fontFamily:"'DM Sans',sans-serif" }}/>
                </div>
                <div>
                  <Label t={t}>People</Label>
                  <div style={{ display:"flex", gap:7, flexWrap:"wrap", marginBottom:10 }}>
                    {["you",...ALL_FRIENDS].map(p => {
                      const sel = editPeople.includes(p);
                      return (
                        <button key={p} className="press" onClick={()=>{ if(p==="you")return; setEditPeople(prev=>prev.includes(p)?prev.filter(x=>x!==p):[...prev,p]); }} style={{ padding:"7px 13px", borderRadius:9, background:sel?t.accent:t.inputBg, border:`1.5px solid ${sel?t.accent:t.border}` }}>
                          <span style={{ fontSize:12, fontWeight:600, color:sel?t.accentText:t.textSecondary }}>{p==="you"?"you":`${p}`}</span>
                        </button>
                      );
                    })}
                  </div>
                  <div style={{ display:"flex", gap:8 }}>
                    <input
                      value={editCustomInput}
                      onChange={e=>setEditCustomInput(e.target.value)}
                      onKeyDown={e=>{ if(e.key==="Enter"){ e.preventDefault(); const clean=editCustomInput.trim().replace(/^@/,""); if(clean&&!editPeople.includes(clean)){setEditPeople(prev=>[...prev,clean]);} setEditCustomInput(""); }}}
                      placeholder="Add someone else… @name"
                      style={{ flex:1, background:t.inputBg, border:`1px solid ${t.border}`, borderRadius:10, padding:"10px 13px", color:t.text, fontSize:14, fontFamily:"'DM Sans',sans-serif" }}
                    />
                    <button className="press" onClick={()=>{ const clean=editCustomInput.trim().replace(/^@/,""); if(clean&&!editPeople.includes(clean)){setEditPeople(prev=>[...prev,clean]);} setEditCustomInput(""); }} style={{ padding:"10px 14px", background:t.accent, border:"none", borderRadius:10, color:t.accentText, fontSize:13, fontWeight:600, flexShrink:0 }}>Add</button>
                  </div>
                  {editPeople.filter(p=>p!=="you"&&!ALL_FRIENDS.includes(p)).length > 0 && (
                    <div style={{ display:"flex", gap:7, flexWrap:"wrap", marginTop:10 }}>
                      {editPeople.filter(p=>p!=="you"&&!ALL_FRIENDS.includes(p)).map(p=>(
                        <div key={p} style={{ display:"flex", alignItems:"center", gap:5, padding:"6px 10px 6px 12px", borderRadius:9, background:t.accent, border:`1.5px solid ${t.accent}` }}>
                          <span style={{ fontSize:12, fontWeight:600, color:t.accentText }}>{p}</span>
                          <button onClick={()=>setEditPeople(prev=>prev.filter(x=>x!==p))} style={{ background:"none", border:"none", color:t.accentText, fontSize:13, lineHeight:1, padding:"0 2px", cursor:"pointer", opacity:0.7 }}>✕</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div style={{ paddingBottom:8 }}/>
              </div>
            </div>
            <div style={{ padding:"12px 22px 34px", borderTop:`1px solid ${t.border}`, background:t.bg, display:"flex", gap:10, flexShrink:0 }}>
              <button className="press" onClick={()=>setShowEdit(false)} style={{ flex:1, padding:"13px", background:t.surface, border:`1px solid ${t.border}`, borderRadius:11, color:t.text, fontSize:13, fontWeight:500 }}>Cancel</button>
              <button className="press" onClick={()=>{ if(onUpdateTrip) onUpdateTrip({...trip, name:editName||trip.name, dates:editDates||trip.dates, memberNames:editPeople, icon:editIcon}); setShowEdit(false); }} style={{ flex:2, padding:"13px", background:t.accent, border:"none", borderRadius:11, color:t.accentText, fontSize:13, fontWeight:700, fontFamily:"'Syne',sans-serif" }}>
                Save changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── PLUS TAB ──────────────────────────────────────────────────────────────────
function PlusTab({ trips, onAddReceipt, onReceiptDone, onAddTrip, venmoHandle, zelleHandle, friends, homeCurrency="USD", tripCurrency="USD", exchangeRate=null, t }) {
  const [showReceipt, setShowReceipt] = useState(false);
  const [showTrip, setShowTrip] = useState(false);
  const [quickAdd, setQuickAdd] = useState(null); // { category, icon }

  const QUICK_CATS = [
    { l:"Food & drinks", icon:<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 6c0-1.7 1.3-4 4-4s4 2.3 4 4c0 2.5-1.8 4-4 4S3 8.5 3 6z" stroke="currentColor" strokeWidth="1.2"/><path d="M12 3v10M10 5h4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg> },
    { l:"Accommodation", icon:<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M2 14V7l6-4 6 4v7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/><rect x="5.5" y="9" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.2"/></svg> },
    { l:"Transport",     icon:<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M2 10l2-5h8l2 5v2H2v-2z" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/><circle cx="5.5" cy="12" r="1.2" stroke="currentColor" strokeWidth="1.1"/><circle cx="10.5" cy="12" r="1.2" stroke="currentColor" strokeWidth="1.1"/></svg> },
    { l:"Activities",   icon:<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><polygon points="8,1 9.8,5.8 15,5.8 10.8,8.8 12.4,14 8,11 3.6,14 5.2,8.8 1,5.8 6.2,5.8" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/></svg> },
  ];

  return (
    <div style={{ padding:"8px 20px 120px" }}>
      <div style={{ paddingTop:18, marginBottom:26 }}>
        <div style={{ fontSize:22, fontWeight:700, fontFamily:"'Syne',sans-serif", color:t.text, marginBottom:3 }}>Add</div>
        <div style={{ fontSize:14, color:t.textSecondary }}>Split a receipt or start a trip</div>
      </div>
      {[
        { label:"Scan a receipt", sub:"Capture, upload, or enter manually", onClick:()=>setShowReceipt(true), icon:<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><rect x="2" y="5" width="16" height="10" rx="2" stroke="currentColor" strokeWidth="1.4"/><circle cx="10" cy="10" r="3" stroke="currentColor" strokeWidth="1.4"/></svg> },
        { label:"Start a trip", sub:"Group receipts into one shared log", onClick:()=>setShowTrip(true), icon:<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M3 10h14M10 3l7 7-7 7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg> },
      ].map((item,i)=>(
        <button key={i} className="press fu" onClick={item.onClick} style={{ width:"100%", background:t.surface, border:`1px solid ${t.border}`, borderRadius:14, padding:"18px", marginBottom:10, display:"flex", alignItems:"center", gap:14, textAlign:"left", animationDelay:`${i*0.06}s` }}>
          <div style={{ width:44, height:44, borderRadius:11, background:t.inputBg, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, color:t.textSecondary }}>{item.icon}</div>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:14, fontWeight:600, fontFamily:"'Syne',sans-serif", color:t.text, marginBottom:2 }}>{item.label}</div>
            <div style={{ fontSize:13, color:t.textSecondary }}>{item.sub}</div>
          </div>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M5 3l4 4-4 4" stroke={t.textMuted} strokeWidth="1.5" strokeLinecap="round"/></svg>
        </button>
      ))}

      <div style={{ marginTop:8 }}>
        <Label t={t}>Quick add</Label>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
          {QUICK_CATS.map(item=>(
            <button key={item.l} className="press fu" onClick={()=>setQuickAdd(item)} style={{ background:t.surface, border:`1px solid ${t.border}`, borderRadius:12, padding:"14px", textAlign:"left", display:"flex", flexDirection:"column", gap:8, color:t.textSecondary }}>
              {item.icon}
              <div style={{ fontSize:12, fontWeight:500, color:t.textSecondary }}>{item.l}</div>
            </button>
          ))}
        </div>
      </div>

      {showReceipt&&<AddReceiptSheet trips={trips} onClose={()=>{ setShowReceipt(false); onReceiptDone?.(); }} onAdd={onAddReceipt} venmoHandle={venmoHandle} zelleHandle={zelleHandle} homeCurrency={homeCurrency} tripCurrency={tripCurrency} exchangeRate={exchangeRate} t={t}/>}
      {showTrip&&<AddTripSheet onClose={()=>setShowTrip(false)} onAdd={onAddTrip} t={t}/>}
      {quickAdd&&<QuickAddSheet category={quickAdd.l} categoryIcon={quickAdd.icon} trips={trips} onClose={()=>{ setQuickAdd(null); onReceiptDone?.(); }} onAdd={onAddReceipt} venmoHandle={venmoHandle} zelleHandle={zelleHandle} homeCurrency={homeCurrency} tripCurrency={tripCurrency} exchangeRate={exchangeRate} t={t}/>}
    </div>
  );
}

// ── QUICK ADD SHEET ────────────────────────────────────────────────────────────
function QuickAddSheet({ category, categoryIcon, trips, onClose, onAdd, venmoHandle="", zelleHandle="", homeCurrency="USD", tripCurrency="USD", exchangeRate=null, t }) {
  const [mode, setMode] = useState("form"); // "form"|"scanning"|"itemize"|"confirm"|"pay"
  const [photo, setPhoto] = useState(null);
  const [scanResult, setScanResult] = useState(null);
  const [scanError, setScanError] = useState(null);
  const [splitResult, setSplitResult] = useState(null);
  const [savedReceipt, setSavedReceipt] = useState(null);
  const [itemizeReady, setItemizeReady] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [total, setTotal] = useState("");
  const [people, setPeople] = useState(["you"]);
  const [payer, setPayer] = useState(["you"]);
  const [trip, setTrip] = useState(null);
  const fileRef = useRef();

  const handleFile = async (e) => {
    let file = e.target.files[0];
    if (!file) return;
    e.target.value = "";
    file = await convertToJpegIfNeeded(file);
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const dataUrl = ev.target.result;
      setPhoto(dataUrl);
      setMode("scanning");
      setScanError(null);
      try {
        const result = await scanReceiptWithAI(dataUrl);
        if (result.error) throw new Error(result.error);
        setScanResult(result);
        if (result.restaurantName) setName(result.restaurantName);
        if (result.total) setTotal(String(result.total));
        setMode("itemize");
      } catch (err) {
        setScanError(err.message || "Could not read receipt");
        setMode("form");
      }
    };
    reader.readAsDataURL(file);
  };

  const togglePerson = (p) => {
    setPeople(prev => {
      const next = prev.includes(p) ? prev.filter(x=>x!==p) : [...prev, p];
      if (!next.includes(p)) setPayer(pr => { const nxt = pr.filter(x=>x!==p); return nxt.length ? nxt : ["you"]; });
      return next;
    });
  };

  const togglePayer = (p) => {
    setPayer(prev => {
      const next = prev.includes(p) ? prev.filter(x=>x!==p) : [...prev, p];
      return next.length ? next : [p];
    });
  };

  const handleSplitConfirm = (result) => {
    setSplitResult(result);
    setTotal(String(result.total));
    setItemizeReady(false);
    setMode("confirm");
  };

  const handleSave = () => {
    const totalNum = parseFloat(total) || 0;
    const yourShare = splitResult?.yourShare ?? (people.length ? totalNum / people.length : 0);
    const tripObj = trips?.find(x => x.name === trip);
    const dateStr = new Date().toLocaleDateString("en-US", { month:"short", day:"numeric" });
    const receiptName = name || category;
    const newReceipt = {
      id: Date.now(), name: receiptName, trip, total: totalNum, date: dateStr,
      people, yourShare, paid: false, archived: false, photoUrl: photo || null,
      tripIcon: tripObj?.icon || null, itemized: splitResult || null,
      payer, personTotals: splitResult?.personTotals || null,
      description: description || null,
    };
    onAdd(newReceipt);
    setSavedReceipt(newReceipt);
    setMode("pay");
  };

  const perPerson = people.length && parseFloat(total) ? parseFloat(total) / people.length : 0;
  const canSave = parseFloat(total) > 0;

  // SCANNING
  if (mode === "scanning") return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.55)", zIndex:300, display:"flex", flexDirection:"column", justifyContent:"flex-end" }}>
      <div className="su" style={{ background:t.bg, borderRadius:"20px 20px 0 0", border:`1px solid ${t.border}` }}>
        <SheetHandle t={t}/>
        <div style={{ padding:"16px 22px 0", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <button className="press" onClick={()=>setMode("form")} style={{ background:"none", border:"none", color:t.textSecondary, fontSize:13, fontWeight:500, display:"flex", alignItems:"center", gap:5, padding:0 }}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M9 3L5 7 9 11" stroke={t.textSecondary} strokeWidth="1.5" strokeLinecap="round"/></svg>
            Back
          </button>
        </div>
        <div style={{ padding:"12px 22px 52px", display:"flex", flexDirection:"column", alignItems:"center", gap:16 }}>
          {photo && <img src={photo} alt="" style={{ width:"100%", maxHeight:160, objectFit:"cover", borderRadius:12, border:`1px solid ${t.border}` }}/>}
          <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:10, paddingTop:4 }}>
            <div style={{ position:"relative", width:36, height:36 }}>
              <svg viewBox="0 0 40 40" style={{ position:"absolute", inset:0, animation:"spin 1s linear infinite", width:36, height:36 }}>
                <circle cx="20" cy="20" r="16" fill="none" stroke={t.accent} strokeWidth="3" strokeDasharray="60 40" strokeLinecap="round"/>
              </svg>
            </div>
            <div style={{ fontSize:14, color:t.textSecondary, textAlign:"center", lineHeight:1.7 }}>
              Reading your receipt…<br/><span style={{ fontSize:12, color:t.textMuted }}>AI is itemizing everything</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  // ITEMIZE
  if (mode === "itemize") return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.55)", zIndex:300, display:"flex", flexDirection:"column", justifyContent:"flex-end" }}>
      <div className="su" style={{ background:t.bg, borderRadius:"20px 20px 0 0", border:`1px solid ${t.border}`, height:"94vh", display:"flex", flexDirection:"column", overflow:"hidden" }}>
        <SheetHandle t={t}/>
        <div style={{ padding:"12px 22px 14px", display:"flex", justifyContent:"space-between", alignItems:"center", borderBottom:`1px solid ${t.border}`, flexShrink:0 }}>
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            <button className="press" onClick={()=>setMode("form")} style={{ background:"none", border:"none", color:t.textSecondary, display:"flex", alignItems:"center", padding:0 }}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M9 3L5 7 9 11" stroke={t.textSecondary} strokeWidth="1.5" strokeLinecap="round"/></svg>
            </button>
            <div>
              <div style={{ fontSize:15, fontWeight:700, fontFamily:"'Syne',sans-serif", color:t.text }}>{name || category}</div>
              <div style={{ fontSize:12, color:t.textSecondary, marginTop:2 }}>Select who was there, then claim items</div>
            </div>
          </div>
          <button onClick={onClose} className="press" style={{ background:t.surface, border:`1px solid ${t.border}`, color:t.textSecondary, width:30, height:30, borderRadius:8, fontSize:13, display:"flex", alignItems:"center", justifyContent:"center" }}>✕</button>
        </div>
        {!itemizeReady ? (
          <>
            <div style={{ overflowY:"auto", flex:1, padding:"16px 22px 0" }}>
              <div style={{ display:"flex", flexDirection:"column", gap:16, paddingBottom:8 }}>
                {scanResult && (
                  <div style={{ background:t.surface, border:`1px solid ${t.border}`, borderRadius:10, padding:"11px 14px", display:"flex", justifyContent:"space-between" }}>
                    <span style={{ fontSize:13, color:t.textSecondary }}>{(scanResult.items||[]).length} items</span>
                    <span style={{ fontSize:13, fontWeight:700, color:t.text }}>${(scanResult.total||0).toFixed(2)}</span>
                  </div>
                )}
                <div>
                  <Label t={t}>Who was there?</Label>
                  <div style={{ display:"flex", gap:7, flexWrap:"wrap" }}>
                    {["you",...ALL_FRIENDS].map(p=>{
                      const sel = people.includes(p);
                      return <Pill key={p} active={sel} t={t} onClick={()=>togglePerson(p)}>{p==="you"?"you":`${p}`}</Pill>;
                    })}
                  </div>
                </div>
                <div>
                  <Label t={t}>Who paid the bill?</Label>
                  <div style={{ fontSize:11, color:t.textMuted, marginBottom:8, marginTop:2 }}>Tap to toggle — select all who paid</div>
                  <div style={{ display:"flex", gap:7, flexWrap:"wrap" }}>
                    {people.map(p=>(
                      <button key={p} className="press" onClick={()=>togglePayer(p)} style={{ display:"flex", alignItems:"center", gap:6, padding:"7px 13px", borderRadius:9, background:payer.includes(p)?t.accent:t.inputBg, border:`1.5px solid ${payer.includes(p)?t.accent:t.border}` }}>
                        <span style={{ fontSize:12, fontWeight:600, color:payer.includes(p)?t.accentText:t.textSecondary }}>{p==="you"?"you":`${p}`}</span>
                        {payer.includes(p) && <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M2 5.5l2.5 2.5 4.5-5" stroke={t.accentText} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                      </button>
                    ))}
                  </div>
                </div>
                <div style={{ paddingBottom:8 }}/>
              </div>
            </div>
            <div style={{ padding:"12px 22px 34px", borderTop:`1px solid ${t.border}`, background:t.bg, display:"flex", gap:10, flexShrink:0 }}>
              <button className="press" onClick={()=>setMode("form")} style={{ flex:1, padding:"13px", background:t.surface, border:`1px solid ${t.border}`, borderRadius:11, color:t.text, fontSize:13, fontWeight:500 }}>Back</button>
              <button className="press" onClick={()=>setItemizeReady(true)} disabled={people.length < 2} style={{ flex:2, padding:"13px", background:people.length>=2?t.accent:t.border, border:"none", borderRadius:11, color:people.length>=2?t.accentText:t.textMuted, fontSize:13, fontWeight:700, fontFamily:"'Syne',sans-serif" }}>
                {people.length < 2 ? "Add at least one person" : `Claim items for ${people.length} →`}
              </button>
            </div>
          </>
        ) : (
          <ItemizedSplitter scanResult={scanResult} people={people} onConfirm={handleSplitConfirm} onBack={()=>setItemizeReady(false)} tripCurrency={tripCurrency} t={t}/>
        )}
      </div>
    </div>
  );

  // CONFIRM
  if (mode === "confirm" && splitResult) return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.55)", zIndex:300, display:"flex", flexDirection:"column", justifyContent:"flex-end" }}>
      <div className="su" style={{ background:t.bg, borderRadius:"20px 20px 0 0", border:`1px solid ${t.border}`, maxHeight:"88vh", display:"flex", flexDirection:"column" }}>
        <SheetHandle t={t}/>
        <SheetHeader title="Confirm & save" sub="Review the split before saving" onClose={onClose} t={t}/>
        <div style={{ overflowY:"auto", flex:1, padding:"12px 22px 0" }}>
          <div style={{ display:"flex", flexDirection:"column", gap:14, paddingBottom:16 }}>
            <div>
              <Label t={t}>Title</Label>
              <input value={name} onChange={e=>setName(e.target.value)} placeholder={category+"…"} style={{ width:"100%", background:t.inputBg, border:`1px solid ${t.border}`, borderRadius:10, padding:"11px 13px", color:t.text, fontSize:14, fontWeight:600 }}/>
            </div>
            <div style={{ background:payer.includes("you")?t.accent+"18":"#3D95CE18", border:`1px solid ${payer.includes("you")?t.accent+"44":"#3D95CE44"}`, borderRadius:11, padding:"11px 14px", display:"flex", alignItems:"center", gap:10 }}>
              <div style={{ width:30, height:30, borderRadius:8, background:payer.includes("you")?t.accent:"#3D95CE", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                <span style={{ fontSize:12, fontWeight:700, color:payer.includes("you")?t.accentText:"#fff" }}>{payer.includes("you") ? "✓" : payer.filter(p=>p!=="you")[0]?.[0]?.toUpperCase() || "?"}</span>
              </div>
              <div style={{ fontSize:12, color:t.text }}>
                <span style={{ fontWeight:600 }}>{payer.includes("you")?"You paid":payer.filter(p=>p!=="you").map(p=>`${p}`).join(" & ")+" paid"}</span>
                {" — "}{payer.includes("you")?"others are paying you":"everyone is paying "+payer.filter(p=>p!=="you").map(p=>`${p}`).join(" & ")}
              </div>
            </div>
            <div style={{ background:t.surface, border:`1px solid ${t.border}`, borderRadius:12, overflow:"hidden" }}>
              <div style={{ padding:"10px 14px", borderBottom:`1px solid ${t.border}`, fontSize:11, fontWeight:600, color:t.textMuted, letterSpacing:0.8, textTransform:"uppercase" }}>Per person</div>
              {Object.entries(splitResult.personTotals).map(([p,amt],i,arr)=>{
                const isPayer = p === payer;
                return (
                  <div key={p} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"11px 14px", borderBottom:i<arr.length-1?`1px solid ${t.border}`:"none", background:isPayer?t.accent+"0A":"transparent" }}>
                    <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                      <div style={{ width:26, height:26, borderRadius:7, background:isPayer?t.accent:t.border, display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, fontWeight:700, color:isPayer?t.accentText:t.textSecondary }}>{p[0].toUpperCase()}</div>
                      <div>
                        <div style={{ fontSize:13, fontWeight:isPayer?600:400, color:t.text }}>{p==="you"?"you":`${p}`}{isPayer?" 💳":""}</div>
                        {p!==payer && <div style={{ fontSize:11, color:t.textMuted }}>paying</div>}
                      </div>
                    </div>
                    <span style={{ fontSize:14, fontWeight:700, fontFamily:"'Syne',sans-serif", color:isPayer?t.accent:t.text }}>${amt.toFixed(2)}</span>
                  </div>
                );
              })}
            </div>
            <div>
              <Label t={t}>Who paid</Label>
              <div style={{ display:"flex", gap:7, flexWrap:"wrap" }}>
                {people.map(p=>(
                  <button key={p} className="press" onClick={()=>togglePayer(p)} style={{ display:"flex", alignItems:"center", gap:6, padding:"7px 13px", borderRadius:9, background:payer.includes(p)?t.accent:t.inputBg, border:`1.5px solid ${payer.includes(p)?t.accent:t.border}` }}>
                    <span style={{ fontSize:12, fontWeight:600, color:payer.includes(p)?t.accentText:t.textSecondary }}>{p==="you"?"you":`${p}`}</span>
                    {payer.includes(p) && <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M2 5.5l2.5 2.5 4.5-5" stroke={t.accentText} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <Label t={t}>Trip (optional)</Label>
              <div style={{ display:"flex", gap:7, flexWrap:"wrap" }}>
                <Pill active={!trip} t={t} onClick={()=>setTrip(null)}>None</Pill>
                {(trips||[]).map(tr=>(
                  <button key={tr.id} className="press" onClick={()=>setTrip(tr.name)} style={{ display:"flex", alignItems:"center", gap:6, padding:"6px 12px", borderRadius:8, background:trip===tr.name?t.accent+"22":t.inputBg, border:`1px solid ${trip===tr.name?t.accent:t.border}` }}>
                    <TripIcon icon={tr.icon} size={12}/>
                    <span style={{ fontSize:12, fontWeight:trip===tr.name?600:400, color:trip===tr.name?t.accent:t.textSecondary }}>{tr.name}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
        <div style={{ padding:"12px 22px 34px", borderTop:`1px solid ${t.border}`, background:t.bg, display:"flex", gap:10, flexShrink:0 }}>
          <button className="press" onClick={()=>setMode("itemize")} style={{ flex:1, padding:"13px", background:t.surface, border:`1px solid ${t.border}`, borderRadius:11, color:t.text, fontSize:13, fontWeight:500, display:"flex", alignItems:"center", justifyContent:"center", gap:5 }}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M7.5 2L3.5 6l4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
            Back
          </button>
          <button className="press" onClick={handleSave} style={{ flex:2, padding:"13px", background:t.accent, border:"none", borderRadius:11, color:t.accentText, fontSize:13, fontWeight:700, fontFamily:"'Syne',sans-serif" }}>
            {payer.includes("you") ? "Save & Request →" : "Save & Pay →"}
          </button>
        </div>
      </div>
    </div>
  );

  // PAY
  if (mode === "pay" && savedReceipt) return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.55)", zIndex:300, display:"flex", flexDirection:"column", justifyContent:"flex-end" }}>
      <PayStep receipt={savedReceipt} onClose={onClose} onBack={()=>setMode("confirm")} venmoHandle={venmoHandle} zelleHandle={zelleHandle} t={t}/>
    </div>
  );

  // FORM (default / manual fallback)
  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.55)", zIndex:300, display:"flex", flexDirection:"column", justifyContent:"flex-end" }}>
      <div className="su" style={{ background:t.bg, borderRadius:"20px 20px 0 0", border:`1px solid ${t.border}`, maxHeight:"92vh", display:"flex", flexDirection:"column" }}>
        <SheetHandle t={t}/>
        <SheetHeader title={<div style={{ display:"flex", alignItems:"center", gap:8 }}><span style={{ color:t.textSecondary }}>{categoryIcon}</span>{category}</div>} sub="Quick add an expense" onClose={onClose} t={t}/>
        <div style={{ overflowY:"auto", flex:1, padding:"4px 22px 0" }}>
          <div style={{ display:"flex", flexDirection:"column", gap:16, paddingBottom:32 }}>
            {scanError && <div style={{ background:"#F8717122", border:"1px solid #F8717155", borderRadius:10, padding:"9px 12px", fontSize:12, color:"#F87171" }}>⚠ {scanError} — fill in the details below</div>}
            <div>
              <input ref={fileRef} type="file" accept="image/*,.heic,.heif" style={{ display:"none" }} onChange={handleFile}/>
              {photo ? (
                <div style={{ position:"relative", borderRadius:12, overflow:"hidden", border:`1px solid ${t.border}` }}>
                  <img src={photo} alt="" style={{ width:"100%", maxHeight:140, objectFit:"cover", display:"block" }}/>
                  <button className="press" onClick={()=>{ setPhoto(null); setScanResult(null); setScanError(null); }} style={{ position:"absolute", top:8, right:8, width:26, height:26, borderRadius:7, background:"rgba(0,0,0,0.55)", border:"none", color:"#fff", fontSize:13, display:"flex", alignItems:"center", justifyContent:"center" }}>✕</button>
                </div>
              ) : (
                <>
                  <div style={{ display:"flex", gap:8 }}>
                    <button className="press" onClick={()=>{ fileRef.current.removeAttribute("capture"); fileRef.current.click(); }} style={{ flex:1, padding:"13px 8px", background:t.surface, border:`1px dashed ${t.borderStrong}`, borderRadius:10, color:t.textSecondary, fontSize:12, fontWeight:500, display:"flex", alignItems:"center", justifyContent:"center", gap:6 }}>
                      <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M6.5 1v7M4 5l2.5 3L9 5M1.5 9.5v1.5a1 1 0 001 1h9a1 1 0 001-1V9.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>
                      Upload photo
                    </button>
                    <button className="press" onClick={()=>{ fileRef.current.setAttribute("capture","environment"); fileRef.current.click(); }} style={{ flex:1, padding:"13px 8px", background:t.surface, border:`1px dashed ${t.borderStrong}`, borderRadius:10, color:t.textSecondary, fontSize:12, fontWeight:500, display:"flex", alignItems:"center", justifyContent:"center", gap:6 }}>
                      <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><rect x="1" y="3" width="11" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.2"/><circle cx="6.5" cy="6.5" r="2" stroke="currentColor" strokeWidth="1.2"/></svg>
                      Scan receipt
                    </button>
                  </div>
                  <div style={{ fontSize:11, color:t.textMuted, marginTop:7, textAlign:"center" }}>Uploading a photo will automatically itemize the receipt</div>
                </>
              )}
            </div>
            <div>
              <Label t={t}>Title</Label>
              <input value={name} onChange={e=>setName(e.target.value)} placeholder={category+"…"} autoFocus style={{ width:"100%", background:t.inputBg, border:`1px solid ${t.border}`, borderRadius:10, padding:"11px 13px", color:t.text, fontSize:15, fontWeight:600, fontFamily:"'DM Sans',sans-serif" }}/>
            </div>
            <div>
              <Label t={t}>Description <span style={{ color:t.textMuted, fontWeight:400 }}>(optional)</span></Label>
              <input value={description} onChange={e=>setDescription(e.target.value)} placeholder="Add any notes…" style={{ width:"100%", background:t.inputBg, border:`1px solid ${t.border}`, borderRadius:10, padding:"11px 13px", color:t.text, fontSize:14, fontFamily:"'DM Sans',sans-serif" }}/>
            </div>
            <div>
              <Label t={t}>Amount</Label>
              <div style={{ position:"relative" }}>
                <span style={{ position:"absolute", left:14, top:"50%", transform:"translateY(-50%)", color:t.textSecondary, fontSize:22, fontWeight:700 }}>$</span>
                <input value={total} onChange={e=>setTotal(e.target.value)} type="number" placeholder="0.00" style={{ width:"100%", background:t.inputBg, border:`1px solid ${t.border}`, borderRadius:12, padding:"14px 14px 14px 32px", color:t.text, fontSize:28, fontWeight:800, fontFamily:"'Syne',sans-serif" }}/>
              </div>
            </div>
            <div>
              <Label t={t}>Split with</Label>
              <div style={{ display:"flex", gap:7, flexWrap:"wrap" }}>
                {["you",...ALL_FRIENDS].map(p=>{ const sel=people.includes(p); return <Pill key={p} active={sel} t={t} onClick={()=>togglePerson(p)}>{p==="you"?"you":`${p}`}</Pill>; })}
              </div>
              {perPerson>0 && <div style={{ marginTop:8, fontSize:12, color:t.textSecondary }}>Each pays <span style={{ fontWeight:600, color:t.text }}>${perPerson.toFixed(2)}</span></div>}
            </div>
            {people.length > 1 && (
              <div>
                <Label t={t}>Who paid</Label>
                <div style={{ display:"flex", gap:7, flexWrap:"wrap" }}>
                  {people.map(p=>(
                    <button key={p} className="press" onClick={()=>togglePayer(p)} style={{ display:"flex", alignItems:"center", gap:6, padding:"7px 13px", borderRadius:9, background:payer.includes(p)?t.accent:t.inputBg, border:`1.5px solid ${payer.includes(p)?t.accent:t.border}` }}>
                      <span style={{ fontSize:12, fontWeight:600, color:payer.includes(p)?t.accentText:t.textSecondary }}>{p==="you"?"you":`${p}`}</span>
                      {payer.includes(p) && <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M2 5.5l2.5 2.5 4.5-5" stroke={t.accentText} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div>
              <Label t={t}>Trip <span style={{ color:t.textMuted, fontWeight:400 }}>(optional)</span></Label>
              <div style={{ display:"flex", gap:7, flexWrap:"wrap" }}>
                <Pill active={!trip} t={t} onClick={()=>setTrip(null)}>None</Pill>
                {(trips||[]).map(tr=>(
                  <button key={tr.id} className="press" onClick={()=>setTrip(tr.name)} style={{ display:"flex", alignItems:"center", gap:6, padding:"6px 12px", borderRadius:8, background:trip===tr.name?t.accent+"22":t.inputBg, border:`1px solid ${trip===tr.name?t.accent:t.border}` }}>
                    <TripIcon icon={tr.icon} size={12}/>
                    <span style={{ fontSize:12, fontWeight:trip===tr.name?600:400, color:trip===tr.name?t.accent:t.textSecondary }}>{tr.name}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
        <div style={{ padding:"13px 22px 34px", borderTop:`1px solid ${t.border}`, background:t.bg, display:"flex", gap:10, flexShrink:0 }}>
          <button className="press" onClick={onClose} style={{ flex:1, padding:"14px", background:t.surface, border:`1px solid ${t.border}`, borderRadius:11, color:t.text, fontSize:14, fontWeight:500 }}>Cancel</button>
          <button className="press" onClick={handleSave} disabled={!canSave} style={{ flex:2, padding:"14px", background:canSave?t.accent:t.border, border:"none", borderRadius:11, color:canSave?t.accentText:t.textMuted, fontSize:14, fontWeight:600, fontFamily:"'Syne',sans-serif", transition:"background 0.15s ease" }}>
            {canSave ? `Save — $${perPerson.toFixed(2)} each` : "Enter an amount"}
          </button>
        </div>
      </div>
    </div>
  );
}


// ── FRIENDS TAB ───────────────────────────────────────────────────────────────
function FriendsTab({ friends, setFriends, receipts, t }) {
  const [showAdd, setShowAdd] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState({ name:"", venmo:"", zelle:"" });

  const openAdd = () => { setForm({ name:"", venmo:"", zelle:"" }); setEditId(null); setShowAdd(true); };
  const openEdit = (f) => { setForm({ name:f.name, venmo:f.venmo||"", zelle:f.zelle||"" }); setEditId(f.id); setShowAdd(true); };

  const handleSave = () => {
    if (!form.name.trim()) return;
    if (editId) {
      setFriends(prev => prev.map(f => f.id===editId ? {...f, ...form, name:form.name.trim()} : f));
    } else {
      setFriends(prev => [...prev, { id:Date.now(), name:form.name.trim(), venmo:form.venmo.replace(/^@/,""), zelle:form.zelle }]);
    }
    setShowAdd(false);
  };

  const handleDelete = (id) => {
    setFriends(prev => prev.filter(f => f.id !== id));
  };

  return (
    <div style={{ padding:"0 20px 120px" }}>
      <div style={{ paddingTop:18, marginBottom:22, display:"flex", justifyContent:"space-between", alignItems:"flex-end" }}>
        <div>
          <div style={{ fontSize:22, fontWeight:700, fontFamily:"'Syne',sans-serif", color:t.text, marginBottom:3 }}>Friends</div>
        </div>
        <button className="press" onClick={openAdd} style={{ background:t.accent, border:"none", borderRadius:10, color:t.accentText, fontSize:13, fontWeight:600, padding:"9px 16px", display:"flex", alignItems:"center", gap:6 }}>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M6 1v10M1 6h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
          Add
        </button>
      </div>

      {friends.length === 0 && (
        <div style={{ textAlign:"center", padding:"60px 0", color:t.textMuted }}>
          <svg width="36" height="36" viewBox="0 0 36 36" fill="none" style={{ margin:"0 auto 12px", display:"block" }}><circle cx="14" cy="13" r="6" stroke={t.textMuted} strokeWidth="1.5"/><path d="M2 30c0-6 5-10 12-10s12 4 12 10" stroke={t.textMuted} strokeWidth="1.5" strokeLinecap="round"/><path d="M28 16c3 0 6 2 6 6" stroke={t.textMuted} strokeWidth="1.5" strokeLinecap="round"/><circle cx="29" cy="11" r="4" stroke={t.textMuted} strokeWidth="1.5"/></svg>
          <div style={{ fontSize:14, fontWeight:500, color:t.textSecondary }}>No friends yet</div>
          <div style={{ fontSize:12, marginTop:4 }}>Add people to split with</div>
        </div>
      )}

      <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
        {friends.map((f, i) => {
          const color = PERSON_COLORS[i % PERSON_COLORS.length];
          const sharedReceipts = receipts.filter(r => r.people?.includes(f.name) && !r.archived).length;
          return (
            <button key={f.id} className="press fu" onClick={()=>openEdit(f)} style={{ background:t.surface, border:`1px solid ${t.border}`, borderRadius:14, padding:"14px 16px", display:"flex", alignItems:"center", gap:12, textAlign:"left", animationDelay:`${i*0.05}s` }}>
              <div style={{ width:44, height:44, borderRadius:13, background:color+"22", border:`1.5px solid ${color}`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:17, fontWeight:700, color, flexShrink:0 }}>
                {f.name[0].toUpperCase()}
              </div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:15, fontWeight:600, color:t.text }}>{f.name}</div>
                <div style={{ fontSize:12, color:t.textMuted, marginTop:2 }}>
                  {[f.venmo && `Venmo: ${f.venmo}`, f.zelle && `Zelle: ${f.zelle}`].filter(Boolean).join(" · ") || "No handles saved"}
                </div>
              </div>
              <div style={{ textAlign:"right", flexShrink:0 }}>
                <div style={{ fontSize:12, color:t.textMuted }}>{sharedReceipts} receipt{sharedReceipts!==1?"s":""}</div>
                <svg width="13" height="13" viewBox="0 0 13 13" fill="none" style={{ marginTop:4 }}><path d="M5 3l4 4-4 4" stroke={t.textMuted} strokeWidth="1.5" strokeLinecap="round"/></svg>
              </div>
            </button>
          );
        })}
      </div>

      {/* Add / Edit sheet */}
      {showAdd && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.5)", zIndex:400, display:"flex", flexDirection:"column", justifyContent:"flex-end" }} onClick={()=>setShowAdd(false)}>
          <div className="su" onClick={e=>e.stopPropagation()} style={{ background:t.bg, borderRadius:"20px 20px 0 0", border:`1px solid ${t.border}`, display:"flex", flexDirection:"column" }}>
            <SheetHandle t={t}/>
            <SheetHeader title={editId ? "Edit friend" : "Add friend"} sub="Save their details for easy splitting" onClose={()=>setShowAdd(false)} t={t}/>
            <div style={{ padding:"4px 22px 0", display:"flex", flexDirection:"column", gap:14 }}>
              <div>
                <Label t={t}>Name</Label>
                <input value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} placeholder="Their name" autoFocus style={{ width:"100%", background:t.inputBg, border:`1px solid ${t.border}`, borderRadius:10, padding:"11px 13px", color:t.text, fontSize:15, fontWeight:600, fontFamily:"'DM Sans',sans-serif" }}/>
              </div>
              <div>
                <Label t={t}>Venmo handle <span style={{ color:t.textMuted, fontWeight:400 }}>(optional)</span></Label>
                <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                  <span style={{ fontSize:15, color:t.textMuted, fontWeight:600 }}>@</span>
                  <input value={form.venmo} onChange={e=>setForm(f=>({...f,venmo:e.target.value.replace(/^@/,"")}))} placeholder="their-venmo" style={{ flex:1, background:t.inputBg, border:`1px solid ${t.border}`, borderRadius:10, padding:"11px 13px", color:t.text, fontSize:14, fontFamily:"'DM Sans',sans-serif" }}/>
                </div>
              </div>
              <div>
                <Label t={t}>Zelle <span style={{ color:t.textMuted, fontWeight:400 }}>(optional)</span></Label>
                <input value={form.zelle} onChange={e=>setForm(f=>({...f,zelle:e.target.value}))} placeholder="Phone or email" style={{ width:"100%", background:t.inputBg, border:`1px solid ${t.border}`, borderRadius:10, padding:"11px 13px", color:t.text, fontSize:14, fontFamily:"'DM Sans',sans-serif" }}/>
              </div>
              <div style={{ paddingBottom:8 }}/>
            </div>
            <div style={{ padding:"12px 22px 34px", borderTop:`1px solid ${t.border}`, background:t.bg, display:"flex", flexDirection:"column", gap:10 }}>
              <div style={{ display:"flex", gap:10 }}>
                <button className="press" onClick={()=>setShowAdd(false)} style={{ flex:1, padding:"13px", background:t.surface, border:`1px solid ${t.border}`, borderRadius:11, color:t.text, fontSize:13, fontWeight:500 }}>Cancel</button>
                <button className="press" onClick={handleSave} disabled={!form.name.trim()} style={{ flex:2, padding:"13px", background:form.name.trim()?t.accent:t.border, border:"none", borderRadius:11, color:form.name.trim()?t.accentText:t.textMuted, fontSize:13, fontWeight:700, fontFamily:"'Syne',sans-serif" }}>
                  {editId ? "Save changes" : "Add friend"}
                </button>
              </div>
              {editId && (
                <button className="press" onClick={()=>{ handleDelete(editId); setShowAdd(false); }} style={{ width:"100%", padding:"12px", background:"none", border:`1px solid #F8717155`, borderRadius:11, color:"#F87171", fontSize:13, fontWeight:500 }}>
                  Remove friend
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── FEED / LANDING PAGE ────────────────────────────────────────────────────────
function FeedTab({ receipts, trips, onReceiptClick, onVenmo, onTripClick, onSettleAll, t }) {
  const [showUnsettledOnly, setShowUnsettledOnly] = useState(false);
  const activeReceipts = receipts.filter(r => !r.archived);
  const unsettled = activeReceipts.filter(r => !r.paid);
  const activeTrips = trips.filter(r => !r.archived);

  // Build activity items from receipts — each gets a type + display props
  const activity = activeReceipts.map(r => {
    const payers = Array.isArray(r.payer) ? r.payer : [r.payer || "you"];
    const youPaid = payers.includes("you");
    const others = r.people.filter(p => p !== "you");

    let action, sub, actionColor, icon;
    if (r.paid) {
      action = "Settled";
      sub = r.name;
      actionColor = t.positive;
      icon = "✓";
    } else if (youPaid && others.length > 0) {
      action = `You paid · $${r.total.toFixed(2)}`;
      sub = `${others.map(p=>`${p}`).join(", ")} ${others.length===1?"owes":"owe"} you`;
      actionColor = t.accent;
      icon = "💳";
    } else if (!youPaid) {
      action = `You owe $${r.yourShare.toFixed(2)}`;
      sub = `to ${payers.filter(p=>p!=="you").map(p=>`${p}`).join(" & ")}`;
      actionColor = "#F97316";
      icon = "↗";
    } else {
      action = `$${r.yourShare.toFixed(2)} · just you`;
      sub = r.name;
      actionColor = t.textSecondary;
      icon = "·";
    }

    return { r, action, sub, actionColor, icon, youPaid };
  });

  // Net summary
  const totalOwedToYou = activeReceipts
    .filter(r => { const p = Array.isArray(r.payer)?r.payer:[r.payer||"you"]; return p.includes("you") && !r.paid; })
    .reduce((a, r) => a + r.people.filter(p=>p!=="you").reduce((s,p) => s + (r.personTotals?.[p] || r.total/r.people.length), 0), 0);
  const totalYouOwe = activeReceipts
    .filter(r => { const p = Array.isArray(r.payer)?r.payer:[r.payer||"you"]; return !p.includes("you") && !r.paid; })
    .reduce((a, r) => a + r.yourShare, 0);

  return (
    <div style={{ padding:"0 20px 120px" }}>

      {/* To collect / To pay */}
      <div className="fu" style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:16 }}>
        {/* To collect */}
        <div style={{ background:t.surface, border:`1px solid ${t.border}`, borderRadius:16, padding:"16px" }}>
          <div style={{ fontSize:11, color:t.textMuted, letterSpacing:0.8, textTransform:"uppercase", marginBottom:8 }}>To collect</div>
          <div style={{ fontSize:28, fontWeight:800, fontFamily:"'Syne',sans-serif", color: totalOwedToYou > 0 ? t.text : t.textMuted, lineHeight:1, marginBottom:4 }}>
            ${totalOwedToYou.toFixed(2)}
          </div>
          <div style={{ fontSize:11, color:t.textMuted }}>
            {totalOwedToYou > 0 ? `${activeReceipts.filter(r=>{ const p=Array.isArray(r.payer)?r.payer:[r.payer||"you"]; return p.includes("you")&&!r.paid&&r.people.length>1; }).length} receipts` : "all clear"}
          </div>
        </div>
        {/* To pay */}
        <div style={{ background: totalYouOwe > 0 ? "#F9731608" : t.surface, border:`1px solid ${totalYouOwe > 0 ? "#F9731630" : t.border}`, borderRadius:16, padding:"16px" }}>
          <div style={{ fontSize:11, color:t.textMuted, letterSpacing:0.8, textTransform:"uppercase", marginBottom:8 }}>To pay</div>
          <div style={{ fontSize:28, fontWeight:800, fontFamily:"'Syne',sans-serif", color: totalYouOwe > 0 ? "#F97316" : t.textMuted, lineHeight:1, marginBottom:4 }}>
            ${totalYouOwe.toFixed(2)}
          </div>
          <div style={{ fontSize:11, color:t.textMuted }}>
            {totalYouOwe > 0 ? `${activeReceipts.filter(r=>{ const p=Array.isArray(r.payer)?r.payer:[r.payer||"you"]; return !p.includes("you")&&!r.paid; }).length} receipts` : "all clear"}
          </div>
        </div>
      </div>

      {/* Active trips pill strip */}
      {activeTrips.length > 0 && (
        <div style={{ marginBottom:20 }}>
          <div style={{ display:"flex", gap:8, overflowX:"auto", paddingBottom:2 }}>
            {activeTrips.map(trip => {
              const tR = receipts.filter(r => r.trip===trip.name && !r.archived);
              const settled = tR.filter(r => r.paid).length;
              const pct = tR.length ? (settled/tR.length)*100 : 0;
              return (
                <button key={trip.id} className="press" onClick={()=>onTripClick(trip)} style={{ flexShrink:0, display:"flex", alignItems:"center", gap:9, background:t.surface, border:`1px solid ${t.border}`, borderRadius:20, padding:"8px 14px 8px 10px" }}>
                  <div style={{ width:24, height:24, borderRadius:7, background:t.inputBg, display:"flex", alignItems:"center", justifyContent:"center" }}>
                    <TripIcon icon={trip.icon} size={14}/>
                  </div>
                  <div style={{ textAlign:"left" }}>
                    <div style={{ fontSize:12, fontWeight:600, color:t.text }}>{trip.name}</div>
                    <div style={{ fontSize:10, color:t.textMuted }}>{settled}/{tR.length} settled</div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Activity feed */}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
        <Label t={t}>{showUnsettledOnly ? "Unsettled" : "Activity"}</Label>
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          {unsettled.length > 0 && (
            <button className="press" onClick={()=>onSettleAll()} style={{ fontSize:12, color:t.textSecondary, fontWeight:500, background:"none", border:`1px solid ${t.border}`, borderRadius:20, padding:"3px 10px" }}>
              Settle all
            </button>
          )}
          {unsettled.length > 0 && (
            <button className="press" onClick={()=>setShowUnsettledOnly(v=>!v)} style={{ display:"flex", alignItems:"center", gap:5, background:showUnsettledOnly?"#F8717122":"transparent", border:`1px solid ${showUnsettledOnly?"#F87171":"transparent"}`, borderRadius:20, padding:"3px 10px 3px 7px" }}>
              <div style={{ width:6, height:6, borderRadius:"50%", background:"#F87171", flexShrink:0 }}/>
              <span style={{ fontSize:12, color:"#F87171", fontWeight:600 }}>{unsettled.length} unsettled</span>
              {showUnsettledOnly && <span style={{ fontSize:11, color:"#F87171", marginLeft:2 }}>✕</span>}
            </button>
          )}
        </div>
      </div>

      {activity.length === 0 && (
        <div style={{ textAlign:"center", padding:"48px 0", color:t.textMuted }}>
          <div style={{ fontSize:32, marginBottom:10 }}>🧾</div>
          <div style={{ fontSize:14, fontWeight:500, color:t.textSecondary }}>No activity yet</div>
          <div style={{ fontSize:12, marginTop:4 }}>Scan a receipt to get started</div>
        </div>
      )}

      {activity
        .filter(({ r }) => !showUnsettledOnly || !r.paid)
        .map(({ r, action, sub, actionColor, icon }, i) => {
        const payers = Array.isArray(r.payer) ? r.payer : [r.payer || "you"];
        const tripObj = activeTrips.find(tr => tr.name === r.trip);
        return (
          <button key={r.id} className="press fu" onClick={()=>onReceiptClick(r)} style={{ width:"100%", background:t.surface, border:`1px solid ${r.paid ? t.border : t.border}`, borderRadius:14, padding:"14px 16px", marginBottom:8, display:"flex", alignItems:"center", gap:12, textAlign:"left", animationDelay:`${i*0.04}s`, opacity: r.paid ? 0.65 : 1 }}>

            {/* Icon circle */}
            <div style={{ width:40, height:40, borderRadius:12, background: r.paid ? t.inputBg : actionColor+"18", border:`1.5px solid ${r.paid ? t.border : actionColor+"44"}`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:16, flexShrink:0 }}>
              {icon}
            </div>

            {/* Main content */}
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:3 }}>
                <div style={{ fontSize:14, fontWeight:600, color:t.text, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", flex:1, paddingRight:8 }}>{r.name}</div>
                <div style={{ fontSize:14, fontWeight:700, fontFamily:"'Syne',sans-serif", color: r.paid ? t.textMuted : actionColor, flexShrink:0 }}>
                  {r.paid ? `$${r.total.toFixed(2)}` : `$${r.yourShare.toFixed(2)}`}
                </div>
              </div>
              <div style={{ fontSize:12, color:t.textSecondary, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{action}</div>
              <div style={{ display:"flex", alignItems:"center", gap:6, marginTop:4, flexWrap:"wrap" }}>
                <span style={{ fontSize:11, color:t.textMuted }}>{r.date}</span>
                {r.trip && (
                  <div style={{ display:"flex", alignItems:"center", gap:4, background:t.inputBg, borderRadius:5, padding:"1px 7px" }}>
                    {r.tripIcon && <TripIcon icon={r.tripIcon} size={9}/>}
                    <span style={{ fontSize:11, color:t.textSecondary }}>{r.trip}</span>
                  </div>
                )}

              </div>
            </div>
          </button>
        );
      })}

      {showUnsettledOnly && unsettled.length === 0 && (
        <div style={{ textAlign:"center", padding:"32px 0", color:t.textMuted }}>
          <div style={{ fontSize:24, marginBottom:8 }}>🎉</div>
          <div style={{ fontSize:14, fontWeight:500, color:t.textSecondary }}>All settled up!</div>
        </div>
      )}
    </div>
  );
}

// ── ARCHIVE TAB ───────────────────────────────────────────────────────────────
function ArchiveTab({ receipts, trips, onReceiptClick, onVenmo, t }) {
  const [view, setView] = useState("receipts");
  const archivedReceipts = receipts.filter(r=>r.archived);
  const archivedTrips = [...ARCHIVED_TRIPS];

  // Group by trip or month
  const grouped = {};
  archivedReceipts.forEach(r=>{
    const key = r.trip || r.date.split(" ").slice(1).join(" ") || "Other";
    if (!grouped[key]) grouped[key]=[];
    grouped[key].push(r);
  });

  return (
    <div style={{ padding:"0 20px 120px" }}>
      <div style={{ display:"flex", gap:6, marginBottom:20 }}>
        {["receipts","trips"].map(v=>(
          <button key={v} className="press" onClick={()=>setView(v)} style={{ flex:1, padding:"9px 0", borderRadius:9, background:view===v?t.accent:t.surface, border:`1px solid ${view===v?t.accent:t.border}`, color:view===v?t.accentText:t.textSecondary, fontSize:13, fontWeight:600 }}>
            {v[0].toUpperCase()+v.slice(1)}
          </button>
        ))}
      </div>

      {view==="receipts"&&(
        archivedReceipts.length===0 ? (
          <div style={{ textAlign:"center", padding:"60px 0", color:t.textMuted }}>
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none" style={{ margin:"0 auto 12px", display:"block" }}><rect x="4" y="4" width="24" height="24" rx="4" stroke={t.textMuted} strokeWidth="1.4"/><path d="M10 16h12M16 10v12" stroke={t.textMuted} strokeWidth="1.4" strokeLinecap="round"/></svg>
            <div style={{ fontSize:14 }}>No archived receipts yet</div>
            <div style={{ fontSize:12, marginTop:4 }}>Paid receipts will appear here</div>
          </div>
        ) : Object.entries(grouped).map(([group, recs])=>(
          <div key={group} style={{ marginBottom:20 }}>
            <div style={{ fontSize:12, fontWeight:600, color:t.textMuted, letterSpacing:0.6, textTransform:"uppercase", marginBottom:10, display:"flex", alignItems:"center", gap:8 }}>
              {recs[0]?.tripIcon&&<TripIcon icon={recs[0].tripIcon} size={12}/>}
              {group}
            </div>
            {recs.map((r,i)=><ReceiptCard key={r.id} r={r} onClick={()=>onReceiptClick(r)} onVenmo={onVenmo} t={t} delay={i*0.04}/>)}
          </div>
        ))
      )}

      {view==="trips"&&(
        archivedTrips.length===0 ? (
          <div style={{ textAlign:"center", padding:"60px 0", color:t.textMuted }}>
            <div style={{ fontSize:14 }}>No archived trips</div>
          </div>
        ) : archivedTrips.map((trip,i)=>{
          const tR=[...receipts,...ARCHIVED_RECEIPTS.filter(r=>r.trip===trip.name)];
          const total=tR.reduce((a,r)=>a+r.total,0);
          return (
            <div key={trip.id} className="fu" style={{ background:t.surface, border:`1px solid ${t.border}`, borderRadius:14, padding:"16px", marginBottom:8, animationDelay:`${i*0.06}s` }}>
              <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:12 }}>
                <div style={{ width:44, height:44, borderRadius:11, background:t.inputBg, border:`1px solid ${t.border}`, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                  <TripIcon icon={trip.icon} size={24}/>
                </div>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:14, fontWeight:600, fontFamily:"'Syne',sans-serif", color:t.text }}>{trip.name}</div>
                  <div style={{ fontSize:12, color:t.textSecondary, marginTop:1 }}>{trip.dates} · {trip.memberNames.length} people</div>
                </div>
                <div style={{ textAlign:"right" }}>
                  <div style={{ fontSize:15, fontWeight:700, fontFamily:"'Syne',sans-serif", color:t.text }}>${total.toFixed(0)}</div>
                  <div style={{ fontSize:11, color:t.textMuted }}>total</div>
                </div>
              </div>
              <div style={{ fontSize:12, color:t.textMuted, display:"flex", alignItems:"center", gap:6 }}>
                <div style={{ width:6, height:6, borderRadius:"50%", background:t.textMuted }}/>
                Archived · {tR.length} receipts, all settled
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

// ── MAIN APP ──────────────────────────────────────────────────────────────────
// ── SETTINGS TAB ──────────────────────────────────────────────────────────────
const CURRENCIES = [
  { code:"USD", symbol:"$",  name:"US Dollar" },
  { code:"EUR", symbol:"€",  name:"Euro" },
  { code:"GBP", symbol:"£",  name:"British Pound" },
  { code:"JPY", symbol:"¥",  name:"Japanese Yen" },
  { code:"CAD", symbol:"$",  name:"Canadian Dollar" },
  { code:"AUD", symbol:"$",  name:"Australian Dollar" },
  { code:"CHF", symbol:"Fr", name:"Swiss Franc" },
  { code:"MXN", symbol:"$",  name:"Mexican Peso" },
  { code:"BRL", symbol:"R$", name:"Brazilian Real" },
  { code:"INR", symbol:"₹",  name:"Indian Rupee" },
  { code:"KRW", symbol:"₩",  name:"South Korean Won" },
  { code:"THB", symbol:"฿",  name:"Thai Baht" },
  { code:"HKD", symbol:"$",  name:"Hong Kong Dollar" },
  { code:"SGD", symbol:"$",  name:"Singapore Dollar" },
  { code:"NZD", symbol:"$",  name:"New Zealand Dollar" },
  { code:"SEK", symbol:"kr", name:"Swedish Krona" },
  { code:"NOK", symbol:"kr", name:"Norwegian Krone" },
  { code:"DKK", symbol:"kr", name:"Danish Krone" },
  { code:"PLN", symbol:"zł", name:"Polish Zloty" },
  { code:"CZK", symbol:"Kč", name:"Czech Koruna" },
  { code:"HUF", symbol:"Ft", name:"Hungarian Forint" },
  { code:"TRY", symbol:"₺",  name:"Turkish Lira" },
  { code:"ZAR", symbol:"R",  name:"South African Rand" },
  { code:"AED", symbol:"د.إ",name:"UAE Dirham" },
  { code:"ILS", symbol:"₪",  name:"Israeli Shekel" },
];

function SettingsTab({ themeKey, setThemeKey, venmoHandle, setVenmoHandle, zelleHandle, setZelleHandle, homeCurrency, setHomeCurrency, tripCurrency, setTripCurrency, exchangeRate, setExchangeRate, t }) {
  const [manualRate, setManualRate] = useState(exchangeRate ? String(exchangeRate) : "");
  const [fetchingRate, setFetchingRate] = useState(false);
  const [fetchedRate, setFetchedRate] = useState(exchangeRate || null);
  const [rateError, setRateError] = useState(null);
  const [showHomePicker, setShowHomePicker] = useState(false);
  const [showTripPicker, setShowTripPicker] = useState(false);
  const [currencySearch, setCurrencySearch] = useState("");

  const home = CURRENCIES.find(c=>c.code===homeCurrency)||CURRENCIES[0];
  const trip = CURRENCIES.find(c=>c.code===tripCurrency)||CURRENCIES[0];
  const isSame = homeCurrency === tripCurrency;

  const manualRateNum = parseFloat(manualRate);
  const activeRate = manualRateNum > 0 ? manualRateNum : fetchedRate;

  // Sync activeRate up to parent whenever it changes
  useEffect(() => { if (activeRate) setExchangeRate(activeRate); }, [activeRate]);

  const fetchRate = async () => {
    if (isSame) return;
    setFetchingRate(true);
    setRateError(null);
    setFetchedRate(null);
    try {
      // Free open API — no key needed
      const res = await fetch(`https://open.er-api.com/v6/latest/${tripCurrency}`);
      if (!res.ok) throw new Error("Rate unavailable");
      const data = await res.json();
      const rate = data.rates?.[homeCurrency];
      if (!rate) throw new Error(`No rate for ${homeCurrency}`);
      setFetchedRate(rate);
    } catch(e) {
      setRateError(e.message || "Could not fetch rate");
    } finally {
      setFetchingRate(false);
    }
  };

  const filteredCurrencies = CURRENCIES.filter(c =>
    c.code.toLowerCase().includes(currencySearch.toLowerCase()) ||
    c.name.toLowerCase().includes(currencySearch.toLowerCase())
  );

  const RowToggle = ({ label, sub, checked, onChange }) => (
    <div style={{ background:t.surface, border:`1px solid ${t.border}`, borderRadius:14, padding:"14px 16px", marginBottom:8, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
      <div>
        <div style={{ fontSize:14, fontWeight:500, color:t.text }}>{label}</div>
        {sub && <div style={{ fontSize:12, color:t.textSecondary, marginTop:2 }}>{sub}</div>}
      </div>
      <button className="press" onClick={onChange} style={{ width:46, height:26, borderRadius:13, background:checked?t.accent:t.border, border:"none", position:"relative", flexShrink:0 }}>
        <div style={{ position:"absolute", top:3, left:checked?22:3, width:20, height:20, borderRadius:"50%", background:checked?t.accentText:t.textSecondary, transition:"left 0.2s ease" }}/>
      </button>
    </div>
  );

  const CurrencyPicker = ({ value, onSelect, onClose }) => (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.55)", zIndex:600, display:"flex", flexDirection:"column", justifyContent:"flex-end" }} onClick={onClose}>
      <div className="su" onClick={e=>e.stopPropagation()} style={{ background:t.bg, borderRadius:"20px 20px 0 0", border:`1px solid ${t.border}`, maxHeight:"75vh", display:"flex", flexDirection:"column" }}>
        <SheetHandle t={t}/>
        <div style={{ padding:"0 22px 14px", borderBottom:`1px solid ${t.border}`, flexShrink:0 }}>
          <div style={{ fontSize:16, fontWeight:700, fontFamily:"'Syne',sans-serif", color:t.text, marginBottom:12 }}>Select currency</div>
          <div style={{ position:"relative" }}>
            <svg style={{ position:"absolute", left:11, top:"50%", transform:"translateY(-50%)" }} width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="6" cy="6" r="4.5" stroke={t.textMuted} strokeWidth="1.3"/><path d="M9.5 9.5l2.5 2.5" stroke={t.textMuted} strokeWidth="1.3" strokeLinecap="round"/></svg>
            <input value={currencySearch} onChange={e=>setCurrencySearch(e.target.value)} placeholder="Search…" autoFocus style={{ width:"100%", background:t.inputBg, border:`1px solid ${t.border}`, borderRadius:10, padding:"9px 12px 9px 30px", color:t.text, fontSize:14 }}/>
          </div>
        </div>
        <div style={{ overflowY:"auto", flex:1 }}>
          {filteredCurrencies.map((c,i,arr)=>(
            <button key={c.code} className="press" onClick={()=>{ onSelect(c.code); setCurrencySearch(""); onClose(); }} style={{ width:"100%", display:"flex", justifyContent:"space-between", alignItems:"center", padding:"13px 22px", background:c.code===value?t.accent+"14":"transparent", border:"none", borderBottom:i<arr.length-1?`1px solid ${t.border}`:"none" }}>
              <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                <div style={{ width:36, height:36, borderRadius:10, background:t.surface, border:`1px solid ${t.border}`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:14, fontWeight:700, color:t.text }}>{c.symbol}</div>
                <div style={{ textAlign:"left" }}>
                  <div style={{ fontSize:13, fontWeight:c.code===value?600:400, color:t.text }}>{c.code}</div>
                  <div style={{ fontSize:12, color:t.textSecondary }}>{c.name}</div>
                </div>
              </div>
              {c.code===value && <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 8l4 4 6-6" stroke={t.accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <div style={{ padding:"0 20px 120px" }}>
      <div style={{ fontSize:22, fontWeight:700, fontFamily:"'Syne',sans-serif", color:t.text, marginBottom:4 }}>Settings</div>
      <div style={{ fontSize:14, color:t.textSecondary, marginBottom:24 }}>Preferences & currency</div>

      {/* Appearance */}
      <div style={{ fontSize:11, fontWeight:600, color:t.textMuted, letterSpacing:0.9, textTransform:"uppercase", marginBottom:10 }}>Appearance</div>
      <RowToggle label="Dark mode" sub={themeKey==="dark"?"Currently dark":"Currently light"} checked={themeKey==="dark"} onChange={()=>setThemeKey(k=>k==="dark"?"light":"dark")}/>

      {/* Currency section */}
      <div style={{ fontSize:11, fontWeight:600, color:t.textMuted, letterSpacing:0.9, textTransform:"uppercase", margin:"20px 0 10px" }}>Currency</div>

      {/* Home currency */}
      <div style={{ background:t.surface, border:`1px solid ${t.border}`, borderRadius:14, padding:"14px 16px", marginBottom:8, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
        <div>
          <div style={{ fontSize:14, fontWeight:500, color:t.text }}>Home currency</div>
          <div style={{ fontSize:12, color:t.textSecondary, marginTop:2 }}>Amounts settle in this currency</div>
        </div>
        <button className="press" onClick={()=>setShowHomePicker(true)} style={{ display:"flex", alignItems:"center", gap:8, background:t.inputBg, border:`1px solid ${t.border}`, borderRadius:10, padding:"8px 12px" }}>
          <span style={{ fontSize:15, fontWeight:700, color:t.text }}>{home.symbol}</span>
          <span style={{ fontSize:13, fontWeight:600, color:t.text }}>{home.code}</span>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M3 5l3 3 3-3" stroke={t.textMuted} strokeWidth="1.4" strokeLinecap="round"/></svg>
        </button>
      </div>

      {/* Trip currency */}
      <div style={{ background:t.surface, border:`1px solid ${t.border}`, borderRadius:14, padding:"14px 16px", marginBottom:8, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
        <div>
          <div style={{ fontSize:14, fontWeight:500, color:t.text }}>Trip currency</div>
          <div style={{ fontSize:12, color:t.textSecondary, marginTop:2 }}>Currency used abroad</div>
        </div>
        <button className="press" onClick={()=>setShowTripPicker(true)} style={{ display:"flex", alignItems:"center", gap:8, background:t.inputBg, border:`1px solid ${t.border}`, borderRadius:10, padding:"8px 12px" }}>
          <span style={{ fontSize:15, fontWeight:700, color:t.text }}>{trip.symbol}</span>
          <span style={{ fontSize:13, fontWeight:600, color:t.text }}>{trip.code}</span>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M3 5l3 3 3-3" stroke={t.textMuted} strokeWidth="1.4" strokeLinecap="round"/></svg>
        </button>
      </div>

      {/* Exchange rate card — only shown if currencies differ */}
      {!isSame && (
        <div style={{ background:t.surface, border:`1px solid ${t.border}`, borderRadius:14, padding:"16px", marginBottom:8 }}>
          <div style={{ fontSize:13, fontWeight:600, color:t.text, marginBottom:4 }}>Exchange rate</div>
          <div style={{ fontSize:12, color:t.textSecondary, marginBottom:14 }}>
            {tripCurrency} → {homeCurrency} conversion
          </div>

          {/* Rate display */}
          {activeRate && (
            <div style={{ background: t.accent+"14", border:`1px solid ${t.accent}44`, borderRadius:10, padding:"12px 14px", marginBottom:12, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <div>
                <div style={{ fontSize:11, color:t.textMuted, textTransform:"uppercase", letterSpacing:0.7, marginBottom:3 }}>{manualRateNum>0?"Manual rate":"Live rate"}</div>
                <div style={{ fontSize:20, fontWeight:800, fontFamily:"'Syne',sans-serif", color:t.text }}>
                  1 {trip.symbol} = {(activeRate).toFixed(4)} {home.symbol}
                </div>
              </div>
              {manualRateNum <= 0 && <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="8" stroke={t.accent} strokeWidth="1.5"/><path d="M7 10l2.5 2.5 3.5-3.5" stroke={t.accent} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>}
            </div>
          )}
          {rateError && (
            <div style={{ background:"#F8717122", border:"1px solid #F8717155", borderRadius:9, padding:"9px 12px", marginBottom:12, fontSize:12, color:"#F87171" }}>
              ⚠ {rateError} — enter a rate manually below
            </div>
          )}

          {/* Fetch live rate */}
          <button className="press" onClick={fetchRate} disabled={fetchingRate} style={{ width:"100%", padding:"11px", background:fetchingRate?t.border:t.inputBg, border:`1px solid ${t.border}`, borderRadius:10, color:fetchingRate?t.textMuted:t.text, fontSize:13, fontWeight:500, marginBottom:10, display:"flex", alignItems:"center", justifyContent:"center", gap:7 }}>
            {fetchingRate ? (
              <><svg viewBox="0 0 20 20" width="14" height="14" style={{ animation:"spin 1s linear infinite" }}><circle cx="10" cy="10" r="7" fill="none" stroke={t.accent} strokeWidth="2.5" strokeDasharray="30 15" strokeLinecap="round"/></svg>Fetching live rate…</>
            ) : (
              <><svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M12 2v4H8M2 12v-4h4M12 6A5 5 0 002.5 8.5M2 8a5 5 0 009.5 2.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>Fetch live rate</>
            )}
          </button>

          {/* Manual override */}
          <div>
            <div style={{ fontSize:12, color:t.textSecondary, marginBottom:6 }}>Or enter manually</div>
            <div style={{ display:"flex", gap:8, alignItems:"center" }}>
              <div style={{ flex:1, position:"relative" }}>
                <span style={{ position:"absolute", left:11, top:"50%", transform:"translateY(-50%)", fontSize:12, color:t.textMuted }}>1 {tripCurrency} =</span>
                <input
                  value={manualRate}
                  onChange={e=>setManualRate(e.target.value)}
                  type="number"
                  placeholder="0.0000"
                  style={{ width:"100%", background:t.inputBg, border:`1px solid ${t.border}`, borderRadius:10, padding:"10px 10px 10px 70px", color:t.text, fontSize:14, fontWeight:600, fontFamily:"'Syne',sans-serif" }}
                />
              </div>
              <div style={{ fontSize:13, fontWeight:600, color:t.textSecondary }}>{homeCurrency}</div>
            </div>
            {manualRateNum > 0 && (
              <button className="press" onClick={()=>setManualRate("")} style={{ marginTop:6, background:"none", border:"none", color:t.textMuted, fontSize:11, padding:0 }}>✕ Clear manual rate</button>
            )}
          </div>

          {/* Live example conversion */}
          {activeRate && (
            <div style={{ marginTop:14, background:t.inputBg, borderRadius:10, padding:"12px 14px" }}>
              <div style={{ fontSize:11, color:t.textMuted, marginBottom:8, textTransform:"uppercase", letterSpacing:0.7 }}>Quick converter</div>
              {[10, 50, 100, 500].map(amt=>(
                <div key={amt} style={{ display:"flex", justifyContent:"space-between", padding:"4px 0", borderBottom:`1px solid ${t.border}` }}>
                  <span style={{ fontSize:13, color:t.textSecondary }}>{trip.symbol}{amt} {tripCurrency}</span>
                  <span style={{ fontSize:13, fontWeight:600, color:t.text }}>{home.symbol}{(amt * activeRate).toFixed(2)} {homeCurrency}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Account */}
      <div style={{ fontSize:11, fontWeight:600, color:t.textMuted, letterSpacing:0.9, textTransform:"uppercase", margin:"20px 0 10px" }}>Account</div>
      <div style={{ background:t.surface, border:`1px solid ${t.border}`, borderRadius:14, overflow:"hidden", marginBottom:8 }}>
        <div style={{ padding:"14px 16px", borderBottom:`1px solid ${t.border}` }}>
          <div style={{ fontSize:12, fontWeight:600, color:t.textMuted, marginBottom:8, display:"flex", alignItems:"center", gap:7 }}>
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M12.5 2C11.3 4.5 9.5 7.4 8 9.2L6.2 4H2.5L5.5 14h3.8C11.5 11 14 6.5 14 4c0-1-.5-1.8-1.5-2z" fill="#3D95CE"/></svg>
            VENMO HANDLE
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            <span style={{ fontSize:15, color:t.textMuted, fontWeight:600 }}>@</span>
            <input
              value={venmoHandle.replace(/^@/,"")}
              onChange={e=>setVenmoHandle(e.target.value.replace(/^@/,""))}
              placeholder="your-venmo-username"
              style={{ flex:1, background:t.inputBg, border:`1px solid ${t.border}`, borderRadius:9, padding:"9px 12px", color:t.text, fontSize:14, fontFamily:"'DM Sans',sans-serif" }}
            />
          </div>
          <div style={{ fontSize:11, color:t.textMuted, marginTop:7 }}>Others will Venmo you at this handle when you request payment</div>
        </div>
        <div style={{ padding:"14px 16px" }}>
          <div style={{ fontSize:12, fontWeight:600, color:t.textMuted, marginBottom:8, display:"flex", alignItems:"center", gap:7 }}>
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M3 3h10v2.5L6.5 10H13v3H3v-2.5L9.5 6H3V3z" fill="#6D1ED4"/></svg>
            ZELLE HANDLE
          </div>
          <input
            value={zelleHandle}
            onChange={e=>setZelleHandle(e.target.value)}
            placeholder="phone or email linked to Zelle"
            style={{ width:"100%", background:t.inputBg, border:`1px solid ${t.border}`, borderRadius:9, padding:"9px 12px", color:t.text, fontSize:14, fontFamily:"'DM Sans',sans-serif" }}
          />
          <div style={{ fontSize:11, color:t.textMuted, marginTop:7 }}>Others will Zelle you at this phone/email when you request payment</div>
        </div>
      </div>

      {showHomePicker && <CurrencyPicker value={homeCurrency} onSelect={setHomeCurrency} onClose={()=>setShowHomePicker(false)}/>}
      {showTripPicker && <CurrencyPicker value={tripCurrency} onSelect={setTripCurrency} onClose={()=>setShowTripPicker(false)}/>}
    </div>
  );
}

// ── PERSISTENT STORAGE (localStorage) ───────────────────────────────────────
function serialiseReceipts(receipts) {
  return JSON.stringify(receipts.map(r => ({
    ...r,
    itemized: r.itemized ? {
      ...r.itemized,
      items: (r.itemized.items || []).map(it => ({
        ...it,
        assignedTo: Array.isArray(it.assignedTo) ? it.assignedTo : [...(it.assignedTo || [])]
      }))
    } : null
  })));
}

function deserialiseReceipts(raw) {
  try {
    return JSON.parse(raw).map(r => ({
      ...r,
      itemized: r.itemized ? {
        ...r.itemized,
        items: (r.itemized.items || []).map(it => ({
          ...it,
          assignedTo: new Set(it.assignedTo || [])
        }))
      } : null
    }));
  } catch { return null; }
}

function lsGet(key) { try { return localStorage.getItem(key); } catch { return null; } }
function lsSet(key, val) { try { localStorage.setItem(key, val); } catch {} }

export default function Splittt() {
  const [themeKey, setThemeKey] = useState("light");
  const [tab, setTab] = useState("feed");
  const [receipts, setReceipts] = useState([]);
  const [trips, setTrips] = useState([]);
  const [showReceipt, setShowReceipt] = useState(null);
  const [showVenmo, setShowVenmo] = useState(null);
  const [activeTrip, setActiveTrip] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [venmoHandle, setVenmoHandle] = useState("");
  const [zelleHandle, setZelleHandle] = useState("");
  const [homeCurrency, setHomeCurrency] = useState("USD");
  const [tripCurrency, setTripCurrency] = useState("USD");
  const [exchangeRate, setExchangeRate] = useState(null); // tripCurrency → homeCurrency
  const [friends, setFriends] = useState([
    { id:1, name:"EJ", venmo:"", zelle:"" },
    { id:2, name:"Della", venmo:"", zelle:"" },
  ]);

  // Load from localStorage on mount
  useEffect(() => {
    const r = lsGet("splittt_receipts");
    const tr = lsGet("splittt_trips");
    const th = lsGet("splittt_theme");
    const vh = lsGet("splittt_venmo");
    const zh = lsGet("splittt_zelle");
    if (r) { const d = deserialiseReceipts(r); if (d) setReceipts(d); }
    if (tr) { try { setTrips(JSON.parse(tr)); } catch {} }
    if (th && THEMES[th]) setThemeKey(th);
    if (vh) setVenmoHandle(vh);
    if (zh) setZelleHandle(zh);
    const hc = lsGet("splittt_homeCurrency");
    const tc = lsGet("splittt_tripCurrency");
    const er = lsGet("splittt_exchangeRate");
    if (hc) setHomeCurrency(hc);
    if (tc) setTripCurrency(tc);
    if (er) setExchangeRate(parseFloat(er));
    const fr = lsGet("splittt_friends");
    if (fr) { try { setFriends(JSON.parse(fr)); } catch {} }
    setLoaded(true);
  }, []);

  // Save on change
  useEffect(() => { if (loaded) lsSet("splittt_receipts", serialiseReceipts(receipts)); }, [receipts, loaded]);
  useEffect(() => { if (loaded) lsSet("splittt_trips", JSON.stringify(trips)); }, [trips, loaded]);
  useEffect(() => { if (loaded) lsSet("splittt_theme", themeKey); }, [themeKey, loaded]);
  useEffect(() => { if (loaded) lsSet("splittt_venmo", venmoHandle); }, [venmoHandle, loaded]);
  useEffect(() => { if (loaded) lsSet("splittt_zelle", zelleHandle); }, [zelleHandle, loaded]);
  useEffect(() => { if (loaded) lsSet("splittt_homeCurrency", homeCurrency); }, [homeCurrency, loaded]);
  useEffect(() => { if (loaded) lsSet("splittt_tripCurrency", tripCurrency); }, [tripCurrency, loaded]);
  useEffect(() => { if (loaded && exchangeRate) lsSet("splittt_exchangeRate", String(exchangeRate)); }, [exchangeRate, loaded]);
  useEffect(() => { if (loaded) lsSet("splittt_friends", JSON.stringify(friends)); }, [friends, loaded]);

  const t = THEMES[themeKey] || THEMES["light"];

  // Keep global ALL_FRIENDS in sync with friends state
  ALL_FRIENDS = friends.map(f => f.name);

  if (!loaded) return (
    <div style={{ fontFamily:"'DM Sans',sans-serif", background:"#F7F6F2", minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center" }}>
      <div style={{ fontSize:22, fontWeight:800, fontFamily:"'Syne',sans-serif", letterSpacing:-0.5, color:"#1A1A18" }}>
        sp/itt<span style={{ display:"inline-block", width:5, height:5, borderRadius:"50%", background:"#1A1A18", marginLeft:2, marginBottom:2 }}/>
      </div>
    </div>
  );

  const NAV = [
    { id:"feed",    label:"Feed",    icon:<svg width="17" height="17" viewBox="0 0 17 17" fill="none"><rect x="1.5" y="1.5" width="5.5" height="5.5" rx="1.5" stroke="currentColor" strokeWidth="1.4"/><rect x="10" y="1.5" width="5.5" height="5.5" rx="1.5" stroke="currentColor" strokeWidth="1.4"/><rect x="1.5" y="10" width="5.5" height="5.5" rx="1.5" stroke="currentColor" strokeWidth="1.4"/><rect x="10" y="10" width="5.5" height="5.5" rx="1.5" stroke="currentColor" strokeWidth="1.4"/></svg> },
    { id:"trips",   label:"Trips",   icon:<svg width="17" height="17" viewBox="0 0 17 17" fill="none"><path d="M2 8.5h13M8.5 2l6.5 6.5-6.5 6.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg> },
    { id:"plus",    label:"",        icon:null },
    { id:"friends", label:"Friends", icon:<svg width="17" height="17" viewBox="0 0 17 17" fill="none"><circle cx="6.5" cy="6" r="3" stroke="currentColor" strokeWidth="1.4"/><path d="M1 14c0-3 2.5-5 5.5-5s5.5 2 5.5 5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/><path d="M13 8c1.5 0 3 1 3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/><circle cx="13.5" cy="5.5" r="2" stroke="currentColor" strokeWidth="1.4"/></svg> },
    { id:"settings",label:"Settings",icon:<svg width="17" height="17" viewBox="0 0 17 17" fill="none"><circle cx="8.5" cy="8.5" r="2.5" stroke="currentColor" strokeWidth="1.4"/><path d="M8.5 1.5v2M8.5 13.5v2M1.5 8.5h2M13.5 8.5h2M3.6 3.6l1.4 1.4M12 12l1.4 1.4M12 3.6l-1.4 1.4M4 12l-1.4 1.4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg> },
  ];

  if (activeTrip) {
    const live = trips.find(x=>x.id===activeTrip.id)||activeTrip;
    return (
      <>
        <style>{STYLES}</style>
        <TripDetail trip={live} allReceipts={receipts} onBack={()=>setActiveTrip(null)} onVenmo={setShowVenmo} onAddReceipt={r=>setReceipts(p=>[r,...p])} onUpdateReceipt={updated=>{ if(updated._deleted) setReceipts(prev=>prev.filter(x=>x.id!==updated.id)); else setReceipts(prev=>prev.map(x=>x.id===updated.id?updated:x)); }} onUpdateTrip={updated=>{setTrips(prev=>prev.map(x=>x.id===updated.id?updated:x));setActiveTrip(updated);}} t={t}/>
        {showVenmo&&<VenmoModal data={showVenmo} onClose={()=>setShowVenmo(null)} venmoHandle={venmoHandle} zelleHandle={zelleHandle} t={t}/>}
      </>
    );
  }

  return (
    <div id="app-root" style={{ fontFamily:"'DM Sans',sans-serif", background:t.bg, height:"100vh", overflowY:"auto", overflowX:"hidden", color:t.text, maxWidth:430, width:"100%", margin:"0 auto", transition:"background 0.25s ease, color 0.25s ease", position:"relative", transform:"translateZ(0)", willChange:"transform" }}>
      <style>{STYLES}</style>

      {/* Top bar */}
      <div style={{ padding:"48px 20px 0", display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:tab==="feed"?18:20 }}>
        <div style={{ fontSize:18, fontWeight:800, fontFamily:"'Syne',sans-serif", letterSpacing:-0.5, display:"flex", alignItems:"center", gap:5 }}>
          sp/itt
          <span style={{ width:5, height:5, borderRadius:"50%", background:t.accent, display:"inline-block", marginBottom:2 }}/>
        </div>
        <Avatar name="A" size={32} t={t}/>
      </div>

      {/* Section heading for non-feed tabs */}
      {tab!=="feed"&&tab!=="plus"&&tab!=="settings"&&tab!=="friends"&&(
        <div style={{ padding:"0 20px 14px", display:"flex", justifyContent:"space-between", alignItems:"baseline" }}>
          <div style={{ fontSize:22, fontWeight:700, fontFamily:"'Syne',sans-serif", color:t.text }}>
            {tab==="trips"?"Trips":tab==="archive"?"Archive":""}
          </div>
        </div>
      )}

      {/* Main content */}
      {tab==="feed"&&<FeedTab receipts={receipts} trips={trips} onReceiptClick={setShowReceipt} onVenmo={setShowVenmo} onTripClick={setActiveTrip} onSettleAll={()=>setReceipts(prev=>prev.map(r=>r.paid||r.archived?r:{...r,paid:true}))} t={t}/>}
      {tab==="friends"&&<FriendsTab friends={friends} setFriends={setFriends} receipts={receipts} t={t}/>}

      {tab==="trips"&&(
        <div style={{ padding:"0 20px 120px" }}>
          {trips.map((trip,i)=>{
            const tR=receipts.filter(r=>r.trip===trip.name&&!r.archived);
            const total=tR.reduce((a,r)=>a+r.total,0);
            const settled=tR.filter(r=>r.paid).length;
            return (
              <div key={trip.id} className="fu press" onClick={()=>setActiveTrip(trip)} style={{ background:t.surface, border:`1px solid ${t.border}`, borderRadius:14, padding:"16px", marginBottom:8, animationDelay:`${i*0.06}s` }}>
                <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:12 }}>
                  <div style={{ width:46, height:46, borderRadius:12, background:t.inputBg, border:`1px solid ${t.border}`, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                    <TripIcon icon={trip.icon} size={26}/>
                  </div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:15, fontWeight:600, fontFamily:"'Syne',sans-serif", color:t.text }}>{trip.name}</div>
                    <div style={{ fontSize:12, color:t.textSecondary, marginTop:2 }}>{trip.dates} · {trip.memberNames.length} people</div>
                  </div>
                  <div style={{ textAlign:"right" }}>
                    <div style={{ fontSize:16, fontWeight:700, fontFamily:"'Syne',sans-serif", color:t.text }}>${total.toFixed(0)}</div>
                    <div style={{ fontSize:11, color:t.textMuted }}>{tR.length} receipts</div>
                  </div>
                </div>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                  <div style={{ flex:1, marginRight:14 }}>
                    <div style={{ height:3, background:t.border, borderRadius:2, marginBottom:4 }}>
                      <div style={{ height:"100%", width:`${tR.length?(settled/tR.length)*100:0}%`, background:t.accent, borderRadius:2 }}/>
                    </div>
                    <div style={{ fontSize:11, color:t.textMuted }}>{settled}/{tR.length} settled</div>
                  </div>
                  <AvatarStack people={trip.memberNames} size={20} t={t}/>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {tab==="plus"&&<PlusTab trips={trips} onAddReceipt={r=>setReceipts(p=>[r,...p])} onReceiptDone={()=>setTab("feed")} onAddTrip={tr=>{setTrips(p=>[tr,...p]);setTab("trips");}} venmoHandle={venmoHandle} zelleHandle={zelleHandle} friends={friends} homeCurrency={homeCurrency} tripCurrency={tripCurrency} exchangeRate={exchangeRate} t={t}/>}

      {tab==="archive"&&<ArchiveTab receipts={receipts} trips={trips} onReceiptClick={setShowReceipt} onVenmo={setShowVenmo} t={t}/>}

      {tab==="settings"&&(
        <SettingsTab themeKey={themeKey} setThemeKey={setThemeKey} venmoHandle={venmoHandle} setVenmoHandle={setVenmoHandle} zelleHandle={zelleHandle} setZelleHandle={setZelleHandle} homeCurrency={homeCurrency} setHomeCurrency={setHomeCurrency} tripCurrency={tripCurrency} setTripCurrency={setTripCurrency} exchangeRate={exchangeRate} setExchangeRate={setExchangeRate} t={t}/>
      )}

      {/* Bottom nav */}
      <div style={{ position:"fixed", bottom:0, left:"50%", transform:"translateX(-50%)", width:"100%", maxWidth:430, background:t.navBg, backdropFilter:"blur(20px)", borderTop:`1px solid ${t.border}`, padding:"8px 10px 22px", display:"flex", justifyContent:"space-around", alignItems:"center", zIndex:50, transition:"background 0.25s ease" }}>
        {NAV.map(n=>{
          if(n.id==="plus") return (
            <button key="plus" className="press" onClick={()=>setTab("plus")} style={{ width:46,height:46,borderRadius:13,background:tab==="plus"?t.accent:t.surface,border:`1px solid ${tab==="plus"?t.accent:t.border}`,display:"flex",alignItems:"center",justifyContent:"center",marginTop:-10,boxShadow:tab==="plus"?`0 4px 18px ${t.accent}44`:`0 2px 8px rgba(0,0,0,0.12)`,transition:"all 0.2s ease" }}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 2v12M2 8h12" stroke={tab==="plus"?t.accentText:t.textSecondary} strokeWidth="2" strokeLinecap="round"/></svg>
            </button>
          );
          const active=tab===n.id;
          return (
            <button key={n.id} className="press" onClick={()=>setTab(n.id)} style={{ background:"none",border:"none",display:"flex",flexDirection:"column",alignItems:"center",gap:4,color:active?t.text:t.textMuted,minWidth:40,transition:"color 0.18s ease" }}>
              {n.icon}
              <span style={{ fontSize:9.5,fontWeight:active?600:400,letterSpacing:0.3 }}>{n.label}</span>
            </button>
          );
        })}
      </div>

      {showReceipt&&<ReceiptModal
        r={showReceipt}
        trips={trips}
        onClose={()=>setShowReceipt(null)}
        onVenmo={r=>{setShowReceipt(null);setShowVenmo(r);}}
        onUpdate={updated=>{
          setReceipts(prev=>prev.map(x=>x.id===updated.id?updated:x));
          setShowReceipt(updated);
        }}
        onDelete={r=>{ setReceipts(prev=>prev.filter(x=>x.id!==r.id)); setShowReceipt(null); }}
        friends={friends}
        t={t}
      />}
      {showVenmo&&<VenmoModal data={showVenmo} onClose={()=>setShowVenmo(null)} venmoHandle={venmoHandle} zelleHandle={zelleHandle} t={t}/>}
    </div>
  );
}
