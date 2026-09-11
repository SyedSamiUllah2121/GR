import type {Metadata} from 'next';
import {MaintenanceScheduleScreen} from '@/components/MaintenanceScheduleScreen';

export const metadata: Metadata = {
  title: 'Schedule | Inspection Log',
};

export default function MaintenanceSchedulePage() {
  return <MaintenanceScheduleScreen />;
}
