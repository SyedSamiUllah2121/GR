import {AppShell} from '@/components/AppShell';

export default function UsersLayout({
  children,
}: Readonly<{children: React.ReactNode}>) {
  return <AppShell>{children}</AppShell>;
}
