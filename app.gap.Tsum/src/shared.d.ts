// The contract between the settings UI and the game script.
//
// These are two separate JavaScript worlds that never share memory: the UI
// serialises a settings object into a `start({...})` source string and hands it
// to `JavaScriptInterface.runScript`. Nothing at runtime checks that the object
// the UI builds is the object `start()` expects -- a renamed key is a silently
// ignored setting, not an error.
//
// This file is the one thing both compilations include (tsconfig.json and
// tsconfig.settings.json), so the two sides are checked against the same type.
// Emits nothing.

/**
 * Every playable skill, as the game's own internal ids.
 *
 * This one string travels the whole width of the project: the settings UI
 * offers it in the Skill Type dropdown, it crosses the `start({...})` bridge,
 * the skill files register handlers under it, and the play loop compares
 * against it. Nothing at runtime ties those four together -- a mismatch means
 * `SkillHandlers[skillType]` misses and the skill quietly falls back to
 * "randomize and wait", which plays but never performs the choreography.
 *
 * Declaring the set here makes all four checked against one list. The comment
 * on each is the label the dropdown shows.
 */
// A `const enum` so the ids are written once and referred to by name. It is
// erased at compile time and every use inlines to the string on the right, which
// is also what lets one vocabulary span both compilations: the settings WebView
// and the device script are separate JavaScript runtimes that share no memory,
// so a runtime constant object here would have to be duplicated into each. A
// compile-time-only one does not exist at runtime at all.
//
// The member name is the label the dropdown shows; the value is the game's id.
declare const enum SkillType {
  Burst = 'burst',
  BurstBubbles = 'burst_bubbles',
  Donald = 'donald',
  HolidayDonald = 'donaldx',
  JediLuke = 'lukej',
  Moana = 'moana',
  Marie = 'marie',
  MissBunny = 'missbunny',
  Rabbit = 'rabbit',
  HornHatMickey = 'mickeyh2015',
  SnowWhite = 'snowwhite',
  Cinderella = 'cinderella',
  SheriffWoody = 'woody2',
  CabbageMickey = 'cabbage_mickey',
  CptLightyear = 'buzzl',
  /**
   * The same skill played at 120fps. A separate id rather than a scaling of the
   * one above so the two choreographies are tuned independently -- and so the
   * round stats keep a file per frame rate, since the two do not average.
   */
  CptLightyear120 = 'buzzl_120',
  LightningMcQueenPlus = 'mcqueenplus',
  /**
   * Formal Suit Beast. Plays as a burst skill, but his activation opens a mode
   * with a gauge of its own that the play loop has to be steered by while it
   * runs -- see `src/skills/formalBeast.ts`.
   */
  FormalBeast = 'beastda',
  TiaraMinniePlus = 'minnie12thplus',
  /**
   * Coronation Day Elsa. Her activation opens a timed freeze window rather than
   * a burst: chains linked while it is open freeze lines of tsums, and one tap
   * on a frozen tsum spends the lot -- see `src/skills/coronationElsa.ts`.
   */
  CoronationElsa = 'elsa_coronation',
  /**
   * Rapunzel+. Her activation makes the board colour-blind for a moment: one
   * chain may take tsums of any colour, up to a length her skill level sets --
   * see `src/skills/rapunzelPlus.ts`.
   */
  RapunzelPlus = 'rapunzelplus',
  /**
   * Gaston. His activation makes every tsum that *drops* a Gaston for a window
   * his skill level sets, so the choreography plays it: chain every Gaston,
   * cancel the pop animation with a bubble so the next batch drops at once, and
   * again -- see `src/skills/gaston.ts`.
   */
  Gaston = 'gaston',
  /**
   * Lorcana Aurora. A Lorcana tsum, so she plays as two skills either side of a
   * transformation: bubbles before it, and after it a chain drawn through every
   * bubble on the board whatever the distance -- see
   * `src/skills/lorcanaAurora.ts`. The transformation itself is not hers: it is
   * the "Lorcana Card" setting, which every Lorcana tsum shares
   * (`src/lorcana.ts`).
   */
  LorcanaAurora = 'auroraink',
  PairTsum = 'pair_tsum',
  /** Offered in the dropdown; short-circuited in useSkill, so it has no handler. */
  NoSkill = 'nokill',
  /** Not offered: what the Tsum constructor holds until start() reads the setting. */
  Unset = '',
}

/**
 * What the play loop is allowed to do with the bubbles on the board.
 *
 * Bubbles are worth far more popped *inside* a chain than popped on their own:
 * with Tiara Minnie+ a bubble that goes off while a chain is clearing takes a
 * bigger area with it. So the default is to hoard them for chains, and every
 * option here says how much of that hoarding to give up.
 *
 * This governs only the play loop's own bubble taps. A skill choreography that
 * calls `clearAllBubbles` is asking outright and is never gated on this -- see
 * `SkillHandler.sweepsBubbles` in `src/skills/skillCore.ts`, which is how a
 * skill declares that it does.
 *
 * A `const enum` for the same reason `SkillType` is one: the value crosses the
 * `start({...})` bridge between two runtimes that share no memory, so it has to
 * be written once and inlined on both sides.
 */
declare const enum BubbleStrategy {
  /**
   * One bubble per chain, and nothing else. The stingiest option: bubbles are
   * only ever spent on a chain, one at a time, so the rest stay on the board
   * for the chains after it.
   */
  OneMidChain = 'one_mid_chain',
  /** Every bubble the last scan found, popped as a chain lands. */
  AllMidChain = 'all_mid_chain',
  /**
   * Every bubble, popped as soon as it is seen -- no waiting for a chain -- plus
   * the periodic blind sweep, which is what the old "Clear Bubbles" switch did
   * on its own. For boards where a bubble left sitting is in the way.
   */
  AllAsap = 'all_asap',
}

/**
 * What the play loop does when a round outlives "Max Round Duration".
 *
 * The cap answers a round that will not end -- a skill choreography stuck on a
 * board it cannot clear, a screen the router never recognised. Both options
 * stop *playing* it and leave the game's own clock to run the round out; what
 * they decide is what becomes of the script.
 *
 * Nothing here touches the game's Pause button. Pausing the game stops its
 * round timer, and a round that cannot time out is the one thing neither option
 * may cause.
 *
 * A `const enum` for the same reason `BubbleStrategy` is one: the value crosses
 * the `start({...})` bridge between two runtimes that share no memory.
 */
declare const enum MaxRoundAction {
  /**
   * Stop playing and let the game's own clock end the round, then carry on as
   * normal -- tally, stats, next round. The default, and the option that keeps
   * the run going.
   */
  Coast = 'coast',
  /**
   * End the run where it stands, the way the Stop button does. The round is
   * abandoned rather than seen out, which is what makes this the answer when
   * nobody is watching.
   */
  Stop = 'stop',
}

/**
 * The boxes the Tsum Tsum Store sells, as the Box Buying chore names them.
 *
 * The store draws its boxes as a row of tabs, and the row is three or four wide
 * depending on whether a limited-time box is running -- so a box is found by its
 * place in that row rather than by a fixed coordinate (`BoxStore`, src/data.ts).
 * `Select` is the limited-time slot, and it is the one that is only sometimes
 * there.
 *
 * A `const enum` for the reason `SkillType` is one: the value crosses the
 * `start({...})` bridge between two runtimes that share no memory, so it is
 * written once and inlined on both sides.
 */
declare const enum BoxType {
  PremiumPlus = 'premium_plus',
  Premium = 'premium',
  /** The limited-time box: present only while one is running. */
  Select = 'select',
  Happiness = 'happiness',
}

/** The keys of record.txt that are not sender-portrait filenames. */
declare const enum RecordKey {
  HeartsCount = 'hearts_count',
}

/**
 * Every language the project speaks, as BCP-47 tags.
 *
 * One member per registered catalogue -- `src/uiEn.ts` and `src/logsEn.ts` for
 * `English`, `src/uiZhTw.ts` and `src/logsZhTw.ts` for `Taiwan`. Adding a
 * language starts with a member here.
 *
 * Here rather than in `src/settings.d.ts` because all three compilations need
 * it: the pages store the chosen tag under `StorageKey.Language`, and the same
 * tag crosses the `start({...})` bridge as `Settings.locale` so the game script
 * writes its log sentences in the language the user picked. A `const enum` for
 * the reason `SkillType` is one -- erased and inlined, so one vocabulary spans
 * runtimes that share no memory.
 *
 * The first registered catalogue is the fallback, and English is loaded first.
 * Nothing compares against a *particular* tag any more: a tag no catalogue
 * claims simply reads as the fallback.
 */
declare const enum Locale {
  English = 'en-US',
  Taiwan = 'zh-TW',
}

/**
 * The name of every setting, written once.
 *
 * A setting name is the widest string in the project: the settings page names a
 * row with it, the share code list names a slot with it, the run-order card
 * looks a value up by it, the round-stats CSV uses it as a column heading, and
 * `start()` reads it back out of the object that crossed the bridge. Spelt out
 * at each of those it was five chances to typo one silently -- the settings page
 * would have written a key `start()` never reads, and the setting would simply
 * do nothing.
 *
 * `Settings` below is declared *from* these members, so this enum and the shape
 * `start()` receives cannot drift apart: there is one list, and `keyof Settings`
 * is it. Everything that names a setting takes `SettingKey`, so a name that is
 * not on the list does not compile.
 *
 * A `const enum` for the reason `SkillType` is one -- it is erased and inlined,
 * so it costs nothing at runtime and can span both compilations.
 */
declare const enum SettingKey {
  DebugLogs = 'debugLogs',
  DebugGame = 'debugGame',
  CollectUnknownScreens = 'collectUnknownScreens',
  Walkthrough = 'walkthrough',
  JpVersion = 'jpVersion',
  SpecialScreenRatio = 'specialScreenRatio',
  DeviceFps = 'deviceFps',
  PageHistoryDepth = 'pageHistoryDepth',
  Locale = 'locale',
  AutoLaunchApp = 'autoLaunchApp',
  AutoPlayGame = 'autoPlayGame',
  TrackRoundStats = 'trackRoundStats',
  ClickAssist = 'clickAssist',
  RoundDelayMinutes = 'roundDelayMinutes',
  MaxRoundMinutes = 'maxRoundMinutes',
  MaxRoundAction = 'maxRoundAction',
  BubbleStrategy = 'bubbleStrategy',
  UseFan = 'useFan',
  MaxChainsPerScan = 'maxChainsPerScan',
  MaxChain = 'maxChain',
  LinkReachPercent = 'linkReachPercent',
  PrioritizeMyTsum = 'prioritizeMyTsum',
  BonusScore = 'bonusScore',
  BonusCoin = 'bonusCoin',
  BonusExp = 'bonusExp',
  BonusTime = 'bonusTime',
  BonusBubble = 'bonusBubble',
  Bonus5to4 = 'bonus5to4',
  BonusCombo = 'bonusCombo',
  SkillWaitingTime = 'skillWaitingTime',
  SkillLevel = 'skillLevel',
  SkillType = 'skillType',
  SkillAutoTap = 'skillAutoTap',
  LorcanaCard = 'lorcanaCard',
  NoSkillLastFeverSec = 'noSkillLastFeverSec',
  UnlockLevelHoursWait = 'unlockLevelHoursWait',
  UnlockLevelsFirst = 'unlockLevelsFirst',
  BuyBoxHoursWait = 'buyBoxHoursWait',
  BuyBoxType = 'buyBoxType',
  BuyBoxTenTimes = 'buyBoxTenTimes',
  BuyBoxMaxPurchases = 'buyBoxMaxPurchases',
  BuyBoxesFirst = 'buyBoxesFirst',
  ReceiveAllHearts = 'receiveAllHearts',
  ReceiveAllHeartsMinWait = 'receiveAllHeartsMinWait',
  ReceiveHeartsOneByOne = 'receiveHeartsOneByOne',
  ReceiveHeartsSkipFirst = 'receiveHeartsSkipFirst',
  ReceiveHeartsSkipRuby = 'receiveHeartsSkipRuby',
  ReceiveHeartsSkipMedals = 'receiveHeartsSkipMedals',
  ClaimAllWithoutCoins = 'claimAllWithoutCoins',
  MailOpenMax = 'mailOpenMax',
  MailMinWait = 'mailMinWait',
  SendHeartsAuto = 'sendHeartsAuto',
  SendHeartsToZeroScore = 'sendHeartsToZeroScore',
  SendHeartsMaxRuntime = 'sendHeartsMaxRuntime',
  SendHeartsMinWait = 'sendHeartsMinWait',
  TsumAppRestartFrequency = 'tsumAppRestartFrequency',
}

/**
 * The configuration `start()` receives. The keys are exactly the `key:` entries
 * of the schema array in settings.ts, plus two that no control holds: `locale`,
 * stamped on by startSettings() from the stored language, and
 * `unlockLevelsFirst`, stamped on by unlockLevelsNow() when the Now button
 * starts a run.
 *
 * Keyed by `SettingKey` rather than by literals, which is what makes that enum
 * and this interface one list rather than two that have to be kept in step.
 * Reading a field is unaffected -- `settings.maxChain` is still the way.
 */
interface Settings {
  [SettingKey.DebugLogs]: boolean;
  [SettingKey.DebugGame]: boolean;
  /** Save unrecognised screens to tsum_record/corpus for offline work. */
  [SettingKey.CollectUnknownScreens]: boolean;
  /**
   * Record a hand-driven walk instead of playing: every screen, every tap, and
   * what followed. Exclusive -- no other task is registered while it is on.
   */
  [SettingKey.Walkthrough]: boolean;
  [SettingKey.JpVersion]: boolean;
  [SettingKey.SpecialScreenRatio]: boolean;
  /**
   * The device's frame rate. Scales the transient windows in `PageProfiles`,
   * which are quoted at `PageBaselineFps` because the game counts them in
   * frames rather than seconds.
   */
  [SettingKey.DeviceFps]: number;
  /** How many page visits `gPages` keeps, and how many frames it writes in debug. */
  [SettingKey.PageHistoryDepth]: number;
  /**
   * The language the run writes its log sentences in. Not a schema entry --
   * genStartCommand() derives it from localStorage.
   *
   * Optional because a `start()` command can arrive without one: a settings page
   * older than this field, or a hand-written command. `logStringsFor` reads an
   * absent tag as English.
   */
  [SettingKey.Locale]?: Locale;
  [SettingKey.AutoLaunchApp]: boolean;
  [SettingKey.AutoPlayGame]: boolean;
  [SettingKey.TrackRoundStats]: boolean;
  [SettingKey.ClickAssist]: boolean;
  /**
   * Minutes to wait after a round before starting the next one; 0 plays
   * straight on. Only the auto-play loop waits -- Click Assist is hand-driven,
   * and the heart and mailbox chores keep their own clocks and run during it.
   */
  [SettingKey.RoundDelayMinutes]: number;
  /**
   * Minutes a round may last before the play loop gives up on it; 0 plays every
   * round to its own end. Measured from the board coming up, not from the walk
   * in, and `maxRoundAction` is what happens when it runs out.
   */
  [SettingKey.MaxRoundMinutes]: number;
  /** What to do when `maxRoundMinutes` runs out. Ignored while that is 0. */
  [SettingKey.MaxRoundAction]: MaxRoundAction;
  [SettingKey.BubbleStrategy]: BubbleStrategy;
  [SettingKey.UseFan]: boolean;
  [SettingKey.MaxChainsPerScan]: number;
  [SettingKey.MaxChain]: number;
  /** Link reach as a percentage of one tsum width; see `TsumConfig.linkReach`. */
  [SettingKey.LinkReachPercent]: number;
  [SettingKey.PrioritizeMyTsum]: boolean;
  [SettingKey.BonusScore]: boolean;
  [SettingKey.BonusCoin]: boolean;
  [SettingKey.BonusExp]: boolean;
  [SettingKey.BonusTime]: boolean;
  [SettingKey.BonusBubble]: boolean;
  [SettingKey.Bonus5to4]: boolean;
  [SettingKey.BonusCombo]: boolean;
  [SettingKey.SkillWaitingTime]: number;
  [SettingKey.SkillLevel]: number;
  [SettingKey.SkillType]: SkillType;
  [SettingKey.SkillAutoTap]: boolean;
  /**
   * Play a Lorcana tsum's transformation: tap the card the game offers once the
   * ring round the skill button fills, and clear the ink stones its skill leaves
   * behind. Independent of Skill Type, because every Lorcana tsum works this way
   * whatever its own skill is -- see `src/lorcana.ts`.
   */
  [SettingKey.LorcanaCard]: boolean;
  [SettingKey.NoSkillLastFeverSec]: number;
  [SettingKey.UnlockLevelHoursWait]: number;
  /**
   * Run the level-cap sweep before anything else in the run. Not a schema
   * entry: `unlockLevelsNow()` sets it on the page's settings when the Now
   * button starts a run, and `buildRun` queues the sweep off it.
   */
  [SettingKey.UnlockLevelsFirst]?: boolean;
  /** Hours between Box Buying sweeps; 0 turns the chore off. */
  [SettingKey.BuyBoxHoursWait]: number;
  /** Which box the sweep buys. Only ever this one -- it never falls back to another. */
  [SettingKey.BuyBoxType]: BoxType;
  /**
   * Buy ten at a time where the box offers it. A box drawn with only a 1-Time
   * button -- Happiness always is -- is bought singly instead; the reverse never
   * happens, so a 1-Time setting can never spend ten boxes' worth.
   */
  [SettingKey.BuyBoxTenTimes]: boolean;
  /**
   * Purchases one sweep may make, where a 10-Time purchase counts as one. The
   * runaway guard on a chore that spends the player's coins: the game running
   * out of stock or coins is what normally ends a sweep, and neither is
   * something this script gets to rely on.
   */
  [SettingKey.BuyBoxMaxPurchases]: number;
  /**
   * Run the Box Buying sweep before anything else in the run. Not a schema
   * entry: `buyBoxesNow()` sets it on the page's settings when the Now button
   * starts a run, and `buildRun` queues the sweep off it.
   */
  [SettingKey.BuyBoxesFirst]?: boolean;
  [SettingKey.ReceiveAllHearts]: boolean;
  [SettingKey.ReceiveAllHeartsMinWait]: number;
  [SettingKey.ReceiveHeartsOneByOne]: boolean;
  [SettingKey.ReceiveHeartsSkipFirst]: boolean;
  [SettingKey.ReceiveHeartsSkipRuby]: boolean;
  /**
   * Leave the Mission Clear medal mails where they are and take the first mail
   * below them instead, so a one-by-one pass collects hearts and not medals.
   * A screenful of nothing but medals is scrolled past rather than given up on.
   */
  [SettingKey.ReceiveHeartsSkipMedals]: boolean;
  [SettingKey.ClaimAllWithoutCoins]: boolean;
  [SettingKey.MailOpenMax]: number;
  [SettingKey.MailMinWait]: number;
  [SettingKey.SendHeartsAuto]: boolean;
  [SettingKey.SendHeartsToZeroScore]: boolean;
  [SettingKey.SendHeartsMaxRuntime]: number;
  [SettingKey.SendHeartsMinWait]: number;
  [SettingKey.TsumAppRestartFrequency]: number;
}
