import pytest
from pawse.facial_cues import FacialCues, facial_estimate, CUE_NAMES

def cues(scores=(1,1,1,1,1), **kwargs):
    return FacialCues(context=kwargs.pop('context','awake_resting'), score_overlay_present=kwargs.pop('score_overlay_present',False), **{k:{'score':v,'evidence':'Visible feature'} for k,v in zip(CUE_NAMES,scores)}, **kwargs)

@pytest.mark.parametrize('scores,total,concern', [((0,0,0,0,0),0,'unknown'),((1,1,1,1,0),4,'contact_vet'),((2,2,2,2,2),10,'contact_vet')])
def test_server_total_and_no_all_clear(scores,total,concern):
    result=facial_estimate(cues(scores),True,True,'adequate')
    assert result.total==total and result.concern==concern
    assert 'cannot rule out pain' in result.note

@pytest.mark.parametrize('condition', ['hidden','sleeping','uncertain','overlay','noncat','face','limited'])
def test_abstains_instead_of_guessing(condition):
    c=cues()
    cat,face,quality=True,True,'adequate'
    if condition=='hidden':c.whiskers.score=None
    if condition=='sleeping':c.context='sleeping_or_active'
    if condition=='uncertain':c.context='uncertain'
    if condition=='overlay':c.score_overlay_present=True
    if condition=='noncat':cat=False
    if condition=='face':face=False
    if condition=='limited':quality='limited'
    result=facial_estimate(c,cat,face,quality)
    assert result.total is None and result.status=='not_assessable'

def test_rejects_out_of_range_model_score():
    with pytest.raises(ValueError):cues((10,0,0,0,0))


def test_missing_total_does_not_hide_concerning_visible_cues():
    for c in [cues((2,2,None,None,None)), cues(score_overlay_present=True)]:
        result=facial_estimate(c,True,True,'adequate')
        assert result.total is None and result.concern=='contact_vet'
