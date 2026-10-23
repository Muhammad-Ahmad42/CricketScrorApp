import { matchDisplayDate } from '@/domain/scoring/matchDates';
import { buildScorecardHtml, buildTournamentHtml } from '@/export';
import type { ExportService } from '../contracts';
import type { ServiceContext } from '../core/context';
import { MESSAGES } from '../core/errors';
import { exportsDirectory, joinPath, safeFileName } from '../core/paths';
import { failure } from '../core/result';
import { attempt, inTransaction } from '../core/transaction';
import { scorecardSource, tournamentSource } from './sources';

function dateOf(iso: string): string {
  return iso.slice(0, 10);
}

function localDateOf(iso: string): string {
  if (iso.length <= 10) {
    return iso;
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return dateOf(iso);
  }
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function createExportService(ctx: ServiceContext): ExportService {
  async function printAndStore(html: string, name: string): Promise<{ readonly fileUri: string }> {
    let printed: string;
    try {
      printed = await ctx.printer.printToFile(html);
    } catch (error) {
      throw failure('EXPORT_FAILED', MESSAGES.exportPdf, { detail: error instanceof Error ? error.message : String(error) });
    }
    const target = joinPath(exportsDirectory(ctx.fileSystem.cacheDirectory), `${safeFileName(name)}.pdf`);
    try {
      await ctx.fileSystem.move(printed, target);
      return { fileUri: target };
    } catch {
      return { fileUri: printed };
    }
  }

  return {
    scorecardPdf(matchId) {
      return attempt(MESSAGES.exportPdf, async () => {
        const source = await inTransaction(ctx, (repos) => scorecardSource(ctx, repos, matchId));
        const generatedAt = ctx.clock.now();
        const html = buildScorecardHtml(source, { generatedAt });
        return printAndStore(html, `scorecard ${source.match.title} ${localDateOf(matchDisplayDate(source.match).value)}`);
      });
    },

    tournamentPdf(tournamentId) {
      return attempt(MESSAGES.exportPdf, async () => {
        const source = await inTransaction(ctx, (repos) => tournamentSource(ctx, repos, tournamentId));
        const generatedAt = ctx.clock.now();
        const html = buildTournamentHtml(source, { generatedAt });
        return printAndStore(html, `tournament ${source.snapshot.tournament.name} ${dateOf(generatedAt)}`);
      });
    },

    share(fileUri, mimeType) {
      return attempt(MESSAGES.share, async () => {
        const available = await ctx.sharer.isAvailable().catch(() => false);
        if (!available) {
          throw failure('EXPORT_FAILED', "Sharing isn't available on this device. The file is saved in the app's files.");
        }
        try {
          await ctx.sharer.share(fileUri, {
            mimeType,
            dialogTitle: mimeType === 'application/pdf' ? 'Share PDF' : 'Save backup',
          });
        } catch (error) {
          throw failure('EXPORT_FAILED', MESSAGES.share, { detail: error instanceof Error ? error.message : String(error) });
        }
      });
    },
  };
}
