"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { Wordmark } from "@/components/Wordmark";
import { api } from "@/lib/client";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="card w-full max-w-sm p-6"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
          await api("/api/auth/login", { method: "POST", json: { token } });
          router.replace(params.get("next") || "/");
          router.refresh();
        } catch (err) {
          setError(err instanceof Error ? err.message : "Login failed");
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="eyebrow mb-2">Producer access</div>
      <input className="input" type="password" autoFocus placeholder="Access token" value={token} onChange={(e) => setToken(e.target.value)} />
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
      <button className="btn btn-primary mt-4 w-full" disabled={busy || !token}>
        Enter studio
      </button>
      <p className="mt-3 text-xs text-ivory-mute">The token is the STUDIO_ACCESS_TOKEN value from the server environment.</p>
    </form>
  );
}

export default function LoginPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 p-6">
      <Wordmark size="lg" />
      <Suspense>
        <LoginForm />
      </Suspense>
    </main>
  );
}
