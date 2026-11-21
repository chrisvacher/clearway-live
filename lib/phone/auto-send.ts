// Selection inputs share one quiet period. The pending value is replaced on each
// change, including a change back to the last sent value (which cancels the send).
export class QuietSend<T> {
  private timer?: ReturnType<typeof setTimeout>;
  private last: string;
  constructor(initial: T, private deliver: (value: T) => void, private delay = 600) {
    this.last = JSON.stringify(initial);
  }
  schedule(value: T, immediate = false) {
    this.cancel();
    const signature = JSON.stringify(value);
    if (signature === this.last) return;
    const send = () => { this.timer = undefined; this.last = signature; this.deliver(value); };
    if (immediate) send(); else this.timer = setTimeout(send, this.delay);
  }
  acknowledge(value: T) { if (this.timer === undefined) this.last = JSON.stringify(value); }
  cancel() { clearTimeout(this.timer); this.timer = undefined; }
}
