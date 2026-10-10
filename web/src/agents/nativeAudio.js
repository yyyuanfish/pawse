export function pcm16Base64(samples) {
  const bytes = new Uint8Array(samples.length * 2), view = new DataView(bytes.buffer);
  for (let i=0;i<samples.length;i++) view.setInt16(i*2, Math.round(Math.max(-1,Math.min(1,samples[i]))*32767), true);
  let s=''; for (let i=0;i<bytes.length;i+=8192) s+=String.fromCharCode(...bytes.subarray(i,i+8192));
  return btoa(s);
}
export function decodePCM(data) {
  const raw=atob(data); if (raw.length%2) throw Error('Invalid PCM frame');
  const bytes=Uint8Array.from(raw,c=>c.charCodeAt(0)), view=new DataView(bytes.buffer), out=new Float32Array(bytes.length/2);
  for(let i=0;i<out.length;i++) out[i]=view.getInt16(i*2,true)/32768;
  return out;
}
// iOS Safari lets an AudioContext start only inside the tap that asked for it, and may keep one created
// later (after a fetch or a React effect) suspended forever: the mic then sends nothing. primeAudio() runs
// synchronously in the tap handlers (Agree and start, mic on); the call's audio adopts or resumes these contexts.
const contextClass=()=>globalThis.AudioContext || globalThis.webkitAudioContext;
let spare=null; const live=new Set();
export function primeAudio() {
  const AC=contextClass(); if(!AC) return;
  if(!live.size&&!spare) spare={input:new AC({sampleRate:16000}),output:new AC({sampleRate:24000})};
  for(const ctx of [...live,...(spare?[spare.input,spare.output]:[])]) ctx.resume().catch(()=>{});
}
export function createNativeAudio(onFrame, onSpeaking) {
  const AC=contextClass();
  if (!AC) throw Error('Native audio is unavailable in this browser.');
  const {input,output}=spare||{input:new AC({sampleRate:16000}),output:new AC({sampleRate:24000})};
  spare=null; live.add(input); live.add(output);
  output.resume().catch(()=>{});
  let ready=null, source=null, worklet=null, stream=null, closed=false, muted=false, inputGeneration=0, attachRequest=0;
  let epoch=0; let next=0; const playing=new Set();
  function flush() { epoch++; for(const s of playing) {try{s.stop();}catch{}} playing.clear();next=0;onSpeaking(false); }
  async function detach() {
    inputGeneration++;
    if(worklet) {worklet.port.onmessage=null;worklet.disconnect();worklet=null;}
    source?.disconnect();source=null;
    stream?.getTracks().forEach(t=>t.stop());stream=null;
  }
  // One input context per call, kept across mic off/on so it never has to be re-unlocked outside a tap.
  function loadWorklet() {
    ready??=input.audioWorklet.addModule(new URL('../audio/pcm-worklet.js', import.meta.url)).catch(e=>{ready=null;throw e;});
    return ready;
  }
  return {
    async attach(media) {
      if(media===stream) return;
      const request=++attachRequest;
      await detach(); if(!media||closed||request!==attachRequest) return;
      const generation=++inputGeneration;
      stream=media;
      await loadWorklet();
      if(closed||generation!==inputGeneration) return;
      await input.resume();
      if(closed||generation!==inputGeneration) return;
      source=input.createMediaStreamSource(media);worklet=new AudioWorkletNode(input,'pawse-pcm');
      worklet.port.onmessage=e=>{if(!closed) onFrame(pcm16Base64(e.data));};
      source.connect(worklet); worklet.connect(input.destination); // processor outputs silence
    },
    async play(data, rate=24000) {
      if(closed||muted) return;
      if(!Number.isFinite(rate)||rate<8000||rate>48000) throw Error('Invalid audio rate');
      const samples=decodePCM(data);
      if(!samples.length) return;
      if(Math.max(next,output.currentTime)+samples.length/rate-output.currentTime>15) throw Error('Audio playback cannot keep up. Restart the session.');
      const generation=epoch;await output.resume(); if(closed||muted||generation!==epoch) return;
      const buffer=output.createBuffer(1,samples.length,rate);buffer.copyToChannel(samples,0);
      const node=output.createBufferSource();node.buffer=buffer;node.connect(output.destination);
      node.onended=()=>{playing.delete(node);node.disconnect();if(!playing.size) onSpeaking(false);};
      playing.add(node);onSpeaking(true);next=Math.max(next,output.currentTime);node.start(next);next+=buffer.duration;
    },
    flush,
    setMuted(value){muted=value;if(value)flush();},
    async close(){closed=true;flush();await detach();live.delete(input);live.delete(output);await Promise.all([input.close(),output.close()].map(p=>p.catch(()=>{})));},
  };
}
