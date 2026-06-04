import type { Metadata } from 'next';
import './globals.css';
import Sidebar from '@/components/Sidebar';

export const metadata: Metadata = {
  title: 'SERPVault — Private SEO Research Database',
  description: 'Upload, clean, dedupe, tag, and export your SEO research data.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--background)', color: 'var(--foreground)' }}>
        <Sidebar />
        <main style={{ flex: 1, overflowY: 'auto', padding: '1.5rem' }}>
          {children}
        </main>
      </body>
    </html>
  );
}
