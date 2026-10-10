export default function FacialCues({result}) {
  const estimate=result?.facial_estimate,cues=result?.facial_cues;
  if(!estimate||!cues)return null;
  const labels={ears:'Ear position',eyes:'Eye narrowing',muzzle:'Muzzle tension',whiskers:'Whisker position',head_position:'Head position'};
  return <section className="card" aria-label="Experimental facial pain cues">
    <h3>Possible pain-related facial cues</h3>
    <p><strong>{estimate.total===null?'Cannot estimate from this photo':`Experimental facial-cue estimate: ${estimate.total}/10`}</strong></p>
    <p>{estimate.note}</p>
    {Object.entries(labels).map(([key,label])=><p key={key}><strong>{label}: {cues[key].score===null?'Not assessable':`${cues[key].score}/2`}</strong> — {cues[key].evidence}</p>)}
    <p>{result.next_step}</p>
    <p>Is your cat awake? Have appetite, movement or usual behaviour changed?</p>
    <a href="https://www.felinegrimacescale.com/practice-your-skills" target="_blank" rel="noreferrer">FGS reference and observation guidance</a>
  </section>;
}
