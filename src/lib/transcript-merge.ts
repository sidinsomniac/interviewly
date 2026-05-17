import type { TranscriptSegment } from "@/types/index";

export function mergeTranscriptSources(
  vttSegments: TranscriptSegment[],
  chatSegments: TranscriptSegment[]
): TranscriptSegment[] {
  return [...vttSegments, ...chatSegments].sort((a, b) =>
    a.startTime.localeCompare(b.startTime)
  );
}
