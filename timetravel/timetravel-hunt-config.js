// Edit this file to define your hunt. Keep destinationkey as an eight-digit
// MMDDYYYY string (including leading zeroes). Add as many steps as you need.
// These two Back to the Future clues are starter examples; replace them.
window.TIME_HUNT_CONFIG = {
  id: 'frontside-time-hunt-v1', // Change the id to start a separate saved hunt.
  initialStep: 1,
  completionMessage: 'You have completed the scavenger hunt. Great Scott!',
  steps: [
    {
      step: 1,
      message: 'First message, but we'll start on Part Two— Travel back to the past where future Marty flew.',
      destinationkey: '10212015'
    },
    {
      step: 2,
      message: 'Doc Brown invents the flux capacitor.',
      destinationkey: '11051955'
    }
  ]
};
