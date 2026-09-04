import type {Metadata} from 'next';
import {RecordsListScreen} from '@/components/RecordsListScreen';

export const metadata: Metadata = {
  title: 'Inspection Records | Inspection Log',
};

export default function InspectionsPage() {
  return <RecordsListScreen />;
}
