import {AppShell} from '@/components/AppShell';

export default function ChecklistLayout({
  children,
}: Readonly<{children: React.ReactNode}>) {
  return <AppShell>{children}</AppShell>;
}
