export function combinations<T>(items: T[], choose: number): T[][] {
  if (choose < 0 || choose > items.length) return [];
  if (choose === 0) return [[]];
  if (choose === items.length) return [items.slice()];

  const result: T[][] = [];
  const current: T[] = [];

  function walk(start: number): void {
    if (current.length === choose) {
      result.push(current.slice());
      return;
    }

    const remainingNeeded = choose - current.length;
    for (let i = start; i <= items.length - remainingNeeded; i += 1) {
      current.push(items[i]);
      walk(i + 1);
      current.pop();
    }
  }

  walk(0);
  return result;
}
