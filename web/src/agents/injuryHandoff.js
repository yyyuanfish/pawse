export function hasVisibleInjury(result) {
  return result?.injury?.wound==='suspected' || result?.injury?.blood_like_material==='suspected';
}
export function injuryMessage(result, clinic, ownerFacts='') {
  return JSON.stringify({purpose:'Ask this veterinary practice whether they can examine my cat and how urgently to come in.',
    clinic:{name:clinic.name,address:clinic.address},owner_report:ownerFacts||'No additional owner report.',
    automated_photo_observations:result.injury,limitations:result.limitations,
    instruction:'These are uncertain visual observations, not a diagnosis. Do not claim active bleeding, a booking, availability or treatment. Ask the practice to assess urgency.'});
}
