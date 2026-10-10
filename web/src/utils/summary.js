// Plain-text case summary (copy-paste ready), built from whatever has happened so far.

const LABELS = {
  zh: {
    plan: '安排',
    estimate: '预估费用',
    insurance: '保险',
    back: '预计报销',
    pay: '预计自付',
    notCovered: '不保',
    prepared: '已准备德语沟通稿，尚未拨打电话',
    vet: '兽医',
  },
  en: {
    plan: 'Plan',
    estimate: 'Estimate',
    insurance: 'Insurance',
    back: 'expected back',
    pay: 'you pay about',
    notCovered: 'not covered',
    prepared: 'German script prepared, no call placed',
    vet: 'Vet',
  },
};

export function buildSummary({ lang = 'zh', triage, vet, insurance }) {
  const L = LABELS[lang] || LABELS.en;
  const lines = [];
  if (triage && triage.summary) lines.push(triage.summary);
  if (vet && vet.prepared) lines.push(`${L.vet}: ${L.prepared}`);
  else if (vet) {
    lines.push(`${L.plan}: ${vet.time} · ${vet.place}`);
    lines.push(`${L.estimate}: ≈ ${vet.currency || 'CHF'} ${vet.estimate}`);
  }
  if (insurance && insurance.prepared) lines.push(`${L.insurance}: ${L.prepared}`);
  else if (insurance) {
    const cur = insurance.currency || 'CHF';
    lines.push(
      `${L.insurance}: ${L.back} ≈ ${cur} ${insurance.reimbursed} · ${L.pay} ≈ ${cur} ${insurance.outOfPocket}`
    );
    const no = (insurance.points || []).filter((p) => !p.ok);
    if (no.length) {
      lines.push(`${L.notCovered}: ${no.map((p) => (p.ref ? `${p.text} (${p.ref})` : p.text)).join('; ')}`);
    }
  }
  return lines.join('\n');
}
