import {useEffect,useRef,useState} from 'react';
export default function PetVision({onBack}) {
  const [photo,setPhoto]=useState(null),[preview,setPreview]=useState(''),[consent,setConsent]=useState(false),[result,setResult]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const ctl=useRef(null),version=useRef(0);
  useEffect(()=>()=>{ctl.current?.abort();},[]);
  useEffect(()=>()=>{if(preview)URL.revokeObjectURL(preview);},[preview]);
  async function select(file){
    if(!file)return;
    const revision=++version.current;ctl.current?.abort();setBusy(false);setResult(null);setError('');setPhoto(null);setPreview('');setConsent(false);
    if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>3000000){setError('Choose JPEG, PNG or WebP up to 3 MB.');return;}
    const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result.split(',')[1]);reader.onerror=reject;reader.readAsDataURL(file);}).catch(()=>null);
    if(revision!==version.current)return;
    if(!data){setError('Could not read this photo.');return;}
    setPhoto({mime_type:file.type,data});setPreview(URL.createObjectURL(file));
  }
  async function analyze(){
    const controller=new AbortController();ctl.current=controller;setBusy(true);setResult(null);setError('');
    const timer=setTimeout(()=>controller.abort(),45000);
    try{
      const r=await fetch('/api/v1/vision/observations',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({photo,share_with_ai:consent}),signal:controller.signal});
      const body=await r.json();if(!r.ok)throw Error(typeof body.detail==='string'?body.detail:'Photo request failed.');setResult(body);
    }catch(e){if(!controller.signal.aborted)setError(e.message);else setError('Analysis stopped or timed out. Please retry.');}
    finally{clearTimeout(timer);setBusy(false);}
  }
  return <main className="plan handoff"><h1>Cat photo observations</h1>
    <p>Photograph the face at eye level in good light. Include a separate full-body photo for posture. This does not identify your cat or diagnose pain.</p>
    <section className="card"><label>Upload photo <input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={e=>select(e.target.files[0])}/></label>
    <label>Take photo <input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" disabled={busy} onChange={e=>select(e.target.files[0])}/></label>
    <p>On supported phones, Take photo opens the camera. On desktop, it may open the file picker.</p>
    {preview&&<img src={preview} alt="Selected cat photo" style={{maxWidth:'100%',maxHeight:320,objectFit:'contain'}}/>}
    <label><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)} disabled={busy}/> Share this selected photo with Gemini for visual observations.</label>
    <button className="btn primary" disabled={busy||!photo||!consent} onClick={analyze}>{busy?'Analyzing…':'Analyze photo'}</button></section>
    {error&&<p role="alert">{error}</p>}
    {result&&<section className="card"><h2>Visible observations</h2><p>Cat detected: {result.cat_detected===null?'unknown':result.cat_detected?'yes':'no'} · Face assessable: {result.face_assessable?'yes':'no'} · Image quality: {result.image_quality}</p>
    {Object.entries(result.visible_observations).map(([key,value])=><p key={key}><strong>{key}:</strong> {value==='not_visible'?'Not visible / cannot assess':value}</p>)}
    <h3>Limitations</h3>{result.limitations.map((x,i)=><p key={i}>{x}</p>)}<h3>Questions for you</h3>{result.questions_for_owner.map((x,i)=><p key={i}>{x}</p>)}<p>{result.disclaimer}</p></section>}
    <p>If your cat has breathing difficulty, collapses or has another emergency sign, contact a veterinarian without waiting for photo analysis.</p>
    <button className="btn ghost" onClick={onBack}>Back</button></main>;
}
