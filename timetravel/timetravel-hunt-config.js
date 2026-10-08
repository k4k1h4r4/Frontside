// Edit this file to define your hunt. Keep destinationkey as an eight-digit
// MMDDYYYY string (including leading zeroes). Add as many steps as you need.
// The last step always requires today's local date. Use 'currentdate' for clarity.
// Wrap messages in double quotes so apostrophes (like we'll) work normally.
// If your clue contains a double quote, escape it as \".
// Keep each quoted message on one physical line. Use \n for a line break
// and \n\n for a blank line between paragraphs.
// Upload clips to images/ and set each step's clip to its path from timetravel.html.
// Use forward slashes (e.g. 'images/bttfTimeTravel.mp4'). Steps can share a clip.
// The clip plays when leaving that step after entering its correct destination.
window.TIME_HUNT_CONFIG = {
  id: 'frontside-time-hunt-v1', // Change the id to start a separate saved hunt.
  initialStep: 1,
  completionMessage: "Congratulations on completing your mission and making it Back to the Frontside. You deserve a beer.",
  steps: [
    {
      step: 1,
      message: "IT WORKED!  WE DID IT!\nNOW FOLLOW MY INSTRUCTIONS EXACTLY!\n\nI sent you this time travel device from the future, so you can prevent a catastrophe.\nThis device is programmed with everything you will need.\n\nThere are several messages stored inside.\nEach message is triggered at a specific point in time.\nThe device will only allow you to travel to those predetermined points.\n\nI have intentionally hidden the dates from you.  Temporal safeguards prevent me from giving you the dates directly. You must discover them.\nOnce you enter the correct date, the device will take you there and the corresponding message will appear.",
      destinationkey: '10212015',
      clip: 'images/hottub.webm'
    },
    {
      step: 2,
      message: "Frontside 2015 looks awfully familiar, doesn't it?\n\nNow that you're away from the immediate threat, I can tell you a little more...\nI come from a time where the Frontside Bar is nothing but a pile of dirt and ash.  I trust that you're the one that can save it!\n\nYou're going to get awfully hungry on this mission, so I would order a Pulled Pork Sandwich.",
      destinationkey: '01061995',
      clip: 'images/t2.webm'
    },
    {
      step: 3,
      message: "Mission accomplished? Almost. You gotta get back to your own place in time to make it Back to the Frontside.",
      destinationkey: 'currentdate',
      clip: 'images/groundhog.webm'
    }
  ]
};
