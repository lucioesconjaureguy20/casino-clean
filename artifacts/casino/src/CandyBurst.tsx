import React, { useState, useCallback, useRef, useEffect } from "react";
import { gt } from "./lib/gameLabels";

// ─── Grid dimensions ─────────────────────────────────────────────────────────
const COLS = 6;
const ROWS = 5;
const SCATTER = "💎";
const MIN_CLUSTER = 5;

// ─── Symbol definitions ───────────────────────────────────────────────────────
const SYMBOL_STYLE: Record<string,{bg:string;shadow:string;name:string;tier:string}> = {
  "🍭": {bg:"linear-gradient(145deg,#ff69b4,#c2185b)",shadow:"#ff69b4",name:"Piruleta", tier:"premium"},
  "🍬": {bg:"linear-gradient(145deg,#00e5ff,#0066cc)",shadow:"#00e5ff",name:"Caramelo", tier:"premium"},
  "🍓": {bg:"linear-gradient(145deg,#ff4444,#990000)",shadow:"#ff4444",name:"Fresa",    tier:"medio"},
  "🍇": {bg:"linear-gradient(145deg,#ab47bc,#6a1b9a)",shadow:"#ab47bc",name:"Uvas",     tier:"medio"},
  "🍑": {bg:"linear-gradient(145deg,#ff9800,#e65100)",shadow:"#ff9800",name:"Durazno",  tier:"bajo"},
  "🍌": {bg:"linear-gradient(145deg,#ffe600,#f57f17)",shadow:"#ffe600",name:"Banana",   tier:"bajo"},
  "🍒": {bg:"linear-gradient(145deg,#e53935,#b71c1c)",shadow:"#e53935",name:"Cereza",   tier:"bajo"},
  [SCATTER]: {bg:"linear-gradient(145deg,#ffd700,#ff8c00)",shadow:"#ffd700",name:"Scatter",tier:"especial"},
};
const TIER_COLOR:Record<string,string>={premium:"#f4a91f",medio:"#22ee66",bajo:"#1a9fff",especial:"#ff69b4"};

// ─── Weights — scatter weight 6 → ~1.5 per spin → bonus ~every 12-18 spins ──
const BASE_WEIGHTS:Record<string,number>={
  "🍭":5,"🍬":7,"🍓":15,"🍇":15,"🍑":25,"🍌":25,"🍒":25,[SCATTER]:6,
};
const FS_WEIGHTS:Record<string,number>={
  "🍭":5,"🍬":7,"🍓":15,"🍇":15,"🍑":25,"🍌":25,"🍒":25,
};

// ─── Payouts ──────────────────────────────────────────────────────────────────
const PAYOUTS:Record<string,[number,number][]>={
  "🍭":[[30,200],[25,75],[20,35],[15,15],[12,6],[10,3],[8,1.8],[7,1.2],[6,0.8],[5,0.5]],
  "🍬":[[30,150],[25,60],[20,25],[15,10],[12,5],[10,2.5],[8,1.2],[7,0.8],[6,0.6],[5,0.4]],
  "🍓":[[30,100],[25,45],[20,18],[15,7],[12,3],[10,1.5],[8,0.7],[7,0.5],[6,0.4],[5,0.3]],
  "🍇":[[30,80],[25,35],[20,15],[15,6],[12,2.5],[10,1.2],[8,0.5],[7,0.35],[6,0.25],[5,0.2]],
  "🍑":[[30,40],[25,18],[20,8],[15,3],[12,1],[10,0.5],[8,0.2],[7,0.15],[6,0.12],[5,0.1]],
  "🍌":[[30,30],[25,12],[20,6],[15,2],[12,0.8],[10,0.4],[8,0.15],[7,0.12],[6,0.1],[5,0.08]],
  "🍒":[[30,25],[25,10],[20,5],[15,1.5],[12,0.6],[10,0.3],[8,0.12],[7,0.09],[6,0.07],[5,0.05]],
};
function getPayout(sym:string,size:number):number {
  const t=PAYOUTS[sym];if(!t)return 0;
  for(const[min,mult] of t)if(size>=min)return mult;
  return 0;
}

// ─── Multipliers ──────────────────────────────────────────────────────────────
const MULT_VALUES=[2,5,10,20,50] as const;
const MULT_WEIGHTS=[40,25,15,12,8];
const MULT_COLOR:Record<number,string>={2:"#00e5ff",5:"#22ee66",10:"#f4a91f",20:"#ff69b4",50:"#ff1493"};
function randomMult():number{
  let r=Math.random()*100;
  for(let i=0;i<MULT_VALUES.length;i++){r-=MULT_WEIGHTS[i];if(r<=0)return MULT_VALUES[i];}
  return MULT_VALUES[MULT_VALUES.length-1];
}

// ─── Math ─────────────────────────────────────────────────────────────────────
function weightedRand(w:Record<string,number>):string{
  const keys=Object.keys(w);
  let r=Math.random()*keys.reduce((s,k)=>s+w[k],0);
  for(const k of keys){r-=w[k];if(r<=0)return k;}
  return keys[keys.length-1];
}
function makeGrid(weights:Record<string,number>):string[][]{
  return Array.from({length:COLS},()=>Array.from({length:ROWS},()=>weightedRand(weights)));
}
function countScatters(g:string[][]):number{return g.flat().filter(s=>s===SCATTER).length;}
function placeMults(g:string[][],minCount=0):{col:number;row:number;val:number}[]{
  const count=Math.max(minCount,Math.random()<0.5?Math.floor(Math.random()*3)+1:0);
  const used=new Set<string>();const result:{col:number;row:number;val:number}[]=[];
  let attempts=0;
  while(result.length<count&&attempts<60){
    attempts++;
    const col=Math.floor(Math.random()*COLS),row=Math.floor(Math.random()*ROWS),key=`${col},${row}`;
    if(!used.has(key)&&g[col][row]!==SCATTER){used.add(key);result.push({col,row,val:randomMult()});}
  }
  return result;
}
interface Cluster{sym:string;cells:[number,number][]}
function findClusters(g:string[][]):Cluster[]{
  const visited=Array.from({length:COLS},()=>new Array(ROWS).fill(false));
  const out:Cluster[]=[];
  for(let c=0;c<COLS;c++){
    for(let r=0;r<ROWS;r++){
      if(visited[c][r])continue;
      const sym=g[c][r];
      if(sym===SCATTER){visited[c][r]=true;continue;}
      const queue:[number,number][]=[[c,r]];const cells:[number,number][]=[];
      visited[c][r]=true;
      while(queue.length){
        const[cc,rr]=queue.shift()!;
        if(g[cc][rr]!==sym)continue;
        cells.push([cc,rr]);
        for(const[dc,dr]of[[-1,0],[1,0],[0,-1],[0,1]]){
          const nc=cc+dc,nr=rr+dr;
          if(nc>=0&&nc<COLS&&nr>=0&&nr<ROWS&&!visited[nc][nr]&&g[nc][nr]===sym){visited[nc][nr]=true;queue.push([nc,nr]);}
        }
      }
      if(cells.length>=MIN_CLUSTER)out.push({sym,cells});
    }
  }
  return out;
}
function tumble(g:string[][],wc:Set<string>,weights:Record<string,number>):string[][]{
  return Array.from({length:COLS},(_,c)=>{
    const kept=g[c].filter((_,r)=>!wc.has(`${c},${r}`));
    const fill=Array.from({length:ROWS-kept.length},()=>weightedRand(weights));
    return[...fill,...kept];
  });
}

// ─── Info Panel ───────────────────────────────────────────────────────────────
function InfoPanel({bet,onClose,lang}:{bet:number;onClose:()=>void;lang?:string}){
  const T=(k:string)=>gt(lang,k);
  const[tab,setTab]=useState<"payouts"|"bonus"|"howto">("payouts");
  const syms=["🍭","🍬","🍓","🍇","🍑","🍌","🍒"];
  const sizes=[5,7,10,12,15,20,30];
  const TB=({id,label}:{id:typeof tab,label:React.ReactNode})=>(
    <button onClick={()=>setTab(id)} style={{flex:1,padding:"8px 4px",fontSize:"11px",fontWeight:700,border:"none",cursor:"pointer",borderRadius:"8px",background:tab===id?"#1a2a3e":"transparent",color:tab===id?"#1a9fff":"#64748b",borderBottom:tab===id?"2px solid #1a9fff":"2px solid transparent"}}>
      {label}
    </button>
  );
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.93)",zIndex:3000,overflowY:"auto",padding:"10px",display:"flex",alignItems:"flex-start",justifyContent:"center"}} onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{width:"100%",maxWidth:"460px",background:"#0f1623",borderRadius:"16px",border:"1px solid #1e2a3e",overflow:"hidden",marginTop:"4px"}}>
        <div style={{display:"flex",alignItems:"center",gap:"8px",padding:"12px 14px",background:"#0d1320",borderBottom:"1px solid #1e2a3e"}}>
          <span style={{fontSize:"20px"}}>🍭</span>
          <div style={{flex:1}}><div style={{fontWeight:900,fontSize:"14px",color:"#fff"}}>Candy Burst</div><div style={{fontSize:"9px",color:"#64748b"}}>{T("cbSubtitle")}</div></div>
          <button onClick={onClose} style={{background:"#2a3448",color:"#94a3b8",border:"none",borderRadius:"7px",padding:"5px 10px",cursor:"pointer",fontWeight:700}}>✕</button>
        </div>
        <div style={{display:"flex",padding:"6px 10px",gap:"3px",background:"#0a1018",borderBottom:"1px solid #1a2438"}}>
          <TB id="payouts" label={<><svg viewBox="0 0 20 20" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.6" style={{verticalAlign:"middle",marginRight:3}}><circle cx="10" cy="10" r="8"/><path d="M10 6v4l2.5 2.5"/></svg>{T("cbPaytable")}</>}/><TB id="bonus" label={<><img src={`${import.meta.env.BASE_URL}emoji-freespins.png`} style={{width:13,height:13,objectFit:"contain",verticalAlign:"middle",marginRight:3}}/>{T("cbBonus")}</>}/><TB id="howto" label={<><svg viewBox="0 0 20 20" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.6" style={{verticalAlign:"middle",marginRight:3}}><circle cx="10" cy="10" r="8"/><path d="M10 9v5M10 6.5v.5"/></svg>{T("cbHowToPlay")}</>}/>
        </div>
        <div style={{padding:"12px 12px 18px"}}>
          {tab==="payouts"&&<>
            <div style={{fontSize:"9px",color:"#364058",fontWeight:700,letterSpacing:".6px",marginBottom:"8px"}}>{T("cbSymbols")}</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"5px",marginBottom:"12px"}}>
              {[...syms,SCATTER].map(sym=>{const i=SYMBOL_STYLE[sym];return(
                <div key={sym} style={{display:"flex",alignItems:"center",gap:"7px",background:"#0d1420",borderRadius:"9px",padding:"5px 8px",border:"1px solid #1a2438"}}>
                  <div style={{width:"30px",height:"30px",borderRadius:"7px",background:i.bg,display:"flex",alignItems:"center",justifyContent:"center",fontSize:"16px",flexShrink:0,boxShadow:`0 0 7px ${i.shadow}44`}}>{sym}</div>
                  <div><div style={{fontSize:"10px",fontWeight:700,color:"#d9e0ea"}}>{i.name}</div><div style={{fontSize:"8px",fontWeight:700,color:TIER_COLOR[i.tier],textTransform:"uppercase"}}>{i.tier}</div></div>
                </div>
              );})}
            </div>
            <div style={{fontSize:"9px",color:"#364058",fontWeight:700,letterSpacing:".6px",marginBottom:"6px"}}>{T("cbMinCluster")}</div>
            <div style={{background:"#0a1018",borderRadius:"9px",overflow:"hidden",border:"1px solid #1a2438"}}>
              <div style={{display:"grid",gridTemplateColumns:"auto repeat(7,1fr)",borderBottom:"1px solid #1a2438"}}>
                <div style={{padding:"5px 6px",fontSize:"8px",color:"#364058",fontWeight:700}}>{T("cbSym")}</div>
                {sizes.map(s=><div key={s} style={{padding:"5px 3px",fontSize:"9px",color:"#94a3b8",fontWeight:700,textAlign:"center"}}>{s}+</div>)}
              </div>
              {syms.map(sym=>{const i=SYMBOL_STYLE[sym];return(
                <div key={sym} style={{display:"grid",gridTemplateColumns:"auto repeat(7,1fr)",borderBottom:"1px solid #0d1520",alignItems:"center"}}>
                  <div style={{padding:"5px 6px"}}><div style={{width:"22px",height:"22px",borderRadius:"5px",background:i.bg,display:"flex",alignItems:"center",justifyContent:"center",fontSize:"12px"}}>{sym}</div></div>
                  {sizes.map(s=>{const m=getPayout(sym,s);const col=m>=5?"#f4a91f":m>=1?"#22ee66":m>0?"#1a9fff":"#2a3a52";return(
                    <div key={s} style={{padding:"4px 2px",textAlign:"center"}}>
                      {m>0?<><div style={{fontSize:"9px",fontWeight:800,color:col}}>×{m}</div><div style={{fontSize:"7px",color:"#364058"}}>${(bet*m).toFixed(m<1?2:0)}</div></>:<span style={{color:"#2a3a52",fontSize:"9px"}}>—</span>}
                    </div>
                  );})}
                </div>
              );})}
              <div style={{display:"grid",gridTemplateColumns:"auto 1fr",alignItems:"center",padding:"6px"}}>
                <div style={{width:"22px",height:"22px",borderRadius:"5px",background:SYMBOL_STYLE[SCATTER].bg,display:"flex",alignItems:"center",justifyContent:"center",fontSize:"12px",marginRight:"8px"}}>{SCATTER}</div>
                <div style={{fontSize:"10px",fontWeight:700,color:"#f4a91f"}}>{T("cbScatter")}</div>
              </div>
            </div>
          </>}
          {tab==="bonus"&&<>
            <div style={{background:"linear-gradient(135deg,#1a100a,#2a1a08)",border:"1px solid #f4a91f44",borderRadius:"12px",padding:"12px",marginBottom:"10px"}}>
              <div style={{fontSize:"11px",fontWeight:700,color:"#f4a91f",marginBottom:"8px"}}>{T("cbScatterTitle")}</div>
              <div style={{display:"flex",gap:"5px",marginBottom:"8px",justifyContent:"center"}}>
                {[1,2,3,4].map(n=><div key={n} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:"3px"}}>
                  <div style={{width:"34px",height:"34px",borderRadius:"9px",background:n<4?"linear-gradient(145deg,#ffd700,#ff8c00)":"linear-gradient(145deg,#ffd700,#ff4400)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"18px",border:n===4?"2px solid #fff":"2px solid transparent",boxShadow:n===4?"0 0 12px #ffd700":undefined}}>💎</div>
                  <div style={{fontSize:"9px",fontWeight:700,color:n<4?"#64748b":"#ffd700"}}>{n===4?"⭐":n}</div>
                </div>)}
              </div>
              <div style={{fontSize:"11px",color:"#94a3b8",textAlign:"center"}}>{T("cbFourPlus")} <strong style={{color:"#f4a91f"}}>{T("cbFreeSpinsLbl")}</strong></div>
            </div>
            <div style={{background:"linear-gradient(135deg,#0e0a1a,#1a1030)",border:"1px solid #7c3aed44",borderRadius:"12px",padding:"12px",marginBottom:"10px"}}>
              <div style={{fontSize:"11px",fontWeight:700,color:"#a78bfa",marginBottom:"8px"}}>{T("cbMultTitle")}</div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:"4px",marginBottom:"8px"}}>
                {MULT_VALUES.map(v=><div key={v} style={{background:MULT_COLOR[v]+"18",border:`1px solid ${MULT_COLOR[v]}66`,borderRadius:"8px",padding:"6px 3px",textAlign:"center"}}>
                  <div style={{fontSize:"13px",fontWeight:900,color:MULT_COLOR[v]}}>×{v}</div>
                  <div style={{fontSize:"7px",color:"#64748b",marginTop:"1px"}}>{v===2?T("cbComun"):v===5?T("cbFrecuente"):v===10?T("cbPoco"):v===20?T("cbRaro"):T("cbEpico")}</div>
                </div>)}
              </div>
              <div style={{background:"#0a0f1a",borderRadius:"8px",padding:"8px",fontSize:"10px"}}>
                <div style={{color:"#64748b",marginBottom:"4px",fontWeight:700}}>{T("cbExample")}</div>
                <div style={{display:"flex",gap:"3px",alignItems:"center",flexWrap:"wrap"}}>
                  <span style={{background:MULT_COLOR[10]+"22",border:`1px solid ${MULT_COLOR[10]}`,borderRadius:"5px",padding:"1px 6px",color:MULT_COLOR[10],fontWeight:700,fontSize:"11px"}}>×10</span>
                  <span style={{color:"#364058"}}>×</span>
                  <span style={{background:MULT_COLOR[20]+"22",border:`1px solid ${MULT_COLOR[20]}`,borderRadius:"5px",padding:"1px 6px",color:MULT_COLOR[20],fontWeight:700,fontSize:"11px"}}>×20</span>
                  <span style={{color:"#364058"}}>=</span>
                  <span style={{color:"#f4a91f",fontWeight:900,fontSize:"13px"}}>×200</span>
                  <span style={{color:"#64748b",fontSize:"9px"}}>{T("cbOnWinnings")}</span>
                </div>
              </div>
            </div>
            <div style={{background:"linear-gradient(135deg,#0a1a10,#0d2018)",border:"1px solid #22ee6644",borderRadius:"12px",padding:"12px"}}>
              <div style={{fontSize:"11px",fontWeight:700,color:"#22ee66",marginBottom:"6px"}}>{T("cbBuyBonusTitle")}</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"6px",fontSize:"10px",color:"#94a3b8"}}>
                <div><strong style={{color:"#f4a91f"}}>{T("cbFreeSpinsName")}</strong><br/>{T("cbBetX75")}<br/>{T("cbFreeNormal")}</div>
                <div><strong style={{color:"#ff69b4"}}>{T("cbSuperName")}</strong><br/>{T("cbBetX250")}<br/>{T("cbFSMultGuarnt")}</div>
              </div>
            </div>
          </>}
          {tab==="howto"&&<>
            <div style={{background:"#0d1420",borderRadius:"10px",padding:"10px",marginBottom:"8px",border:"1px solid #1a2438"}}>
              <div style={{fontSize:"10px",fontWeight:700,color:"#1a9fff",marginBottom:"6px"}}>{T("cbClusterPays")}</div>
              <div style={{fontSize:"10px",color:"#94a3b8",lineHeight:1.6}}>{T("cbPaidWhen")} <strong style={{color:"#fff"}}>{T("cbClusterDesc")}</strong> {T("cbNoPaylines")}</div>
            </div>
            <div style={{background:"#0d1420",borderRadius:"10px",padding:"10px",marginBottom:"8px",border:"1px solid #1a2438"}}>
              <div style={{fontSize:"10px",fontWeight:700,color:"#22ee66",marginBottom:"6px"}}>{T("cbTumbleTitle")}</div>
              <div style={{fontSize:"10px",color:"#94a3b8",lineHeight:1.6}}>{T("cbTumbleDesc")}</div>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"6px",marginBottom:"8px"}}>
              {[{label:"RTP",val:"96.5%",color:"#f4a91f"},{label:T("cbVolatility"),val:T("cbVolatilityHigh"),color:"#ff5b5b"},{label:"Grid",val:"6 × 5",color:"#1a9fff"},{label:T("cbClusterMin"),val:"5",color:"#22ee66"}].map(({label,val,color})=>(
                <div key={label} style={{background:"#0a1018",borderRadius:"8px",padding:"8px",border:"1px solid #1a2438",textAlign:"center"}}>
                  <div style={{fontSize:"9px",color:"#64748b",fontWeight:700}}>{label}</div>
                  <div style={{fontSize:"14px",fontWeight:900,color,margin:"3px 0"}}>{val}</div>
                </div>
              ))}
            </div>
          </>}
        </div>
      </div>
    </div>
  );
}

// ─── Bet options ──────────────────────────────────────────────────────────────
const BET_OPTS=[0.2,0.5,1,2,5,10,25,50,100];

// ─── Props ────────────────────────────────────────────────────────────────────
interface Props{
  balance:number;currentUser:string;onBack:()=>void;
  onBalanceChange:(n:number)=>void;
  addBet:(wagered:number,win:number,game:string)=>void;
  lang?:string;
}
type Phase="idle"|"spinning"|"evaluating"|"showing_wins"|"exploding"|"tumbling"|
           "freespins_intro"|"freespins"|"freespins_evaluating";

// ─── Main component ───────────────────────────────────────────────────────────
export function CandyBurst({balance,currentUser,onBack,onBalanceChange,addBet,lang}:Props){
  const T=(k:string)=>gt(lang,k);
  const[grid,setGrid]           =useState<string[][]>(()=>makeGrid(BASE_WEIGHTS));
  const[cellKeys,setCellKeys]   =useState<number[][]>(()=>Array.from({length:COLS},(_,c)=>Array.from({length:ROWS},(_,r)=>c*ROWS+r)));
  const[winCells,setWinCells]   =useState<Set<string>>(new Set());
  const[newCells,setNewCells]   =useState<Set<string>>(new Set());
  const[exploding,setExploding] =useState<Set<string>>(new Set());
  const[phase,setPhase]         =useState<Phase>("idle");
  const[bet,setBet]             =useState(1);
  const[freeSpinsLeft,setFSLeft]=useState(0);
  const[roundWin,setRoundWin]   =useState(0);
  const[sessionWin,setSessionWin]=useState(0);
  const[multipliers,setMults]   =useState<{col:number;row:number;val:number}[]>([]);
  const[clusters,setClusters]   =useState<Cluster[]>([]);
  const[winMsg,setWinMsg]       =useState("");
  const[showInfo,setShowInfo]   =useState(false);
  const[autoPlay,setAutoPlay]   =useState(false);
  const[autoLeft,setAutoLeft]   =useState(0);
  const[autoCount,setAutoCount] =useState(10);
  const[scatterHit,setScatterHit]=useState(0);
  const[showBetMenu,setShowBetMenu]=useState(false);
  const[superMode,setSuperMode] =useState(false);

  const keyRef=useRef(COLS*ROWS);
  const cancelRef=useRef(false);
  const autoRef=useRef(false);
  const betRef=useRef(bet);
  const balRef=useRef(balance);
  const phaseRef=useRef<Phase>("idle");
  const fsRef=useRef(0);
  const roundWinRef=useRef(0);
  const cbVolRef=useRef(70); // 0-100

  // ─── Audio helpers ──────────────────────────────────────────────────────
  function playCBSound(type:"spin"|"win"|"bigwin"|"click"|"scatter"){
    if(cbVolRef.current===0)return;
    const v=cbVolRef.current/100;
    try{
      const ctx=new AudioContext();
      if(type==="click"){
        // Soft chip tap
        const buf=ctx.createBuffer(1,Math.floor(ctx.sampleRate*0.04),ctx.sampleRate);
        const d=buf.getChannelData(0);
        for(let i=0;i<d.length;i++) d[i]=(Math.random()*2-1)*Math.pow(1-i/d.length,5)*0.7;
        const src=ctx.createBufferSource(); src.buffer=buf;
        const bp=ctx.createBiquadFilter(); bp.type="bandpass"; bp.frequency.value=900; bp.Q.value=1;
        const g=ctx.createGain(); g.gain.value=v*0.5;
        src.connect(bp);bp.connect(g);g.connect(ctx.destination);src.start();
      } else if(type==="spin"){
        // Mechanical reel whir: short filtered noise burst
        const len=Math.floor(ctx.sampleRate*0.18);
        const buf=ctx.createBuffer(1,len,ctx.sampleRate);
        const d=buf.getChannelData(0);
        for(let i=0;i<d.length;i++) d[i]=(Math.random()*2-1)*0.12*(1-i/len*0.6);
        const src=ctx.createBufferSource(); src.buffer=buf;
        const bp=ctx.createBiquadFilter(); bp.type="bandpass"; bp.frequency.value=480; bp.Q.value=0.7;
        const g=ctx.createGain(); g.gain.value=v*0.65;
        src.connect(bp);bp.connect(g);g.connect(ctx.destination);src.start();
        // Low thump
        const osc=ctx.createOscillator(); const og=ctx.createGain();
        osc.connect(og);og.connect(ctx.destination); osc.type="sine";
        osc.frequency.setValueAtTime(120,ctx.currentTime); osc.frequency.exponentialRampToValueAtTime(55,ctx.currentTime+0.12);
        og.gain.setValueAtTime(v*0.28,ctx.currentTime); og.gain.exponentialRampToValueAtTime(0.001,ctx.currentTime+0.14);
        osc.start();osc.stop(ctx.currentTime+0.15);
      } else if(type==="scatter"){
        // Rising chime
        [440,660,880].forEach((f,i)=>{
          const osc=ctx.createOscillator(); const g=ctx.createGain();
          osc.connect(g);g.connect(ctx.destination); osc.type="sine"; osc.frequency.value=f;
          g.gain.setValueAtTime(0,ctx.currentTime+i*0.09); g.gain.linearRampToValueAtTime(v*0.18,ctx.currentTime+i*0.09+0.03);
          g.gain.exponentialRampToValueAtTime(0.001,ctx.currentTime+i*0.09+0.28);
          osc.start(ctx.currentTime+i*0.09);osc.stop(ctx.currentTime+i*0.09+0.3);
        });
      } else if(type==="win"){
        // 3-note ascending ding
        [523,659,784].forEach((f,i)=>{
          const osc=ctx.createOscillator(); const g=ctx.createGain();
          osc.connect(g);g.connect(ctx.destination); osc.type="sine"; osc.frequency.value=f;
          g.gain.setValueAtTime(0,ctx.currentTime+i*0.1); g.gain.linearRampToValueAtTime(v*0.2,ctx.currentTime+i*0.1+0.02);
          g.gain.exponentialRampToValueAtTime(0.001,ctx.currentTime+i*0.1+0.3);
          osc.start(ctx.currentTime+i*0.1);osc.stop(ctx.currentTime+i*0.1+0.35);
        });
      } else if(type==="bigwin"){
        // 5-note fanfare
        [523,659,784,1047,1319].forEach((f,i)=>{
          const osc=ctx.createOscillator(); const g=ctx.createGain();
          osc.connect(g);g.connect(ctx.destination); osc.type="sine"; osc.frequency.value=f;
          g.gain.setValueAtTime(0,ctx.currentTime+i*0.08); g.gain.linearRampToValueAtTime(v*0.22,ctx.currentTime+i*0.08+0.02);
          g.gain.exponentialRampToValueAtTime(0.001,ctx.currentTime+i*0.08+0.4);
          osc.start(ctx.currentTime+i*0.08);osc.stop(ctx.currentTime+i*0.08+0.45);
        });
      }
    }catch{}
  }

  useEffect(()=>{betRef.current=bet;},[bet]);
  useEffect(()=>{balRef.current=balance;},[balance]);
  useEffect(()=>{phaseRef.current=phase;},[phase]);
  useEffect(()=>{autoRef.current=autoPlay;},[autoPlay]);
  useEffect(()=>()=>{cancelRef.current=true;autoRef.current=false;},[]);

  const nextKey=()=>++keyRef.current;
  const wait=(ms:number)=>new Promise<void>(r=>setTimeout(r,ms));
  function buildAllNewSet(){const s=new Set<string>();for(let c=0;c<COLS;c++)for(let r=0;r<ROWS;r++)s.add(`${c},${r}`);return s;}
  function buildKeys(){return Array.from({length:COLS},()=>Array.from({length:ROWS},()=>nextKey()));}

  // ─── Evaluate + tumble ────────────────────────────────────────────────────
  async function evaluateLoop(g:string[][],isFS:boolean,mults:{col:number;row:number;val:number}[]):Promise<number>{
    setPhase(isFS?"freespins_evaluating":"evaluating");
    await wait(780);
    if(cancelRef.current)return 0;
    const found=findClusters(g);
    if(found.length===0){setPhase(isFS?"freespins":"idle");return 0;}
    const wc=new Set(found.flatMap(cl=>cl.cells.map(([c,r])=>`${c},${r}`)));
    setWinCells(wc);setClusters(found);setPhase("showing_wins");
    const rawMult=found.reduce((s,cl)=>s+getPayout(cl.sym,cl.cells.length),0);
    let accMult=1;
    if(isFS&&mults.length>0)accMult=mults.reduce((p,m)=>p*m.val,1);
    const winAmt=Math.round(betRef.current*rawMult*accMult*100)/100;
    roundWinRef.current+=winAmt;
    setRoundWin(prev=>prev+winAmt);
    balRef.current+=winAmt;
    onBalanceChange(balRef.current);
    await wait(1100);if(cancelRef.current)return winAmt;
    setExploding(wc);setWinCells(new Set());setPhase("exploding");
    await wait(380);if(cancelRef.current)return winAmt;
    const weights=isFS?FS_WEIGHTS:BASE_WEIGHTS;
    const ng=tumble(g,wc,weights);
    const nk=buildKeys();
    const nc=new Set<string>();
    for(let c=0;c<COLS;c++){const removed=g[c].filter((_,r)=>wc.has(`${c},${r}`)).length;for(let r=0;r<removed;r++)nc.add(`${c},${r}`);}
    setExploding(new Set());setClusters([]);setGrid(ng);setCellKeys(nk);setNewCells(nc);setPhase("tumbling");
    await wait(120);
    return winAmt+await evaluateLoop(ng,isFS,mults);
  }

  // ─── Free spins ───────────────────────────────────────────────────────────
  async function runFreeSpins(isSuper=false):Promise<void>{
    const TOTAL=10;fsRef.current=TOTAL;setFSLeft(TOTAL);
    setPhase("freespins_intro");setWinMsg(isSuper?"⭐ SUPER FREE SPINS!":"⭐ ¡FREE SPINS!");
    setSuperMode(isSuper);
    await wait(2400);if(cancelRef.current)return;
    setWinMsg("");
    while(fsRef.current>0&&!cancelRef.current){
      fsRef.current--;setFSLeft(fsRef.current);setPhase("freespins");
      const ng=makeGrid(FS_WEIGHTS);
      const mults=isSuper?placeMults(ng,2):placeMults(ng);
      setMults(mults);
      setGrid(ng);setCellKeys(buildKeys());setNewCells(buildAllNewSet());
      await evaluateLoop(ng,true,mults);
      if(cancelRef.current)break;
      await wait(480);
    }
    setMults([]);fsRef.current=0;setFSLeft(0);setSuperMode(false);
  }

  // ─── Main spin ────────────────────────────────────────────────────────────
  const doSpin=useCallback(async()=>{
    if(phaseRef.current!=="idle")return;
    const curBet=betRef.current,curBal=balRef.current;
    if(curBal<curBet){setWinMsg("💸 Saldo insuficiente");return;}
    cancelRef.current=false;
    playCBSound("spin");
    setPhase("spinning");setWinMsg("");setWinCells(new Set());setExploding(new Set());
    setClusters([]);setMults([]);setRoundWin(0);setScatterHit(0);roundWinRef.current=0;
    balRef.current=curBal-curBet;onBalanceChange(curBal-curBet);
    const ng=makeGrid(BASE_WEIGHTS);
    setGrid(ng);setCellKeys(buildKeys());setNewCells(buildAllNewSet());
    await evaluateLoop(ng,false,[]);if(cancelRef.current)return;
    const sc=countScatters(ng);setScatterHit(sc);
    if(sc>=4){playCBSound("scatter");await wait(500);if(cancelRef.current){setPhase("idle");return;}await runFreeSpins(false);}
    if(cancelRef.current)return;
    const finalWin=roundWinRef.current;
    addBet(curBet,finalWin,"Candy Burst");
    if(finalWin>0){
      setSessionWin(prev=>prev+finalWin);
      if(finalWin>=curBet*20) playCBSound("bigwin");
      else playCBSound("win");
      setWinMsg(finalWin>=curBet*50?`🏆 ¡MEGA WIN! +$${finalWin.toFixed(2)}`:finalWin>=curBet*20?`🔥 ¡BIG WIN! +$${finalWin.toFixed(2)}`:`✨ +$${finalWin.toFixed(2)}`);
    }
    setPhase("idle");
  },[]);

  // ─── Buy bonus ────────────────────────────────────────────────────────────
  const buyBonus=useCallback(async(isSuper:boolean)=>{
    if(phaseRef.current!=="idle")return;
    const cost=isSuper?betRef.current*250:betRef.current*75;
    if(balRef.current<cost){setWinMsg("💸 Saldo insuficiente");return;}
    cancelRef.current=false;
    setPhase("spinning");setWinMsg("");setWinCells(new Set());setExploding(new Set());
    setClusters([]);setMults([]);setRoundWin(0);roundWinRef.current=0;
    balRef.current-=cost;onBalanceChange(balRef.current);
    await runFreeSpins(isSuper);
    if(cancelRef.current)return;
    const finalWin=roundWinRef.current;
    addBet(cost,finalWin,"Candy Burst");
    if(finalWin>0){
      setSessionWin(prev=>prev+finalWin);
      setWinMsg(finalWin>=cost*0.5?`🏆 ¡MEGA WIN! +$${finalWin.toFixed(2)}`:finalWin>0?`✨ +$${finalWin.toFixed(2)}`:"");
    }
    setPhase("idle");
  },[]);

  // ─── Auto-play ────────────────────────────────────────────────────────────
  useEffect(()=>{
    if(!autoPlay||phaseRef.current!=="idle")return;
    if(autoLeft<=0){setAutoPlay(false);return;}
    const t=setTimeout(()=>{if(autoRef.current&&autoLeft>0){setAutoLeft(p=>p-1);doSpin();}},320);
    return()=>clearTimeout(t);
  },[autoPlay,phase,autoLeft]);

  function startAuto(){if(phaseRef.current!=="idle")return;setAutoLeft(autoCount);setAutoPlay(true);doSpin();}
  function stopAuto(){setAutoPlay(false);setAutoLeft(0);cancelRef.current=true;}

  // ─── Derived ──────────────────────────────────────────────────────────────
  const spinning=phase!=="idle";
  const inFS=phase==="freespins"||phase==="freespins_intro"||phase==="freespins_evaluating";
  const showingWin=phase==="showing_wins"||phase==="exploding";
  const betIdx=BET_OPTS.indexOf(bet);

  // ─── Render ───────────────────────────────────────────────────────────────
  return(
    <>
      <style>{`
        @keyframes cbDrop {
          0%   { transform:translateY(-130px) scale(0.7); opacity:0; }
          55%  { transform:translateY(8px) scale(1.08); opacity:1; }
          75%  { transform:translateY(-4px) scale(0.97); }
          100% { transform:translateY(0) scale(1); opacity:1; }
        }
        @keyframes cbWin {
          0%,100% { transform:scale(1); filter:brightness(1.15) saturate(1.2); }
          45%     { transform:scale(1.2); filter:brightness(1.8) saturate(1.7); }
        }
        @keyframes cbExplode {
          0%   { transform:scale(1) rotate(0);   opacity:1; filter:brightness(2); }
          40%  { transform:scale(1.5) rotate(15deg); opacity:0.7; filter:brightness(4); }
          100% { transform:scale(0) rotate(30deg); opacity:0; filter:brightness(6) blur(3px); }
        }
        @keyframes cbFSBanner {
          0%   { transform:scale(0.2) rotate(-12deg); opacity:0; }
          60%  { transform:scale(1.12) rotate(3deg); opacity:1; }
          80%  { transform:scale(0.96) rotate(-1deg); }
          100% { transform:scale(1) rotate(0); opacity:1; }
        }
        @keyframes cbMultPop {
          0%   { transform:scale(0) rotate(-25deg); opacity:0; }
          60%  { transform:scale(1.4) rotate(8deg); opacity:1; }
          100% { transform:scale(1) rotate(0); opacity:1; }
        }
        @keyframes cbScatterPulse {
          0%,100% { transform:scale(1); box-shadow:0 0 6px #ffd700; }
          50%     { transform:scale(1.08); box-shadow:0 0 20px #ffd700; }
        }
        @keyframes cbPulse { 0%,100% { opacity:1; } 50% { opacity:0.5; } }
        @keyframes cbWinCount {
          0%   { transform:scale(0.7) translateY(6px); opacity:0; }
          60%  { transform:scale(1.1) translateY(-3px); opacity:1; }
          100% { transform:scale(1) translateY(0); opacity:1; }
        }
        @keyframes cbBanner {
          0%,100% { text-shadow:0 0 20px #f4a91f, 0 0 40px #ff8c00; }
          50%     { text-shadow:0 0 40px #f4a91f, 0 0 80px #ff8c00, 0 0 120px #ff4400; }
        }
        @keyframes cbFSGlow {
          0%,100% { box-shadow:0 0 30px rgba(124,58,237,.4), inset 0 0 40px rgba(124,58,237,.05); }
          50%     { box-shadow:0 0 60px rgba(124,58,237,.7), inset 0 0 80px rgba(124,58,237,.1); }
        }
      `}</style>

      {showInfo&&<InfoPanel bet={bet} onClose={()=>setShowInfo(false)} lang={lang}/>}

      {/* Bet selector popup */}
      {showBetMenu&&!spinning&&(
        <div style={{position:"fixed",inset:0,zIndex:2000,display:"flex",alignItems:"flex-end",justifyContent:"flex-start",padding:"0 0 52px 4px"}} onClick={()=>setShowBetMenu(false)}>
          <div style={{background:"#131a28",border:"1px solid #2a3550",borderRadius:"12px",padding:"8px",minWidth:"130px"}} onClick={e=>e.stopPropagation()}>
            <div style={{fontSize:"8px",color:"#64748b",fontWeight:700,letterSpacing:".6px",marginBottom:"6px",paddingLeft:"4px"}}>{T("cbApuesta")}</div>
            {BET_OPTS.map(b=>(
              <button key={b} onClick={()=>{setBet(b);setShowBetMenu(false);}} style={{display:"block",width:"100%",padding:"5px 10px",fontSize:"12px",fontWeight:800,background:bet===b?"linear-gradient(135deg,#f6b531,#ea9807)":"transparent",color:bet===b?"#000":"#94a3b8",border:"none",borderRadius:"7px",cursor:"pointer",textAlign:"left",marginBottom:"1px"}}>
                ${b<1?b:Math.round(b)}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Root: fills parent container, no scroll ── */}
      <div style={{
        height:"100%",overflow:"hidden",
        background:"linear-gradient(180deg,#080c16 0%,#0e1320 60%,#080c14 100%)",
        color:"#d9e0ea",fontFamily:"system-ui,sans-serif",
        display:"flex",flexDirection:"column",
      }}>

        {/* ── Header bar ── */}
        <div style={{display:"flex",alignItems:"center",gap:"12px",padding:"10px 20px",background:"#0e1826",borderBottom:"1px solid #1a2438",flexShrink:0}}>
          <button onClick={onBack} style={{background:"#131a28",border:"1px solid #252f45",color:"#8090b0",cursor:"pointer",fontSize:"18px",padding:"5px 12px",borderRadius:"8px",lineHeight:1}}>←</button>
          <div style={{fontWeight:900,fontSize:"15px",letterSpacing:"1.5px",color:"#fff"}}>🍭 CANDY BURST</div>
          {inFS&&(
            <div style={{display:"flex",alignItems:"center",gap:"4px",background:"linear-gradient(135deg,#4c1d95,#7c3aed)",borderRadius:"8px",padding:"3px 8px",animation:"cbPulse 1s ease infinite"}}>
              <span style={{fontSize:"12px"}}>⭐</span>
              <div>
                <div style={{fontSize:"11px",fontWeight:900,color:"#fff",lineHeight:1}}>{freeSpinsLeft}</div>
                <div style={{fontSize:"7px",color:"#c4b5fd",lineHeight:1}}>FS</div>
              </div>
            </div>
          )}
          <div style={{marginLeft:"auto",fontSize:"12px",color:"#5a6a88",fontWeight:700}}>{T("manderOriginals")}</div>
        </div>

        {/* ── TOP BAR: banner ── */}
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"3px 6px",flexShrink:0,background:"linear-gradient(180deg,#0c1020,transparent)"}}>
          <div style={{fontSize:"clamp(10px,2.8vw,13px)",fontWeight:900,color:"#f4a91f",animation:"cbBanner 2s ease-in-out infinite",letterSpacing:".3px"}}>
            {T("cbGaneHasta")} <span style={{color:"#fff"}}>200×</span> {T("cbApuesta")}
          </div>
          {!inFS&&<div style={{fontSize:"11px",fontWeight:800,color:"#f4a91f"}}>${balance.toFixed(2)}</div>}
        </div>

        {/* ── MIDDLE: left panel + grid ── */}
        <div style={{display:"flex",flex:1,overflow:"hidden",gap:"4px",padding:"2px 4px"}}>

          {/* ──── LEFT PANEL (narrow) ──── */}
          <div style={{width:"90px",flexShrink:0,display:"flex",flexDirection:"column",gap:"4px",overflow:"hidden"}}>

            {/* Buy Free Spins */}
            <button onClick={()=>!spinning&&buyBonus(false)} disabled={spinning||balance<bet*75} style={{
              background:spinning||balance<bet*75?"#1a2438":"linear-gradient(160deg,#9d1448,#e91e8c)",
              border:spinning||balance<bet*75?"1px solid #2a3448":"1px solid #f472b6",
              borderRadius:"8px",padding:"5px 4px",cursor:spinning||balance<bet*75?"not-allowed":"pointer",
              opacity:spinning||balance<bet*75?.5:1,textAlign:"center",
              boxShadow:spinning||balance<bet*75?"none":"0 3px 14px rgba(233,30,140,.4)",
              transition:"all .2s",flexShrink:0,
            }}
            onMouseEnter={e=>{ if(!spinning&&balance>=bet*75){e.currentTarget.style.transform="scale(1.05)";e.currentTarget.style.boxShadow="0 5px 22px rgba(233,30,140,.7)";}}}
            onMouseLeave={e=>{ e.currentTarget.style.transform="";e.currentTarget.style.boxShadow=spinning||balance<bet*75?"none":"0 3px 14px rgba(233,30,140,.4)"; }}>
              <div style={{fontSize:"7px",fontWeight:700,color:"rgba(255,255,255,.75)",lineHeight:1.3}}>{T("cbBuySpins").split("\n").map((l,i)=>i===0?l:<><br/>{l}</>)}</div>
              <div style={{fontSize:"13px",fontWeight:900,color:"#fff",marginTop:"2px"}}>${(bet*75)<100?(bet*75).toFixed(bet<1?2:0):(bet*75).toFixed(0)}</div>
            </button>

            {/* Buy Super Free Spins */}
            <button onClick={()=>!spinning&&buyBonus(true)} disabled={spinning||balance<bet*250} style={{
              background:spinning||balance<bet*250?"#1a2438":"linear-gradient(160deg,#3b0764,#7c3aed)",
              border:spinning||balance<bet*250?"1px solid #2a3448":"1px solid #a78bfa",
              borderRadius:"8px",padding:"5px 4px",cursor:spinning||balance<bet*250?"not-allowed":"pointer",
              opacity:spinning||balance<bet*250?.5:1,textAlign:"center",
              boxShadow:spinning||balance<bet*250?"none":"0 3px 14px rgba(124,58,237,.4)",
              transition:"all .2s",flexShrink:0,
            }}
            onMouseEnter={e=>{ if(!spinning&&balance>=bet*250){e.currentTarget.style.transform="scale(1.05)";e.currentTarget.style.boxShadow="0 5px 22px rgba(124,58,237,.75)";}}}
            onMouseLeave={e=>{ e.currentTarget.style.transform="";e.currentTarget.style.boxShadow=spinning||balance<bet*250?"none":"0 3px 14px rgba(124,58,237,.4)"; }}>
              <div style={{fontSize:"7px",fontWeight:700,color:"rgba(255,255,255,.75)",lineHeight:1.3}}>{T("cbBuySpins").split("\n")[0]}<br/><span style={{color:"#f9a8d4",fontWeight:900}}>SUPER</span></div>
              <div style={{fontSize:"13px",fontWeight:900,color:"#fff",marginTop:"2px"}}>${(bet*250)<100?(bet*250).toFixed(bet<1?2:0):(bet*250).toFixed(0)}</div>
            </button>

            {/* Bet selector */}
            <div style={{background:"#0d1420",border:"1px solid #1e2a3e",borderRadius:"8px",padding:"5px 4px",textAlign:"center",flexShrink:0}}>
              <div style={{fontSize:"7px",color:"#4a5a78",fontWeight:700}}>{T("cbApuesta")}</div>
              <div style={{fontSize:"15px",fontWeight:900,color:"#f4a91f",lineHeight:1.1}}>${bet<1?bet:Math.round(bet)}</div>
              <div style={{display:"flex",gap:"2px",justifyContent:"center",marginTop:"3px"}}>
                <button onClick={()=>!spinning&&betIdx>0&&setBet(BET_OPTS[betIdx-1])} disabled={spinning||betIdx===0} style={{flex:1,height:"20px",background:"#1a2438",color:"#64748b",border:"none",borderRadius:"4px",cursor:"pointer",fontSize:"12px",fontWeight:700,opacity:spinning||betIdx===0?.4:1,transition:"filter .12s,transform .12s"}}
                  onMouseEnter={e=>{ if(!spinning&&betIdx>0){e.currentTarget.style.filter="brightness(1.5)";e.currentTarget.style.transform="scale(1.1)";}}}
                  onMouseLeave={e=>{ e.currentTarget.style.filter="";e.currentTarget.style.transform=""; }}>−</button>
                <button onClick={()=>!spinning&&setShowBetMenu(true)} disabled={spinning} style={{flex:1,height:"20px",background:"#1a2438",color:"#4a5a78",border:"none",borderRadius:"4px",cursor:"pointer",fontSize:"7px",fontWeight:700,transition:"filter .12s"}}
                  onMouseEnter={e=>{ if(!spinning)e.currentTarget.style.filter="brightness(1.5)"; }}
                  onMouseLeave={e=>{ e.currentTarget.style.filter=""; }}>{T("cbSee")}</button>
                <button onClick={()=>!spinning&&betIdx<BET_OPTS.length-1&&setBet(BET_OPTS[betIdx+1])} disabled={spinning||betIdx===BET_OPTS.length-1} style={{flex:1,height:"20px",background:"#1a2438",color:"#64748b",border:"none",borderRadius:"4px",cursor:"pointer",fontSize:"12px",fontWeight:700,opacity:spinning||betIdx===BET_OPTS.length-1?.4:1,transition:"filter .12s,transform .12s"}}
                  onMouseEnter={e=>{ if(!spinning&&betIdx<BET_OPTS.length-1){e.currentTarget.style.filter="brightness(1.5)";e.currentTarget.style.transform="scale(1.1)";}}}
                  onMouseLeave={e=>{ e.currentTarget.style.filter="";e.currentTarget.style.transform=""; }}>+</button>
              </div>
            </div>

            {/* Live win counter */}
            {roundWin>0&&spinning&&(
              <div style={{background:"linear-gradient(135deg,#071508,#0d2010)",border:"1px solid #22ee6644",borderRadius:"8px",padding:"5px 4px",textAlign:"center",animation:"cbWinCount .35s ease",flexShrink:0}}>
                <div style={{fontSize:"7px",color:"#22ee6688",fontWeight:700}}>{T("cbWinning")}</div>
                <div style={{fontSize:"14px",fontWeight:900,color:"#22ee66",lineHeight:1,textShadow:"0 0 14px #22ee66"}}>+${roundWin.toFixed(2)}</div>
              </div>
            )}

            {/* Win message */}
            {winMsg&&!spinning&&(
              <div style={{background:"linear-gradient(135deg,#1a1005,#2a1a08)",border:"1px solid #f4a91f44",borderRadius:"8px",padding:"5px 4px",textAlign:"center",animation:"cbWinCount .4s ease",flexShrink:0}}>
                <div style={{fontSize:"11px",fontWeight:900,color:"#f4a91f",lineHeight:1.2,textShadow:winMsg.includes("MEGA")?"0 0 20px #f4a91f":"none",display:"flex",alignItems:"center",justifyContent:"center",gap:"4px"}}>
                  {(()=>{
                    const emojiMap:[string,string,number][]=[
                      ["🏆",`${import.meta.env.BASE_URL}emoji-megawin.png`,18],
                      ["🔥",`${import.meta.env.BASE_URL}emoji-bigwin.png`,16],
                      ["⭐",`${import.meta.env.BASE_URL}emoji-freespins.png`,16],
                    ];
                    for(const[em,src,sz] of emojiMap){
                      if(winMsg.startsWith(em))return<><img src={src} style={{width:sz,height:sz,objectFit:"contain",flexShrink:0}}/><span>{winMsg.slice(em.length).trimStart()}</span></>;
                    }
                    return<span>{winMsg.replace(/^[✨💸]\s*/,"")}</span>;
                  })()}
                </div>
              </div>
            )}

            {/* Scatter hint */}
            {scatterHit>0&&scatterHit<4&&phase==="idle"&&(
              <div style={{background:"#10100a",border:"1px solid #f4a91f33",borderRadius:"7px",padding:"4px",textAlign:"center",flexShrink:0}}>
                <div style={{fontSize:"8px",color:"#f4a91f",fontWeight:700}}>💎 {scatterHit}/4</div>
              </div>
            )}

            {/* Spacer + session */}
            <div style={{flex:1}}/>
            <div style={{background:"#0a1018",border:"1px solid #1a2438",borderRadius:"7px",padding:"4px",textAlign:"center",flexShrink:0}}>
              <div style={{fontSize:"7px",color:"#2a3a52",fontWeight:700}}>{T("cbSession")}</div>
              <div style={{fontSize:"11px",fontWeight:800,color:"#22ee66"}}>${sessionWin.toFixed(2)}</div>
            </div>
          </div>

          {/* ──── GRID ──── */}
          <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",overflow:"hidden",minWidth:0,gap:"3px"}}>

            {/* Grid wrapper — fills available height */}
            <div style={{
              position:"relative",flex:1,width:"100%",
              display:"flex",alignItems:"center",justifyContent:"center",overflow:"hidden",
            }}>
              <div style={{
                position:"relative",
                background:"#060a12",
                borderRadius:"12px",
                padding:"5px",
                border:inFS?(superMode?"2px solid #ff69b4":"2px solid #7c3aed"):"2px solid #162030",
                animation:inFS?"cbFSGlow 2s ease-in-out infinite":"none",
                transition:"border-color .5s",
                height:"100%",
                aspectRatio:"6/5",
                maxWidth:"100%",
                boxSizing:"border-box",
              }}>

                {/* FS intro overlay */}
                {phase==="freespins_intro"&&(
                  <div style={{position:"absolute",inset:0,background:"rgba(3,1,14,.96)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",zIndex:10,borderRadius:"10px",gap:"5px"}}>
                    <div style={{fontSize:"clamp(18px,5vw,32px)",fontWeight:900,color:superMode?"#ff69b4":"#f4a91f",animation:"cbFSBanner .7s cubic-bezier(.34,1.56,.64,1)",textShadow:`0 0 40px ${superMode?"#ff69b4":"#f4a91f"}`}}>
                      {superMode?"⭐ SUPER FREE SPINS ⭐":"⭐ FREE SPINS ⭐"}
                    </div>
                    <div style={{fontSize:"clamp(11px,3vw,16px)",fontWeight:700,color:"#fff"}}>10 giros gratis</div>
                    <div style={{display:"flex",gap:"3px",marginTop:"3px"}}>
                      {MULT_VALUES.map(v=><div key={v} style={{background:MULT_COLOR[v]+"22",border:`1px solid ${MULT_COLOR[v]}`,borderRadius:"5px",padding:"2px 5px",color:MULT_COLOR[v],fontWeight:800,fontSize:"10px"}}>×{v}</div>)}
                    </div>
                  </div>
                )}

                {/* Grid cells */}
                <div style={{
                  display:"grid",
                  gridTemplateColumns:`repeat(${COLS},1fr)`,
                  gridTemplateRows:`repeat(${ROWS},1fr)`,
                  gap:"3px",
                  width:"100%",
                  height:"100%",
                }}>
                  {Array.from({length:ROWS},(_,r)=>Array.from({length:COLS},(_,c)=>{
                    const sym=grid[c][r];
                    const st=SYMBOL_STYLE[sym]??SYMBOL_STYLE["🍒"];
                    const ck=`${c},${r}`;
                    const isWin=winCells.has(ck),isExploding=exploding.has(ck),isNew=newCells.has(ck);
                    const mult=multipliers.find(m=>m.col===c&&m.row===r);
                    const isScatter=sym===SCATTER;
                    return(
                      <div key={cellKeys[c][r]} style={{
                        background:st.bg,borderRadius:"8px",
                        display:"flex",alignItems:"center",justifyContent:"center",
                        fontSize:"clamp(14px,3.8vw,28px)",position:"relative",overflow:"hidden",
                        border:isWin?"2px solid rgba(255,255,255,.9)":"1px solid rgba(255,255,255,.08)",
                        boxShadow:isWin?`0 0 16px 3px ${st.shadow}77, inset 0 0 8px rgba(255,255,255,.15)`:isScatter&&!spinning?`0 0 8px ${st.shadow}55`:"0 1px 4px rgba(0,0,0,.5)",
                        animation:isExploding?"cbExplode .38s ease-out both":isNew?`cbDrop 0.65s cubic-bezier(.34,1.4,.64,1) ${c*35}ms both`:isWin?"cbWin .7s ease-in-out infinite":isScatter&&!spinning?"cbScatterPulse 2s ease infinite":"none",
                        filter:isWin?"brightness(1.2)":isExploding?"brightness(2.5)":"none",
                        transition:"box-shadow .3s,filter .3s",
                      } as React.CSSProperties}>
                        <span style={{lineHeight:1,userSelect:"none"}}>{sym}</span>
                        {mult&&(
                          <div style={{position:"absolute",bottom:"-3px",right:"-3px",background:MULT_COLOR[mult.val],color:"#000",fontWeight:900,fontSize:"7px",borderRadius:"4px",padding:"1px 3px",border:"1.5px solid #fff",zIndex:2,animation:"cbMultPop .45s cubic-bezier(.34,1.56,.64,1) both",lineHeight:1.2}}>×{mult.val}</div>
                        )}
                      </div>
                    );
                  }))}
                </div>
              </div>
            </div>

            {/* Cluster breakdown pills */}
            {clusters.length>0&&showingWin&&(
              <div style={{display:"flex",justifyContent:"center",gap:"3px",flexWrap:"wrap",width:"100%",flexShrink:0}}>
                {clusters.map((cl,i)=>{
                  const m=getPayout(cl.sym,cl.cells.length);
                  return(
                    <div key={i} style={{background:"rgba(255,255,255,.05)",borderRadius:"6px",padding:"2px 6px",fontSize:"10px",fontWeight:700,color:"#fff",border:"1px solid rgba(255,255,255,.1)"}}>
                      {cl.sym}×{cl.cells.length} <span style={{color:"#22ee66"}}>+${(betRef.current*m).toFixed(2)}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ──── BOTTOM BAR ──── */}
        <div style={{
          display:"flex",alignItems:"center",gap:"5px",
          padding:"4px 6px 6px",flexShrink:0,
          background:"linear-gradient(180deg,transparent,#060a12)",
        }}>
          {/* Left controls */}
          <button onClick={onBack} style={{width:"28px",height:"28px",background:"#1a2438",color:"#64748b",border:"1px solid #2a3550",borderRadius:"7px",cursor:"pointer",fontSize:"12px",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>←</button>
          <button onClick={()=>setShowInfo(true)} style={{width:"28px",height:"28px",background:"#1a2438",color:"#94a3b8",border:"1px solid #2a3550",borderRadius:"50%",cursor:"pointer",fontWeight:700,fontSize:"12px",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>i</button>

          {/* Credit info */}
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:"8px",color:"#4a5a78",fontWeight:700}}>{T("cbCredit")}</div>
            <div style={{fontSize:"13px",fontWeight:800,color:"#f4a91f",lineHeight:1}}>${balance.toFixed(2)}</div>
          </div>

          {/* Auto count − */}
          <button onClick={()=>!spinning&&setAutoCount(c=>Math.max(5,c-5))} disabled={spinning} style={{width:"26px",height:"26px",background:"#1a2438",color:"#64748b",border:"1px solid #2a3550",borderRadius:"50%",cursor:"pointer",fontSize:"13px",fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,opacity:spinning?.4:1,transition:"filter .15s,transform .12s"}}
            onMouseEnter={e=>{ if(!spinning){e.currentTarget.style.filter="brightness(1.4)";e.currentTarget.style.transform="scale(1.15)";}}}
            onMouseLeave={e=>{ e.currentTarget.style.filter="";e.currentTarget.style.transform=""; }}>−</button>

          {/* TIR. AUTO. */}
          {autoPlay
            ?<button onClick={stopAuto} style={{height:"38px",padding:"0 8px",background:"linear-gradient(180deg,#7c3aed,#4c1d95)",color:"#fff",border:"1px solid #a855f7",borderRadius:"8px",cursor:"pointer",fontSize:"9px",fontWeight:900,textAlign:"center",minWidth:"60px",flexShrink:0}}>
                <div>{T("cbStop")}</div><div style={{fontSize:"7px",color:"#c4b5fd"}}>{autoLeft}</div>
              </button>
            :<button onClick={startAuto} disabled={spinning} style={{height:"38px",padding:"0 8px",background:spinning?"#111820":"linear-gradient(180deg,#0f2a45,#1a9fff)",color:spinning?"#2a3a52":"#fff",border:spinning?"1px solid #1a2438":"1px solid #38bdf8",borderRadius:"8px",cursor:spinning?"not-allowed":"pointer",fontSize:"9px",fontWeight:900,textAlign:"center",minWidth:"60px",flexShrink:0,opacity:spinning?.5:1}}>
                <div>{T("cbAutoSpin")}</div><div style={{fontSize:"7px",color:spinning?"#2a3a52":"#7dd3fc"}}>{autoCount}</div>
              </button>
          }

          {/* Auto count + */}
          <button onClick={()=>!spinning&&setAutoCount(c=>Math.min(100,c+5))} disabled={spinning} style={{width:"26px",height:"26px",background:"#1a2438",color:"#64748b",border:"1px solid #2a3550",borderRadius:"50%",cursor:"pointer",fontSize:"13px",fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,opacity:spinning?.4:1,transition:"filter .15s,transform .12s"}}
            onMouseEnter={e=>{ if(!spinning){e.currentTarget.style.filter="brightness(1.4)";e.currentTarget.style.transform="scale(1.15)";}}}
            onMouseLeave={e=>{ e.currentTarget.style.filter="";e.currentTarget.style.transform=""; }}>+</button>

          {/* SPIN */}
          <button onClick={doSpin} disabled={spinning} style={{
            width:"52px",height:"52px",borderRadius:"50%",flexShrink:0,
            background:spinning?"#121820":inFS?"linear-gradient(145deg,#7c3aed,#4c1d95)":"linear-gradient(145deg,#f6b531,#ea9807)",
            border:spinning?"2px solid #1e2a3e":inFS?"2px solid #a855f7":"2px solid #fde68a",
            cursor:spinning?"not-allowed":"pointer",fontSize:"20px",
            display:"flex",alignItems:"center",justifyContent:"center",
            boxShadow:spinning?"none":inFS?"0 0 22px rgba(124,58,237,.65)":"0 0 22px rgba(246,181,49,.65)",
            animation:spinning?"cbPulse .8s ease infinite":"none",
            opacity:spinning?.65:1,transition:"all .25s",
          }}
          onMouseEnter={e => { if (!spinning) { e.currentTarget.style.transform="scale(1.12)"; e.currentTarget.style.boxShadow=inFS?"0 0 38px rgba(124,58,237,.9)":"0 0 38px rgba(246,181,49,.9)"; }}}
          onMouseLeave={e => { e.currentTarget.style.transform=""; e.currentTarget.style.boxShadow=spinning?"none":inFS?"0 0 22px rgba(124,58,237,.65)":"0 0 22px rgba(246,181,49,.65)"; }}>
            {spinning?"⏳":"↺"}
          </button>
        </div>

      </div>
    </>
  );
}
