'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

type Dimension = { key: string; label: string; unit: string; bestSlugs: string[]; values: { slug: string; value: number | string | null }[] };
type College = { slug: string; name: string; shortName: string | null; location: { city: string; state: string } };

export default function ComparePage() {
  const [slugs, setSlugs] = useState('');
  const [colleges, setColleges] = useState<College[]>([]);
  const [dimensions, setDimensions] = useState<Dimension[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    const querySlugs = new URLSearchParams(window.location.search).get('slugs') || '';
    setSlugs(querySlugs);
  }, []);

  useEffect(() => {
    if (!slugs) return;
    fetch(`/api/colleges/compare?slugs=${encodeURIComponent(slugs)}`).then((response) => response.json()).then((body) => {
      if (body.error) setError(body.error.message);
      else { setColleges(body.data.colleges); setDimensions(body.data.dimensions); }
    }).catch(() => setError('Unable to load comparison.'));
  }, [slugs]);

  return <main className="section"><div className="shell"><div className="page-head" style={{ paddingTop: 0 }}><Link className="back" href="/">← Back to explore</Link><h1>Compare colleges</h1><p>See the trade-offs clearly. Winners are calculated from the latest available data.</p></div>{!slugs ? <div className="empty">Select 2–3 colleges from the explore page to compare them.</div> : error ? <div className="empty">{error}</div> : !colleges.length ? <div className="loading">Building comparison…</div> : <section className="panel compare-table"><table><thead><tr><th>Metric</th>{colleges.map((college) => <th key={college.slug}>{college.shortName || college.name}<br /><small>{college.location.city}</small></th>)}</tr></thead><tbody>{dimensions.map((dimension) => <tr key={dimension.key}><td><strong>{dimension.label}</strong><br /><small>{dimension.unit}</small></td>{dimension.values.map((value) => <td className={dimension.bestSlugs.includes(value.slug) ? 'winner' : ''} key={value.slug}>{typeof value.value === 'number' ? dimension.unit === 'INR' ? `₹${(value.value / 100000).toFixed(1)}L` : value.value.toLocaleString('en-IN') : value.value || '—'}{dimension.bestSlugs.includes(value.slug) && <span> ✓</span>}</td>)}</tr>)}</tbody></table></section>}</div></main>;
}
