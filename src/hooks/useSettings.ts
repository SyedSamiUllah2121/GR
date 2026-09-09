'use client';

import { useEffect, useState } from 'react';
import { DEFAULT_SETTINGS, Settings, getSettings, subscribeToSettings } from '../services/settings';

/**
 * The live system settings, re-read whenever the admin changes one.
 *
 * Starts from the defaults rather than from storage so the server and the
 * first client render agree — screens outside the app shell render on the
 * server, where there is no storage to read. The effect below fills in the
 * stored values immediately after mount.
 */
export function useSettings(): Settings {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);

  useEffect(() => {
    const refresh = () => setSettings(getSettings());
    refresh();
    return subscribeToSettings(refresh);
  }, []);

  return settings;
}
