import type {Metadata} from 'next';
import {ChecklistEditorScreen} from '@/components/ChecklistEditorScreen';

export const metadata: Metadata = {
  title: 'Checklist | Inspection Log',
};

export default function ChecklistEditorPage() {
  return <ChecklistEditorScreen />;
}
