import { useState } from "react";
import { supabase } from "@/lib/supabase";

export default function Login() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSending(true);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    });
    setSending(false);
    if (error) {
      setError(error.message);
      return;
    }
    setSent(true);
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <h1 className="font-display text-3xl font-extrabold tracking-tight">Front Door</h1>
        <p className="text-muted mt-1 mb-8">Provider portal</p>

        {sent ? (
          <div className="border border-line rounded-xl bg-surface p-6">
            <h2 className="font-display font-bold text-lg">Check your email</h2>
            <p className="text-muted text-sm mt-2">
              We've sent a sign-in link to <strong className="text-ink">{email}</strong>. Open it on this device to
              get in — no password needed.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="border border-line rounded-xl bg-surface p-6 grid gap-4">
            <div>
              <label htmlFor="email" className="block font-semibold text-sm mb-1.5">
                Work email
              </label>
              <input
                id="email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full border-2 border-line rounded-lg px-3 py-2.5 focus:outline-none focus:border-accent"
              />
            </div>
            {error && <p className="text-sm text-red-700">{error}</p>}
            <button
              type="submit"
              disabled={sending}
              className="bg-accent text-white font-semibold rounded-lg py-2.5 disabled:opacity-60"
            >
              {sending ? "Sending…" : "Send me a login link"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
