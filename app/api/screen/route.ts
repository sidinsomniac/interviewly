// ============================================================
// Phase J — POST /api/screen: resume upload + LLM screening.
//
// Body: multipart/form-data with:
//   - file: .pdf or .docx (the resume)
//   - roleId: string (matches a key in the probeform role registry)
//   - jdText: string (optional)
//
// Steps:
//   1. parseResume → plain text
//   2. extractCandidateProfile → structured profile
//   3. scoreCandidate → verdict + reasoning
//
// Returns: { ok, profile, score, resumeText: <first 500 chars for preview> }
//
// No persistence — recruiter approves before /api/screen/approve creates
// the interview record.
// ============================================================
import { NextRequest, NextResponse } from "next/server";
import { parseResume } from "@/lib/screening/parseResume";
import { extractCandidateProfile } from "@/lib/screening/extractProfile";
import { scoreCandidate } from "@/lib/screening/scoreCandidate";
import { getRoleSchema } from "@/lib/probeform/registry";
import { log } from "@/lib/logger";

export async function POST(req: NextRequest) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ ok: false, error: "Expected multipart/form-data body" }, { status: 400 });
  }

  const file = form.get("file") as File | null;
  const roleId = form.get("roleId") as string | null;
  const jdText = ((form.get("jdText") as string | null) ?? "").trim() || undefined;

  if (!file) {
    return NextResponse.json({ ok: false, error: "file is required" }, { status: 400 });
  }
  if (!roleId) {
    return NextResponse.json({ ok: false, error: "roleId is required" }, { status: 400 });
  }
  const schema = getRoleSchema(roleId);
  if (!schema) {
    return NextResponse.json(
      { ok: false, error: `Unknown roleId: "${roleId}"` },
      { status: 400 }
    );
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    log.info(
      { roleId, filename: file.name, size: buffer.length, jdLen: jdText?.length ?? 0 },
      "/api/screen: parsing resume"
    );
    const resumeText = await parseResume(buffer, file.name);
    if (!resumeText || resumeText.length < 50) {
      return NextResponse.json(
        { ok: false, error: "Resume text too short or empty — file may be image-only or corrupt." },
        { status: 400 }
      );
    }

    log.info({ roleId, resumeChars: resumeText.length }, "/api/screen: extracting profile");
    const profile = await extractCandidateProfile(resumeText, roleId, jdText);

    log.info({ roleId, candidateName: profile.candidateName }, "/api/screen: scoring candidate");
    const score = await scoreCandidate(profile, schema, jdText);

    log.info(
      { roleId, candidateName: profile.candidateName, verdict: score.verdict, confidence: score.confidence },
      "/api/screen: complete"
    );

    return NextResponse.json({
      ok: true,
      profile,
      score,
      resumeText: resumeText.slice(0, 500),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error({ roleId, err: msg }, "/api/screen failed");
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
