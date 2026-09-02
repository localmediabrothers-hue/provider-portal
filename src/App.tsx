import { useState } from "react";
import { useSession } from "@/lib/useSession";
import Login from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import Properties from "@/pages/Properties";
import Layout, { type Tab } from "@/components/Layout";

export default function App() {
  const { session, loading } = useSession();
  const [tab, setTab] = useState<Tab>("enquiries");

  if (loading) {
    return <div className="min-h-screen grid place-items-center text-muted">Loading…</div>;
  }

  if (!session) return <Login />;

  return (
    <Layout tab={tab} onTabChange={setTab}>
      {tab === "enquiries" ? <Dashboard /> : <Properties />}
    </Layout>
  );
}
