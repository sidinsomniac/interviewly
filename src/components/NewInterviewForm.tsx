"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { z } from "zod";
import { Spinner } from "@/components/LoadingStates";

const FormSchema = z.object({
  candidateName: z.string().min(1, "Required"),
  candidateTotalYears: z.number().min(0).max(50),
  candidateRelevantYears: z.number().min(0).max(50),
  roleAppliedFor: z.string().min(1, "Required"),
  round: z.enum(["Core", "React"]),
  jdText: z.string().optional(),
  meetingTopic: z.string().min(1, "Required"),
});

type FormValues = z.infer<typeof FormSchema>;

export function NewInterviewForm() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(FormSchema),
    defaultValues: { round: "Core", candidateTotalYears: 3, candidateRelevantYears: 3 },
  });

  async function onSubmit(values: FormValues) {
    setSubmitting(true);
    try {
      const res = await fetch("/api/interviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error ?? "Unknown error");
      toast.success("Question plan generated!");
      router.push(`/interviews/${data.interview.id}/plan`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create interview");
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 bg-white rounded-xl border border-gray-200 shadow-sm p-6">
      <Field label="Candidate Name" error={errors.candidateName?.message}>
        <input {...register("candidateName")} className={input()} placeholder="Jane Doe" />
      </Field>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Total Years Experience" error={errors.candidateTotalYears?.message}>
          <input {...register("candidateTotalYears", { valueAsNumber: true })} type="number" min={0} max={50} className={input()} />
        </Field>
        <Field label="Relevant Years Experience" error={errors.candidateRelevantYears?.message}>
          <input {...register("candidateRelevantYears", { valueAsNumber: true })} type="number" min={0} max={50} className={input()} />
        </Field>
      </div>

      <Field label="Role Applied For" error={errors.roleAppliedFor?.message}>
        <input {...register("roleAppliedFor")} className={input()} placeholder="Senior Experience Engineer" />
      </Field>

      <Field label="Interview Round" error={errors.round?.message}>
        <select {...register("round")} className={input()}>
          <option value="Core">Core (HTML, CSS &amp; NFRs)</option>
          <option value="React">Framework React</option>
        </select>
      </Field>

      <Field label="Job Description (optional)" error={errors.jdText?.message}>
        <textarea
          {...register("jdText")}
          rows={4}
          className={input()}
          placeholder="Paste JD text here to improve question relevance…"
        />
      </Field>

      <Field label="Meeting Subject / Topic" error={errors.meetingTopic?.message}>
        <input
          {...register("meetingTopic")}
          className={input()}
          placeholder="e.g. Interview – Jane Doe"
        />
        <p className="mt-1 text-xs text-gray-400">
          The subject of the Teams meeting you scheduled. The bot finds the meeting chat by matching this text. Tip: this is the calendar event&apos;s subject line in Outlook.
        </p>
      </Field>

      <button
        type="submit"
        disabled={submitting}
        className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
      >
        {submitting ? (
          <>
            <Spinner size="sm" />
            Generating Question Plan…
          </>
        ) : (
          "Generate Question Plan"
        )}
      </button>
    </form>
  );
}

function input() {
  return "block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500";
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      {children}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
