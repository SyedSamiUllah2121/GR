import type {Metadata} from 'next';
import {DashboardScreen} from '@/components/DashboardScreen';

export const metadata: Metadata = {
  title: 'Dashboard | Inspection Log',
};

export default function DashboardPage() {
  return <DashboardScreen />;
}
