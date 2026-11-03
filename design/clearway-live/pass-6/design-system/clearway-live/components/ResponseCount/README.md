# ResponseCount

The survey's response count with when it was last read and Refresh. The app counts responses each time it reads Team Hub; a refresh that brings new responses rolls the number up.

**Screens:** SET-04. **Sets:** Setup. Design pass 6 (milestone 6).

**Consumer provides:** The count, the time of the last read, and whether a read is running, Team Hub is unreachable or the data is a CSV import.

**Anatomy:** The number at 48px 700 with responses, a quiet chip with how many are new since the last read, the last-read line with refresh-cw, and Refresh. No live count anywhere in the room.

| State | Behavior |
| --- | --- |
| Typical | 87 responses, read at 4:12 pm |
| Reading | A spinner and Reading Team Hub, Refresh disabled |
| New responses | Rolls up over cwl-dur-bar-grow, +12 since the last read |
| Unreachable | Last read and that Team Hub can't be reached |
| CSV | From the CSV import, no Refresh |
| Reduced motion | The number changes in place |

**Don't:** Poll Team Hub on its own or show a live count to the room.
