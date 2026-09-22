import type {Metadata} from 'next';
import {Suspense} from 'react';
import {MaintenanceScreen} from '@/components/MaintenanceScreen';

export const metadata: Metadata = {
  title: 'Job Board | Inspection Log',
};

/**
 * The board reads `?equipment=` off the URL, which is what an appliance's
 * History button links to. A client component that reads search params has to
 * sit inside a Suspense boundary or the production build fails outright — and
 * dev renders routes on demand, so nothing here would have said so.
 *
 * Nothing to show while it waits: the board is drawn from the browser's own
 * store, so AppShell is already holding the page until it has mounted.
 */
export default function MaintenanceJobsPage() {
  return (
    <Suspense fallback={null}>
      <MaintenanceScreen />
    </Suspense>
  );
}
