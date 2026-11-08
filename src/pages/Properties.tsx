import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/lib/useSession";
import { matchesWaitlist } from "@/lib/matching";
import type { Property, PropertyType, Provider, Room, RoomType, WaitlistSignup } from "@/types";
import { PROPERTY_FEATURES } from "@/types";

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
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<Property | null>(null);
  const [managingPhotosFor, setManagingPhotosFor] = useState<Property | null>(null);
  const [managingRoomsFor, setManagingRoomsFor] = useState<Property | null>(null);
  const [matchBanner, setMatchBanner] = useState<{ title: string; count: number } | null>(null);

  /* Checked after rooms are saved, not after the property shell, since a
     brand-new property has no rooms - and so nothing actually available -
     until its rooms exist. Room count stands in for "bedrooms" here. */
  async function checkWaitlistMatches(saved: { active: boolean; title: string; area: string; availableRooms: number }) {
    if (!saved.active || saved.availableRooms === 0) return;
    const { data } = await supabase.from("waitlist_signups").select("*");
    const rows = (data as WaitlistSignup[]) ?? [];
    const count = rows.filter((s) =>
      matchesWaitlist(s, { area: saved.area, bedrooms: saved.availableRooms } as Property),
    ).length;
    if (count > 0) setMatchBanner({ title: saved.title, count });
  }

  const load = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    const [providerRes, propertiesRes, roomsRes] = await Promise.all([
      supabase.from("providers").select("*").eq("id", session.user.id).maybeSingle(),
      supabase.from("properties").select("*").order("created_at", { ascending: false }),
      supabase.from("rooms").select("*").order("sort_order", { ascending: true }),
    ]);
    setProvider(providerRes.data ?? null);
    setProperties((propertiesRes.data as Property[]) ?? []);
    setRooms((roomsRes.data as Room[]) ?? []);
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

      {matchBanner && (
        <div className="border-2 border-accent bg-accent-soft text-accent rounded-xl px-4 py-3 mb-6 text-sm font-semibold flex items-center justify-between gap-3">
          <span>
            {matchBanner.count} {matchBanner.count === 1 ? "person is" : "people are"} on your waiting list for
            something like "{matchBanner.title}" — go to the Waiting list tab to message them.
          </span>
          <button type="button" onClick={() => setMatchBanner(null)} className="flex-none opacity-70 hover:opacity-100">
            Dismiss
          </button>
        </div>
      )}

      {showAdd && (
        <PropertyForm
          providerId={provider.id}
          onDone={(savedProperty) => {
            setShowAdd(false);
            load();
            setManagingRoomsFor(savedProperty);
          }}
          onCancel={() => setShowAdd(false)}
        />
      )}

      {editing && (
        <PropertyForm
          providerId={provider.id}
          property={editing}
          onDone={() => {
            setEditing(null);
            load();
          }}
          onCancel={() => setEditing(null)}
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

      {managingRoomsFor && (
        <RoomsManager
          property={managingRoomsFor}
          onDone={(availableRooms) => {
            checkWaitlistMatches({
              active: managingRoomsFor.active,
              title: managingRoomsFor.title,
              area: managingRoomsFor.area,
              availableRooms,
            });
            setManagingRoomsFor(null);
          }}
          onCancel={() => setManagingRoomsFor(null)}
        />
      )}

      {properties.length === 0 ? (
        <div className="border border-dashed border-line rounded-xl p-10 text-center text-muted">
          No properties yet — click "Add property" to list your first one.
        </div>
      ) : (
        <div className="grid gap-4">
          {properties.map((p) => (
            <PropertyCard
              key={p.id}
              property={p}
              rooms={rooms.filter((r) => r.property_id === p.id)}
              onEdit={() => setEditing(p)}
              onManagePhotos={() => setManagingPhotosFor(p)}
              onManageRooms={() => setManagingRoomsFor(p)}
              onConfirmAvailable={async () => {
                await supabase
                  .from("properties")
                  .update({ last_confirmed_at: new Date().toISOString() })
                  .eq("id", p.id);
                load();
              }}
            />
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

/* Used for both adding a new property and editing an existing one — pass
   `property` to edit it. Photos on an existing property are handled by
   ManagePhotosForm instead, so the picker only shows when adding. */
function PropertyForm({
  providerId,
  property,
  onDone,
  onCancel,
}: {
  providerId: string;
  property?: Property;
  onDone: (savedProperty: Property) => void;
  onCancel?: () => void;
}) {
  const editing = Boolean(property);
  const [type, setType] = useState<PropertyType>(property?.type ?? "flat");
  const [title, setTitle] = useState(property?.title ?? "");
  const [address, setAddress] = useState(property?.address ?? "");
  const [area, setArea] = useState(property?.area ?? "");
  const [monthlyRent, setMonthlyRent] = useState(property?.monthly_rent ? String(property.monthly_rent) : "");
  const [toilets, setToilets] = useState(property?.toilets != null ? String(property.toilets) : "");
  const [floors, setFloors] = useState(property?.floors != null ? String(property.floors) : "");
  const [features, setFeatures] = useState<string[]>(property?.features ?? []);
  const [maxStayNote, setMaxStayNote] = useState(property?.max_stay_note ?? "");
  const [blurb, setBlurb] = useState(property?.blurb ?? "");
  const [files, setFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function toggleFeature(value: string) {
    setFeatures((f) => (f.includes(value) ? f.filter((x) => x !== value) : [...f, value]));
  }

  async function saveExisting(nextActive: boolean) {
    setSaving(true);
    setError(null);
    try {
      setStep(nextActive ? "Posting…" : "Taking down…");
      const fields = {
        type,
        title,
        address,
        area,
        monthly_rent: monthlyRent ? Number(monthlyRent) : null,
        toilets: toilets ? Number(toilets) : null,
        floors: floors ? Number(floors) : null,
        features,
        max_stay_note: maxStayNote,
        blurb,
      };
      const { data, error: updateError } = await supabase
        .from("properties")
        .update({ ...fields, active: nextActive })
        .eq("id", property!.id)
        .select()
        .single();
      if (updateError) throw new Error(updateError.message);
      onDone(data as Property);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
      setStep(null);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const fields = {
        type,
        title,
        address,
        area,
        monthly_rent: monthlyRent ? Number(monthlyRent) : null,
        toilets: toilets ? Number(toilets) : null,
        floors: floors ? Number(floors) : null,
        features,
        max_stay_note: maxStayNote,
        blurb,
      };

      {
        // This form is only ever submitted this way when adding a brand new
        // property — editing an existing one goes through saveExisting()
        // instead, via the Post/Remove buttons below.
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
        const { data, error: insertError } = await supabase
          .from("properties")
          .insert({
            ...fields,
            slug: crypto.randomUUID(),
            provider_id: providerId,
            photo_urls: photoUrls,
          })
          .select()
          .single();
        if (insertError) throw new Error(insertError.message);
        onDone(data as Property);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
      setStep(null);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="border border-line rounded-xl bg-surface p-6 mb-6 grid gap-4">
      {editing && <h3 className="font-display font-bold">Edit — {property!.title}</h3>}
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
      <Field label="Town / city / area">
        <input
          required
          placeholder="e.g. Coventry, or Peckham"
          value={area}
          onChange={(e) => setArea(e.target.value)}
          className="w-full border-2 border-line rounded-lg px-3 py-2.5 focus:outline-none focus:border-accent"
        />
        <p className="text-xs text-muted mt-1">
          What tenants actually type into "Where do you want to live?" — if the postcode is all that's in the
          address, searching the city name won't find this listing without this filled in.
        </p>
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
      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="Toilets/bathrooms (optional)">
          <input
            type="number"
            min={0}
            placeholder="e.g. 2"
            value={toilets}
            onChange={(e) => setToilets(e.target.value)}
            className="w-full border-2 border-line rounded-lg px-3 py-2.5 focus:outline-none focus:border-accent"
          />
        </Field>
        <Field label="Floors (optional)">
          <input
            type="number"
            min={0}
            placeholder="e.g. 2"
            value={floors}
            onChange={(e) => setFloors(e.target.value)}
            className="w-full border-2 border-line rounded-lg px-3 py-2.5 focus:outline-none focus:border-accent"
          />
        </Field>
      </div>
      <Field label="Features">
        <div className="grid sm:grid-cols-2 gap-2">
          {PROPERTY_FEATURES.map((f) => (
            <label key={f.value} className="flex items-center gap-2 border border-line rounded-lg px-3 py-2 text-sm">
              <input
                type="checkbox"
                checked={features.includes(f.value)}
                onChange={() => toggleFeature(f.value)}
                className="w-4 h-4"
              />
              {f.label}
            </label>
          ))}
        </div>
      </Field>
      {!editing && (
        <p className="text-sm text-muted bg-paper border border-line rounded-lg px-3 py-2.5">
          Prices and availability are set per room, once this property's saved — you'll go straight to adding its
          rooms next.
        </p>
      )}
      <Field label="How long can someone stay? (optional)">
        <input
          type="text"
          placeholder="e.g. Up to 18 months, reviewed with you along the way"
          value={maxStayNote}
          onChange={(e) => setMaxStayNote(e.target.value)}
          className="w-full border-2 border-line rounded-lg px-3 py-2.5 focus:outline-none focus:border-accent"
        />
      </Field>
      {!editing && (
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
      )}

      {error && <p className="text-sm text-red-700">{error}</p>}

      <div className="flex gap-3">
        {editing ? (
          <button
            type="button"
            disabled={saving}
            onClick={() => saveExisting(!property!.active)}
            className={`font-semibold rounded-lg px-4 py-2.5 text-sm disabled:opacity-60 text-white ${
              property!.active ? "bg-red-600" : "bg-accent"
            }`}
          >
            {saving
              ? step ?? "Saving…"
              : property!.active
                ? "Remove this property"
                : "Post this property"}
          </button>
        ) : (
          <button
            type="submit"
            disabled={saving}
            className="bg-accent text-white font-semibold rounded-lg px-4 py-2.5 text-sm disabled:opacity-60"
          >
            {saving ? step ?? "Saving…" : "Add this property"}
          </button>
        )}
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="px-4 py-2.5 border-2 border-line rounded-lg font-semibold text-sm disabled:opacity-60"
          >
            Cancel
          </button>
        )}
      </div>
      {editing && (
        <p className="text-xs text-muted">
          {property!.active
            ? "This is live on the site — \"Remove this property\" saves your edits and takes it down. Nothing is deleted, so you can post it again any time."
            : "Not live yet — \"Post this property\" saves your edits and puts it on the site straight away."}
        </p>
      )}
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
  tag,
  onTagChange,
  onUp,
  onDown,
  onRemove,
}: {
  preview: string;
  label: string;
  tag?: string;
  onTagChange?: (value: string) => void;
  onUp?: () => void;
  onDown?: () => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex items-center gap-3 border border-line rounded-lg p-2">
      <img src={preview} alt="" className="w-14 h-14 rounded object-cover flex-none" />
      <div className="flex-1 min-w-0">
        <span className="text-xs text-muted block mb-1">{label}</span>
        {onTagChange && (
          <input
            value={tag ?? ""}
            onChange={(e) => onTagChange(e.target.value)}
            placeholder="e.g. Room 1, Kitchen"
            className="w-full border-2 border-line rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-accent"
          />
        )}
      </div>
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
  // Padded out to match photos — a photo with no label at that index just
  // reads as "" rather than being missing from the array entirely.
  const [labels, setLabels] = useState<string[]>(
    property.photo_urls.map((_, i) => property.photo_labels?.[i] ?? ""),
  );
  const [newFiles, setNewFiles] = useState<File[]>([]);
  const [newLabels, setNewLabels] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function move(i: number, dir: -1 | 1) {
    const j = i + dir;
    setPhotos((p) => {
      if (j < 0 || j >= p.length) return p;
      const next = [...p];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
    setLabels((l) => {
      if (j < 0 || j >= l.length) return l;
      const next = [...l];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }
  function remove(i: number) {
    setPhotos((p) => p.filter((_, idx) => idx !== i));
    setLabels((l) => l.filter((_, idx) => idx !== i));
  }
  function setLabel(i: number, value: string) {
    setLabels((l) => l.map((v, idx) => (idx === i ? value : v)));
  }
  function removeNewFile(i: number) {
    setNewFiles((f) => f.filter((_, idx) => idx !== i));
    setNewLabels((l) => l.filter((_, idx) => idx !== i));
  }
  function setNewLabel(i: number, value: string) {
    setNewLabels((l) => l.map((v, idx) => (idx === i ? value : v)));
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
        .update({
          photo_urls: [...photos, ...uploaded],
          photo_labels: [...labels, ...newLabels.slice(0, uploaded.length)],
        })
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
              tag={labels[i]}
              onTagChange={(value) => setLabel(i, value)}
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
              tag={newLabels[i]}
              onTagChange={(value) => setNewLabel(i, value)}
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
          onChange={(e) => {
            const added = Array.from(e.target.files ?? []);
            setNewFiles((f) => [...f, ...added]);
            setNewLabels((l) => [...l, ...added.map(() => "")]);
          }}
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

function RoomsManager({
  property,
  onDone,
  onCancel,
}: {
  property: Property;
  onDone: (availableRoomCount: number) => void;
  onCancel: () => void;
}) {
  const [rooms, setRooms] = useState<Room[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("rooms")
      .select("*")
      .eq("property_id", property.id)
      .order("sort_order", { ascending: true });
    if (error) setError(error.message);
    setRooms((data as Room[]) ?? []);
  }, [property.id]);

  useEffect(() => {
    load();
  }, [load]);

  async function addRoom() {
    const nextOrder = rooms ? rooms.length : 0;
    const { error } = await supabase.from("rooms").insert({
      property_id: property.id,
      room_type: "double",
      ensuite: false,
      weekly_service_charge: 20,
      available: true,
      sort_order: nextOrder,
    });
    if (error) {
      setError(error.message);
      return;
    }
    load();
  }

  async function updateRoom(id: string, fields: Partial<Room>) {
    const { error } = await supabase.from("rooms").update(fields).eq("id", id);
    if (error) {
      setError(error.message);
      return;
    }
    setRooms((rs) => rs?.map((r) => (r.id === id ? { ...r, ...fields } : r)) ?? null);
  }

  async function removeRoom(id: string) {
    const { error } = await supabase.from("rooms").delete().eq("id", id);
    if (error) {
      setError(error.message);
      return;
    }
    load();
  }

  const availableCount = rooms?.filter((r) => r.available).length ?? 0;

  return (
    <div className="border border-line rounded-xl bg-surface p-6 mb-6">
      <h3 className="font-display font-bold">Rooms — {property.title}</h3>
      <p className="text-muted text-sm mt-1 mb-4">
        Each room has its own price and its own available/taken switch. Tenants see every available room when they
        open this property, and can ask to view one room specifically, or the whole property if more than one is
        free.
      </p>

      {error && <p className="text-sm text-red-700 mb-3">{error}</p>}

      {rooms === null ? (
        <p className="text-muted text-sm">Loading…</p>
      ) : (
        <div className="grid gap-3 mb-4">
          {rooms.map((room, i) => (
            <RoomRow
              key={room.id}
              room={room}
              index={i}
              onChange={(fields) => updateRoom(room.id, fields)}
              onRemove={() => removeRoom(room.id)}
            />
          ))}
          {rooms.length === 0 && (
            <p className="text-sm text-muted border border-dashed border-line rounded-lg p-4 text-center">
              No rooms yet — add one below.
            </p>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={addRoom}
        className="border-2 border-line rounded-lg px-4 py-2 text-sm font-semibold hover:border-accent"
      >
        + Add a room
      </button>

      <div className="flex gap-3 mt-6 pt-4 border-t border-line">
        <button
          type="button"
          onClick={() => onDone(availableCount)}
          className="bg-accent text-white font-semibold rounded-lg px-4 py-2.5 text-sm"
        >
          Done
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2.5 border-2 border-line rounded-lg font-semibold text-sm"
        >
          Close
        </button>
      </div>
    </div>
  );
}

function RoomRow({
  room,
  index,
  onChange,
  onRemove,
}: {
  room: Room;
  index: number;
  onChange: (fields: Partial<Room>) => void;
  onRemove: () => void;
}) {
  const [label, setLabel] = useState(room.label);
  const [size, setSize] = useState(room.size_sqm ? String(room.size_sqm) : "");
  const [price, setPrice] = useState(String(room.weekly_service_charge));

  return (
    <div className={`border rounded-lg p-4 ${room.available ? "border-line" : "border-line bg-paper opacity-75"}`}>
      <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onBlur={() => onChange({ label })}
          placeholder={`Room ${index + 1} (optional name)`}
          className="font-semibold text-sm border-2 border-line rounded-lg px-3 py-1.5 focus:outline-none focus:border-accent min-w-[160px]"
        />
        <label className="flex items-center gap-2 text-sm font-semibold">
          <input
            type="checkbox"
            checked={room.available}
            onChange={(e) => onChange({ available: e.target.checked })}
            className="w-4 h-4"
          />
          Available
        </label>
      </div>

      <div className="grid sm:grid-cols-4 gap-3">
        <label className="block">
          <span className="block text-xs text-muted mb-1">Type</span>
          <select
            value={room.room_type}
            onChange={(e) => onChange({ room_type: e.target.value as RoomType })}
            className="w-full border-2 border-line rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-accent bg-surface"
          >
            <option value="single">Single</option>
            <option value="double">Double</option>
          </select>
        </label>
        <label className="flex items-end pb-2 gap-2 text-sm">
          <input
            type="checkbox"
            checked={room.ensuite}
            onChange={(e) => onChange({ ensuite: e.target.checked })}
            className="w-4 h-4"
          />
          Ensuite
        </label>
        <label className="block">
          <span className="block text-xs text-muted mb-1">Size (m&sup2;)</span>
          <input
            type="number"
            min={0}
            value={size}
            onChange={(e) => setSize(e.target.value)}
            onBlur={() => onChange({ size_sqm: size ? Number(size) : null })}
            className="w-full border-2 border-line rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-accent"
          />
        </label>
        <label className="block">
          <span className="block text-xs text-muted mb-1">£/week</span>
          <input
            type="number"
            min={0}
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            onBlur={() => onChange({ weekly_service_charge: Number(price) || 0 })}
            className="w-full border-2 border-line rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-accent"
          />
        </label>
      </div>

      <button type="button" onClick={onRemove} className="text-xs font-semibold text-red-700 mt-3">
        Remove this room
      </button>
    </div>
  );
}

function confirmedAgo(iso: string) {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 14) return `${days} days ago`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function PropertyCard({
  property,
  rooms,
  onEdit,
  onManagePhotos,
  onManageRooms,
  onConfirmAvailable,
}: {
  property: Property;
  rooms: Room[];
  onEdit: () => void;
  onManagePhotos: () => void;
  onManageRooms: () => void;
  onConfirmAvailable: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const availableRooms = rooms.filter((r) => r.available);
  const cheapest = availableRooms.length
    ? Math.min(...availableRooms.map((r) => r.weekly_service_charge))
    : null;

  return (
    <article className="border border-line rounded-xl bg-surface p-5 flex gap-4">
      {property.photo_urls[0] ? (
        <img src={property.photo_urls[0]} alt="" className="w-24 h-24 rounded-lg object-cover flex-none" />
      ) : (
        <div className="w-24 h-24 rounded-lg bg-paper flex-none grid place-items-center text-muted text-xs">
          No photo
        </div>
      )}
      <div className="min-w-0">
        <div className="flex items-start gap-2 flex-wrap">
          <h3 className="font-display font-bold">{property.title}</h3>
          {!property.active && (
            <span className="text-xs font-bold px-2 py-0.5 rounded-md bg-line text-muted whitespace-nowrap">
              Hidden from the site
            </span>
          )}
        </div>
        <p className="text-muted text-sm mt-0.5">{property.address}</p>
        <p className="text-sm font-semibold mt-2">
          {rooms.length === 0
            ? "No rooms added yet"
            : cheapest !== null
              ? `${availableRooms.length} of ${rooms.length} room${rooms.length === 1 ? "" : "s"} available · from £${cheapest}/week`
              : "Nothing available right now"}
        </p>
        {rooms.length === 0 && (
          <p className="text-xs text-amber-700 mt-1">
            This won't show up to tenants until it has at least one room — add one below.
          </p>
        )}
        {!property.area && (
          <p className="text-xs text-amber-700 mt-1">
            No town/city set — tenants searching by area won't find this listing until you add one.
          </p>
        )}
        <p className="text-xs text-muted mt-1">Tenants see this as checked {confirmedAgo(property.last_confirmed_at)}.</p>
        <div className="flex gap-4 mt-2 items-center flex-wrap">
          <button type="button" onClick={onEdit} className="text-sm font-semibold text-accent">
            Edit
          </button>
          <button type="button" onClick={onManageRooms} className="text-sm font-semibold text-accent">
            Manage rooms ({rooms.length})
          </button>
          <button type="button" onClick={onManagePhotos} className="text-sm font-semibold text-accent">
            Manage photos ({property.photo_urls.length})
          </button>
          <button
            type="button"
            disabled={confirming}
            onClick={async () => {
              setConfirming(true);
              await onConfirmAvailable();
              setConfirming(false);
            }}
            className="text-sm font-semibold text-accent disabled:opacity-60"
          >
            {confirming ? "Confirming…" : "Confirm still available"}
          </button>
        </div>
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
