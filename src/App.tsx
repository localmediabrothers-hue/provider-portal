import { useSession } from "@/lib/useSession";
import Login from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";

export default function App() {
  const { session, loading } = useSession();

  if (loading) {
    return <div className="min-h-screen grid place-items-center text-muted">Loading…</div>;
  }

  return session ? <Dashboard /> : <Login />;
}
