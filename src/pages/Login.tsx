import { useState } from "react";
import { supabase } from "@/lib/supabase";

const ADMIN_EMAIL = "localmediabrothers@gmail.com";

export default function Login() {
  const [mode, setMode] = useState<"password" | "emailLink">("password");
  const [password, setPassword] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  async function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSending(true);
    const { error } = await supabase.auth.signInWithPassword({ email: ADMIN_EMAIL, password });
    setSending(false);
    if (error) {
      setError(error.message === "Invalid login credentials" ? "Wrong password." : error.message);
      return;
    }
  }

  async function handleEmailLink() {
    setError(null);
    setSending(true);
    const { error } = await supabase.auth.signInWithOtp({
      email: ADMIN_EMAIL,
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
        <h1 className="font-display text-3xl font-extrabold tracking-tight">My Room Link</h1>
        <p className="text-muted mt-1 mb-8">Provider portal</p>

        {sent ? (
          <div className="border border-line rounded-xl bg-surface p-6">
            <h2 className="font-display font-bold text-lg">Check your email</h2>
            <p className="text-muted text-sm mt-2">
              We've sent a sign-in link to <strong className="text-ink">{ADMIN_EMAIL}</strong>. Open it on this
              device to get in.
            </p>
          </div>
        ) : mode === "password" ? (
          <form onSubmit={handlePasswordSubmit} className="border border-line rounded-xl bg-surface p-6 grid gap-4">
            <div>
              <label htmlFor="password" className="block font-semibold text-sm mb-1.5">
                Password
              </label>
              <input
                id="password"
                type="password"
                required
                autoFocus
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full border-2 border-line rounded-lg px-3 py-2.5 focus:outline-none focus:border-accent"
              />
            </div>
            {error && <p className="text-sm text-red-700">{error}</p>}
            <button
              type="submit"
              disabled={sending}
              className="bg-accent text-white font-semibold rounded-lg py-2.5 disabled:opacity-60"
            >
              {sending ? "Logging in…" : "Log in"}
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("emailLink");
                setError(null);
              }}
              className="text-sm text-muted hover:text-ink text-center"
            >
              Forgot it, or no password set yet? Email me a login link
            </button>
          </form>
        ) : (
          <div className="border border-line rounded-xl bg-surface p-6 grid gap-4">
            <p className="text-sm text-muted">
              We'll send a one-click sign-in link to <strong className="text-ink">{ADMIN_EMAIL}</strong>. Once
              you're in, set a password under "Set password" at the top so next time is instant.
            </p>
            {error && <p className="text-sm text-red-700">{error}</p>}
            <button
              type="button"
              onClick={handleEmailLink}
              disabled={sending}
              className="bg-accent text-white font-semibold rounded-lg py-2.5 disabled:opacity-60"
            >
              {sending ? "Sending…" : "Send me a login link"}
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("password");
                setError(null);
              }}
              className="text-sm text-muted hover:text-ink text-center"
            >
              Back to password
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
