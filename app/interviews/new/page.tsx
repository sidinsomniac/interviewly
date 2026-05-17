import { NewInterviewForm } from "@/components/NewInterviewForm";

export default function NewInterviewPage() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-10">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">New Interview</h1>
        <p className="text-sm text-gray-500 mt-1">Fill in the details to generate a question plan.</p>
      </div>
      <NewInterviewForm />
    </div>
  );
}
