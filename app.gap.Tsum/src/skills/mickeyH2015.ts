// Horn Hat Mickey — bubbles, with the shortest intro of the bubble skills.

registerSkill({
  types: [SkillType.HornHatMickey],
  sweepsBubbles: true,
  afterActivate: function(ts) {
    ts.clearAllBubbles(1500, 50);
  }
});
