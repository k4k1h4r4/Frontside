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
      message: "It Worked!  We Did It!\n\nNow follow my instructions carefully.  I sent you this time-travel device from the future, so you can prevent a catastrophe.\n\nThis device is programmed with everything you will need.\n\nSeveral messages are stored inside. Each message is triggered at a specific point in time.  The device will only allow you to travel to those predetermined dates.\n\nI have intentionally hidden the dates from you.\n\nTemporal safeguards prevent me from giving you the dates directly.  You must discover them.\n\nSolve each clue and enter the correct date. The device will take you there, and the corresponding message will appear.\n\nCLUE: Check the sign next to the front exit, and travel to the day the youngest drinkers were born.",
      destinationkey: 'currentdate - 21years',
      clip: 'images/billted.webm'
    },
    {
      step: 2,
      message: "In the future, a Frontside Keno Writer named Benedict Ballsworth unites his fellow Keno Writers in a revolt against the bar's patrons.\n\nThe writers lock the patrons inside the bar and burn the Frontside to the ground.\n\nCLUE: Imagine betting $5 on a 9-spot, and hitting 8 numbers.  Those dollars could buy you a date.",
      destinationkey: '02252000',
      clip: 'images/hottub.webm'
    },
    {
      step: 3,
      message: "The night the Frontside burned, Ballsworth stood in the parking lot and watched it with calm satisfaction.\n\nHe didn’t run, and he didn’t hide.  When the fire trucks arrived, he was still standing there, and he told the first officer his name and spelled it twice.\n\nAt his trial, he never gave a reason. He refused a lawyer and refused to speak, and the only thing he ever said in public was a single sentence: \n\n'The house always wins, so I took the house.'\n\nIt was printed on posters within a week. Within a month, Keno Writers in forty-one states had walked out of their parlors.  By the end of the year, nobody was left to call the numbers.\n\nCLUE:  Order 3 Pancakes, 2 sausage patties, and 1 egg.  No tax required.",
      destinationkey: '01052025',
      clip: 'images/t2.webm'
    },
    {
      step: 4,
      message: "The Ballsworth Rebellion, as it came to be known, inspired Keno Writers across the country to rise up. The resulting revolution destroyed every Keno parlor in the United States.\n\nThe ashes of the Frontside were never cleared. A chain-link fence still surrounds the lot, and every year on the anniversary, strangers leave crayons and little stubby pencils along its edge.\n\nBallsworth’s actions at the Frontside ultimately brought an end to Keno as we know it.\n\nYour actions can prevent this future from happening.\n\nCLUE: Walk over to the Jukebox, and notice the most recent Occupation Tax sticker.   Subtract 95,208 from the tax ID number, and don't forget a costume.",
      destinationkey: '10312022', 
      clip: 'images/timecop.webm' 
    },
    {
      step: 5,
      message: "Ballsworth historians point to one specific event that set him on his path of revenge:\n\nWhen Benedict was a young boy, his mother, Anna, worked as a Keno Writer at the Frontside.  One night, a player hit a massive jackpot but left without tipping her a single cent.\n\nAnna came home devastated. She told young Benedict what had happened, declared she was done working at the Frontside, and locked herself in her room for days.\n\nAfter that night her spirit was crushed, and she was never quite the same.\n\nBenedict never forgot what the bar and the game had done to his mother.  He grew up vowing revenge.\n\nCLUE: Go out to the patio for a smoke.  You'll notice a reference to a particular bike rally.  Travel to the closing day of this event.",
      destinationkey: '08162020',
      clip: 'images/looper.webm'
    },
    {
      step: 6,
      message: "You will see a young 21-year-old walk into the Frontside and order 3 pancakes, 2 sausage patties, and 1 egg.\n\nWhile eating, he’ll tell anyone who will listen about his recent trip to the Sturgis Rally.\n\nHe will then bet $5 on a 9-spot and hit 8 numbers, winning $22,500.\n\nHe’ll collect his winnings from Anna, walk over to the jukebox, play Steve Miller Band’s ‘Take the Money and Run’ and leave the bar laughing hysterically.\n\nYou must not change any of this.  Do not interfere with his meal, his bet, his winnings, or his song. The events must unfold exactly as history remembers them.\n\nOnce the winner has left, walk over to Anna at the Keno counter.  Hand her $100 and simply say,\n\n‘You deserve this.’\n\nThen walk away.\n\nCLUE: Place a call to the bar, while taking note of the final four digits.",
      destinationkey: '01032020',
      clip: 'images/groundhog.webm'
    },
    {
      step: 7,
      message: "There’s one thing I neglected to tell you…\n\nI am you.\n\nNot metaphorically. Not symbolically. I am literally you.\n\nI remember finding this device. I remember reading these same messages.\n\nI came from a future where the Frontside burned, Keno disappeared, and the world paid the price for one man’s grudge. I sent this device back because I had to give us a chance to change that future.\n\nNow it’s your turn to return home and live your life. Trust me, it's going to awesome.  You're not going to believe the Keno jackpot we're gonna hit in 2035.\n\nBut there’s one final responsibility.\n\nKeep this device safe. Do not use it again until June 20, 2040.  On that date, you must send the device back to yourself in 2026.\n\nBefore you do, update the first message.\n\nIf the Frontside survived and Keno is still alive and well, the message should say “It Worked! We Did It!”\n\nIf the rebellion still happened, the message should say “We Failed.”  The loop must continue until we get it right.\n\nNow go home. Live your life. And try not to screw this up.\n\nCLUE:  Go home.",
      destinationkey: 'currentdate',
      clip: 'images/endgame.webm'
    }
  ]
};
