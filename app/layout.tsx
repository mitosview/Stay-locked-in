import './globals.css';
import Link from 'next/link';

export const metadata = {
  title: 'Stay Locked In',
  description: 'Coach + athlete SaaS powered by Supabase and AI.'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <main>
          <h1>Stay Locked In</h1>
          <p>Athlete-centered coaching platform.</p>
          <nav style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
            <Link href="/coach">Coach Dashboard</Link>
            <Link href="/athlete">Athlete Portal</Link>
          </nav>
          {children}
        </main>
      </body>
    </html>
  );
}
