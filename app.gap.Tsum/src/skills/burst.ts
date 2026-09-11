// Burst — the plain clearing skills.
//
// No aiming and no follow-up: the tap is the whole activation, which is what
// lets the play loop fire these blind between chains (see Tsum.link).

registerSkill({
  types: [SkillType.Burst],
  bareTapActivates: true,
  afterActivate: function(ts) {
    skillRandomizeAndWait(ts);
  }
});

// Same skill, on a board that leaves bubbles behind: sweep them after the clear.
//
// The generic form of what Marie, Moana, Horn Hat Mickey and Snow White do, and
// it sweeps the same full play area they do. It used to start at y=1000 -- the
// bottom third of an area running 632..1532 -- and pause 300ms a row, so it was
// both slower and narrower than every skill it stands in for.
//
// No startDelay, unlike those four: they know their own animation length, this
// one waits out the user's "Skill Waiting time" above instead.
registerSkill({
  types: [SkillType.BurstBubbles],
  bareTapActivates: true,
  sweepsBubbles: true,
  afterActivate: function(ts) {
    skillRandomizeAndWait(ts);
    ts.clearAllBubbles(0, 50);
  }
});
