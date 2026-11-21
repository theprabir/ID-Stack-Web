/**
 * Keep Windows awake while a batch is generating (v0.7.5).
 *
 * A 600-card run can take minutes. Without this, a short display/sleep timeout
 * could suspend the machine mid-job; `SetThreadExecutionState` holds the
 * system awake until the run ends. The screen may still turn off — only sleep
 * is blocked. Best effort: a failure here never stops the batch.
 */
import { invoke, isTauri } from '@tauri-apps/api/core';
import { logMessage } from './appLog';

/**
 * Tell the native shell whether a batch is running.
 * @param active - true at the start of a run, false when it ends
 */
export async function setBatchActive(active: boolean): Promise<void> {
  if (!isTauri()) return;
  try {
    await invoke('set_batch_active', { active });
  } catch (error) {
    logMessage('warn', `Sleep guard ${active ? 'on' : 'off'} failed: ${String(error)}`);
  }
}
