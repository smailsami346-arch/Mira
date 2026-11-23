import { MemoryRepository, type Repository } from "./repository";

const g = globalThis as unknown as { __sfe_repo?: Repository };

// Singleton repository (survives Next.js hot reloads in dev).
export function getRepo(): Repository {
  if (!g.__sfe_repo) g.__sfe_repo = new MemoryRepository();
  return g.__sfe_repo;
}
