/**
 * @oks/etl — публичный интерфейс пакета (используется apps/api: seed и джобы).
 */

export * from './csv_parser';
export * from './normalize';
export * from './quality';
export * from './geo_utils';
export * from './geocode/types';
export * from './geocode/scoring';
export * from './geocode/provider';
export * from './geocode/pipeline';
export { runDryRun, REPO_ROOT } from './dry_run';
export type { DryRunOptions, DryRunSummary } from './dry_run';
export { runGeocodeJob } from './geocode_job';
export {
  ORGANIZATION_ALIASES,
  PROGRAM_NP_ALIASES,
  PROGRAM_FP_ALIASES,
  GRBS_TO_INDUSTRY,
  GRBS_INDUSTRY_AMBIGUOUS,
  SETTLEMENT_TO_MUNICIPALITY,
  orgAliasKey,
} from './config/aliases';
