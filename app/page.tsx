import Link from "next/link";
import { BentoCard } from "@/components/ui/BentoCard";
import { BentoGrid } from "@/components/ui/BentoGrid";
import { SparkleIcon, ChatIcon, SendIcon } from "@/components/ui/icons";

export default function Home() {
  return (
    <main className="px-6 py-16 max-w-6xl mx-auto">
      {/* Hero bento — 48px tagline + two primary CTAs + ghost link for /interviews/new. */}
      <BentoGrid className="mb-6">
        <BentoCard span="col-span-12" hero>
          <div className="text-center py-8 px-4">
            {/* Round-4 (2026-06-01) — Medha logo above the hero title. */}
            <img src="/images/medha_logo_color.png" alt="Medha" className="h-14 mx-auto mb-4" />
            <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-teams-primary/10 px-3 py-1 text-sm font-medium text-teams-primary ring-1 ring-teams-primary/20">
              <SparkleIcon className="h-4 w-4" />
              AI-powered interviewing
            </div>
            <h1 className="text-5xl font-bold tracking-tight text-[color:var(--medha-text-primary)] mb-4">
              Medha — AI Interview Co-pilot
            </h1>
            <p className="text-lg text-[color:var(--medha-text-secondary)] mb-8 max-w-2xl mx-auto">
              AI-driven Microsoft Teams interviewer that screens resumes, runs the meeting,
              and generates PS probe forms automatically — so you can focus on the conversation.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link
                href="/recruiter/screen"
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-teams-primary px-8 py-3.5 text-base font-semibold text-white shadow-lg shadow-teams-primary/30 hover:bg-teams-primary-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teams-primary transition-colors"
              >
                Screen a Candidate
              </Link>
              <Link
                href="/interviews"
                className="inline-flex items-center justify-center rounded-lg bg-white/40 px-8 py-3.5 text-base font-semibold text-teams-primary ring-1 ring-teams-primary/30 hover:bg-white/60 transition-colors"
              >
                Browse Interviews
              </Link>
            </div>
            <Link
              href="/interviews/new"
              className="mt-5 inline-block text-sm text-[color:var(--medha-text-secondary)] hover:text-teams-primary transition-colors"
            >
              Or create an interview manually →
            </Link>
          </div>
        </BentoCard>
      </BentoGrid>

      {/* Feature bento — 3 cards explaining the value prop. */}
      <BentoGrid>
        <BentoCard span="col-span-12 sm:col-span-4">
          <div className="flex items-start gap-3 mb-2">
            <div className="rounded-lg bg-teams-primary/10 p-2 text-teams-primary">
              <SparkleIcon className="h-5 w-5" />
            </div>
            <h3 className="font-semibold text-[color:var(--medha-text-primary)] mt-1">Auto question plans</h3>
          </div>
          <p className="text-sm text-[color:var(--medha-text-secondary)]">
            Generates round-specific questions tailored to the candidate&apos;s experience and JD.
          </p>
        </BentoCard>
        <BentoCard span="col-span-12 sm:col-span-4">
          <div className="flex items-start gap-3 mb-2">
            <div className="rounded-lg bg-teams-primary/10 p-2 text-teams-primary">
              <ChatIcon className="h-5 w-5" />
            </div>
            <h3 className="font-semibold text-[color:var(--medha-text-primary)] mt-1">Live Teams integration</h3>
          </div>
          <p className="text-sm text-[color:var(--medha-text-secondary)]">
            Posts questions directly to the Teams meeting chat for a guided interview flow.
          </p>
        </BentoCard>
        <BentoCard span="col-span-12 sm:col-span-4">
          <div className="flex items-start gap-3 mb-2">
            <div className="rounded-lg bg-teams-primary/10 p-2 text-teams-primary">
              <SendIcon className="h-5 w-5" />
            </div>
            <h3 className="font-semibold text-[color:var(--medha-text-primary)] mt-1">Instant probe form</h3>
          </div>
          <p className="text-sm text-[color:var(--medha-text-secondary)]">
            Analyses the transcript and emails the PS probe form the moment the meeting ends.
          </p>
        </BentoCard>
      </BentoGrid>
    </main>
  );
}
