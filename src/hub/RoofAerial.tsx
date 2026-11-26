import { useCallback, useEffect, useState } from 'react';
import { Camera, CheckCircle2, ExternalLink, RefreshCw } from 'lucide-react';
import type { PreparedRoofAerial, RoofAerialReview } from '../../shared/roofAerial';
import { workflowApi } from './workflowApi';
import { Button, Notice, Spinner } from './ui';

type Entry = { data: PreparedRoofAerial; review: RoofAerialReview | null; expires: number };
const previews = new Map<string, Entry>();
const keyFor = (id: string, source: string, address: string) => `${source}:${id}:${address.trim()}`;
function current(id: string, source: string, address: string): Entry | undefined {
  const key = keyFor(id, source, address);
  const entry = previews.get(key);
  if (entry && entry.expires <= Date.now()) { previews.delete(key); return undefined; }
  return entry;
}
export function reviewedRoofAerial(id: string, source: string, address: string): RoofAerialReview | undefined {
  return current(id, source, address)?.review || undefined;
}

export default function RoofAerial({ leadId, source = 'customer', address, onReview, onContinue, addressChanged = false }: {
  leadId?: string; source?: 'customer' | 'booking'; address?: string | null;
  onReview?: (review: RoofAerialReview | undefined) => void;
  onContinue?: () => void; addressChanged?: boolean;
}) {
  const cached = leadId && address ? current(leadId, source, address) : undefined;
  const [image, setImage] = useState(cached?.data || null);
  const [reviewed, setReviewed] = useState(Boolean(cached?.review));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sample = !leadId || leadId.startsWith('demo-');
  const available = !sample && Boolean(address?.trim()) && !addressChanged;
  const load = useCallback(async (refresh = false) => {
    if (!leadId || !address || leadId.startsWith('demo-') || addressChanged) return;
    const previous = current(leadId, source, address);
    if (previous && !refresh) { setImage(previous.data); setReviewed(Boolean(previous.review)); return; }
    setBusy(true); setError(null); setImage(null); setReviewed(false);
    try {
      const data = await workflowApi.aerial(leadId, source);
      if (!/^data:image\/(png|jpeg);base64,/.test(data.imageDataUrl)) throw new Error('The mapping service did not return a usable aerial image.');
      if (previews.size >= 8) previews.delete(previews.keys().next().value!);
      previews.set(keyFor(leadId, source, address), { data, review: null, expires: Date.now() + 15 * 60 * 1000 });
      setImage(data);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not prepare the roof aerial.'); }
    finally { setBusy(false); }
  }, [leadId, address, source, addressChanged]);
  useEffect(() => { if (available) void load(); }, [available, load]);
  return <section className="mt-4 rounded-xl border border-hub-line bg-hub-muted p-4" aria-label="Prepare roof aerial">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h3 className="m-0 flex items-center gap-2 text-base font-bold text-hub-ink"><Camera size={18} aria-hidden="true" />Prepare roof aerial</h3>
        <p className="m-0 mt-1 text-sm leading-relaxed text-hub-soft">Check the actual house before starting the panel layout.</p></div>
      {available && <Button type="button" variant="ghost" className="px-3 text-xs" disabled={busy} onClick={() => { onReview?.(undefined); void load(true); }}>
        {busy ? <Spinner className="h-4 w-4" /> : <RefreshCw size={14} />}{busy ? 'Preparing…' : image ? 'Refresh aerial' : 'Prepare aerial'}</Button>}
    </div>
    {address && <p className="mb-0 mt-3 break-words text-sm font-semibold text-hub-ink">{address}</p>}
    {!available && <p className="mb-0 mt-3 text-sm text-hub-soft">{addressChanged ? 'Update the street address in the customer record, then reopen the roof designer to prepare its aerial.' : sample ? 'Sign in and open a saved customer to prepare their property aerial.' : 'Add the customer’s full street address first.'}</p>}
    {busy && <div className="flex items-center gap-3 py-8 text-sm text-hub-soft" role="status"><Spinner />Locating the property and preparing satellite imagery…</div>}
    {error && <div className="mt-3"><Notice tone="warn">{error}</Notice></div>}
    {image && !addressChanged && <>
      <figure className="m-0 mt-4"><img src={image.imageDataUrl} alt={`Satellite aerial for ${image.formattedAddress}`} width={1280} height={1280} className="mx-auto block max-h-[380px] w-full rounded-lg bg-hub-bg object-contain" onError={() => { setImage(null); setReviewed(false); setError('The aerial image could not be displayed. Prepare it again before reviewing the house.'); onReview?.(undefined); }} />
        <figcaption className="mt-2 text-xs leading-relaxed text-hub-soft">{image.source} · North up · Prepared {new Date(image.preparedAt).toLocaleDateString('en-US')}. Existing satellite imagery; source imagery date is not supplied.</figcaption>
      </figure>
      <p className="mb-0 mt-2 text-sm text-hub-soft">Matched address: {image.formattedAddress}</p>
      <label className="mt-3 flex min-h-11 cursor-pointer items-start gap-3 text-sm font-semibold text-hub-ink">
        <input type="checkbox" className="mt-1 h-4 w-4 accent-[#176ded]" checked={reviewed} onChange={event => {
          const checked = event.target.checked; setReviewed(checked);
          const review: RoofAerialReview | undefined = checked ? { address: image.address, source: image.source, preparedAt: image.preparedAt, verifiedAt: new Date().toISOString() } : undefined;
          const entry = leadId && address ? current(leadId, source, address) : undefined;
          if (entry) entry.review = review || null;
          onReview?.(review);
        }} />I verified this is the correct house and the roof is visible.
      </label>
      {reviewed && <p className="m-0 flex items-center gap-2 text-sm text-hub-success-ink" role="status"><CheckCircle2 size={16} />Aerial reviewed. Save the roof design to keep this review with the customer.</p>}
      <p className="mb-0 mt-2 text-xs leading-relaxed text-hub-soft">Confirm roof edges, obstructions, measurements, and local setbacks during design. The aerial alone does not verify structural suitability or code compliance.</p>
    </>}
    <div className="mt-3 flex flex-wrap items-center gap-3">
      {onContinue && <Button type="button" disabled={!image || !reviewed || busy || addressChanged} onClick={onContinue}>Continue to roof design</Button>}
      {address && <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-hub-link">Review address in Maps<ExternalLink size={14} /></a>}
    </div>
  </section>;
}
