// Edit this file to define your hunt. Keep destinationkey as an eight-digit
// MMDDYYYY string (including leading zeroes). Add as many steps as you need.
// The last step always requires today's local date. Use 'currentdate' for clarity.
// Wrap messages in double quotes so apostrophes (like we'll) work normally.
// If your clue contains a double quote, escape it as \".
// Keep each quoted message on one physical line. Use \n for a line break
// and \n\n for a blank line between paragraphs.
window.TIME_HUNT_CONFIG = {
  id: 'frontside-time-hunt-v1', // Change the id to start a separate saved hunt.
  initialStep: 1,
  completionMessage: "Congratulations on completing your mission and making it Back to the Frontside. You deserve a beer.",
  steps: [
    {
      step: 1,
      message: "IF YOU ARE READING THIS, THEN THE MACHINE WORKED!\n\nFirst message, but we'll start on Part Two—\nTravel back to the past where future Marty flew.\n\nI will tell you more later, but you need to go now!!",
      destinationkey: '10212015'
    },
    {
      step: 2,
      message: "Frontside 2015 looks awfully familiar, doesn't it?\n\nNow that you're away from the immediate threat, I can tell you a little more...\nI come from a time where the Frontside Bar is nothing but a pile of dirt and ash.  I trust that you're the one that can save it!\n\nYou're going to get awfully hungry on this mission, so I would order a Pulled Pork Sandwich.",
      destinationkey: '01061995'
    },
    {
      step: 3,
      message: "Mission accomplished? Almost. You gotta get back to your own place in time to make it Back to the Frontside.",
      destinationkey: 'currentdate'
    }
  ]
};
