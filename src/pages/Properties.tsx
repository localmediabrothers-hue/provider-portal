import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/lib/useSession";
import type { Property, PropertyType, Provider } from "@/types";

const PROPERTY_TYPES: { value: PropertyType; label: string }[] = [
  { value: "flat", label: "Flat" },
  { value: "house", label: "House" },
  { value: "studio", label: "Studio" },
  { value: "room", label: "Room in a shared house" },
];

export default function Properties() {
  const { session } = useSession();
  const [provider, setProvider] = useState<Provider | null>(null);
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);

  const load = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    const [providerRes, propertiesRes] = await Promise.all([
      supabase.from("providers").select("*").eq("id", session.user.id).maybeSingle(),
      supabase.from("properties").select("*").order("created_at", { ascending: false }),
    ]);
    setProvider(providerRes.data ?? null);
    setProperties((propertiesRes.data as Property[]) ?? []);
    setLoading(false);
  }, [session]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <p className="text-muted">Loading…</p>;

  if (!provider) {
    return <ProviderSetup email={session?.user.email ?? ""} onDone={load} />;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="font-display text-lg font-bold">Your properties</h2>
        <button
          onClick={() => setShowAdd((v) => !v)}
          className="bg-accent text-white font-semibold rounded-lg px-4 py-2 text-sm"
        >
          {showAdd ? "Close" : "Add property"}
        </button>
      </div>

      {showAdd && (
        <AddPropertyForm
          providerId={provider.id}
          onAdded={() => {
            setShowAdd(false);
            load();
          }}
        />
      )}

      {properties.length === 0 ? (
        <div className="border border-dashed border-line rounded-xl p-10 text-center text-muted">
          No properties yet — click "Add property" to list your first one.
        </div>
      ) : (
        <div className="grid gap-4">
          {properties.map((p) => (
            <PropertyCard key={p.id} property={p} />
          ))}
        </div>
      )}
    </div>
  );
}

function ProviderSetup({ email, onDone }: { email: string; onDone: () => void }) {
  const [name, setName] = useState("");
  const [contactEmail, setContactEmail] = useState(email);
  const [contactPhone, setContactPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const { data: userData } = await supabase.auth.getUser();
    const { error } = await supabase.from("providers").insert({
      id: userData.user!.id,
      name,
      contact_email: contactEmail,
      contact_phone: contactPhone || null,
    });
    setSaving(false);
    if (error) {
      setError(error.message);
      return;
    }
    onDone();
  }

  return (
    <div className="border border-line rounded-xl bg-surface p-6 max-w-md">
      <h2 className="font-display font-bold text-lg">Set up your profile</h2>
      <p className="text-muted text-sm mt-1 mb-5">
        Just once — this is the name and contact details shown against the properties you list.
      </p>
      <form onSubmit={handleSubmit} className="grid gap-4">
        <Field label="Your name or company name">
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full border-2 border-line rounded-lg px-3 py-2.5 focus:outline-none focus:border-accent"
          />
        </Field>
        <Field label="Contact email">
          <input
            type="email"
            required
            value={contactEmail}
            onChange={(e) => setContactEmail(e.target.value)}
            className="w-full border-2 border-line rounded-lg px-3 py-2.5 focus:outline-none focus:border-accent"
          />
        </Field>
        <Field label="Contact phone (optional)">
          <input
            value={contactPhone}
            onChange={(e) => setContactPhone(e.target.value)}
            className="w-full border-2 border-line rounded-lg px-3 py-2.5 focus:outline-none focus:border-accent"
          />
        </Field>
        {error && <p className="text-sm text-red-700">{error}</p>}
        <button
          type="submit"
          disabled={saving}
          className="bg-accent text-white font-semibold rounded-lg py-2.5 disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save and continue"}
        </button>
      </form>
    </div>
  );
}

function AddPropertyForm({ providerId, onAdded }: { providerId: string; onAdded: () => void }) {
  const [type, setType] = useState<PropertyType>("flat");
  const [title, setTitle] = useState("");
  const [address, setAddress] = useState("");
  const [weeklyServiceCharge, setWeeklyServiceCharge] = useState(20);
  const [monthlyRent, setMonthlyRent] = useState("");
  const [blurb, setBlurb] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      setStep("Uploading photos…");
      const photoUrls: string[] = [];
      for (const file of files) {
        const path = `${providerId}/${crypto.randomUUID()}-${file.name}`;
        const { error: uploadError } = await supabase.storage.from("property-photos").upload(path, file);
        if (uploadError) throw new Error(`Uploading ${file.name}: ${uploadError.message}`);
        const { data } = supabase.storage.from("property-photos").getPublicUrl(path);
        photoUrls.push(data.publicUrl);
      }

      setStep("Saving the listing…");
      const { error: insertError } = await supabase.from("properties").insert({
        slug: crypto.randomUUID(),
        provider_id: providerId,
        type,
        title,
        address,
        weekly_service_charge: weeklyServiceCharge,
        monthly_rent: monthlyRent ? Number(monthlyRent) : null,
        blurb,
        photo_urls: photoUrls,
      });
      if (insertError) throw new Error(insertError.message);

      onAdded();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
      setStep(null);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="border border-line rounded-xl bg-surface p-6 mb-6 grid gap-4">
      <Field label="Property type">
        <select
          value={type}
          onChange={(e) => setType(e.target.value as PropertyType)}
          className="w-full border-2 border-line rounded-lg px-3 py-2.5 focus:outline-none focus:border-accent bg-surface"
        >
          {PROPERTY_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Title (shown to tenants)">
        <input
          required
          placeholder="e.g. 2 bedroom flat"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full border-2 border-line rounded-lg px-3 py-2.5 focus:outline-none focus:border-accent"
        />
      </Field>
      <Field label="Address">
        <input
          required
          placeholder="e.g. Bellenden Road, Peckham SE15"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          className="w-full border-2 border-line rounded-lg px-3 py-2.5 focus:outline-none focus:border-accent"
        />
      </Field>
      <Field label="Description (shown to tenants)">
        <textarea
          required
          rows={3}
          placeholder="A short, honest description of the place — what it's like, what's nearby."
          value={blurb}
          onChange={(e) => setBlurb(e.target.value)}
          className="w-full border-2 border-line rounded-lg px-3 py-2.5 focus:outline-none focus:border-accent resize-y"
        />
      </Field>
      <Field label="Weekly service charge (the only cost the tenant sees, £10–£30)">
        <input
          type="number"
          min={10}
          max={30}
          required
          value={weeklyServiceCharge}
          onChange={(e) => setWeeklyServiceCharge(Number(e.target.value))}
          className="w-full border-2 border-line rounded-lg px-3 py-2.5 focus:outline-none focus:border-accent"
        />
      </Field>
      <Field label="Monthly rent (optional — shown to tenants as context only, never charged to them)">
        <input
          type="number"
          min={0}
          placeholder="Leave blank to not show a figure"
          value={monthlyRent}
          onChange={(e) => setMonthlyRent(e.target.value)}
          className="w-full border-2 border-line rounded-lg px-3 py-2.5 focus:outline-none focus:border-accent"
        />
      </Field>
      <Field label="Photos">
        <input
          type="file"
          accept="image/*"
          multiple
          onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
          className="w-full text-sm"
        />
        {files.length > 0 && <p className="text-xs text-muted mt-1">{files.length} photo(s) selected</p>}
      </Field>
      {error && <p className="text-sm text-red-700">{error}</p>}
      <button
        type="submit"
        disabled={saving}
        className="bg-accent text-white font-semibold rounded-lg py-2.5 disabled:opacity-60"
      >
        {saving ? step ?? "Saving…" : "Add this property"}
      </button>
    </form>
  );
}

function PropertyCard({ property }: { property: Property }) {
  return (
    <article className="border border-line rounded-xl bg-surface p-5 flex gap-4">
      {property.photo_urls[0] ? (
        <img src={property.photo_urls[0]} alt="" className="w-24 h-24 rounded-lg object-cover flex-none" />
      ) : (
        <div className="w-24 h-24 rounded-lg bg-paper flex-none grid place-items-center text-muted text-xs">
          No photo
        </div>
      )}
      <div>
        <h3 className="font-display font-bold">{property.title}</h3>
        <p className="text-muted text-sm mt-0.5">{property.address}</p>
        <p className="text-sm font-semibold mt-2">£{property.weekly_service_charge}/week service charge</p>
        {!property.active && <p className="text-xs text-muted mt-1">Not shown on the site (inactive)</p>}
      </div>
    </article>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block font-semibold text-sm mb-1.5">{label}</span>
      {children}
    </label>
  );
}
