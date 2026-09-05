export function getNextStrategyVersionNumber(existingVersionNumbers: readonly number[]) {
  return existingVersionNumbers.length === 0 ? 1 : Math.max(...existingVersionNumbers) + 1;
}

export function canEditStrategyVersionConfig(completedRunCount: number) {
  return completedRunCount === 0;
}

export function assertStrategyVersionConfigEditable(completedRunCount: number) {
  if (!canEditStrategyVersionConfig(completedRunCount)) {
    throw new Error("Strategy versions used by completed runs cannot be edited. Create a new version instead.");
  }
}
