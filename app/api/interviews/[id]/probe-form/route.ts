import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { format } from "date-fns";
import { store } from "@/lib/store";
import { config } from "@/lib/config";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const interview = store.get(id);

  if (!interview) {
    return NextResponse.json({ ok: false, error: "Interview not found" }, { status: 404 });
  }
  if (interview.status !== "completed") {
    return NextResponse.json(
      { ok: false, error: `Probe form not ready — status is "${interview.status}"` },
      { status: 400 }
    );
  }

  const filePath = path.resolve(process.cwd(), config.app.outputDir, `${id}.xlsx`);
  if (!fs.existsSync(filePath)) {
    return NextResponse.json({ ok: false, error: "File not found on disk" }, { status: 404 });
  }

  const fileBuffer = fs.readFileSync(filePath);
  const safeName = interview.candidateName.replace(/\s+/g, "_");
  const dateStr = format(new Date(interview.createdAt), "yyyy-MM-dd");
  const filename = `${safeName}_${interview.roleId}_${dateStr}.xlsx`;

  return new NextResponse(fileBuffer, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(fileBuffer.length),
    },
  });
}
