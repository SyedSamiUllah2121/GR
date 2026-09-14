import type {Metadata} from 'next';
import {EquipmentScreen} from '@/components/EquipmentScreen';

export const metadata: Metadata = {
  title: 'Appliances | Inspection Log',
};

export default function EquipmentPage() {
  return <EquipmentScreen />;
}
