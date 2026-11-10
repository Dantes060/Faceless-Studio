import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/AuthForm";
import { currentUser } from "@/lib/auth";
import { ALLOW_SIGNUP, SIGNUP_FREE_CREDITS } from "@/lib/config";

export default async function SignupPage() {
  if (await currentUser()) redirect("/studio");
  if (!ALLOW_SIGNUP) redirect("/login");
  return (
    <main className="grid min-h-screen place-items-center px-6 py-12">
      <div className="w-full max-w-sm">
        <Link href="/" className="mb-6 flex items-center gap-2 text-sm font-bold">
          <span className="grid h-6 w-6 place-items-center rounded-md bg-lime-400 text-[11px] font-black text-ink-950">
            FS
          </span>
          Faceless Studio
        </Link>
        <AuthForm mode="signup" />
        {SIGNUP_FREE_CREDITS > 0 && (
          <p className="mt-4 text-center text-xs text-ink-500">
            New accounts start with {SIGNUP_FREE_CREDITS} credits.
          </p>
        )}
      </div>
    </main>
  );
}
