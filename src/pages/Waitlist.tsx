import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { whatsappLink } from "@/lib/whatsapp";
import { matchesWaitlist } from "@/lib/matching";
import type { Property, WaitlistSignup } from "@/types";

export default function Waitlist() {
  const [signups, setSignups] = useState<WaitlistSignup[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [signupsRes, propertiesRes] = await Promise.all([
      supabase.from("waitlist_signups").select("*").order("created_at", { ascending: false }),
      supabase.from("properties").select("*").eq("active", true).order("created_at", { ascending: false }),
    ]);
    if (signupsRes.error) setError(signupsRes.error.message);
    setSignups((signupsRes.data as WaitlistSignup[]) ?? []);
    setProperties((propertiesRes.data as Property[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function markNotified(id: string) {
    await supabase.from("waitlist_signups").update({ notified: true }).eq("id", id);
    setSignups((rows) => rows.map((r) => (r.id === id ? { ...r, notified: true } : r)));
  }

  async function saveNote(id: string, note: string) {
    const { error } = await supabase.from("waitlist_signups").update({ operator_note: note }).eq("id", id);
    if (error) {
      setError(`Couldn't save that note: ${error.message}`);
      return;
    }
    setSignups((rows) => rows.map((r) => (r.id === id ? { ...r, operator_note: note } : r)));
  }

  return (
    <div>
      <div className="mb-6">
        <h2 className="font-display font-bold text-xl">Waiting list</h2>
        <p className="text-muted text-sm mt-1">
          Everyone who asked to be told when something comes up. When you publish a property, check back here for
          anyone it matches - message them on WhatsApp with one click, then jot down what they said.
        </p>
      </div>

      {error && (
        <div className="border-2 border-red-200 bg-red-50 text-red-800 rounded-lg px-4 py-3 mb-6 text-sm">{error}</div>
      )}

      {loading ? (
        <p className="text-muted">Loading…</p>
      ) : signups.length === 0 ? (
        <div className="border border-dashed border-line rounded-xl p-10 text-center text-muted">
          Nobody's on the waiting list yet.
        </div>
      ) : (
        <div className="grid gap-4">
          {signups.map((s) => (
            <WaitlistCard
              key={s.id}
              signup={s}
              properties={properties}
              matchCount={properties.filter((p) => matchesWaitlist(s, p)).length}
              onMarkNotified={() => markNotified(s.id)}
              onSaveNote={(note) => saveNote(s.id, note)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function WaitlistCard({
  signup,
  properties,
  matchCount,
  onMarkNotified,
  onSaveNote,
}: {
  signup: WaitlistSignup;
  properties: Property[];
  matchCount: number;
  onMarkNotified: () => void;
  onSaveNote: (note: string) => void;
}) {
  const matchingProperties = properties.filter((p) => matchesWaitlist(signup, p));
  const ordered = [...matchingProperties, ...properties.filter((p) => !matchingProperties.includes(p))];
  const [propertyId, setPropertyId] = useState(ordered[0]?.id ?? "");
  const [note, setNote] = useState(signup.operator_note);
  const chosen = properties.find((p) => p.id === propertyId);

  const message = chosen
    ? `Hi ${signup.name}, we've got a place that might suit you - ${chosen.title} at ${chosen.address}. Want to hear more?`
    : `Hi ${signup.name}, we've got a place we think might suit you - want to hear more?`;

  return (
    <article className="border border-line rounded-xl bg-surface p-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h3 className="font-display font-bold text-lg">{signup.name}</h3>
          <p className="text-muted text-sm mt-0.5">
            Looking in {signup.area || "any area"}
            {signup.bedrooms_needed != null ? ` · ${signup.bedrooms_needed === 4 ? "4+" : signup.bedrooms_needed} bedroom${signup.bedrooms_needed === 1 ? "" : "s"}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {matchCount > 0 && (
            <span className="text-xs font-bold px-2.5 py-1 rounded-md bg-accent-soft text-accent whitespace-nowrap">
              {matchCount} live match{matchCount === 1 ? "" : "es"}
            </span>
          )}
          {signup.notified && (
            <span className="text-xs font-bold px-2.5 py-1 rounded-md bg-line text-muted whitespace-nowrap">
              Messaged
            </span>
          )}
        </div>
      </div>

      <dl className="grid sm:grid-cols-4 gap-3 mt-4 text-sm">
        <div>
          <dt className="text-muted">Phone</dt>
          <dd className="font-medium">
            <a href={`tel:${signup.phone}`} className="text-accent">
              {signup.phone}
            </a>
          </dd>
        </div>
        <div>
          <dt className="text-muted">Email</dt>
          <dd className="font-medium break-words">{signup.email ?? "Not given"}</dd>
        </div>
        <div>
          <dt className="text-muted">Claiming benefits</dt>
          <dd className="font-medium">
            {signup.claiming_benefits === null ? "Not given" : signup.claiming_benefits ? "Yes" : "No"}
          </dd>
        </div>
        <div>
          <dt className="text-muted">Asked</dt>
          <dd className="font-medium">{formatWhen(signup.created_at)}</dd>
        </div>
      </dl>

      {signup.note && (
        <p className="mt-3 text-sm bg-paper border border-line rounded-lg px-3 py-2.5">
          <span className="text-muted">They said: </span>
          {signup.note}
        </p>
      )}

      {properties.length > 0 && (
        <div className="mt-4 pt-4 border-t border-line">
          <label className="block text-sm font-semibold mb-2">Message them about</label>
          <div className="flex gap-2 flex-wrap items-center">
            <select
              value={propertyId}
              onChange={(e) => setPropertyId(e.target.value)}
              className="border-2 border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent min-w-[220px]"
            >
              {ordered.map((p) => (
                <option key={p.id} value={p.id}>
                  {matchingProperties.includes(p) ? "✓ " : ""}
                  {p.title} - {p.address}
                </option>
              ))}
            </select>
            <a
              href={whatsappLink(signup.phone, message)}
              target="_blank"
              rel="noreferrer"
              onClick={onMarkNotified}
              className="inline-flex items-center gap-2 bg-accent text-white font-semibold rounded-lg px-4 py-2 text-sm"
            >
              <WhatsAppIcon /> Message on WhatsApp
            </a>
          </div>
        </div>
      )}

      <div className="mt-4 pt-4 border-t border-line">
        <label className="block text-sm font-semibold mb-2">Your note (what was said, when you last spoke)</label>
        <div className="flex gap-2">
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Messaged about the Coventry house, waiting to hear back"
            className="flex-1 min-w-0 border-2 border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent"
          />
          <button
            type="button"
            onClick={() => onSaveNote(note)}
            disabled={note === signup.operator_note}
            className="px-4 bg-accent text-white font-semibold rounded-lg text-sm disabled:opacity-40"
          >
            Save
          </button>
        </div>
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
  return new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}
