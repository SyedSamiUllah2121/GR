import type {Metadata} from 'next';
import {MaintenanceJobScreen} from '@/components/MaintenanceJobScreen';

export const metadata: Metadata = {
  title: 'Maintenance Job | Inspection Log',
};

export default async function MaintenanceJobPage({
  params,
}: {
  params: Promise<{id: string}>;
}) {
  const {id} = await params;
  return <MaintenanceJobScreen key={id} jobId={id} />;
}
