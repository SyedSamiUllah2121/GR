import type {Metadata} from 'next';
import {SummaryScreen} from '@/components/SummaryScreen';

export const metadata: Metadata = {
  title: 'Inspection Summary | Inspection Log',
};

export default async function SummaryPage({
  params,
}: {
  params: Promise<{id: string}>;
}) {
  const {id} = await params;
  return <SummaryScreen key={id} inspectionId={id} />;
}
