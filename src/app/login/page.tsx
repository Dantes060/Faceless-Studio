import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/AuthForm";
import { currentUser } from "@/lib/auth";

export default async function LoginPage() {
  if (await currentUser()) redirect("/studio");
  return (
    <main className="grid min-h-screen place-items-center px-6 py-12">
      <div className="w-full max-w-sm">
        <Link href="/" className="mb-6 flex items-center gap-2 text-sm font-bold">
          <span className="grid h-6 w-6 place-items-center rounded-md bg-lime-400 text-[11px] font-black text-ink-950">
            FS
          </span>
          Faceless Studio
        </Link>
        <AuthForm mode="login" />
      </div>
    </main>
  );
}
