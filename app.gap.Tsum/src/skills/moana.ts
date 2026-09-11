// Moana — bubbles again, behind a slightly longer intro than Marie's.

registerSkill({
  types: [SkillType.Moana],
  sweepsBubbles: true,
  afterActivate: function(ts) {
    ts.clearAllBubbles(2500, 50);
  }
});
