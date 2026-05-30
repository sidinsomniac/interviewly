import type { TranscriptSegment } from "@/types/index";

/**
 * Merge an arbitrary number of transcript sources into a single timeline,
 * sorted by startTime. Variadic — callers pass 2 (legacy VTT + chat) or
 * 3 (VTT + chat + liveTranscript) source arrays. Empty arrays are fine.
 */
export function mergeTranscriptSources(
  ...sources: TranscriptSegment[][]
): TranscriptSegment[] {
  return sources.flat().sort((a, b) => a.startTime.localeCompare(b.startTime));
}
