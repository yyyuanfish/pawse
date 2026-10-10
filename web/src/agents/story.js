// The second half of the Mimi story, shared by both phone agents and the pages: the demo calendar,
// the two option cards (clinic vs home visit), the confirmation and taxi results, the claim checklist.
// Live mode reads the numbers from GET /api/v1/demo/mimi (pawse/demo.py costs()); the keyless mock
// uses the same formulas below, so the cards, the video script and the backend agree.
// Everything here is a simulated demo: nothing is booked, no insurer has approved anything.

import { INSURANCE_RULES, DEFAULT_ESTIMATE, HOME_VISIT_FEE, reimbursement } from './mockScripts.js';

const T = (en, zh) => ({ en, zh });
const num = (v, d) => (typeof v === 'number' && Number.isFinite(v) ? v : d);

export const TAXI_FARE = 25;
export const CLAIM_DAYS = 30; // AVB 2.2 in the demo policy
export const DEMO_CALENDAR = { source: 'synthetic', free_from: '16:00', appointment: '16:30', taxi: '16:05' };
export const CHOICES = ['clinic', 'home'];

/** Same formulas as costs() in pawse/demo.py: the taxi and the home-visit fee are never reimbursed. */
export function demoCosts({
  treatment = DEFAULT_ESTIMATE,
  taxi = TAXI_FARE,
  houseCall = HOME_VISIT_FEE,
  rules = INSURANCE_RULES,
  claimDays = CLAIM_DAYS,
} = {}) {
  const reimbursed = reimbursement(treatment, rules);
  return {
    currency: 'CHF',
    treatment,
    remaining_deductible: rules.deductible,
    reimbursement_rate: rules.rate,
    reimbursed,
    clinic: treatment - reimbursed + taxi,
    home: treatment - reimbursed + houseCall,
    taxi,
    home_visit_extra: houseCall,
    claim_days: claimDays,
  };
}

/** The keyless stand-in for GET /api/v1/demo/mimi (only the parts the beats need). */
export function mockStory() {
  return { id: 'mimi-zurich', synthetic: true, costs: demoCosts(), calendar: { ...DEMO_CALENDAR } };
}

/** Live: the backend story; falls back to the mock formulas if the backend is unreachable. */
export async function loadStory({ live, base = '' } = {}) {
  if (!live || typeof fetch !== 'function') return mockStory();
  try {
    const res = await fetch(`${base}/api/v1/demo/mimi`);
    if (!res.ok) throw new Error(String(res.status));
    return await res.json();
  } catch {
    return mockStory();
  }
}

/** Flat facts the pages use; any field the story lacks falls back to the mock formulas. */
export function storyFacts(story) {
  const m = demoCosts();
  const c = (story && story.costs) || {};
  const cal = (story && story.calendar) || {};
  const pick = (k) => num(c[k], m[k]);
  return {
    currency: c.currency || 'CHF',
    treatment: pick('treatment'),
    reimbursed: pick('reimbursed'),
    taxi: pick('taxi'),
    homeVisitExtra: pick('home_visit_extra'),
    clinic: pick('clinic'),
    home: pick('home'),
    claimDays: pick('claim_days'),
    freeFrom: cal.free_from || DEMO_CALENDAR.free_from,
    appointment: cal.appointment || DEMO_CALENDAR.appointment,
    taxiAt: cal.taxi || DEMO_CALENDAR.taxi,
  };
}

/** The two option cards shown after the insurer call: A clinic today, B home visit tonight. */
export function optionCards(facts) {
  return [
    {
      id: 'clinic',
      letter: 'A',
      time: facts.appointment,
      total: facts.treatment + facts.taxi,
      insurerPays: facts.reimbursed,
      youPay: facts.clinic,
      extra: facts.taxi,
    },
    {
      id: 'home',
      letter: 'B',
      time: null,
      total: facts.treatment + facts.homeVisitExtra,
      insurerPays: facts.reimbursed,
      youPay: facts.home,
      extra: facts.homeVisitExtra,
    },
  ];
}

/** A taxi only makes sense when the owner takes Mimi to the clinic. */
export const taxiOffered = (choice) => choice === 'clinic';

/** Result of the confirmation call. `simulated` always: no real call, nothing booked. */
export function buildConfirmResult({ facts, lang = 'en', choice = 'clinic', clinic } = {}) {
  const L = (o) => o[lang] ?? o.en;
  const f = facts || storyFacts(null);
  const name = clinic && clinic.name ? clinic.name : L(T('Vet practice', '兽医诊所'));
  const home = choice === 'home';
  return {
    kind: 'confirmation',
    choice: home ? 'home' : 'clinic',
    time: home ? L(T('Tonight, exact time still open', '今晚，具体时间待定')) : f.appointment,
    place: home ? `${L(T('Home visit', '上门'))} · ${name}` : name,
    currency: f.currency,
    youPay: home ? f.home : f.clinic,
    note: L(
      T(
        'Simulated reply. Itemised invoice requested; the vet asks you before any physio (not insured).',
        '模拟回复。已要求明细发票；理疗（不保）前兽医会先问你。'
      )
    ),
    simulated: true,
  };
}

/** Result of the taxi call (clinic option only). The taxi is never insured. */
export function buildTaxiResult({ facts, lang = 'en' } = {}) {
  const L = (o) => o[lang] ?? o.en;
  const f = facts || storyFacts(null);
  return {
    kind: 'ride',
    pickup: f.taxiAt,
    appointment: f.appointment,
    fare: f.taxi,
    currency: f.currency,
    carrierOk: true,
    insured: false,
    note: L(T("Simulated reply. The taxi isn't covered by insurance: transport is not an insured cost.", '模拟回复。出租车不在保险范围内：交通费不报销。')),
    simulated: true,
  };
}

/** Claim checklist. `ownPolicy` (live hand-off): the 30 days are the demo policy's, check your own. */
export function claimChecklist({ lang = 'en', claimDays = CLAIM_DAYS, ownPolicy = false } = {}) {
  const L = (o) => o[lang] ?? o.en;
  const items = [
    T('Keep the video you just filmed', '保留刚才的视频'),
    T('Ask the clinic for an itemised invoice', '找诊所要明细发票'),
    T('Keep the medical record and proof of payment', '保留病历和付款凭证'),
    ownPolicy
      ? T("Check the submission deadline in your actual policy with your insurer", "请向保险公司确认你实际保单的理赔期限")
      : T(`Submit the claim within ${claimDays} days`, `${claimDays} 天内提交理赔`),
  ];
  return items.map(L);
}
