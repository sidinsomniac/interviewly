import { notFound } from "next/navigation";
import { store } from "@/lib/store";
import { ResultClient } from "@/components/ResultClient";

export const dynamic = "force-dynamic";

export default async function ResultPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const interview = store.get(id);
  if (!interview) notFound();

  return (
    <div className="max-w-2xl mx-auto px-4 py-10">
      <ResultClient interview={interview} />
    </div>
  );
}
