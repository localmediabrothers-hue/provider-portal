import { useState } from "react";
import { supabase } from "@/lib/supabase";

export type Tab = "enquiries" | "properties" | "waitlist" | "leads" | "analytics";

export default function Layout({
  tab,
  onTabChange,
  children,
}: {
  tab: Tab;
  onTabChange: (tab: Tab) => void;
  children: React.ReactNode;
}) {
  async function signOut() {
    await supabase.auth.signOut();
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-line bg-surface">
        <div className="max-w-4xl mx-auto px-6 py-5 flex items-center justify-between">
          <h1 className="font-display text-xl font-bold">My Room Link</h1>
          <div className="flex items-center gap-4">
            <SetPassword />
            <button onClick={signOut} className="text-sm font-medium text-muted hover:text-ink">
              Sign out
            </button>
          </div>
        </div>
        <div className="max-w-4xl mx-auto px-6 flex gap-1">
          <TabButton active={tab === "enquiries"} onClick={() => onTabChange("enquiries")}>
            Enquiries
          </TabButton>
          <TabButton active={tab === "properties"} onClick={() => onTabChange("properties")}>
            Properties
          </TabButton>
          <TabButton active={tab === "waitlist"} onClick={() => onTabChange("waitlist")}>
            Waiting list
          </TabButton>
          <TabButton active={tab === "leads"} onClick={() => onTabChange("leads")}>
            Provider leads
          </TabButton>
          <TabButton active={tab === "analytics"} onClick={() => onTabChange("analytics")}>
            Analytics
          </TabButton>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8">{children}</main>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px ${
        active ? "border-accent text-accent" : "border-transparent text-muted hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}

/* Lets you (re)set the password used on the login screen, so a magic-link
   sign-in (the only way in before a password exists, or after forgetting
   one) can be turned into an instant password login going forward. */
function SetPassword() {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("Use at least 8 characters.");
      return;
    }
    setSaving(true);
    const { error } = await supabase.auth.updateUser({ password });
    setSaving(false);
    if (error) {
      setError(error.message);
      return;
    }
    setDone(true);
    setPassword("");
  }

  if (!open) {
    return (
      <button
        onClick={() => {
          setOpen(true);
          setDone(false);
        }}
        className="text-sm font-medium text-muted hover:text-ink"
      >
        Set password
      </button>
    );
  }

  return (
    <div className="relative">
      <button onClick={() => setOpen(false)} className="text-sm font-medium text-ink">
        Set password
      </button>
      <form
        onSubmit={handleSubmit}
        className="absolute right-0 mt-2 w-72 border border-line rounded-xl bg-surface p-4 shadow-lg grid gap-3 z-10"
      >
        {done ? (
          <p className="text-sm text-good font-medium">Password updated — use it next time you log in.</p>
        ) : (
          <>
            <label htmlFor="newPassword" className="block font-semibold text-sm">
              New password
            </label>
            <input
              id="newPassword"
              type="password"
              autoFocus
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border-2 border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent"
            />
            {error && <p className="text-xs text-red-700">{error}</p>}
            <button
              type="submit"
              disabled={saving}
              className="bg-accent text-white font-semibold rounded-lg py-2 text-sm disabled:opacity-60"
            >
              {saving ? "Saving…" : "Save password"}
            </button>
          </>
        )}
      </form>
    </div>
  );
}
