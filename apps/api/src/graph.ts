export type DirectedLink = { sourceNodeId: string; targetNodeId: string };
/** True if adding from -> to would introduce a directed cycle. */
export function createsCycle(edges: DirectedLink[], from: string, to: string): boolean {
  if (from === to) return true;
  const visited = new Set<string>();
  const adjacency = new Map<string, string[]>();
  for (const e of edges) adjacency.set(e.sourceNodeId, [...(adjacency.get(e.sourceNodeId) || []), e.targetNodeId]);
  const pending = [to];
  while (pending.length) {
    const current = pending.pop()!;
    if (current === from) return true;
    if (visited.has(current)) continue;
    visited.add(current);
    pending.push(...(adjacency.get(current) || []));
  }
  return false;
}
