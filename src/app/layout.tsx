import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';

export const metadata: Metadata = {
  title: 'CampusCompass | Find your right college',
  description: 'Search, compare and predict your best-fit colleges in India.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><header className="site-header"><div className="shell nav"><Link href="/" className="brand"><span className="brand-mark">C</span><span>CampusCompass</span></Link><nav><Link href="/">Explore</Link><Link href="/compare">Compare</Link><Link href="/predict">Predictor</Link></nav><Link href="/predict" className="nav-cta">Find my college <span>↗</span></Link></div></header>{children}<footer className="footer"><div className="shell footer-inner"><span>© 2026 CampusCompass</span><span>Built for better college decisions</span></div></footer></body></html>;
}
