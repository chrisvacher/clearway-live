# QuestionResult

One survey question's results in setup: bars for single and multiple choice and dropdown, a distribution for scale, eNPS and slider, a count for date and PDF upload, and themes for open text.

**Screens:** SET-04. **Sets:** Setup. Design pass 6 (milestone 6).

**Consumer provides:** The question (type, title, section, options, scale ends) and its counts, the number answering, and an optional segment.

**Anatomy:** Type and section eyebrow, the question, the answered count. Bars keep the survey's own option order so nothing trades places on a refresh; each has its count and share. Distributions show the average (or eNPS score) large with columns. Pick-all shares are of the people answering. Open text hands over to ThemeList.

| State | Behavior |
| --- | --- |
| Scale | Average and columns, the scale's end labels |
| Single and multiple choice, dropdown | Bars in option order with count and share |
| eNPS | The score from promoters less detractors, columns 0 to 10 |
| Slider | Average and five ranges |
| Date, PDF upload | How many answered only. Files stay in Team Hub |
| Segment | Filtered counts, the segment named |
| Refresh | Bars and columns grow in place over cwl-dur-bar-grow |

**Don't:** Sort ordinal options by count in setup, or chart dates.
