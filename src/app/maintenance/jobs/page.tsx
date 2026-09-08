import type {Metadata} from 'next';
import {MaintenanceScreen} from '@/components/MaintenanceScreen';

export const metadata: Metadata = {
  title: 'Job Board | Inspection Log',
};

export default function MaintenanceJobsPage() {
  return <MaintenanceScreen />;
}
