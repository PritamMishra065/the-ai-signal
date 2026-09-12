'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';

type Detail = {
  name: string; shortName: string | null;
  overview: { description: string; location: { city: string; state: string }; ownership: string; establishedYear: number; campusAreaAcres: number | null; naacGrade: string | null; nirfRank: number | null };
  rating: { average: number; count: number };
  fees: { minAnnualInr: number | null };
  courses: { id: string; name: string; degreeLevel: string; stream: string; durationMonths: number; annualFeeInr: number; totalSeats: number }[];
  placements: { latest: { year: number; medianPackageLakhs: number | null; placementRatePct: number | null; topRecruiters: string[] } | null };
  reviews: { id: string; authorName: string; title: string; body: string; graduationYear: number; ratings: { overall: number } }[];
};

const money = (value: number | null) => value === null ? '—' : `₹${(value / 100000).toFixed(1)}L`;
const initials = (name: string) => name.split(/\s+/).slice(0, 2).map((x) => x[0]).join('').toUpperCase();

export default function CollegePage() {
  const { slug } = useParams<{ slug: string }>();
  const [college, setCollege] = useState<Detail | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [review, setReview] = useState({ authorName: '', authorEmail: '', overallRating: 5, title: '', body: '', graduationYear: new Date().getFullYear() });

  useEffect(() => {
    fetch(`/api/colleges/${slug}`).then((response) => response.json()).then((body) => body.error ? setError(body.error.message) : setCollege(body.data)).catch(() => setError('Unable to load this college.'));
  }, [slug]);

  if (error) return <main className="shell page-head"><div className="empty">{error}<br /><Link className="icon-link" href="/">← Back to explore</Link></div></main>;
  if (!college) return <main className="shell page-head"><div className="loading">Loading college profile…</div></main>;
  const latest = college.placements.latest;

  return <>
    <section className="detail-hero"><div className="shell"><Link className="back" href="/">← Back to colleges</Link><div className="detail-title"><div className="college-logo">{initials(college.name)}</div><div><h1>{college.shortName || college.name}</h1><p>{college.overview.location.city}, {college.overview.location.state} · {college.overview.ownership.toLowerCase()} · Established {college.overview.establishedYear}</p></div></div></div></section>
    <main className="section"><div className="shell detail-grid"><div>
      <section className="panel"><h2>About the college</h2><p>{college.overview.description}</p><div className="info-grid"><div><span>NIRF rank</span><strong>#{college.overview.nirfRank ?? '—'}</strong></div><div><span>Student rating</span><strong>★ {college.rating.average.toFixed(1)} / 5</strong></div><div><span>Annual fees</span><strong>{money(college.fees.minAnnualInr)}</strong></div><div><span>Campus</span><strong>{college.overview.campusAreaAcres ? `${college.overview.campusAreaAcres} acres` : '—'}</strong></div><div><span>NAAC grade</span><strong>{college.overview.naacGrade ?? '—'}</strong></div><div><span>Reviews</span><strong>{college.rating.count}</strong></div></div></section>
      <section className="panel"><h2>Courses & fees</h2><div className="table-wrap"><table><thead><tr><th>Course</th><th>Stream</th><th>Duration</th><th>Annual fee</th><th>Seats</th></tr></thead><tbody>{college.courses.map((course) => <tr key={course.id}><td><strong>{course.name}</strong><br /><small>{course.degreeLevel.toLowerCase()}</small></td><td>{course.stream}</td><td>{course.durationMonths / 12} years</td><td>{money(course.annualFeeInr)}</td><td>{course.totalSeats}</td></tr>)}</tbody></table></div></section>
      <section className="panel"><h2>Placements</h2>{latest ? <><div className="info-grid"><div><span>Median package</span><strong>{money(latest.medianPackageLakhs === null ? null : latest.medianPackageLakhs * 100000)}</strong></div><div><span>Placement rate</span><strong>{latest.placementRatePct ?? '—'}%</strong></div><div><span>Latest year</span><strong>{latest.year}</strong></div></div><p>Top recruiters: {latest.topRecruiters.join(' · ')}</p></> : <p>No placement data reported yet.</p>}</section>
      <section className="panel"><h2>Student reviews</h2>{college.reviews.length ? college.reviews.map((item) => <div className="review" key={item.id}><h4>{item.title} <span className="rating">★ {item.ratings.overall}</span></h4><small>{item.authorName} · Class of {item.graduationYear}</small><p>{item.body}</p></div>) : <p>No reviews yet.</p>}</section>
    </div><aside><section className="panel"><h2>Share your experience</h2>{message && <div className="notice">{message}</div>}<form onSubmit={async (event) => { event.preventDefault(); setMessage('Submitting…'); const response = await fetch(`/api/colleges/${slug}/reviews`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(review) }); const body = await response.json(); setMessage(body.error?.message || 'Review submitted successfully. Refresh to see it.'); }}><div className="form-grid"><div className="field"><label>Your name</label><input required value={review.authorName} onChange={(event) => setReview({ ...review, authorName: event.target.value })} /></div><div className="field"><label>Email</label><input required type="email" value={review.authorEmail} onChange={(event) => setReview({ ...review, authorEmail: event.target.value })} /></div><div className="field full"><label>Review title</label><input required minLength={5} value={review.title} onChange={(event) => setReview({ ...review, title: event.target.value })} /></div><div className="field full"><label>Your review</label><textarea required minLength={40} value={review.body} onChange={(event) => setReview({ ...review, body: event.target.value })} /></div><div className="field"><label>Rating</label><select value={review.overallRating} onChange={(event) => setReview({ ...review, overallRating: Number(event.target.value) })}>{[5, 4, 3, 2, 1].map((value) => <option key={value} value={value}>{value} / 5</option>)}</select></div><div className="field"><label>Graduation year</label><input type="number" value={review.graduationYear} onChange={(event) => setReview({ ...review, graduationYear: Number(event.target.value) })} /></div><div className="field full"><button className="button">Submit review</button></div></div></form></section></aside></div></main>
  </>;
}
