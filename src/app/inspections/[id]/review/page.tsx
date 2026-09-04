import type {Metadata} from 'next';
import {ReviewScreen} from '@/components/ReviewScreen';

export const metadata: Metadata = {
  title: 'Review & Submit | Inspection Log',
};

export default async function ReviewPage({
  params,
}: {
  params: Promise<{id: string}>;
}) {
  const {id} = await params;
  return <ReviewScreen key={id} inspectionId={id} />;
}
