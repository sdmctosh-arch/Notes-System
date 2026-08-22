import { useState, useEffect } from 'react';
import { getSettings, subscribeSettings } from './settings';

export function useSettings() {
  const [settings, setSettingsState] = useState(getSettings());
  useEffect(() => subscribeSettings(setSettingsState), []);
  return settings;
}
