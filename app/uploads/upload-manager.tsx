"use client";

import { useRef, useState } from "react";

const partSize = 1024 * 1024;
const actorHeaders = {
  "x-actor-id": "synthetic-producer",
  "x-actor-role": "producer",
};

async function checksum(value: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", value);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function UploadManager() {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("Choose a bounded MP4 or WAV fixture.");
  const paused = useRef(false);

  async function startUpload() {
    if (file === null || title.trim().length === 0) {
      setStatus("A title and file are required.");
      return;
    }
    paused.current = false;
    setStatus("Calculating source checksum…");
    const expectedSha256 = await checksum(await file.arrayBuffer());
    const creation = await fetch("/api/uploads", {
      body: JSON.stringify({
        expectedSha256,
        expectedSize: file.size,
        fileName: file.name,
        mediaType: file.type,
        title,
      }),
      headers: { ...actorHeaders, "content-type": "application/json" },
      method: "POST",
    });
    if (!creation.ok) {
      setStatus("The upload session could not be created.");
      return;
    }
    const payload = (await creation.json()) as { upload: { id: string } };
    localStorage.setItem("framerights-upload", payload.upload.id);
    for (
      let offset = 0, partNumber = 1;
      offset < file.size;
      offset += partSize, partNumber += 1
    ) {
      while (paused.current) {
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      const part = file.slice(offset, Math.min(offset + partSize, file.size));
      const response = await fetch(
        `/api/uploads/${payload.upload.id}/parts/${partNumber}`,
        {
          body: part,
          headers: actorHeaders,
          method: "PUT",
        },
      );
      if (!response.ok) {
        setStatus(`Part ${partNumber} failed; the session can be resumed.`);
        return;
      }
      setProgress(Math.round((Math.min(offset + partSize, file.size) / file.size) * 100));
    }
    setStatus("Verifying checksum, signature, and scanner policy…");
    const completion = await fetch(
      `/api/uploads/${payload.upload.id}/complete`,
      { headers: actorHeaders, method: "POST" },
    );
    const result = (await completion.json()) as {
      error?: string;
      inspection?: { accepted: boolean; reasonCode: string };
    };
    if (!completion.ok) {
      setStatus(
        result.inspection?.reasonCode ??
          result.error ??
          "Immutable promotion was refused.",
      );
      return;
    }
    localStorage.removeItem("framerights-upload");
    setStatus("Immutable asset version promoted.");
  }

  return (
    <section className="workspace" aria-labelledby="upload-title">
      <div>
        <p className="eyebrow">Producer workspace</p>
        <h1 id="upload-title">Resumable verified ingest</h1>
        <p className="muted">
          Parts remain staged until exact size, SHA-256, media signature, and
          deterministic scanner checks pass.
        </p>
      </div>
      <label>
        Asset title
        <input
          onChange={(event) => setTitle(event.target.value)}
          value={title}
        />
      </label>
      <label>
        Synthetic MP4 or WAV fixture
        <input
          accept="audio/wav,video/mp4"
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          type="file"
        />
      </label>
      <progress aria-label="Upload progress" max={100} value={progress}>
        {progress}%
      </progress>
      <p aria-live="polite">{status}</p>
      <div className="actions">
        <button className="button primary" onClick={startUpload} type="button">
          Start upload
        </button>
        <button
          className="button"
          onClick={() => {
            paused.current = !paused.current;
            setStatus(paused.current ? "Upload paused." : "Upload resumed.");
          }}
          type="button"
        >
          Pause / resume
        </button>
      </div>
    </section>
  );
}
