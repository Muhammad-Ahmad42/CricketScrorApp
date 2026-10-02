import { create } from 'zustand';
import type { AppServices, ServiceResult } from '@/services/contracts';
import type { ExportStore } from './contracts';
import { call } from './internal/call';

export const useExportStore = create<ExportStore>()((set) => {
  const run = async <T>(task: (services: AppServices) => Promise<ServiceResult<T>>): Promise<ServiceResult<T>> => {
    set({ status: 'saving', error: null });
    const result = await call(task);
    set(result.ok ? { status: 'ready' } : { status: 'ready', error: result.error });
    return result;
  };

  return {
    status: 'idle',
    error: null,

    async scorecardPdf(matchId) {
      const result = await run((services) => services.export.scorecardPdf(matchId));
      return result.ok ? result.value.fileUri : null;
    },

    async tournamentPdf(tournamentId) {
      const result = await run((services) => services.export.tournamentPdf(tournamentId));
      return result.ok ? result.value.fileUri : null;
    },

    async share(fileUri, mimeType) {
      return (await run((services) => services.export.share(fileUri, mimeType))).ok;
    },

    clearError() {
      set({ error: null });
    },
  };
});
