// Official APIs: https://developers.google.com/youtube/iframe_api_reference
// https://github.com/vimeo/player.js
// Official player APIs, loaded only on a TV/preview that contains a linked video.
// References: https://developers.google.com/youtube/iframe_api_reference
// https://developers.google.com/youtube/player_parameters
// https://github.com/vimeo/player.js
export type LinkedVideo = { provider: "youtube" | "vimeo"; id: string; hash?: string };
export type LinkedPlayerOptions = {
  start?: number; end?: number | null; muted?: boolean; title?: string;
  onAutoplayBlocked?: () => void;
  onEnded?: () => void;
  onPlayingChange?: (playing: boolean) => void;
  onError?: (error: Error) => void;
};
export type LinkedPlayer = {
  ready: Promise<void>;
  play: () => Promise<void>;
  pause: () => Promise<void>;
  seek: (seconds: number) => Promise<number>;
  mute: (muted: boolean) => Promise<void>;
  duration: () => Promise<number>;
  currentTime: () => Promise<number>;
  destroy: () => Promise<void>;
};
type YouTubePlayer = {
  playVideo(): void; pauseVideo(): void; seekTo(seconds: number, allowSeekAhead: boolean): void;
  mute(): void; unMute(): void; getDuration(): number; getCurrentTime(): number; getPlayerState(): number; destroy(): void;
};
type VimeoPlayer = {
  ready(): Promise<void>; play(): Promise<void>; pause(): Promise<void>; setCurrentTime(seconds: number): Promise<number>;
  setMuted(muted: boolean): Promise<boolean>; getDuration(): Promise<number>; getCurrentTime(): Promise<number>; destroy(): Promise<void>;
  on(event: string, handler: (event?: { seconds?: number }) => void): void;
  off(event: string, handler: (event?: { seconds?: number }) => void): void;
};
type PlayerWindow = Window & {
  YT?: { Player: new (iframe: HTMLIFrameElement, options: { events: {
    onReady: () => void; onStateChange: (event: { data: number }) => void;
    onError: (event: { data: number }) => void; onAutoplayBlocked: () => void;
  } }) => YouTubePlayer };
  Vimeo?: { Player: new (iframe: HTMLIFrameElement) => VimeoPlayer };
  onYouTubeIframeAPIReady?: () => void;
};
const loaders = new WeakMap<Window, Map<LinkedVideo["provider"], Promise<void>>>();
const asError = (error: unknown) => error instanceof Error ? error : new Error(String(error));
function loadApi(win: PlayerWindow, provider: LinkedVideo["provider"]) {
  if (provider === "youtube" ? win.YT?.Player : win.Vimeo?.Player) return Promise.resolve();
  let byProvider = loaders.get(win); if (!byProvider) { byProvider = new Map(); loaders.set(win, byProvider); }
  const existing = byProvider.get(provider); if (existing) return existing;
  const promise = new Promise<void>((resolve, reject) => {
    const doc = win.document, src = provider === "youtube" ? "https://www.youtube.com/iframe_api" : "https://player.vimeo.com/api/player.js";
    let script = doc.querySelector<HTMLScriptElement>(`script[src="${src}"]`);
    const owned = !script; if (!script) { script = doc.createElement("script"); script.src = src; script.async = true; }
    const node = script;
    const previous = win.onYouTubeIframeAPIReady;
    let callback: (() => void) | undefined;
    const cleanup = () => { win.clearTimeout(timeout); node.removeEventListener("error", failed); node.removeEventListener("load", loaded); if (callback && win.onYouTubeIframeAPIReady === callback) win.onYouTubeIframeAPIReady = previous; };
    const success = () => { cleanup(); resolve(); };
    const failed = () => { cleanup(); if (owned) node.remove(); byProvider?.delete(provider); reject(new Error(`Could not load the ${provider} player.`)); };
    const loaded = () => { if (provider === "vimeo" && win.Vimeo?.Player) success(); };
    const timeout = win.setTimeout(failed, 30000);
    if (provider === "youtube") {
      callback = () => { try { previous?.(); } finally { if (win.YT?.Player) success(); else failed(); } };
      win.onYouTubeIframeAPIReady = callback;
    }
    node.addEventListener("error", failed, { once: true }); node.addEventListener("load", loaded, { once: true });
    if (owned) doc.head.append(node);
  });
  byProvider.set(provider, promise); return promise;
}

// The caller must supply a parsed, validated provider/id; arbitrary embed URLs are never used.
// The adapter owns only the iframe it appends, so destroying an old player cannot remove a new one.
export function makeLinkedPlayer(host: HTMLElement, video: LinkedVideo, options: LinkedPlayerOptions = {}): LinkedPlayer {
  if (video.provider === "youtube" ? !/^[A-Za-z0-9_-]{11}$/.test(video.id) : !/^\d{1,15}$/.test(video.id)) throw new Error("Choose a valid video link.");
  if (video.hash && !/^[A-Za-z0-9]+$/.test(video.hash)) throw new Error("Choose a valid Vimeo link.");
  const win = host.ownerDocument.defaultView as PlayerWindow | null;
  if (!win) throw new Error("The video needs a browser window.");
  let destroyed = false, muted = options.muted ?? true, playingIntent = false, fallbackAttempted = false, intentVersion = 0;
  let yt: YouTubePlayer | undefined, vimeo: VimeoPlayer | undefined;
  let rejectReady: (error: Error) => void = () => {};
  let pendingPlay: { resolve: () => void; reject: (error: Error) => void; timer: number } | null = null;
  const iframe = host.ownerDocument.createElement("iframe");
  iframe.title = options.title ?? "Workshop video"; iframe.className = "cwl-linked-video";
  iframe.width = "100%"; iframe.height = "100%"; iframe.setAttribute("frameborder", "0");
  iframe.allow = "autoplay; fullscreen; encrypted-media; picture-in-picture";
  iframe.allowFullscreen = true; iframe.referrerPolicy = "strict-origin-when-cross-origin";
  const start = Math.max(0, Number.isFinite(options.start) ? options.start! : 0);
  const url = new URL(video.provider === "youtube" ? `https://www.youtube-nocookie.com/embed/${video.id}` : `https://player.vimeo.com/video/${video.id}`);
  const vars = video.provider === "youtube"
    ? { enablejsapi: "1", origin: win.location.origin, controls: "0", disablekb: "1", fs: "0", playsinline: "1", rel: "0", autoplay: "0", start: String(Math.floor(start)), mute: muted ? "1" : "0" }
    : { controls: "0", keyboard: "0", title: "0", byline: "0", portrait: "0", dnt: "1", playsinline: "1", autoplay: "0", muted: muted ? "1" : "0", autopause: "0" };
  Object.entries(vars).forEach(([key, value]) => url.searchParams.set(key, value));
  if (video.provider === "youtube" && options.end != null) url.searchParams.set("end", String(Math.ceil(options.end)));
  if (video.provider === "vimeo") { if (video.hash) url.searchParams.set("h", video.hash); if (start) url.hash = `t=${start}s`; }
  const finishPlay = (error?: Error) => { if (!pendingPlay) return; win.clearTimeout(pendingPlay.timer); const pending = pendingPlay; pendingPlay = null; if (error) pending.reject(error); else pending.resolve(); };
  const assertActive = () => { if (destroyed) throw new Error("The video player was closed."); };
  const signalBlocked = () => { if (!destroyed) options.onAutoplayBlocked?.(); };
  const ready = new Promise<void>((resolve, reject) => {
    rejectReady = reject;
    void loadApi(win, video.provider).then(() => {
      assertActive(); iframe.src = url.toString(); host.append(iframe);
      if (video.provider === "youtube") {
        yt = new win.YT!.Player(iframe, { events: {
          onReady: () => { if (!destroyed) { if (muted) yt?.mute(); else yt?.unMute(); resolve(); } },
          onStateChange: ({ data }) => { if (destroyed) return; if (data === 1) { fallbackAttempted = false; finishPlay(); } options.onPlayingChange?.(data === 1); if (data === 0) options.onEnded?.(); },
          onError: ({ data }) => { const error = new Error(`YouTube could not play this video (${data}).`); reject(error); finishPlay(error); if (!destroyed) options.onError?.(error); },
          onAutoplayBlocked: () => {
            if (destroyed || !playingIntent) return;
            signalBlocked();
            if (!muted && !fallbackAttempted) { fallbackAttempted = true; muted = true; yt?.mute(); yt?.playVideo(); }
            else finishPlay(new DOMException("Click the TV to start the video.", "NotAllowedError"));
          },
        } });
      } else {
        vimeo = new win.Vimeo!.Player(iframe);
        vimeo.on("ended", ended); vimeo.on("play", playing); vimeo.on("pause", paused);
        void vimeo.ready().then(() => { if (!destroyed) resolve(); }, reject);
      }
    }).catch(error => { const failure = asError(error); reject(failure); if (!destroyed) options.onError?.(failure); });
  });
  // A blocked provider iframe cannot leave Preview waiting forever.
  const readyTimer = win.setTimeout(() => {
    const error = new Error("The linked video did not load. Check the connection.");
    rejectReady(error); if (!destroyed) options.onError?.(error);
  }, 30000);
  // The component can destroy an unready adapter without an unhandled rejected Promise.
  void ready.then(() => win.clearTimeout(readyTimer), () => win.clearTimeout(readyTimer));
  function ended() { if (!destroyed) options.onEnded?.(); }
  function playing() { if (!destroyed) options.onPlayingChange?.(true); }
  function paused() { if (!destroyed) options.onPlayingChange?.(false); }
  return {
    ready,
    async play() {
      const intent = ++intentVersion; playingIntent = true;
      await ready; assertActive(); if (intent !== intentVersion) return;
      if (vimeo) {
        try { await vimeo.play(); }
        catch (error) {
          if (asError(error).name !== "NotAllowedError") throw error;
          signalBlocked();
          if (muted) throw error;
          muted = true; await vimeo.setMuted(true); assertActive(); await vimeo.play();
        }
      } else if (yt) {
        if (yt.getPlayerState() === 1) return;
        if (pendingPlay) finishPlay();
        await new Promise<void>((resolve, reject) => {
          pendingPlay = { resolve, reject, timer: win.setTimeout(() => finishPlay(new Error("The linked video did not start. Check the connection.")), 15000) };
          yt!.playVideo();
        });
      }
    },
    async pause() { intentVersion++; playingIntent = false; await ready; assertActive(); finishPlay(); if (vimeo) await vimeo.pause(); else yt?.pauseVideo(); },
    async seek(seconds) {
      await ready; assertActive(); const position = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
      if (vimeo) { const actual = await vimeo.setCurrentTime(position); if (!playingIntent) await vimeo.pause(); return actual; }
      yt?.seekTo(position, true); return position;
    },
    async mute(next) { await ready; assertActive(); muted = next; if (vimeo) await vimeo.setMuted(next); else if (next) yt?.mute(); else yt?.unMute(); },
    async duration() { await ready; assertActive(); return vimeo ? vimeo.getDuration() : yt?.getDuration() ?? 0; },
    async currentTime() { await ready; assertActive(); return vimeo ? vimeo.getCurrentTime() : yt?.getCurrentTime() ?? 0; },
    async destroy() {
      if (destroyed) return; destroyed = true; playingIntent = false; intentVersion++; win.clearTimeout(readyTimer);
      const error = new Error("The video player was closed."); rejectReady(error); finishPlay(error);
      if (vimeo) { vimeo.off("ended", ended); vimeo.off("play", playing); vimeo.off("pause", paused); await vimeo.destroy().catch(() => {}); }
      else yt?.destroy();
      iframe.remove();
    },
  };
}
