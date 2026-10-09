import type {Metadata, Viewport} from 'next';
import {IBM_Plex_Sans, Source_Serif_4} from 'next/font/google';
import './globals.css';

const ibmPlexSans = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  style: ['normal', 'italic'],
  display: 'swap',
  variable: '--font-ibm-plex-sans',
});

/* The display face for the sign-in screen's headings. */
const sourceSerif = Source_Serif_4({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  display: 'swap',
  variable: '--font-source-serif',
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
    <html lang="en" className={`${ibmPlexSans.variable} ${sourceSerif.variable}`}>
      <body className="bg-[#F6F6F8] text-[#17181D] antialiased">{children}</body>
    </html>
  );
}
