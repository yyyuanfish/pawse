"""Experimental facial-cue estimates; not a validated automated FGS assessment."""
from typing import Literal
from pydantic import Field
from .models import Model

class FacialCue(Model):
    score: Literal[0, 1, 2] | None
    evidence: str = Field(max_length=300)

class FacialCues(Model):
    context: Literal['awake_resting', 'sleeping_or_active', 'uncertain']
    score_overlay_present: bool
    ears: FacialCue
    eyes: FacialCue
    muzzle: FacialCue
    whiskers: FacialCue
    head_position: FacialCue

class FacialEstimate(Model):
    status: Literal['experimental', 'not_assessable']
    total: int | None = Field(default=None, ge=0, le=10)
    concern: Literal['contact_vet', 'unknown'] = 'unknown'
    note: str

CUE_NAMES = ('ears', 'eyes', 'muzzle', 'whiskers', 'head_position')
LIMITATION = 'Experimental AI facial-cue estimate, not a validated FGS pain score. A low estimate cannot rule out pain. Do not give painkillers without veterinary advice.'

def facial_estimate(cues, cat_detected, face_assessable, image_quality):
    observable = (cat_detected is True and face_assessable and image_quality == 'adequate'
                  and cues.context == 'awake_resting')
    eligible = observable and not cues.score_overlay_present
    scores = [getattr(cues, k).score for k in CUE_NAMES]
    if not eligible or any(s is None for s in scores):
        return FacialEstimate(status='not_assessable', concern='contact_vet' if observable and sum(s for s in scores if s is not None) >= 4 else 'unknown', note='No total: unclear features, activity/context or a score overlay prevents assessment. Observe awake and undisturbed, then take a clear face-and-shoulders photo. ' + LIMITATION)
    total = sum(scores)
    return FacialEstimate(status='experimental', total=total,
                          concern='contact_vet' if total >= 4 else 'unknown', note=LIMITATION)

FACIAL_PROMPT = '''Always include facial_cues. Independently inspect five facial action units using only the cat pixels, never captions, printed scores or remembered example-image labels. Report score_overlay_present=true for a screenshot containing any pain score. Context is awake_resting only if visibly awake and not eating, grooming or vocalising; sleeping, activity or uncertain context must not be scored. For each visible unit give a short visual evidence description and score 0 (cue absent), 1 (moderately present/uncertain degree), 2 (clearly present), or null (not assessable). Ear cue: outward flattening; eye cue: narrowing; muzzle cue: tension; whisker cue: straightening/forward positioning; head cue: lowering relative to shoulders. If a unit is hidden, blurry, ambiguous, or context unsuitable, use null, never guess 0. Head score requires visible shoulders. Do not interpret these as clinical pain severity or prescribe treatment. Do not copy a total from an image. Ask about appetite, movement, behaviour and whether the cat is awake. A still image cannot confirm a 30-second resting observation.'''
