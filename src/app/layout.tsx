import type {Metadata, Viewport} from 'next';
import {IBM_Plex_Sans} from 'next/font/google';
import './globals.css';

const ibmPlexSans = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  style: ['normal', 'italic'],
  display: 'swap',
  variable: '--font-ibm-plex-sans',
});

export const metadata: Metadata = {
  title: 'Inspection Log',
  description: 'Weekly restaurant hygiene and service inspection log.',
  openGraph: {
    title: 'Inspection Log',
    description: 'Weekly restaurant hygiene and service inspection log.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{children: React.ReactNode}>) {
  return (
    <html lang="en" className={ibmPlexSans.variable}>
      <body className="bg-[#F5F3EC] text-[#242217] antialiased">{children}</body>
    </html>
  );
}
