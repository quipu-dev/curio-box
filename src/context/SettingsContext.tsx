import type React from 'react';
import { createContext, useCallback, useContext, useMemo, useState } from 'react';

export type DefaultCreationMode = 'clipboard' | 'scratch';

export interface UserSettings {
  enableGrouping: boolean;
  defaultCreationMode: DefaultCreationMode;
}

interface SettingsContextValue {
  settings: UserSettings;
  updateSettings: (partial: Partial<UserSettings>) => void;
  toggleGrouping: () => void;
}

const STORAGE_KEY = 'curio_user_settings_v1';

const DEFAULT_SETTINGS: UserSettings = {
  enableGrouping: false,
  defaultCreationMode: 'clipboard',
};

function getSavedSettings(): UserSettings {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        enableGrouping: typeof parsed.enableGrouping === 'boolean' ? parsed.enableGrouping : false,
        defaultCreationMode: parsed.defaultCreationMode === 'scratch' ? 'scratch' : 'clipboard',
      };
    }
  } catch {
    // 容错降级
  }
  return DEFAULT_SETTINGS;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export const SettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [settings, setSettingsState] = useState<UserSettings>(getSavedSettings);

  const updateSettings = useCallback((partial: Partial<UserSettings>) => {
    setSettingsState((prev) => {
      const next = { ...prev, ...partial };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch (err) {
        console.warn('持久化设置失败:', err);
      }
      return next;
    });
  }, []);

  const toggleGrouping = useCallback(() => {
    updateSettings({ enableGrouping: !settings.enableGrouping });
  }, [settings.enableGrouping, updateSettings]);

  const contextValue = useMemo(
    () => ({
      settings,
      updateSettings,
      toggleGrouping,
    }),
    [settings, updateSettings, toggleGrouping],
  );

  return <SettingsContext.Provider value={contextValue}>{children}</SettingsContext.Provider>;
};

export function useSettings(): SettingsContextValue {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
}
