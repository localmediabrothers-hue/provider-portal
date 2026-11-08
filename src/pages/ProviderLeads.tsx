import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { whatsappLink } from "@/lib/whatsapp";
import { PROPERTY_FEATURES, type ProviderSubmission, type ProviderSubmissionStatus } from "@/types";

interface LeadProperty {
  id: string;
  title: string;
  address: string;
  active: boolean;
  photo_urls: string[];
  photo_labels: string[];
  type: string;
  toilets: number | null;
  floors: number | null;
  rooms: {
    label: string;
    room_type: string;
    ensuite: boolean;
    size_sqm: number | null;
    weekly_service_charge: number;
    available: boolean;
  }[];
}

interface LeadWithProperty extends ProviderSubmission {
  properties: LeadProperty | null;
}

const STATUS_LABEL: Record<ProviderSubmissionStatus, string> = {
  pending: "New",
  contacted: "Contacted",
  approved: "Approved",
  declined: "Declined",
};

const STATUS_BADGE: Record<ProviderSubmissionStatus, string> = {
  pending: "bg-accent-soft text-accent",
  contacted: "bg-line text-muted",
  approved: "bg-good-soft text-good",
  declined: "bg-red-100 text-red-700",
};

export default function ProviderLeads() {
  const [leads, setLeads] = useState<LeadWithProperty[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("provider_submissions")
      .select("*, properties(id, title, address, active, photo_urls, photo_labels, type, toilets, floors, rooms(label, room_type, ensuite, size_sqm, weekly_service_charge, available))")
      .order("created_at", { ascending: false });
    if (error) setError(error.message);
    setLeads((data as LeadWithProperty[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function setStatus(id: string, status: ProviderSubmissionStatus) {
    const { error } = await supabase.from("provider_submissions").update({ status }).eq("id", id);
    if (error) {
      setError(`Couldn't update that: ${error.message}`);
      return;
    }
    setLeads((rows) => rows.map((r) => (r.id === id ? { ...r, status } : r)));
  }

  async function saveNote(id: string, note: string) {
    const { error } = await supabase.from("provider_submissions").update({ operator_note: note }).eq("id", id);
    if (error) {
      setError(`Couldn't save that note: ${error.message}`);
      return;
    }
    setLeads((rows) => rows.map((r) => (r.id === id ? { ...r, operator_note: note } : r)));
  }

  const pendingCount = leads.filter((l) => l.status === "pending").length;

  return (
    <div>
      <div className="mb-6">
        <h2 className="font-display font-bold text-xl">Provider leads</h2>
        <p className="text-muted text-sm mt-1">
          Landlords who filled in "List your property" on the site. Each one creates a draft listing automatically
          (inactive, with a placeholder price) — find it under Properties, fill in the real address and price, and
          switch it on when it's ready.
          {pendingCount > 0 && ` ${pendingCount} new.`}
        </p>
      </div>

      {error && (
        <div className="border-2 border-red-200 bg-red-50 text-red-800 rounded-lg px-4 py-3 mb-6 text-sm">{error}</div>
      )}

      {loading ? (
        <p className="text-muted">Loading…</p>
      ) : leads.length === 0 ? (
        <div className="border border-dashed border-line rounded-xl p-10 text-center text-muted">
          No provider leads yet.
        </div>
      ) : (
        <div className="grid gap-4">
          {leads.map((lead) => (
            <LeadCard
              key={lead.id}
              lead={lead}
              onSetStatus={(status) => setStatus(lead.id, status)}
              onSaveNote={(note) => saveNote(lead.id, note)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function LeadCard({
  lead,
  onSetStatus,
  onSaveNote,
}: {
  lead: LeadWithProperty;
  onSetStatus: (status: ProviderSubmissionStatus) => void;
  onSaveNote: (note: string) => void;
}) {
  const [note, setNote] = useState(lead.operator_note);
  const featureLabels = lead.features
    .map((f) => PROPERTY_FEATURES.find((p) => p.value === f)?.label)
    .filter((l): l is string => !!l);

  const message = `Hi, thanks for listing your property with Front Door! I just need a few more details to get it live - do you have a minute for a quick call or a few messages back and forth?`;

  return (
    <article className="border border-line rounded-xl bg-surface p-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h3 className="font-display font-bold text-lg">{lead.phone}</h3>
          <p className="text-muted text-sm mt-0.5">{formatWhen(lead.created_at)}</p>
        </div>
        <span className={`text-xs font-bold px-2.5 py-1 rounded-md whitespace-nowrap ${STATUS_BADGE[lead.status]}`}>
          {STATUS_LABEL[lead.status]}
        </span>
      </div>

      <dl className="grid sm:grid-cols-3 gap-3 mt-4 text-sm">
        <div>
          <dt className="text-muted">Phone</dt>
          <dd className="font-medium">
            <a href={`tel:${lead.phone}`} className="text-accent">
              {lead.phone}
            </a>
          </dd>
        </div>
        <div>
          <dt className="text-muted">Rooms</dt>
          <dd className="font-medium">{lead.rooms_count ?? "Not given"}</dd>
        </div>
        <div>
          <dt className="text-muted">Postcode</dt>
          <dd className="font-medium">{lead.postcode || "Not given"}</dd>
        </div>
      </dl>

      {featureLabels.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-3">
          {featureLabels.map((label) => (
            <span key={label} className="text-xs font-semibold px-2.5 py-1 rounded-md bg-paper border border-line">
              {label}
            </span>
          ))}
        </div>
      )}

      {lead.properties ? (
        <div className="mt-4 pt-4 border-t border-line">
          <p className="text-sm">
            <span className="font-semibold">Draft listing created:</span> "{lead.properties.title}" —{" "}
            {lead.properties.active ? (
              <span className="text-good font-semibold">active</span>
            ) : (
              <span className="text-muted">not active yet, find it under Properties to finish it</span>
            )}
          </p>

          <dl className="grid sm:grid-cols-4 gap-3 mt-3 text-sm">
            <div>
              <dt className="text-muted">Type</dt>
              <dd className="font-medium capitalize">{lead.properties.type}</dd>
            </div>
            <div>
              <dt className="text-muted">Address</dt>
              <dd className="font-medium">{lead.properties.address || "Not given"}</dd>
            </div>
            <div>
              <dt className="text-muted">Toilets</dt>
              <dd className="font-medium">{lead.properties.toilets ?? "Not given"}</dd>
            </div>
            <div>
              <dt className="text-muted">Floors</dt>
              <dd className="font-medium">{lead.properties.floors ?? "Not given"}</dd>
            </div>
          </dl>

          {lead.properties.rooms.length > 0 && (
            <div className="grid gap-2 mt-3">
              {lead.properties.rooms.map((room, i) => (
                <div key={i} className="text-sm bg-paper border border-line rounded-lg px-3 py-2 flex items-center justify-between gap-3">
                  <span>
                    <span className="font-semibold">Room {i + 1}:</span>{" "}
                    {room.room_type === "single" ? "Single" : "Double"}
                    {room.ensuite ? ", ensuite" : ""}
                    {room.size_sqm ? `, ${room.size_sqm}m²` : ""}
                    {room.label && <span className="text-muted"> — {room.label}</span>}
                  </span>
                  <span className="font-semibold whitespace-nowrap">
                    £{room.weekly_service_charge}/wk
                    {!room.available && <span className="text-muted font-normal"> · not available</span>}
                  </span>
                </div>
              ))}
            </div>
          )}

          {lead.properties.photo_urls.length > 0 && (
            <div className="flex gap-3 mt-3 flex-wrap">
              {lead.properties.photo_urls.map((url, i) => (
                <div key={url} className="text-center">
                  <img src={url} alt="" className="w-16 h-16 object-cover rounded-md border border-line" />
                  <p className="text-xs text-muted mt-1 max-w-16 truncate">{lead.properties!.photo_labels?.[i] || "—"}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <p className="text-sm text-muted mt-4 pt-4 border-t border-line">
          A draft listing couldn't be created automatically for this one — you'll need to add it by hand under
          Properties.
        </p>
      )}

      <div className="mt-4 pt-4 border-t border-line flex gap-2 flex-wrap items-center">
        <a
          href={whatsappLink(lead.phone, message)}
          target="_blank"
          rel="noreferrer"
          onClick={() => lead.status === "pending" && onSetStatus("contacted")}
          className="inline-flex items-center gap-2 bg-accent text-white font-semibold rounded-lg px-4 py-2 text-sm"
        >
          <WhatsAppIcon /> Message on WhatsApp
        </a>
        <select
          value={lead.status}
          onChange={(e) => onSetStatus(e.target.value as ProviderSubmissionStatus)}
          className="border-2 border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent"
        >
          {(Object.keys(STATUS_LABEL) as ProviderSubmissionStatus[]).map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-4 pt-4 border-t border-line">
        <label className="block text-sm font-semibold mb-2">Your note</label>
        <div className="flex gap-2">
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Spoke Tue, sending photos over Thu"
            className="flex-1 min-w-0 border-2 border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent"
          />
          <button
            type="button"
            onClick={() => onSaveNote(note)}
            disabled={note === lead.operator_note}
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
