# Time circuits

Open `timetravel.html`. No build step is required. Tap Input beside Destination Time to open the keypad popup. It has MM / DD / YYYY fields, numeric buttons, Clear, Backspace, and a white Input Destination button. Tap a field to correct it; physical number keys and Backspace also work. Confirm a valid date with Input Destination to close the keypad and light the red Engage switch in the top edge of the console with a Destination Locked indicator. Close or Escape discards unconfirmed edits. Tap Engage to launch the video and update the circuits.

## Clock and travel behavior

- Destination starts blank. Eight digits in MMDDYYYY order form a draft date. Input Destination accepts only valid complete dates; confirming commits the date and lights Engage. Destination time follows the current device time. Variable or URL updates commit directly and also light Engage.
- Present starts with the current device date/time.
- Last Time Departed starts at October 26, 1985, 01:20 AM.
- Travel captures the previous Present Time date/time in Last Time Departed before changing Present to the destination. Departed stays static until the next trip.
- Present switches to that destination date while its hours and minutes continue following the device clock. The selected date remains fixed, including across midnight.
- Destination and keypad fields clear after every trip, and Engage returns to its dim, disabled state.
- Each successful trip opens `images/bttfTimeTravel.mp4` in a mobile inline video popup with audio enabled. It plays once from the start and closes when the clip ends. The × button or Escape stops playback and returns to the circuits. Native video controls allow pausing or muting. If browser audio policy blocks playback, a Play Clip With Sound button provides another direct tap. Buffering and media errors display a status message. Circuit values update immediately and skipping does not undo the trip. The clip controls the sequence duration; there is no fixed animation timer.

## Set up the scavenger hunt

Edit `timetravel-hunt-config.js`. Each step has a numeric `step`, a clue in `message`, and an eight-digit **string** `destinationkey` in MMDDYYYY format. The included movie clues are starter examples to replace with your hunt's clues.

```js
window.TIME_HUNT_CONFIG = {
  id: 'my-hunt-v1',
  initialStep: 1,
  completionMessage: 'You found the final destination!',
  steps: [
    { step: 1, message: 'Your first clue goes here.', destinationkey: '10261985' },
    { step: 2, message: 'Your second clue goes here.', destinationkey: '11051955' }
  ]
};
```

Add as many steps as needed, numbering them from 1. Steps run in numerical order, beginning at `initialStep` for new players. Clue headings read Message 1, Message 2, and so on. Changing `initialStep` does not override a returning player's saved step. Existing progress from the original zero-based version migrates to the same clue with the new numbering. Change `id` to create a new hunt with independent browser progress.

MESSAGE opens the current clue popup. An incorrect destination opens the unsuccessful-travel popup without changing the step or circuit values or playing the video. A correct destination records the previous Present Time, advances to the next configured step, saves progress, and plays the video. Finishing the last step marks the hunt complete; MESSAGE then shows `completionMessage`. Skipping the video does not undo success.

The current step, message, destinationkey, completion flag, selected Present date, static Departed time, and confirmed Destination are saved in `localStorage`. Reloading or navigating away and returning resumes the same hunt in that browser on the same site. Clues and keys are refreshed from the configuration when loading, so correcting a clue file also updates returning players. If browser storage is disabled, the hunt works for the current page visit.

For setup or testing in the browser console:

```js
timeHunt.getState();  // { step, message, destinationkey, completed }
timeHunt.setStep(2);  // Select a configured step, clear Destination, save it
timeHunt.reset();     // Restart at initialStep and reset the circuit defaults
```

## Variable updates

After the deferred script loads:

```js
timeCircuits.set('destination', '10212015'); // MMDDYYYY
timeCircuits.travel();                     // Use selected destination
timeCircuits.travel('11051955');           // Select and travel immediately
timeCircuits.set('present', '2015-10-21');  // Chosen date with current time
timeCircuits.set('departed', '1985-10-26T01:20'); // Static date/time
timeCircuits.set('destination', null);     // Clear destination
timeCircuits.resetPresent();              // Restore current device date/time
```

All three accept MMDDYYYY, YYYY-MM-DD, local YYYY-MM-DDTHH:mm strings, or Date objects. Years must be 0001–9999. Destination and Present always use current device time, even when the supplied value includes a time. Departed preserves an explicit time; date-only values use current time. Date objects use the device's local timezone. Invalid dates throw before changing state.

`timeCircuits.get(name)` returns the displayed YYYY-MM-DDTHH:mm value or `null` for blank Destination. `travel()` checks the current step's key; it returns `success: true` with the resulting circuit values and new hunt state, or `success: false` when the answer is incorrect or the hunt is already complete. Malformed dates still throw.

```js
window.dispatchEvent(new CustomEvent('timecircuits:update', {
  detail: { destination: destinationDate, present: presentDate, departed: lastDepartureTime }
}));
```

The entire event is validated before applying changes. URL parameters can supply initial values: `timetravel.html?destination=10212015&present=11051955`.

Confirmed values and progress persist in browser storage. URL parameters override saved circuit values for that load, but do not bypass answer checking or change the saved hunt step. Run checks from the project root: `node --test tests/timetravel.test.cjs`.


