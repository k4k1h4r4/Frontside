// Edit this file to define your hunt. Add as many steps as you need.
// destinationkey accepts a fixed MMDDYYYY string (including leading zeroes),
// 'currentdate', or a relative year expression like 'currentdate - 21years'.
// Example: on October 8, 2026, 'currentdate - 21years' resolves to '10082005'.
// Both + and - are supported; spaces and singular 'year' are also accepted.
// Relative dates follow the player's local date, including after midnight.
// February 29 becomes February 28 if the target year is not a leap year.
// Use 'currentdate' on the last step to return players to today.
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
      message: "IT WORKED! WE DID IT!\nNow following my instructions carefully. I sent you this time-travel device from the future, so you can prevent a catastrophe.\nThis device is programmed with everything you will need.\nSeveral messages are stored inside. Each message is triggered at a specific point in time.\nThe device will only allow you to travel to those predetermined dates.\nI have intentionally hidden the dates from you.\nTemporal safeguards prevent me from giving you the dates directly. You must discover them.\nSolve each clue and enter the correct date. The device will take you there, and the corresponding message will appear.\n\nCLUE: Check the sign next to the front exit, and travel to the day the youngest drinkers were born.",
      destinationkey: 'currentdate - 21years',
      clip: 'images/t2.webm'
    },
    {
      step: 2,
      message: "In the future, a Frontside Keno Writer named Benedict Ballsworth unites his fellow Keno Writers in a revolt against the bar's patrons.\n\nThe workers lock the patrons inside and burn the Frontside to the ground.\n\nCLUE: Order the Ribeye Steak & Eggs. No tax required.",
      destinationkey: '01071995',
      clip: 'images/billted.webm'
    },
    {
      step: 3,
      message: "The Ballsworth Rebellion, as it came to be known, inspired Keno Writers across the country to rise up. The resulting uprising destroyed every Keno parlor in the United States.\n\nBallsworth’s actions at the Frontside ultimately brought an end to Keno as we know it.\n\nYour actions can prevent this future from happening.\n\nCLUE: Imagine betting $5 on a 9-spot, and hitting 8 numbers. That’s a lot of dollars.",
      destinationkey: '02252000',
      clip: 'images/hottub.webm'
    },
    {
      step: 4,
      message: "Ballsworth historians point to one specific event that set him on his path of revenge:\n\nWhen Benedict was a young boy, his mother, Anna, worked as a Keno Writer at the Frontside. One night, a player hit a massive jackpot but left without tipping her a single cent.\n\nAnna came home devastated. She told young Benedict what had happened, declared she was done working at the Frontside, and locked herself in her room for days.\n\nAfter that night her spirit was crushed, and she was never quite the same.\n\nBenedict never forgot what the bar and the game had done to his mother. He grew up vowing revenge.\n\nCLUE: Go out to the patio, for a smoke. You will notice a reference to a particular bike rally. Travel to the closing day of this event.",
      destinationkey: '08162020', 
      clip: 'images/looper.webm' 
    },
    {
      step: 5,
      message: "You will see a young 21-year-old walk into the Frontside and order the Ribeye Steak & Eggs.\n\nWhile eating, he’ll tell anyone who will listen about his recent trip to the Sturgis Rally.\n\nHe will then bet $5 on a 9-spot and hit 8 numbers, winning $22,500.\n\nHe’ll collect his winnings from Anna, walk over to the jukebox, play Steve Miller Band’s ‘Take the Money and Run’ and leave the bar laughing hysterically.\n\nYou must not change any of this. Do not interfere with his meal, his bet, his winnings, or his song. The events must unfold exactly as history remembers them.\n\nOnce the winner has left, walk over to Anna at the Keno counter. Hand her $100 and simply say,\n\n‘You deserve this.’\n\nThen walk away.\n\nCLUE: Place a call to the bar, while taking note of the final digits.",
      destinationkey: '01032020', 
      clip: 'images/groundhog.webm' 
    },
    {
      step: 6,
      message: "There’s one thing I neglected to tell you…\n\nI am you.\n\nNot metaphorically. Not symbolically. I am literally you.\n\nI remember finding this device. I remember reading these same messages. And I remember standing exactly where you’re standing now.\n\nI came from a future where the Frontside burned, Keno disappeared, and the world paid the price for one man’s grudge. I sent this device back because I had to give us a chance to change that future.\n\nNow it’s your turn to return home and live your life. Trust me, you don’t want to miss out on the cool shit we’re gonna do.\n\nBut there’s one final responsibility.\n\nKeep this device safe. Do not use it again until June 20, 2040.\n\nOn that date, you must reset the device, set its destination to [CURRENT DATE], and send it back to yourself.\n\nBefore you do, update the first message.\n\nIf the Frontside survived and Keno is still alive and well, the message should say “IT WORKED! WE DID IT!”\n\nIf the rebellion still happened, the message should say “WE FAILED.” The next version of us will need another chance.\n\nThen send the device back. The loop must continue until we get it right.\n\nNow go home. Live your life. And try not to screw this up.\n\nCLUE: Go home.",
      destinationkey: 'currentdate', 
      clip: 'images/endgame.webm' 
    }
  ]
};
