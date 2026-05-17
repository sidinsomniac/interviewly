import Link from "next/link";
import { store } from "@/lib/store";
import { StatusBadge } from "@/components/LoadingStates";
import { format } from "date-fns";

export const dynamic = "force-dynamic";

export default function InterviewsPage() {
  const interviews = store.list().sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  return (
    <div className="max-w-5xl mx-auto px-4 py-10">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Interviews</h1>
          <p className="text-sm text-gray-500 mt-1">{interviews.length} total</p>
        </div>
        <Link
          href="/interviews/new"
          className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 transition-colors"
        >
          + New Interview
        </Link>
      </div>

      {interviews.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white py-16 text-center">
          <p className="text-gray-500 mb-4">No interviews yet.</p>
          <Link href="/interviews/new" className="text-blue-600 font-medium hover:underline">
            Create your first interview
          </Link>
        </div>
      ) : (
        <div className="rounded-xl border border-gray-200 bg-white overflow-hidden shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {["Candidate", "Role", "Round", "Status", "Date", "Actions"].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {interviews.map((iv) => (
                <tr key={iv.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-gray-900">{iv.candidateName}</td>
                  <td className="px-4 py-3 text-gray-600 max-w-[180px] truncate">{iv.roleAppliedFor}</td>
                  <td className="px-4 py-3 text-gray-600">{iv.round}</td>
                  <td className="px-4 py-3"><StatusBadge status={iv.status} /></td>
                  <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                    {format(new Date(iv.createdAt), "MMM d, yyyy")}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <Link href={`/interviews/${iv.id}/plan`} className="text-blue-600 hover:underline">
                        View
                      </Link>
                      {iv.status === "completed" && (
                        <a
                          href={`/api/interviews/${iv.id}/probe-form`}
                          className="text-green-600 hover:underline"
                        >
                          Download
                        </a>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
