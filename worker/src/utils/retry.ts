import { RetryStrategy } from 'prisma-db';

export function calculateRetryDelay(
  strategy: RetryStrategy,
  attemptNumber: number, // 1-indexed, meaning this is the Nth failure
  baseDelaySec: number,
  multiplier: number,
  maxDelaySec: number
): number {
  let delay = 0;
  
  if (strategy === 'FIXED') {
    delay = baseDelaySec;
  } else if (strategy === 'LINEAR') {
    delay = baseDelaySec * attemptNumber;
  } else if (strategy === 'EXPONENTIAL') {
    delay = baseDelaySec * Math.pow(multiplier, attemptNumber - 1);
  }
  
  return Math.min(delay, maxDelaySec);
}
