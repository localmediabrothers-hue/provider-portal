import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/lib/useSession";
import type { EnquiryNote, EnquiryStatus, EnquiryWithProperty } from "@/types";
import { whatsappLink } from "@/lib/whatsapp";

const STATUS: Record<EnquiryStatus, { label: string; className: string }> = {
  new: { label: "Needs a decision", className: "bg-warn-soft text-warn" },
  approved: { label: "Eligibility form sent", className: "bg-accent-soft text-accent" },
  form_returned: { label: "Form returned", className: "bg-accent-soft text-accent" },
  eligible: { label: "Eligible", className: "bg-accent-soft text-accent" },
  viewing_booked: { label: "Viewing booked", className: "bg-accent-soft text-accent" },
  moved_in: { label: "Moved in", className: "bg-accent text-white" },
  not_eligible: { label: "Not eligible", className: "bg-line text-muted" },
  declined: { label: "Declined", className: "bg-line text-muted" },
  withdrawn: { label: "Withdrawn", className: "bg-line text-muted" },
};

/* Where each stage can go next. Approving isn't here — it's the one move that
   emails the tenant, so it only happens through the approve-enquiry function. */
const NEXT_STAGES: Record<EnquiryStatus, EnquiryStatus[]> = {
  new: [],
  approved: ["form_returned", "withdrawn"],
  form_returned: ["eligible", "not_eligible", "withdrawn"],
  eligible: ["viewing_booked", "not_eligible", "withdrawn"],
  viewing_booked: ["moved_in", "withdrawn"],
  moved_in: [],
  not_eligible: [],
  declined: [],
  withdrawn: [],
};

const IN_PROGRESS: EnquiryStatus[] = ["approved", "form_returned", "eligible", "viewing_booked"];
const CLOSED: EnquiryStatus[] = ["moved_in", "not_eligible", "declined", "withdrawn"];

type Filter = "new" | "progress" | "closed" | "all";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "new", label: "Needs a decision" },
  { key: "progress", label: "In progress" },
  { key: "closed", label: "Closed" },
  { key: "all", label: "Everything" },
];

export default function Dashboard() {
  const { session } = useSession();
  const [enquiries, setEnquiries] = useState<EnquiryWithProperty[]>([]);
  const [notes, setNotes] = useState<EnquiryNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("new");

  const load = useCallback(async () => {
    setLoading(true);
    const [enquiriesRes, notesRes] = await Promise.all([
      supabase.from("enquiries").select("*, properties(id, title, address)").order("created_at", { ascending: false }),
      supabase.from("enquiry_notes").select("*").order("created_at", { ascending: true }),
    ]);
    if (enquiriesRes.error) {
      setError(enquiriesRes.error.message);
    } else {
      setEnquiries((enquiriesRes.data ?? []) as unknown as EnquiryWithProperty[]);
      setNotes((notesRes.data ?? []) as EnquiryNote[]);
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

  async function moveTo(id: string, status: EnquiryStatus) {
    setBusyId(id);
    setError(null);
    const { error } = await supabase.from("enquiries").update({ status }).eq("id", id);
    setBusyId(null);
    if (error) {
      setError(`Couldn't update that one: ${error.message}`);
      return;
    }
    await load();
  }

  async function addNote(enquiryId: string, body: string) {
    if (!session) return;
    const { error } = await supabase
      .from("enquiry_notes")
      .insert({ enquiry_id: enquiryId, provider_id: session.user.id, body });
    if (error) {
      setError(`Couldn't save that note: ${error.message}`);
      return;
    }
    await load();
  }

  const counts = {
    new: enquiries.filter((e) => e.status === "new").length,
    progress: enquiries.filter((e) => IN_PROGRESS.includes(e.status)).length,
    closed: enquiries.filter((e) => CLOSED.includes(e.status)).length,
    all: enquiries.length,
  };

  const visible = enquiries.filter((e) => {
    if (filter === "new") return e.status === "new";
    if (filter === "progress") return IN_PROGRESS.includes(e.status);
    if (filter === "closed") return CLOSED.includes(e.status);
    return true;
  });

  return (
    <div>
      <div className="flex items-center gap-2 mb-6 flex-wrap">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`px-4 py-2 rounded-full text-sm font-semibold border-2 ${
              filter === f.key ? "bg-accent text-white border-accent" : "border-line"
            }`}
          >
            {f.label}
            {counts[f.key] > 0 && (
              <span className={filter === f.key ? "ml-1.5 opacity-80" : "ml-1.5 text-muted"}>{counts[f.key]}</span>
            )}
          </button>
        ))}
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
              notes={notes.filter((n) => n.enquiry_id === e.id)}
              busy={busyId === e.id}
              onApprove={() => approve(e.id)}
              onMoveTo={(status) => moveTo(e.id, status)}
              onAddNote={(body) => addNote(e.id, body)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function EnquiryCard({
  enquiry,
  notes,
  busy,
  onApprove,
  onMoveTo,
  onAddNote,
}: {
  enquiry: EnquiryWithProperty;
  notes: EnquiryNote[];
  busy: boolean;
  onApprove: () => void;
  onMoveTo: (status: EnquiryStatus) => void;
  onAddNote: (body: string) => void;
}) {
  const [showNotes, setShowNotes] = useState(false);
  const [draft, setDraft] = useState("");
  const status = STATUS[enquiry.status] ?? STATUS.new;
  const nextStages = NEXT_STAGES[enquiry.status] ?? [];

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

      <dl className="grid sm:grid-cols-4 gap-3 mt-4 text-sm">
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
          <dd className="font-medium break-words">{enquiry.tenant_email ?? "Not given"}</dd>
        </div>
        <div>
          <dt className="text-muted">Best time</dt>
          <dd className="font-medium">{enquiry.best_time ?? "Any time"}</dd>
        </div>
        <div>
          <dt className="text-muted">Claiming benefits</dt>
          <dd className="font-medium">
            {enquiry.claiming_benefits === null ? "Not given" : enquiry.claiming_benefits ? "Yes" : "No"}
          </dd>
        </div>
      </dl>

      <a
        href={whatsappLink(
          enquiry.tenant_phone,
          `Hi ${enquiry.tenant_name}, thanks for your interest in ${enquiry.properties.title} at ${enquiry.properties.address} - when are you free for a viewing?`,
        )}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-2 mt-3 text-sm font-semibold text-accent"
      >
        <WhatsAppIcon /> Message on WhatsApp
      </a>

      {enquiry.message && (
        <p className="mt-4 text-sm bg-paper border border-line rounded-lg px-3 py-2.5">{enquiry.message}</p>
      )}

      <p className="mt-3 text-xs text-muted">
        Enquired {formatWhen(enquiry.created_at)}
        {enquiry.status !== "new" && ` · at this stage since ${formatWhen(enquiry.status_changed_at)}`}
      </p>

      {enquiry.status === "new" && (
        <div className="flex gap-3 mt-4 flex-wrap">
          <button
            onClick={onApprove}
            disabled={busy}
            className="flex-1 min-w-[220px] bg-accent text-white font-semibold rounded-lg py-2.5 text-sm disabled:opacity-60"
          >
            {busy ? "Sending…" : "Approve — send eligibility form"}
          </button>
          <button
            onClick={() => onMoveTo("declined")}
            disabled={busy}
            className="px-5 border-2 border-line rounded-lg font-semibold text-sm disabled:opacity-60"
          >
            Decline
          </button>
        </div>
      )}

      {nextStages.length > 0 && (
        <div className="flex items-center gap-2 mt-4 flex-wrap">
          <span className="text-sm text-muted">Move to:</span>
          {nextStages.map((s) => (
            <button
              key={s}
              onClick={() => onMoveTo(s)}
              disabled={busy}
              className="px-3 py-1.5 border-2 border-line rounded-lg text-sm font-semibold disabled:opacity-60 hover:border-accent"
            >
              {STATUS[s].label}
            </button>
          ))}
        </div>
      )}

      <div className="mt-4 pt-4 border-t border-line">
        <button
          type="button"
          onClick={() => setShowNotes((v) => !v)}
          className="text-sm font-semibold text-accent"
        >
          {showNotes ? "Hide notes" : `Notes${notes.length ? ` (${notes.length})` : ""}`}
        </button>

        {showNotes && (
          <div className="mt-3">
            {notes.length > 0 && (
              <ul className="grid gap-2 mb-3">
                {notes.map((n) => (
                  <li key={n.id} className="text-sm bg-paper border border-line rounded-lg px-3 py-2">
                    <p className="whitespace-pre-wrap">{n.body}</p>
                    <p className="text-xs text-muted mt-1">{formatWhen(n.created_at)}</p>
                  </li>
                ))}
              </ul>
            )}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const body = draft.trim();
                if (!body) return;
                setDraft("");
                onAddNote(body);
              }}
              className="flex gap-2"
            >
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="e.g. Rang Tuesday, no answer — trying again Thursday"
                className="flex-1 min-w-0 border-2 border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent"
              />
              <button
                type="submit"
                disabled={!draft.trim()}
                className="px-4 bg-accent text-white font-semibold rounded-lg text-sm disabled:opacity-40"
              >
                Add
              </button>
            </form>
          </div>
        )}
      </div>
    </article>
  );
}

function WhatsAppIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
      <path d="M12 2a10 10 0 0 0-8.6 15L2 22l5.2-1.4A10 10 0 1 0 12 2zm0 18.2a8.2 8.2 0 0 1-4.2-1.1l-.3-.2-3.1.8.8-3-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.4-.7-1.7-.8-.2-.1-.4-.1-.6.1-.2.3-.6.8-.8 1-.1.2-.3.2-.5.1-.2-.1-1-.4-1.9-1.2-.7-.6-1.2-1.4-1.3-1.6-.1-.2 0-.4.1-.5l.4-.4c.1-.1.2-.3.2-.4.1-.1 0-.3 0-.4-.1-.1-.6-1.4-.8-1.9-.2-.5-.4-.4-.6-.4h-.5c-.2 0-.4.1-.6.3-.2.3-.8.8-.8 1.9s.8 2.2.9 2.4c.1.2 1.6 2.4 3.8 3.4.5.2.9.4 1.3.5.5.2 1 .1 1.3.1.4-.1 1.4-.6 1.6-1.1.2-.5.2-1 .1-1.1-.1-.1-.2-.2-.4-.3z"/>
    </svg>
  );
}

function formatWhen(iso: string) {
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}
