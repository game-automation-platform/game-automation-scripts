// The log event vocabulary: every `event` name this project writes, once.
//
// `event` is the field you filter a run on -- stable, dotted and language
// independent -- so it is an interface, and this is where it is declared. The
// sentence a user reads is `src/logs.ts`, keyed by these same constants; the
// record shape is `src/logging.ts`; `LOGGING.md` is the schema.
//
// A `const enum` per component, inside a namespace that is itself erased: the
// emitted bundle contains the bare string and nothing else, exactly as
// `PageName` does. What it buys is one definition per event to jump to, find
// references on and rename, and a name that completes as you type it.
//
// Names mirror the key: `Log.Skill.TiaraNoDream` is `skill.tiara.noDream`. The
// third segment folds into the member name because a const enum cannot nest.
//
// Not every event has a catalogue entry -- a debug line's name is its whole
// description. Adding one: a member here first, then `src/logs.ts` if it is
// user-visible. Order and grouping follow `LOGGING.md` § Components.
namespace Log {
  /** One start()..stop(). */
  export const enum Run {
    BundleIncomplete = 'run.bundleIncomplete',
    Start            = 'run.start',
    StartBusy        = 'run.startBusy',
    Stop             = 'run.stop',
    StopSlow         = 'run.stopSlow',
  }

  /** The scheduler. */
  export const enum Task {
    LoopStart             = 'task.loopStart',
    LoopStop              = 'task.loopStop',
    LoopStopped           = 'task.loopStopped',
    LoopStopping          = 'task.loopStopping',
    NotAFunction          = 'task.notAFunction',
    Threw                 = 'task.threw',
    WatchdogRestart       = 'task.watchdogRestart',
    WatchdogRestartFailed = 'task.watchdogRestartFailed',
  }

  /** The game app process. */
  export const enum App {
    Off              = 'app.off',
    OffTimeout       = 'app.offTimeout',
    Restarted        = 'app.restarted',
    Restarting       = 'app.restarting',
    RestartPreparing = 'app.restartPreparing',
    RestartSkipped   = 'app.restartSkipped',
    Start            = 'app.start',
    Started          = 'app.started',
    Up               = 'app.up',
    UpTimeout        = 'app.upTimeout',
  }

  /** Screen geometry, once per run, and waiting for the screen or the board to stop moving. */
  export const enum Screen {
    BoardSettled  = 'screen.boardSettled',
    CalculateSize = 'screen.calculateSize',
    Detect        = 'screen.detect',
    DetectOffset  = 'screen.detectOffset',
    Offset        = 'screen.offset',
    Settled       = 'screen.settled',
    TallGeometry  = 'screen.tallGeometry',
  }

  /** The router: what was matched, and navigation. */
  export const enum Page {
    AccountLevelUpClosing = 'page.accountLevelUp.closing',
    Current               = 'page.current',
    DispatchReentered     = 'page.dispatchReentered',
    DispatchStopped       = 'page.dispatchStopped',
    EventCardRevealClosing = 'page.eventCardReveal.closing',
    EventGiftClosing      = 'page.eventGift.closing',
    EventMainClosing      = 'page.eventMain.closing',
    Friends               = 'page.friends',
    GameResuming          = 'page.gamePause.resuming',
    HeldOff               = 'page.heldOff',
    HighScoreClosing      = 'page.highScore.closing',
    HistoryFrameFailed    = 'page.historyFrameFailed',
    Matched               = 'page.matched',
    Probed                = 'page.probed',
    Rejected              = 'page.rejected',
    SubscriptionCycle     = 'page.subscriptionCycle',
    SubscriptionThrew     = 'page.subscriptionThrew',
    Trail                 = 'page.trail',
    Tsums                 = 'page.tsums',
    Unmatched             = 'page.unmatched',
    WaitOut               = 'page.waitOut',
  }

  /** Multi-step navigation plans. */
  export const enum Nav {
    NoPlan  = 'nav.noPlan',
    NoRoute = 'nav.noRoute',
  }

  /** What the script is about to do next, at all three layers (forecast.ts). */
  export const enum Forecast {
    State = 'forecast.state',
  }

  /** Reading the board and planning chains. */
  export const enum Board {
    Clusters         = 'board.clusters',
    DeadScan         = 'board.deadScan',
    LinkReach        = 'board.linkReach',
    MyTsumColor      = 'board.myTsumColor',
    PathDone         = 'board.pathDone',
    PathStart        = 'board.pathStart',
    RecognitionStart = 'board.recognitionStart',
    RecognitionTime  = 'board.recognitionTime',
    Recognized       = 'board.recognized',
    Stalled          = 'board.stalled',
  }

  /** Bubbles on the board. */
  export const enum Bubble {
    Cleared   = 'bubble.cleared',
    Found     = 'bubble.found',
    Generated = 'bubble.generated',
    Popped    = 'bubble.popped',
  }

  /** A round, start to finish. */
  export const enum Play {
    BoardUp               = 'play.boardUp',
    BoardUpTimeout        = 'play.boardUpTimeout',
    BonusItemsToggled     = 'play.bonusItemsToggled',
    CheckBonusItems       = 'play.checkBonusItems',
    ConfirmingGameOver    = 'play.confirmingGameOver',
    GameOver              = 'play.gameOver',
    GameOverAssumed       = 'play.gameOverAssumed',
    GameOverConfirmed     = 'play.gameOverConfirmed',
    GameStart             = 'play.gameStart',
    GamingFast            = 'play.gamingFast',
    HudBack               = 'play.hudBack',
    MagicalTimeCancelled  = 'play.magicalTimeCancelled',
    RoundDelayOver        = 'play.roundDelayOver',
    RoundDelaySkipped     = 'play.roundDelaySkipped',
    RoundDelayStarted     = 'play.roundDelayStarted',
    RoundDelayWaiting     = 'play.roundDelayWaiting',
    RoundCoastGaveUp      = 'play.roundCoastGaveUp',
    RoundTimeUp           = 'play.roundTimeUp',
  }

  /** Which tsum is selected, off the pre-round icon. */
  export const enum Tsums {
    Identified     = 'tsums.identified',
    LibraryLoaded  = 'tsums.libraryLoaded',
    NoBoardColors  = 'tsums.noBoardColors',
    NoLibrary      = 'tsums.noLibrary',
    ReadFailed     = 'tsums.readFailed',
    StaleTemplate  = 'tsums.staleTemplate',
    Unidentified   = 'tsums.unidentified',
    Unreadable     = 'tsums.unreadable',
  }

  /** The skill core, then one group per skill that has anything to say. */
  export const enum Skill {
    CabbageMickeyFound    = 'skill.cabbageMickey.found',
    CabbageMickeyNotFound = 'skill.cabbageMickey.notFound',
    CinderellaStroke      = 'skill.cinderella.stroke',
    CptLyEnteredLate      = 'skill.cptLy.enteredLate',
    ElsaBurst             = 'skill.elsa.burst',
    ElsaDone              = 'skill.elsa.done',
    ElsaIceAlike          = 'skill.elsa.iceAlike',
    ElsaPass              = 'skill.elsa.pass',
    FeverHoldOff          = 'skill.feverHoldOff',
    FormalBeastModeEnd    = 'skill.formalBeast.modeEnd',
    FormalBeastModeStart  = 'skill.formalBeast.modeStart',
    FormalBeastSteer      = 'skill.formalBeast.steer',
    GastonDone            = 'skill.gaston.done',
    GastonPass            = 'skill.gaston.pass',
    LorcanaAuroraDone     = 'skill.lorcanaAurora.done',
    LorcanaAuroraNoChain  = 'skill.lorcanaAurora.noChain',
    LorcanaAuroraStayed   = 'skill.lorcanaAurora.stayed',
    LorcanaAuroraSwept    = 'skill.lorcanaAurora.swept',
    MyTsumPriorityHold    = 'skill.myTsumPriority.hold',
    OverloadProbe         = 'skill.overloadProbe',
    RapunzelDone          = 'skill.rapunzel.done',
    ReadyAgain            = 'skill.readyAgain',
    TiaraBubbleRead       = 'skill.tiara.bubbleRead',
    TiaraBusy             = 'skill.tiara.busy',
    TiaraDimDream         = 'skill.tiara.dimDream',
    TiaraDream            = 'skill.tiara.dream',
    TiaraNoDream          = 'skill.tiara.noDream',
    TiaraPicked           = 'skill.tiara.picked',
    TiaraSettled          = 'skill.tiara.settled',
    TiaraUnsure           = 'skill.tiara.unsure',
    TiaraWaiting          = 'skill.tiara.waiting',
    Use                   = 'skill.use',
  }

  /** Fever time -- a mode of the board, not a page. */
  export const enum Fever {
    End               = 'fever.end',
    Start             = 'fever.start',
    SubscriptionThrew = 'fever.subscriptionThrew',
  }

  /** The Lorcana transformation -- a mode of the board, not a page. */
  export const enum Lorcana {
    StonePopped   = 'lorcana.stonePopped',
    Transformed   = 'lorcana.transformed',
    Untransformed = 'lorcana.untransformed',
  }

  /** Sending and receiving hearts. */
  export const enum Hearts {
    GoToSelfDone        = 'hearts.goToSelf.done',
    GoToSelfStart       = 'hearts.goToSelf.start',
    ListEnd             = 'hearts.listEnd',
    NoToast             = 'hearts.noToast',
    ReadRecords         = 'hearts.readRecords',
    SaveRecords         = 'hearts.saveRecords',
    Screenful           = 'hearts.screenful',
    Scrolled            = 'hearts.scrolled',
    SendAttempt         = 'hearts.sendAttempt',
    SendDone            = 'hearts.sendDone',
    SendStart           = 'hearts.sendStart',
    SendStep            = 'hearts.sendStep',
    SendTaskUnfinished  = 'hearts.sendTask.unfinished',
    SweepTooLong        = 'hearts.sweepTooLong',
    TimeUp              = 'hearts.timeUp',
    ZeroScore           = 'hearts.zeroScore',
  }

  /** The gift box. */
  export const enum Gifts {
    AdIgnored                 = 'gifts.adIgnored',
    AllReceived               = 'gifts.allReceived',
    CheckUnreceived           = 'gifts.checkUnreceived',
    Completed                 = 'gifts.completed',
    MailScrolled              = 'gifts.mailScrolled',
    NoOkButton                = 'gifts.noOkButton',
    ReceiveAgain              = 'gifts.receiveAgain',
    ReceiveAll                = 'gifts.receiveAll',
    ReceiveOneByOne           = 'gifts.receiveOneByOne',
    ReceiveOneClosing         = 'gifts.receiveOne.closing',
    ReceiveOneFetchedAllSoFar = 'gifts.receiveOne.fetchedAllSoFar',
    ReceiveOneHandleAd        = 'gifts.receiveOne.handleAd',
    ReceiveOneIdle            = 'gifts.receiveOne.idle',
    ReceiveOneMedalsOnly      = 'gifts.receiveOne.medalsOnly',
    ReceiveOneOk              = 'gifts.receiveOne.ok',
    ReceiveOneProbe           = 'gifts.receiveOne.probe',
    ReceiveOneReceiveAll      = 'gifts.receiveOne.receiveAll',
    ReceiveOneSkipMedal       = 'gifts.receiveOne.skipMedal',
    ReceiveOneStuck           = 'gifts.receiveOne.stuck',
    ReceiveOneStuckRetry      = 'gifts.receiveOne.stuckRetry',
    ReceiveOneTimeout         = 'gifts.receiveOne.timeout',
    ReceiveOneWaiting         = 'gifts.receiveOne.waiting',
    TicketReceived            = 'gifts.ticketReceived',
  }

  /** Raising tsum level caps -- the collection sweep. */
  export const enum Unlock {
    CardsRead         = 'unlock.cardsRead',
    DialogMissing     = 'unlock.dialogMissing',
    End               = 'unlock.end',
    NextPage          = 'unlock.nextPage',
    NowQueued         = 'unlock.nowQueued',
    NowRefused        = 'unlock.nowRefused',
    NowWaiting        = 'unlock.nowWaiting',
    NowYielded        = 'unlock.nowYielded',
    PageMissed        = 'unlock.pageMissed',
    PagesExhausted    = 'unlock.pagesExhausted',
    Raised            = 'unlock.raised',
    RaiseLimit        = 'unlock.raiseLimit',
    RaiseNotConfirmed = 'unlock.raiseNotConfirmed',
    RaiseNotOffered   = 'unlock.raiseNotOffered',
    Raising           = 'unlock.raising',
    Retrying          = 'unlock.retrying',
    RewindFailed      = 'unlock.rewindFailed',
    Rewinding         = 'unlock.rewinding',
    Rewound           = 'unlock.rewound',
    SortFailed        = 'unlock.sortFailed',
    SortNotTaken      = 'unlock.sortNotTaken',
    SortRead          = 'unlock.sortRead',
    SortRestored      = 'unlock.sortRestored',
    SortUnread        = 'unlock.sortUnread',
    Sorted            = 'unlock.sorted',
    Start             = 'unlock.start',
    ToastStuck        = 'unlock.toastStuck',
  }

  /** Buying boxes in the Tsum Tsum Store -- the Box Buying chore. */
  export const enum Box {
    Bought           = 'box.bought',
    ButtonsRead      = 'box.buttonsRead',
    Buying           = 'box.buying',
    DialogMissing    = 'box.dialogMissing',
    End              = 'box.end',
    NoCoins          = 'box.noCoins',
    NotOffered       = 'box.notOffered',
    NowQueued        = 'box.nowQueued',
    NowRefused       = 'box.nowRefused',
    NowWaiting       = 'box.nowWaiting',
    PageMissed       = 'box.pageMissed',
    PurchaseLimit    = 'box.purchaseLimit',
    RevealsStuck     = 'box.revealsStuck',
    Retrying         = 'box.retrying',
    SoldOut          = 'box.soldOut',
    Start            = 'box.start',
    StoreLoading     = 'box.storeLoading',
    TabPicked        = 'box.tabPicked',
    TabNotTaken      = 'box.tabNotTaken',
    TabRead          = 'box.tabRead',
  }

  /** The per-round CSV. */
  export const enum Stats {
    CoinCounter     = 'stats.coinCounter',
    DeviceIdUnsaved = 'stats.deviceIdUnsaved',
    NeverRead       = 'stats.neverRead',
    NeverSettled    = 'stats.neverSettled',
    Publishing      = 'stats.publishing',
    ReadFailed      = 'stats.readFailed',
    RoundWritten    = 'stats.roundWritten',
    ScorePageGaveUp = 'stats.scorePageGaveUp',
    ShotSaveFailed  = 'stats.shotSaveFailed',
    TallyCovered    = 'stats.tallyCovered',
    TooManyGlyphs   = 'stats.tooManyGlyphs',
    UnreadableGlyph = 'stats.unreadableGlyph',
    UnreadShotSaved = 'stats.unreadShotSaved',
    WriteFailed     = 'stats.writeFailed',
  }

  /** Android system dialogs. */
  export const enum Dialog {
    Detected          = 'dialog.detected',
    DismissFailed     = 'dialog.dismissFailed',
    DpadFallback      = 'dialog.dpadFallback',
    NoButtonRow       = 'dialog.noButtonRow',
    ScreenSaved       = 'dialog.screenSaved',
    ScreenSaveFailed  = 'dialog.screenSaveFailed',
    TapPageHint       = 'dialog.tapPageHint',
    TapRightmostLabel = 'dialog.tapRightmostLabel',
    TapViaUi          = 'dialog.tapViaUi',
    UiDumpUnavailable = 'dialog.uiDumpUnavailable',
  }

  /** The progress watchdog. */
  export const enum Stall {
    CheckingDialog = 'stall.checkingDialog',
    GivingUp       = 'stall.givingUp',
    RestartingApp  = 'stall.restartingApp',
  }

  /** Capturing unrecognised screens. */
  export const enum Corpus {
    Saved      = 'corpus.saved',
    SaveFailed = 'corpus.saveFailed',
  }

  /** Issue reports -- the folder a player sends in (src/report.ts). */
  export const enum Report {
    Failed     = 'report.failed',
    PartFailed = 'report.partFailed',
    Saved      = 'report.saved',
  }

  /** The walkthrough recorder. */
  export const enum Walk {
    Done       = 'walk.done',
    Page       = 'walk.page',
    SaveFailed = 'walk.saveFailed',
    Start      = 'walk.start',
    Tap        = 'walk.tap',
  }

  /** Click Assist. */
  export const enum Assist {
    GameStart     = 'assist.gameStart',
    Linking       = 'assist.linking',
    NoChain       = 'assist.noChain',
    NoTouchDevice = 'assist.noTouchDevice',
    Ready         = 'assist.ready',
    TapOutside    = 'assist.tapOutside',
    TouchDevice   = 'assist.touchDevice',
  }

  /** The logger itself. */
  export const enum Log {
    Unserializable = 'log.unserializable',
  }

  /**
   * The settings WebView -- a separate compilation, same vocabulary.
   *
   * Written by the page itself, with one exception: `LiveApplied` is the engine
   * (`applyLiveSettings`, src/index.ts) reporting what a save off this page did
   * to the run in progress. The Quick Bar's namespace below is split the same
   * way, and for the same reason -- the event names what asked, not what wrote.
   */
  export const enum Settings {
    ClipboardExecCommandFailed = 'settings.clipboardExecCommandFailed',
    ClipboardGetFailed         = 'settings.clipboardGetFailed',
    ClipboardReadFailed        = 'settings.clipboardReadFailed',
    ClipboardSetFailed         = 'settings.clipboardSetFailed',
    ClipboardWriteFailed       = 'settings.clipboardWriteFailed',
    Enabled                    = 'settings.enabled',
    EnableUnknown              = 'settings.enableUnknown',
    LiveApplied                = 'settings.liveApplied',
    LiveRead                   = 'settings.liveRead',
    Loaded                     = 'settings.loaded',
    NoneFound                  = 'settings.noneFound',
    PresetApplied              = 'settings.presetApplied',
    PresetDeleted              = 'settings.presetDeleted',
    PresetExported             = 'settings.presetExported',
    PresetSaved                = 'settings.presetSaved',
    PresetStoreFailed          = 'settings.presetStoreFailed',
    ReportAsked                = 'settings.reportAsked',
    RoundDelaySkipAsked        = 'settings.roundDelaySkipAsked',
    UnlockLevelsNowAsked       = 'settings.unlockLevelsNowAsked',
    BuyBoxesNowAsked           = 'settings.buyBoxesNowAsked',
    Saved                      = 'settings.saved',
    ShareCodeUndecodable       = 'settings.shareCodeUndecodable',
    ShareFieldIgnored          = 'settings.shareFieldIgnored',
    ShareKeyIgnored            = 'settings.shareKeyIgnored',
    ShareNoSlot                = 'settings.shareNoSlot',
    ShareSlotPrivate           = 'settings.shareSlotPrivate',
    ShareSlotRepeated          = 'settings.shareSlotRepeated',
    ShareSlotsOverflow         = 'settings.shareSlotsOverflow',
    StartCommand               = 'settings.startCommand',
    StoreRead                  = 'settings.storeRead',
    Unserializable             = 'settings.unserializable',
  }

  /**
   * The Quick Bar -- the strip of live settings above the log.
   *
   * Written from both sides: the engine half (`src/quickbar.ts`) and the page
   * itself, which is its own compilation and carries its own logger, as the
   * settings page does.
   */
  export const enum QuickBar {
    Applied        = 'quickBar.applied',
    ApplyFailed    = 'quickBar.applyFailed',
    PausedRound    = 'quickBar.pausedRound',
    /** The whistle: what a round in progress could not take is on now. */
    PendingApplied = 'quickBar.pendingApplied',
    PresetApplied  = 'quickBar.presetApplied',
    ReportAsked    = 'quickBar.reportAsked',
    ReportFailed   = 'quickBar.reportFailed',
    UnknownSetting = 'quickBar.unknownSetting',
  }
}
