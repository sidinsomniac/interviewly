"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { Spinner } from "@/components/LoadingStates";

export function TranscriptUpload({ interviewId }: { interviewId: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);

  async function upload(file: File) {
    if (!file.name.endsWith(".vtt") && !file.name.endsWith(".txt")) {
      toast.error("Only .vtt or .txt files are supported");
      return;
    }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`/api/interviews/${interviewId}/upload-transcript`, {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error ?? "Upload failed");
      toast.success(`Transcript uploaded (${data.segmentsLoaded} segments). Generating probe form…`);
      setTimeout(() => window.location.reload(), 2000);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) upload(file);
  }

  function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) upload(file);
  }

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      onClick={() => !uploading && inputRef.current?.click()}
      className={`cursor-pointer rounded-lg border-2 border-dashed p-8 text-center transition-colors ${
        dragging ? "border-blue-400 bg-blue-50" : "border-gray-300 bg-gray-50 hover:border-gray-400"
      } ${uploading ? "pointer-events-none opacity-60" : ""}`}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".vtt,.txt"
        className="hidden"
        onChange={onChange}
      />
      {uploading ? (
        <div className="flex flex-col items-center gap-2">
          <Spinner size="md" />
          <p className="text-sm text-gray-600">Uploading…</p>
        </div>
      ) : (
        <div>
          <p className="text-sm font-medium text-gray-700">Drop .vtt or .txt file here</p>
          <p className="text-xs text-gray-400 mt-1">or click to browse</p>
        </div>
      )}
    </div>
  );
}
