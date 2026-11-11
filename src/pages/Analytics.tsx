import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

interface AnalyticsEvent {
  id: string;
  event_type: string;
  meta: Record<string, unknown>;
  created_at: string;
}

const EVENT_LABEL: Record<string, string> = {
  page_view: "Page views",
  property_view: "Property views",
  enquiry_submitted: "Enquiries submitted",
  provider_listing_submitted: "Provider listings submitted",
  map_search: "Map searches",
};

export default function Analytics() {
  const [events, setEvents] = useState<AnalyticsEvent[] | null>(null);
  const [days, setDays] = useState(30);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const since = new Date(Date.now() - days * 86400000).toISOString();
      const { data, error } = await supabase
        .from("analytics_events")
        .select("*")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(5000);
      if (cancelled) return;
      if (error) setError(error.message);
      setEvents((data as AnalyticsEvent[]) ?? []);
    })();
    return () => {
      cancelled = true;
    };
  }, [days]);

  if (events === null) return <p className="text-muted">Loading…</p>;

  const counts: Record<string, number> = {};
  for (const e of events) counts[e.event_type] = (counts[e.event_type] ?? 0) + 1;

  const propertyViews: Record<string, { title: string; count: number }> = {};
  for (const e of events) {
    if (e.event_type !== "property_view") continue;
    const id = String(e.meta.property_id ?? "unknown");
    const title = String(e.meta.title ?? "Untitled");
    if (!propertyViews[id]) propertyViews[id] = { title, count: 0 };
    propertyViews[id].count++;
  }
  const topProperties = Object.values(propertyViews)
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  const searches: Record<string, number> = {};
  for (const e of events) {
    if (e.event_type !== "map_search") continue;
    const label = String(e.meta.label ?? e.meta.query ?? "Unknown");
    searches[label] = (searches[label] ?? 0) + 1;
  }
  const topSearches = Object.entries(searches)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);

  // Daily page views, oldest first, so the bars read left-to-right as "over time".
  const byDay: Record<string, number> = {};
  for (const e of events) {
    if (e.event_type !== "page_view") continue;
    const day = e.created_at.slice(0, 10);
    byDay[day] = (byDay[day] ?? 0) + 1;
  }
  const dayEntries = Object.entries(byDay).sort(([a], [b]) => a.localeCompare(b));
  const maxDayCount = Math.max(1, ...dayEntries.map(([, c]) => c));

  return (
    <div>
      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="font-display font-bold text-xl">Analytics</h2>
          <p className="text-muted text-sm mt-1">
            What's happening on the public site — first-party, no cookies, nothing sent anywhere else.
          </p>
        </div>
        <select
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
          className="border-2 border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent"
        >
          <option value={7}>Last 7 days</option>
          <option value={30}>Last 30 days</option>
          <option value={90}>Last 90 days</option>
        </select>
      </div>

      {error && (
        <div className="border-2 border-red-200 bg-red-50 text-red-800 rounded-lg px-4 py-3 mb-6 text-sm">{error}</div>
      )}

      {events.length === 0 ? (
        <div className="border border-dashed border-line rounded-xl p-10 text-center text-muted">
          No activity recorded yet in this window.
        </div>
      ) : (
        <>
          <div className="grid sm:grid-cols-3 md:grid-cols-5 gap-3 mb-8">
            {Object.entries(EVENT_LABEL).map(([key, label]) => (
              <div key={key} className="border border-line rounded-xl bg-surface p-4">
                <div className="text-2xl font-display font-bold">{counts[key] ?? 0}</div>
                <div className="text-muted text-xs mt-1">{label}</div>
              </div>
            ))}
          </div>

          {dayEntries.length > 0 && (
            <div className="border border-line rounded-xl bg-surface p-5 mb-6">
              <h3 className="font-display font-bold text-sm mb-3">Page views by day</h3>
              <div className="flex items-end gap-1.5 h-32">
                {dayEntries.map(([day, count]) => (
                  <div key={day} className="flex-1 flex flex-col items-center justify-end gap-1" title={`${day}: ${count}`}>
                    <div
                      className="w-full bg-accent rounded-t"
                      style={{ height: `${Math.max(4, (count / maxDayCount) * 100)}%` }}
                    />
                    <span className="text-[10px] text-muted whitespace-nowrap">{day.slice(5)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="grid md:grid-cols-2 gap-6">
            <div className="border border-line rounded-xl bg-surface p-5">
              <h3 className="font-display font-bold text-sm mb-3">Most-viewed properties</h3>
              {topProperties.length === 0 ? (
                <p className="text-muted text-sm">No property views yet.</p>
              ) : (
                <ul className="grid gap-2">
                  {topProperties.map((p, i) => (
                    <li key={i} className="flex items-center justify-between gap-3 text-sm">
                      <span className="truncate">{p.title}</span>
                      <span className="font-semibold text-accent flex-none">{p.count}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="border border-line rounded-xl bg-surface p-5">
              <h3 className="font-display font-bold text-sm mb-3">Most-searched areas</h3>
              {topSearches.length === 0 ? (
                <p className="text-muted text-sm">No map searches yet.</p>
              ) : (
                <ul className="grid gap-2">
                  {topSearches.map(([label, count], i) => (
                    <li key={i} className="flex items-center justify-between gap-3 text-sm">
                      <span className="truncate">{label}</span>
                      <span className="font-semibold text-accent flex-none">{count}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
