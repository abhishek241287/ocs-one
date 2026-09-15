export interface StartupDependencies {
  seedDatabase: () => Promise<unknown>;
  backfillProducts: () => Promise<unknown>;
  listen: () => void;
  isProduction: boolean;
  exit: (code: number) => void;
  onError: (error: unknown) => void;
}

export async function startAfterBootstrap(deps: StartupDependencies): Promise<void> {
  try {
    await deps.seedDatabase();
    await deps.backfillProducts();
    deps.listen();
  } catch (error) {
    deps.onError(error);
    if (deps.isProduction) {
      deps.exit(1);
      return;
    }
    deps.listen();
  }
}