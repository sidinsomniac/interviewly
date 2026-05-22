// Smoke test: POST to /api/schedule-interview to create a real Teams meeting.
// Requires `pnpm dev` running on http://localhost:3000.
// Usage: pnpm smoke:schedule

import { config as dotenv } from "dotenv";
dotenv({ path: ".env.local" });

const BASE_URL = process.env.SMOKE_BASE_URL ?? "http://localhost:3000";

async function main() {
  const interviewerEmail = process.env.MS_ORGANIZER_EMAIL;
  if (!interviewerEmail) {
    console.error("MS_ORGANIZER_EMAIL is required in .env.local");
    process.exit(1);
  }

  console.log(`POST ${BASE_URL}/api/schedule-interview …`);
  const res = await fetch(`${BASE_URL}/api/schedule-interview`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      candidateName: "Test Candidate",
      candidateEmail: "chatterjeesid1993@gmail.com", // your own email for testing
      jobTitle: "Senior React Engineer",
      jobDescription: "React + TypeScript + Redux + Next.js + AWS. Senior level.",
      requiredSkills: "React, TypeScript, Redux, Next.js, AWS",
      yearsExperience: 5,
      scoringDetails: {
        overallScore: 85,
        skillsMatch: 90,
        experienceMatch: 80,
        strengths: "Strong React + TS, good system design",
        gaps: "Limited AWS hands-on",
        recommendation: "Strong Fit",
      },
      interviewerEmail,
    }),
  });

  const data = await res.json();
  console.log(JSON.stringify(data, null, 2));

  if (!data.ok) {
    console.error("\n❌ schedule-interview failed");
    process.exit(1);
  }
  console.log("\n✅ Meeting created — check Outlook calendar and the candidate's inbox.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
