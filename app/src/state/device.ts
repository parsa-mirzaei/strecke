import type { KeyValueStore } from '@core/data/adapter.ts';
import type { PersistState } from '../storage/persist';

/** Device bookkeeping (not part of a backup): runs, backups, the persistent-storage answer. */
export interface DeviceInfo {
  completedRuns: number;
  runsSinceBackup: number;
  lastBackupAt: number | null;
  backupHintShown: boolean;
  persist: PersistState | null;
}

const KEY = 'device.v1';
export const DEFAULT_DEVICE: DeviceInfo = { completedRuns: 0, runsSinceBackup: 0, lastBackupAt: null, backupHintShown: false, persist: null };

export async function loadDevice(kv: KeyValueStore): Promise<DeviceInfo> {
  try { return { ...DEFAULT_DEVICE, ...((await kv.get<DeviceInfo>(KEY)) ?? {}) }; } catch { return DEFAULT_DEVICE; }
}
export async function saveDevice(kv: KeyValueStore, d: DeviceInfo): Promise<void> {
  try { await kv.set(KEY, d); } catch { /* bookkeeping only */ }
}
