const SINGULAR_SOLUTION_REFERENCE = /\bSolution\s+(\d+)\b/giu;
const PLURAL_SOLUTION_REFERENCE = /\bSolutions\s+(\d+(?:(?:\s*,\s*(?:and\s+)?|\s+and\s+)\d+)*)/giu;

export function replaceExperimentSolutionReferences(
  rationale: string,
  candidateReferences: readonly string[],
): string {
  const withSingularReferences = rationale.replace(
    SINGULAR_SOLUTION_REFERENCE,
    (match, ordinal: string) => candidateReferences[Number(ordinal) - 1] ?? match,
  );

  return withSingularReferences.replace(PLURAL_SOLUTION_REFERENCE, (match, ordinalList: string) => {
    const ordinals = ordinalList.match(/\d+/gu) ?? [];
    if (ordinals.some((ordinal) => !candidateReferences[Number(ordinal) - 1])) return match;
    return ordinalList.replace(/\d+/gu, (ordinal) => candidateReferences[Number(ordinal) - 1]!);
  });
}
