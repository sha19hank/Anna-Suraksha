import type { Metadata } from 'next';
import './globals.css';
import { AmplifyProvider } from '@/components/ui/AmplifyProvider';
import { Toaster } from 'react-hot-toast';

export const metadata: Metadata = {
  title: 'Anna Suraksha — AI Food Intelligence',
  description: 'Know when food expires. Redirect surplus. Reduce waste.',
  openGraph: {
    title: 'Anna Suraksha',
    description: 'AI-driven food freshness intelligence for India',
    type: 'website',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-body antialiased min-h-screen bg-cream text-earth">
        <AmplifyProvider />
        {children}
        <Toaster
          position="bottom-center"
          toastOptions={{
            style: {
              background: '#2C1810',
              color: '#FAF7F0',
              fontFamily: 'var(--font-dm-sans)',
              borderRadius: '8px',
              fontSize: '14px',
            },
            success: { iconTheme: { primary: '#28A870', secondary: '#FAF7F0' } },
            error:   { iconTheme: { primary: '#E8772E', secondary: '#FAF7F0' } },
          }}
        />
      </body>
    </html>
  );
}
