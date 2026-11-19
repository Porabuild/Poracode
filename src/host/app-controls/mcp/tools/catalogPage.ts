import { z } from "zod";

export const catalogPageFields = {
  offset: z.number().int().nonnegative().default(0),
  limit: z.number().int().min(1).max(200).optional(),
};

export function pageCatalog<T>(rows: readonly T[], offset: number, limit?: number) {
  const end = limit === undefined ? rows.length : offset + limit;
  return {
    rows: rows.slice(offset, end),
    count: rows.length,
    ...(end < rows.length ? { nextOffset: end } : {}),
  };
}
