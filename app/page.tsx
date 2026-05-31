import Link from "next/link";

export default function Home() {
  return (
    <main className="flex flex-col flex-1 items-center justify-center px-4 py-16">
      <div className="text-center max-w-2xl">
        <div className="mb-4 inline-flex items-center rounded-full bg-blue-50 px-3 py-1 text-sm font-medium text-blue-700 ring-1 ring-blue-200">
          AI-powered interviewing
        </div>
        <h1 className="text-5xl font-bold tracking-tight text-gray-400 mb-4">Medha</h1>
        <p className="text-xl text-gray-500 mb-10">
          AI-driven Microsoft Teams interviewer that generates PS probe forms automatically — so you can focus on the conversation.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link
            href="/recruiter/screen"
            className="inline-flex items-center justify-center rounded-lg bg-indigo-600 px-8 py-3.5 text-base font-semibold text-white shadow-sm hover:bg-indigo-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 transition-colors"
          >
            🤖 Screen a Candidate
          </Link>
          <Link
            href="/interviews/new"
            className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-8 py-3.5 text-base font-semibold text-white shadow-sm hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 transition-colors"
          >
            Create New Interview
          </Link>
          <Link
            href="/interviews"
            className="inline-flex items-center justify-center rounded-lg bg-white px-8 py-3.5 text-base font-semibold text-gray-700 shadow-sm ring-1 ring-gray-300 hover:bg-gray-50 transition-colors"
          >
            View History
          </Link>
        </div>
      </div>

      <div className="mt-20 grid grid-cols-1 sm:grid-cols-3 gap-8 max-w-3xl w-full text-center">
        {[
          { title: "Auto Question Plans", desc: "Generates round-specific questions tailored to the candidate's experience and JD." },
          { title: "Live Teams Integration", desc: "Posts questions directly to the Teams meeting chat for a guided interview flow." },
          { title: "Instant Probe Form", desc: "Analyses the transcript and fills the PS probe form the moment the meeting ends." },
        ].map(({ title, desc }) => (
          <div key={title} className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <h3 className="font-semibold text-gray-900 mb-2">{title}</h3>
            <p className="text-sm text-gray-500">{desc}</p>
          </div>
        ))}
      </div>
    </main>
  );
}
