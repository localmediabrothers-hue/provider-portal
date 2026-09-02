import { supabase } from "@/lib/supabase";

export type Tab = "enquiries" | "properties";

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
          <h1 className="font-display text-xl font-bold">Front Door</h1>
          <button onClick={signOut} className="text-sm font-medium text-muted hover:text-ink">
            Sign out
          </button>
        </div>
        <div className="max-w-4xl mx-auto px-6 flex gap-1">
          <TabButton active={tab === "enquiries"} onClick={() => onTabChange("enquiries")}>
            Enquiries
          </TabButton>
          <TabButton active={tab === "properties"} onClick={() => onTabChange("properties")}>
            Properties
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
