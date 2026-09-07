import {AppShell} from '@/components/AppShell';

export default function MaintenanceLayout({
  children,
}: Readonly<{children: React.ReactNode}>) {
  return <AppShell>{children}</AppShell>;
}
