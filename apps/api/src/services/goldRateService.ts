import { config } from '../config';
import { AppError } from '../lib/errors';
import { logger } from '../logger';

/**
 * Current 24K rate in paise per gram. The only way the app reads the rate (CLAUDE.md §4.2),
 * async so a cached live-rate source can replace the config value later.
 */
export async function getGoldRate(): Promise<bigint> {
  const raw = config.goldRate24kPaisePerGram;
  if (!/^\d+$/.test(raw) || BigInt(raw) <= 0n) {
    logger.error({ goldRate24kPaisePerGram: raw }, 'Invalid GOLD_RATE_24K_PAISE_PER_GRAM');
    throw new AppError(503, 'GOLD_RATE_UNAVAILABLE', 'The gold rate is unavailable right now. Please try again later.');
  }
  return BigInt(raw);
}
