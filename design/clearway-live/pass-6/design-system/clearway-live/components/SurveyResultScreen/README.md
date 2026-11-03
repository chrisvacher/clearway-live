# SurveyResultScreen

One survey question or one accepted theme at a time on the TV, sourced from Team Hub, with its detail on phones. Chosen from the control surface. Uses the pass 3 bars and scale and the headline with depth.

**Screens:** SET-10. **Sets:** TV, phone, control. Design pass 6 (milestone 6).

**Consumer provides:** The item to show (a closed question with its counts, or an accepted theme with its count and quotes) and the total responses.

**Anatomy:** TV: the eyebrow, the question at tv-headline with the pass 3 bars or scale, or a theme as a headline with depth (count in tv-display, the theme in tv-headline-xl). A source line names the survey, responses and close date. Phones: the full question, each option's count and share or the theme's example quotes with no names, and what it rests on.

| State | Behavior |
| --- | --- |
| Nothing up yet | The TV says what will appear. Phones are never empty |
| Choice | Pass 3 bars, leader in Sunrise |
| Scale | Average and columns |
| Theme | Count and theme, quotes on phones |
| Thin | Thin flag on TV and phones; the number drops Sunrise |
| Next result | Crossfade over cwl-dur-make-room, as a session change |
| Offline | Holds the result with the gray mark |

**Don't:** Show a segment under 5, a name or an email, or a live count.
