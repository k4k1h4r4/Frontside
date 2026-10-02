// Edit this file to define your hunt. Keep destinationkey as an eight-digit
// MMDDYYYY string (including leading zeroes). Add as many steps as you need.
// The last step always requires today's local date. Use 'currentdate' for clarity.
// Wrap messages in double quotes so apostrophes (like we'll) work normally.
// If your clue contains a double quote, escape it as \".
window.TIME_HUNT_CONFIG = {
  id: 'frontside-time-hunt-v1', // Change the id to start a separate saved hunt.
  initialStep: 1,
  completionMessage: "Congratulations on completing your mission and making it Back to the Frontside. You deserve a beer.",
  steps: [
    {
      step: 1,
      message: "First message, but we'll start on Part Two— \n\nTravel back to the past where future Marty flew.",
      destinationkey: '10212015'
    },
    {
      step: 2,
      message: "Doc Brown invents the flux capacitor.",
      destinationkey: '11051955'
    },
    {
      step: 3,
      message: "Mission accomplished? Almost. Set your destination to today's date and make it Back to the Frontside.",
      destinationkey: 'currentdate'
    }
  ]
};
