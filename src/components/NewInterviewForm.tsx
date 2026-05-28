"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { z } from "zod";
import { Spinner } from "@/components/LoadingStates";
import { listRoles } from "@/lib/probeform/registry";

const AVAILABLE_ROLES = listRoles();

const FormSchema = z.object({
  candidateName: z.string().min(1, "Required"),
  candidateTotalYears: z.number().min(0).max(50),
  candidateRelevantYears: z.number().min(0).max(50),
  roleAppliedFor: z.string().min(1, "Required"),
  roleId: z.string().min(1, "Required"),
  jdText: z.string().optional(),
  meetingTopic: z.string().min(1, "Required"),
});

type FormValues = z.infer<typeof FormSchema>;

export function NewInterviewForm() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  // Sub-Phase E: when /api/interviews returns 409 we keep the user on
  // the form and render an inline notice linking to the existing record
  // instead of throwing a toast and forgetting it.
  const [duplicate, setDuplicate] = useState<{ id: string; message: string } | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      roleId: AVAILABLE_ROLES[0]?.roleId ?? "react",
      candidateTotalYears: 3,
      candidateRelevantYears: 3,
    },
  });

  async function onSubmit(values: FormValues) {
    setSubmitting(true);
    setDuplicate(null);
    try {
      const res = await fetch("/api/interviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const data = await res.json();

      // Sub-Phase E dup-guard: 409 with existingInterviewId → inline notice.
      if (res.status === 409 && data?.existingInterviewId) {
        setDuplicate({ id: data.existingInterviewId, message: data.error ?? "Interview already exists" });
        setSubmitting(false);
        return;
      }

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
      {duplicate && (
        <div role="alert" className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <p className="font-medium">{duplicate.message}</p>
          <Link
            href={`/interviews/${duplicate.id}/plan`}
            className="mt-1 inline-block text-amber-800 underline hover:text-amber-900"
          >
            Open the existing interview →
          </Link>
        </div>
      )}
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

      <Field label="Role" error={errors.roleId?.message}>
        <select {...register("roleId")} className={input()}>
          {AVAILABLE_ROLES.map((schema) => (
            <option key={schema.roleId} value={schema.roleId}>
              {schema.displayName}
            </option>
          ))}
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
