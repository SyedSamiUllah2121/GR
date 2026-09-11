import type {Metadata} from 'next';
import {EquipmentScreen} from '@/components/EquipmentScreen';

export const metadata: Metadata = {
  title: 'Equipment | Inspection Log',
};

export default function EquipmentPage() {
  return <EquipmentScreen />;
}
