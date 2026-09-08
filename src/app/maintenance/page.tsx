import type {Metadata} from 'next';
import {MaintenanceOverviewScreen} from '@/components/MaintenanceOverviewScreen';

export const metadata: Metadata = {
  title: 'Maintenance | Inspection Log',
};

export default function MaintenancePage() {
  return <MaintenanceOverviewScreen />;
}
