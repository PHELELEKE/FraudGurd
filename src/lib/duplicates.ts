export type DuplicateCandidate = {
  id: number;
  ref: string;
  item: string;
  company: string;
  requester: string;
};

export function normalizeDuplicateItem(item: string): string {
  return item.trim().toLowerCase();
}

export function findDuplicates(target: DuplicateCandidate, candidates: DuplicateCandidate[]): DuplicateCandidate[] {
  const targetItem = normalizeDuplicateItem(target.item);
  return candidates.filter((candidate) => candidate.id !== target.id && normalizeDuplicateItem(candidate.item) === targetItem);
}
