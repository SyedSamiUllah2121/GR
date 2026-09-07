import type {Metadata} from 'next';
import {MaintenanceReportScreen} from '@/components/MaintenanceReportScreen';

export const metadata: Metadata = {
  title: 'Maintenance Report | Inspection Log',
};

export default function MaintenanceReportPage() {
  return <MaintenanceReportScreen />;
}
