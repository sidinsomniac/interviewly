import { notFound } from "next/navigation";
import { store } from "@/lib/store";
import { getRoleSchema } from "@/lib/probeform/registry";
import { QuestionPlanView } from "@/components/QuestionPlanView";

export const dynamic = "force-dynamic";

export default async function PlanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const interview = store.get(id);
  if (!interview) notFound();

  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <div className="mb-8">
        <p className="text-sm text-gray-500 mb-1">Question Plan</p>
        <h1 className="text-2xl font-bold text-gray-900">{interview.candidateName}</h1>
        <p className="text-sm text-gray-500 mt-1">
          {interview.roleAppliedFor} · {getRoleSchema(interview.roleId)?.displayName ?? interview.roleId}
        </p>
      </div>
      <QuestionPlanView interview={interview} />
    </div>
  );
}
