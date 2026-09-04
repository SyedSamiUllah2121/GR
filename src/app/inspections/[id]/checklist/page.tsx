import type {Metadata} from 'next';
import {ChecklistScreen} from '@/components/ChecklistScreen';

export const metadata: Metadata = {
  title: 'Checklist | Inspection Log',
};

export default async function ChecklistPage({
  params,
}: {
  params: Promise<{id: string}>;
}) {
  const {id} = await params;
  return <ChecklistScreen key={id} inspectionId={id} />;
}
