import { notFound, redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { buildSnapshot } from "@/lib/snapshot";
import { ensureWorker } from "@/lib/worker";
import { Workspace } from "@/components/Workspace";

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) redirect("/login");
  const { id } = await params;

  const snapshot = buildSnapshot(user.id, id);
  if (!snapshot) notFound();

  ensureWorker();
  return <Workspace id={id} initialData={snapshot} />;
}
