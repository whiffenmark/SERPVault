import type { Metadata } from 'next';
import './globals.css';
import Sidebar from '@/components/Sidebar';

export const metadata: Metadata = {
  title: 'SERPVault — Private SEO Research Database',
  description: 'Upload, clean, dedupe, tag, and export your SEO research data.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  let saved = localStorage.getItem('serpvault_theme');
                  if (!saved) {
                    saved = localStorage.getItem('theme');
                  }
                  if (saved === 'light' || saved === 'dark') {
                    document.documentElement.setAttribute('data-theme', saved);
                  } else {
                    const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
                    document.documentElement.setAttribute('data-theme', systemDark ? 'dark' : 'light');
                  }
                } catch (e) {}
              })();
            `,
          }}
        />
      </head>
      <body className="app-layout">
        <Sidebar />
        <main className="app-main">
          {children}
        </main>
      </body>
    </html>
  );
}
