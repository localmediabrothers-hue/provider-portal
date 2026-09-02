import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import type { EnquiryWithProperty } from "@/types";

const STATUS_LABEL: Record<string, { label: string; className: string }> = {
  new: { label: "Needs a decision", className: "bg-warn-soft text-warn" },
  approved: { label: "Approved — form sent", className: "bg-accent-soft text-accent" },
  form_sent: { label: "Form sent", className: "bg-accent-soft text-accent" },
  declined: { label: "Declined", className: "bg-line text-muted" },
};

export default function Dashboard() {
  const [enquiries, setEnquiries] = useState<EnquiryWithProperty[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"new" | "all">("new");

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("enquiries")
      .select("*, properties(id, title, address)")
      .order("created_at", { ascending: false });
    if (error) {
      setError(error.message);
    } else {
      setEnquiries((data ?? []) as unknown as EnquiryWithProperty[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function approve(id: string) {
    setBusyId(id);
    setError(null);
    const { data, error } = await supabase.functions.invoke("approve-enquiry", {
      body: { enquiry_id: id },
    });
    setBusyId(null);
    if (error) {
      setError(`Couldn't approve that one: ${error.message}`);
      return;
    }
    if (data?.error) {
      setError(data.error);
      return;
    }
    await load();
  }

  async function decline(id: string) {
    setBusyId(id);
    setError(null);
    const { error } = await supabase.from("enquiries").update({ status: "declined" }).eq("id", id);
    setBusyId(null);
    if (error) {
      setError(`Couldn't decline that one: ${error.message}`);
      return;
    }
    await load();
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  const visible = filter === "new" ? enquiries.filter((e) => e.status === "new") : enquiries;

  return (
    <div className="min-h-screen">
      <header className="border-b border-line bg-surface">
        <div className="max-w-4xl mx-auto px-6 py-5 flex items-center justify-between">
          <h1 className="font-display text-xl font-bold">Front Door — enquiries</h1>
          <button onClick={signOut} className="text-sm font-medium text-muted hover:text-ink">
            Sign out
          </button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8">
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => setFilter("new")}
            className={`px-4 py-2 rounded-full text-sm font-semibold border-2 ${
              filter === "new" ? "bg-accent text-white border-accent" : "border-line"
            }`}
          >
            Needs a decision
          </button>
          <button
            onClick={() => setFilter("all")}
            className={`px-4 py-2 rounded-full text-sm font-semibold border-2 ${
              filter === "all" ? "bg-accent text-white border-accent" : "border-line"
            }`}
          >
            Everything
          </button>
        </div>

        {error && (
          <div className="border-2 border-red-200 bg-red-50 text-red-800 rounded-lg px-4 py-3 mb-6 text-sm">
            {error}
          </div>
        )}

        {loading ? (
          <p className="text-muted">Loading…</p>
        ) : visible.length === 0 ? (
          <div className="border border-dashed border-line rounded-xl p-10 text-center text-muted">
            Nothing here right now.
          </div>
        ) : (
          <div className="grid gap-4">
            {visible.map((e) => (
              <EnquiryCard
                key={e.id}
                enquiry={e}
                busy={busyId === e.id}
                onApprove={() => approve(e.id)}
                onDecline={() => decline(e.id)}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function EnquiryCard({
  enquiry,
  busy,
  onApprove,
  onDecline,
}: {
  enquiry: EnquiryWithProperty;
  busy: boolean;
  onApprove: () => void;
  onDecline: () => void;
}) {
  const status = STATUS_LABEL[enquiry.status] ?? STATUS_LABEL.new;
  const when = new Date(enquiry.created_at).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <article className="border border-line rounded-xl bg-surface p-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="font-display font-bold text-lg">{enquiry.tenant_name}</h2>
          <p className="text-muted text-sm mt-0.5">
            {enquiry.properties.title} · {enquiry.properties.address}
          </p>
        </div>
        <span className={`text-xs font-bold px-2.5 py-1 rounded-md whitespace-nowrap ${status.className}`}>
          {status.label}
        </span>
      </div>

      <dl className="grid sm:grid-cols-3 gap-3 mt-4 text-sm">
        <div>
          <dt className="text-muted">Phone</dt>
          <dd className="font-medium">
            <a href={`tel:${enquiry.tenant_phone}`} className="text-accent">
              {enquiry.tenant_phone}
            </a>
          </dd>
        </div>
        <div>
          <dt className="text-muted">Email</dt>
          <dd className="font-medium">{enquiry.tenant_email ?? "Not given"}</dd>
        </div>
        <div>
          <dt className="text-muted">Best time</dt>
          <dd className="font-medium">{enquiry.best_time ?? "Any time"}</dd>
        </div>
      </dl>

      {enquiry.message && (
        <p className="mt-4 text-sm bg-paper border border-line rounded-lg px-3 py-2.5">{enquiry.message}</p>
      )}

      <p className="mt-3 text-xs text-muted">Sent {when}</p>

      {enquiry.status === "new" && (
        <div className="flex gap-3 mt-4">
          <button
            onClick={onApprove}
            disabled={busy}
            className="flex-1 bg-accent text-white font-semibold rounded-lg py-2.5 text-sm disabled:opacity-60"
          >
            {busy ? "Sending…" : "Approve — send eligibility form"}
          </button>
          <button
            onClick={onDecline}
            disabled={busy}
            className="px-5 border-2 border-line rounded-lg font-semibold text-sm disabled:opacity-60"
          >
            Decline
          </button>
        </div>
      )}
    </article>
  );
}
