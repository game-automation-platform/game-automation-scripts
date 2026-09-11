// The emitted event vocabulary: every name this script broadcasts, once.
//
// Separate from `Log` (src/logEvents.ts) on purpose. A log line is for a person
// reading a run afterwards; an emitted event is an *interface* another program
// reacts to as the run happens -- an OBS recorder starting on `round.start` and
// stopping on `round.end`. Renaming a log event costs a grep; renaming one of
// these breaks somebody's tooling.
//
// A `const enum` per component inside a namespace that is erased with them, the
// same shape as `Log`: the bundle carries the bare string and nothing else, and
// what it buys is one definition to jump to, find references on and rename.
//
// The host defines none of these names and reads none of the payloads -- see
// `../game-automation-app/docs/EVENTS.md`. What each one carries is EVENTS.md,
// which is generated from the call sites by `npm run events:docs`, so adding an
// event here and emitting it is the whole of the work.
namespace Emit {
  /** One start()..stop(). */
  export const enum Run {
    /** A run has been asked for and its world is about to be built. */
    Started = 'run.started',
    /** The run's world has been dismantled; nothing is playing. */
    Stopped = 'run.stopped',
  }

  /**
   * One played round.
   *
   * Three events rather than two because the interesting moment is not the same
   * as the obvious one: `Over` is the board ending, `End` is the score tally
   * having finished and the figures being readable. A recorder that stops on
   * `Over` cuts the tally off.
   */
  export const enum Round {
    /**
     * The pre-round screen is up with the bonus items set, and Start is about to
     * be tapped. **The signal to start recording** -- emitted here rather than on
     * the board so a recording opens on the items the round is being played with;
     * the board follows a few seconds later.
     * `id` is the round's own, repeated by every other `round.*` event of that
     * round -- which is how a consumer several emulators dial into tells one
     * round's events from another's, where `round` counts a single device's
     * rounds and starts at 1 on each. It is also the CSV row's id. `settings` is
     * what the round is being played under: the gameplay settings the stats CSV
     * records as columns, as the settings object holds them.
     */
    Start = 'round.start',
    /** The board is finished and the score tally is beginning. */
    Over  = 'round.over',
    /**
     * The tally is done and the figures have been read. **The signal to stop
     * recording**, and the only event carrying the round's numbers. `settings`
     * repeats what `round.start` said, so this one event stands on its own.
     */
    End   = 'round.end',
  }
}
