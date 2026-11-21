import { useEffect } from 'react';
import { isTauri } from '@tauri-apps/api/core';
import { getCurrentWindow, ProgressBarStatus } from '@tauri-apps/api/window';

/** Taskbar progress states the Windows shell understands */
export type TaskbarProgressStatus = 'none' | 'normal' | 'paused' | 'error';

const STATUS_MAP: Record<Exclude<TaskbarProgressStatus, 'none'>, ProgressBarStatus> = {
  normal: ProgressBarStatus.Normal,
  paused: ProgressBarStatus.Paused,
  error: ProgressBarStatus.Error,
};

/**
 * Mirror batch progress onto the taskbar button (v0.7.5).
 *
 * A minimized window still shows how far the run got, and a paused/error run
 * is visible without restoring the window. Cleared automatically on unmount,
 * so a finished or abandoned job never leaves a stuck progress bar.
 *
 * @param status - normal while running, paused/error as needed, none when idle
 * @param progress - 0–100
 */
export function useTaskbarProgress(status: TaskbarProgressStatus, progress: number): void {
  useEffect(() => {
    if (!isTauri()) return;
    const window = getCurrentWindow();
    const value = Math.max(0, Math.min(100, Math.round(progress)));
    const state =
      status === 'none'
        ? { status: ProgressBarStatus.None }
        : { status: STATUS_MAP[status], progress: value };
    void window.setProgressBar(state).catch(() => undefined);
  }, [status, progress]);

  // Leaving Step 4 must not leave a stale bar on the taskbar button.
  useEffect(() => {
    if (!isTauri()) return;
    const window = getCurrentWindow();
    return () => {
      void window.setProgressBar({ status: ProgressBarStatus.None }).catch(() => undefined);
    };
  }, []);
}
