import { notFound } from "next/navigation";
import { store } from "@/lib/store";
import { LiveDashboard } from "@/components/LiveDashboard";

export const dynamic = "force-dynamic";

export default async function LivePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const interview = store.get(id);
  if (!interview) notFound();

  return <LiveDashboard interview={interview} />;
}
