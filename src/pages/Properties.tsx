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
  const [managingPhotosFor, setManagingPhotosFor] = useState<Property | null>(null);

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

      {managingPhotosFor && (
        <ManagePhotosForm
          property={managingPhotosFor}
          onDone={() => {
            setManagingPhotosFor(null);
            load();
          }}
          onCancel={() => setManagingPhotosFor(null)}
        />
      )}

      {properties.length === 0 ? (
        <div className="border border-dashed border-line rounded-xl p-10 text-center text-muted">
          No properties yet — click "Add property" to list your first one.
        </div>
      ) : (
        <div className="grid gap-4">
          {properties.map((p) => (
            <PropertyCard key={p.id} property={p} onManagePhotos={() => setManagingPhotosFor(p)} />
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
          onChange={(e) => setFiles((f) => [...f, ...Array.from(e.target.files ?? [])])}
          className="w-full text-sm"
        />
        {files.length > 0 && (
          <>
            <p className="text-xs text-muted mt-2 mb-1.5">
              The first photo is what shows on the listing card — use the arrows to reorder.
            </p>
            <ReorderableFileList files={files} setFiles={setFiles} />
          </>
        )}
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

/* thumbnails for photos already picked in the Add property form, reorderable before upload */
function ReorderableFileList({
  files,
  setFiles,
}: {
  files: File[];
  setFiles: React.Dispatch<React.SetStateAction<File[]>>;
}) {
  function move(i: number, dir: -1 | 1) {
    setFiles((f) => {
      const j = i + dir;
      if (j < 0 || j >= f.length) return f;
      const next = [...f];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }
  function remove(i: number) {
    setFiles((f) => f.filter((_, idx) => idx !== i));
  }

  return (
    <div className="grid gap-2">
      {files.map((file, i) => (
        <PhotoRow
          key={file.name + file.lastModified + i}
          preview={URL.createObjectURL(file)}
          label={i === 0 ? "Shown first" : `Photo ${i + 1}`}
          onUp={i > 0 ? () => move(i, -1) : undefined}
          onDown={i < files.length - 1 ? () => move(i, 1) : undefined}
          onRemove={() => remove(i)}
        />
      ))}
    </div>
  );
}

/* one row shared by both the pre-upload preview list and the manage-photos screen */
function PhotoRow({
  preview,
  label,
  onUp,
  onDown,
  onRemove,
}: {
  preview: string;
  label: string;
  onUp?: () => void;
  onDown?: () => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex items-center gap-3 border border-line rounded-lg p-2">
      <img src={preview} alt="" className="w-14 h-14 rounded object-cover flex-none" />
      <span className="text-xs text-muted flex-1">{label}</span>
      <button
        type="button"
        onClick={onUp}
        disabled={!onUp}
        aria-label="Move up"
        className="w-8 h-8 border border-line rounded disabled:opacity-30"
      >
        ↑
      </button>
      <button
        type="button"
        onClick={onDown}
        disabled={!onDown}
        aria-label="Move down"
        className="w-8 h-8 border border-line rounded disabled:opacity-30"
      >
        ↓
      </button>
      <button
        type="button"
        onClick={onRemove}
        className="px-2.5 h-8 border border-line rounded text-red-700 text-xs font-semibold"
      >
        Remove
      </button>
    </div>
  );
}

function ManagePhotosForm({
  property,
  onDone,
  onCancel,
}: {
  property: Property;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [photos, setPhotos] = useState<string[]>(property.photo_urls);
  const [newFiles, setNewFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function move(i: number, dir: -1 | 1) {
    setPhotos((p) => {
      const j = i + dir;
      if (j < 0 || j >= p.length) return p;
      const next = [...p];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }
  function remove(i: number) {
    setPhotos((p) => p.filter((_, idx) => idx !== i));
  }
  function removeNewFile(i: number) {
    setNewFiles((f) => f.filter((_, idx) => idx !== i));
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const uploaded: string[] = [];
      for (const file of newFiles) {
        const path = `${property.provider_id}/${crypto.randomUUID()}-${file.name}`;
        const { error: uploadError } = await supabase.storage.from("property-photos").upload(path, file);
        if (uploadError) throw new Error(`Uploading ${file.name}: ${uploadError.message}`);
        const { data } = supabase.storage.from("property-photos").getPublicUrl(path);
        uploaded.push(data.publicUrl);
      }
      const { error: updateError } = await supabase
        .from("properties")
        .update({ photo_urls: [...photos, ...uploaded] })
        .eq("id", property.id);
      if (updateError) throw new Error(updateError.message);
      onDone();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="border border-line rounded-xl bg-surface p-6 mb-6">
      <h3 className="font-display font-bold">Manage photos — {property.title}</h3>
      <p className="text-muted text-sm mt-1 mb-4">
        The first photo is what shows on the listing card and search results. Use the arrows to reorder.
      </p>

      {photos.length > 0 && (
        <div className="grid gap-2 mb-4">
          {photos.map((url, i) => (
            <PhotoRow
              key={url}
              preview={url}
              label={i === 0 ? "Shown first" : `Photo ${i + 1}`}
              onUp={i > 0 ? () => move(i, -1) : undefined}
              onDown={i < photos.length - 1 ? () => move(i, 1) : undefined}
              onRemove={() => remove(i)}
            />
          ))}
        </div>
      )}

      {newFiles.length > 0 && (
        <div className="grid gap-2 mb-4">
          {newFiles.map((file, i) => (
            <PhotoRow
              key={file.name + file.lastModified + i}
              preview={URL.createObjectURL(file)}
              label="New — added at the end when you save"
              onRemove={() => removeNewFile(i)}
            />
          ))}
        </div>
      )}

      <Field label="Add more photos">
        <input
          type="file"
          accept="image/*"
          multiple
          onChange={(e) => setNewFiles((f) => [...f, ...Array.from(e.target.files ?? [])])}
          className="w-full text-sm"
        />
      </Field>

      {error && <p className="text-sm text-red-700 mt-3">{error}</p>}

      <div className="flex gap-3 mt-4">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="bg-accent text-white font-semibold rounded-lg px-4 py-2.5 text-sm disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save photo order"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="px-4 py-2.5 border-2 border-line rounded-lg font-semibold text-sm disabled:opacity-60"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function PropertyCard({ property, onManagePhotos }: { property: Property; onManagePhotos: () => void }) {
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
        <button type="button" onClick={onManagePhotos} className="text-sm font-semibold text-accent mt-2">
          Manage photos ({property.photo_urls.length})
        </button>
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
