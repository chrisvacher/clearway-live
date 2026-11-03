# FourListsComposer

On the phone: pick one of the four columns, write a card, send, then agree with others' cards with one tap.

**Screens:** INT-11. **Sets:** Phone. Design pass 6 (milestone 6).

**Consumer provides:** The chosen column, the draft text, the sent card, the column's cards and which ones this phone agreed with.

**Anatomy:** Add to a list, a 2 by 2 column picker (the chosen column filled in cwl-button-primary with a check), the input, the sent card, then Agree with others for the chosen column with Agree or Agreed, and Anonymous on the screen.

| State | Behavior |
| --- | --- |
| Writing | Column picked, text in the box |
| Agreeing | Agreed is filled; a second tap takes it back |
| Phones down | Dimmed, the card kept |
| Offline | Saved on this phone |

**Don't:** Show names or let a phone agree with its own card twice.
