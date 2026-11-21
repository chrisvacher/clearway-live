"use client";
import { useEffect, useState } from "react";
import { Film, Upload } from "lucide-react";
import type { OptionsEditorProps } from "@/components/interactions/option-editors";
import { linkedVideo, videoOptions, videoTime, type VideoOptions } from "@/lib/video/playback";
import { videoLimit, type VideoFile } from "@/lib/video/files";
import { uploadVideo } from "@/lib/video/upload";
import { Select } from "@/components/ui/select";
import "./video-options.css";

const defaults = { start: 0, end: null, ends: "hold", sound: true } as const;
function parseTime(value: string) {
  const text = value.trim(), parts = /^(\d{1,4}):([0-5]\d)$/.exec(text);
  return parts ? Number(parts[1]) * 60 + Number(parts[2]) : null;
}
export function VideoStepOptions({ value, context, locked, onChange }: OptionsEditorProps) {
  const video = videoOptions(value);
  const [source, setSource] = useState<VideoOptions["source"]>(video?.source ?? "upload");
  const [url, setUrl] = useState(video?.url ?? ""), [start, setStart] = useState(videoTime(video?.start ?? 0));
  const [end, setEnd] = useState(video?.end == null ? "" : videoTime(video.end));
  const [records, setRecords] = useState<VideoFile[]>([]);
  const [progress, setProgress] = useState<number | null>(null), [message, setMessage] = useState("");
  const file = records.find(record => record.id === video?.id);
  useEffect(() => {
    let valid = true;
    void fetch(`/api/setup/videos?engagement=${context.id}`).then(response => response.json()).then(data => {
      if (valid && data.status === "ok") setRecords(data.videos);
    }).catch(() => {});
    return () => { valid = false; };
  }, [context.id]);
  function save(patch: Partial<VideoOptions>) {
    const candidate = { ...defaults, ...video, ...patch };
    if ((candidate.end !== null && candidate.start >= candidate.end) || !candidate.source) return;
    if (candidate.source === "link" && candidate.url && linkedVideo(candidate.url)) {
      const { id: _id, ...rest } = candidate; void _id;
      onChange({ ...value, video: rest });
    } else if (candidate.source === "upload" && candidate.id) {
      const { url: _url, ...rest } = candidate; void _url;
      onChange({ ...value, video: rest });
    }
  }
  const disabled = locked || progress !== null;
  async function uploadFile(file: File) {
    setMessage("");
    if (file.size > videoLimit) { setMessage("Choose a video up to 500 MB."); return; }
    setProgress(0);
    try {
      const added = await uploadVideo(context.id, file, setProgress);
      setRecords(items => [...items, added]);
      setStart("0:00"); setEnd("");
      save({ source: "upload", id: added.id, start: 0, end: null });
    } catch (error) { setMessage(error instanceof Error ? error.message : "Couldn’t upload the video. Try again."); }
    finally { setProgress(null); }
  }
  function saveTime(field: "start" | "end", text: string) {
    const seconds = parseTime(text);
    if (field === "end" && !text.trim()) { setMessage(""); save({ end: null }); return; }
    if (seconds === null) { setMessage("Enter the time as minutes and seconds, for example 1:30."); return; }
    if ((field === "start" ? seconds : video?.start ?? 0) >= (field === "end" ? seconds : video?.end ?? Infinity)) {
      setMessage("Start at must come before End at."); return;
    }
    if (file && (seconds > file.duration || field === "start" && seconds === file.duration)) { setMessage("Choose a time within the video."); return; }
    setMessage(""); save({ [field]: seconds });
  }
  return <div className="ros-video-options is-full">
    <fieldset disabled={disabled}>
      <legend>Video</legend>
      <label><input type="radio" checked={source === "upload"} onChange={() => setSource("upload")} />Upload a video file</label>
      <p className="show-help">Plays cleanest, with no player controls or ads.</p>
      {source === "upload" && <div className="ros-video-file">
        <Film size={20} aria-hidden="true" />
        {file && <div><strong>{file.name}</strong><p>{videoTime(file.duration)} · {(file.bytes / 1_048_576).toFixed(1)} MB · {file.width} × {file.height} · Uploaded</p></div>}
        <label className="show-button"><Upload size={16} aria-hidden="true" />{file ? "Replace" : "Choose a video"}
          <input className="sr-only" type="file" accept=".mp4,.mov,video/mp4,video/quicktime" aria-label={file ? "Replace video" : "Upload video"}
            onChange={event => { const next = event.currentTarget.files?.[0]; event.currentTarget.value = ""; if (next) void uploadFile(next); }} />
        </label>
      </div>}
      <label><input type="radio" checked={source === "link"} onChange={() => setSource("link")} />Paste a YouTube or Vimeo link</label>
      <p className="show-help">A linked video can show the site&apos;s own controls and, on YouTube, ads. Upload when you can.</p>
      {source === "link" && <input aria-label="Video link" type="url" placeholder="https://" value={url} onChange={event => {
        const next = event.target.value; setUrl(next);
        if (linkedVideo(next)) { setMessage(""); save({ source: "link", url: next }); }
      }} onBlur={() => { if (url.trim() && !linkedVideo(url)) setMessage("Paste a YouTube or Vimeo link."); }} />}
    </fieldset>
    {progress !== null && <progress max={1} value={progress} aria-label="Video upload progress" />}
    <div className="show-fields">
      <label>Start at<input value={start} placeholder="0:00" disabled={disabled} onChange={event => setStart(event.target.value)} onBlur={() => saveTime("start", start)} /></label>
      <label>End at<input value={end} placeholder="The end" disabled={disabled} onChange={event => setEnd(event.target.value)} onBlur={() => saveTime("end", end)} /></label>
      <label className="is-full">When it ends<Select value={video?.ends ?? "hold"} disabled={disabled} onChange={event => save({ ends: event.target.value === "next" ? "next" : "hold" })}><option value="hold">Hold the last frame</option><option value="next">Go to the next step</option></Select></label>
      <label className="show-check is-full"><input type="checkbox" checked={video?.sound ?? true} disabled={disabled} onChange={event => save({ sound: event.target.checked })} />Play sound from the TV window</label>
    </div>
    {message && <p className="show-message is-error" role="alert">{message}</p>}
    {!video && <p className="show-help" role="status">Add a video before marking this step ready.</p>}
    <p className="show-help">Phones show the title and &quot;Watch the screen.&quot; Going live starts the video from Start at.</p>
  </div>;
}
