import type {Metadata} from 'next';
import {NewInspectionScreen} from '@/components/NewInspectionScreen';

export const metadata: Metadata = {
  title: 'New Inspection | Inspection Log',
};

export default function NewInspectionPage() {
  return <NewInspectionScreen />;
}
