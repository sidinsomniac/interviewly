"use client";

import Link from "next/link";
import type { InterviewMetadata } from "@/types/index";

export function QuestionPlanView({ interview }: { interview: InterviewMetadata }) {
  const { questionPlan, id } = interview;

  if (!questionPlan) {
    return <p className="text-gray-500">No question plan available.</p>;
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        <div className="divide-y divide-gray-100">
          {questionPlan.questions.map((q, i) => (
            <div key={q.rowIndex} className="p-4 flex gap-4">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center text-sm font-semibold text-blue-700">
                {i + 1}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-semibold text-gray-900">{q.competencyName}</span>
                  <span className={`text-xs rounded-full px-2 py-0.5 font-medium ${q.rubricType === "architecture" ? "bg-purple-100 text-purple-700" : "bg-teal-100 text-teal-700"}`}>
                    {q.rubricType}
                  </span>
                  <span className="text-xs text-gray-400">row {q.rowIndex}</span>
                </div>
                <p className="text-sm text-gray-700 leading-relaxed">{q.questionText}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex gap-4">
        <Link
          href={`/interviews/${id}/live`}
          className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 transition-colors"
        >
          Start Interview
        </Link>
        <Link
          href="/interviews"
          className="inline-flex items-center justify-center rounded-lg bg-white px-6 py-2.5 text-sm font-semibold text-gray-700 ring-1 ring-gray-300 hover:bg-gray-50 transition-colors"
        >
          Back to List
        </Link>
      </div>
    </div>
  );
}
