import type { Department, Entity } from '../types';

/* ------------------------------------------------------------------ */
/* Legal entity tree helpers                                           */
/*                                                                     */
/* The workspace is one tenant made of a group of companies and their  */
/* sub-companies. Screens that let a user focus on a single entity     */
/* share the traversal rules here so the tree is read the same way     */
/* everywhere: a selection covers the entity itself plus every         */
/* company beneath it.                                                 */
/* ------------------------------------------------------------------ */

export interface EntityOption {
  entity: Entity;
  /** 0 = group of company, 1 = company, 2 = sub-company … */
  depth: number;
}

/** Walks up the entity tree to the root group of company. */
export function entityRoot(entities: Entity[], entity: Entity | undefined): Entity | undefined {
  let current = entity;
  const seen = new Set<string>();
  while (current?.parentId) {
    if (seen.has(current.id)) break;
    seen.add(current.id);
    const parentId: string = current.parentId;
    current = entities.find((e) => e.id === parentId);
  }
  return current;
}

/** The selected entity plus every company / sub-company beneath it, with depth for indenting. */
export function entitySubtree(entities: Entity[], rootId: string): EntityOption[] {
  const root = entities.find((e) => e.id === rootId);
  if (!root) return [];
  const out: EntityOption[] = [{ entity: root, depth: 0 }];
  const seen = new Set<string>([root.id]);
  for (let i = 0; i < out.length; i += 1) {
    const depth = out[i].depth;
    entities
      .filter((e) => e.parentId === out[i].entity.id && !seen.has(e.id))
      .forEach((child) => {
        seen.add(child.id);
        out.push({ entity: child, depth: depth + 1 });
      });
  }
  return out;
}

/** Ids of the entity and all its descendants — the data a selection covers. */
export function entitySubtreeIds(entities: Entity[], rootId: string): Set<string> {
  return new Set(entitySubtree(entities, rootId).map((option) => option.entity.id));
}

/** The entity plus all of its ancestors, used to anchor a selection in the tree. */
export function entityAncestorIds(entities: Entity[], entityId: string): string[] {
  const out: string[] = [];
  let current = entities.find((e) => e.id === entityId);
  const seen = new Set<string>();
  while (current) {
    if (seen.has(current.id)) break;
    seen.add(current.id);
    out.push(current.id);
    current = current.parentId ? entities.find((e) => e.id === current!.parentId) : undefined;
  }
  return out;
}

/**
 * Entities the signed-in user may focus on. Only entities that hold a
 * department in their scope are offered, plus their ancestors so the
 * hierarchy reads group → company → sub-company. A department head can
 * therefore never pick an entity they have no data in.
 */
export function scopeEntityOptions(entities: Entity[], departments: Department[]): EntityOption[] {
  const candidateIds = new Set<string>();
  departments.forEach((department) => {
    entityAncestorIds(entities, department.entityId).forEach((id) => candidateIds.add(id));
  });
  if (!candidateIds.size) return [];

  const roots = entities.filter((entity) => !entity.parentId && candidateIds.has(entity.id));
  const out: EntityOption[] = [];
  const seen = new Set<string>();
  const walk = (entity: Entity, depth: number) => {
    if (seen.has(entity.id) || !candidateIds.has(entity.id)) return;
    seen.add(entity.id);
    out.push({ entity, depth });
    entities
      .filter((child) => child.parentId === entity.id)
      .forEach((child) => walk(child, depth + 1));
  };
  roots.forEach((root) => walk(root, 0));
  return out;
}

/** Departments inside an entity selection (the entity plus its companies beneath). */
export function departmentsInEntityScope(
  entities: Entity[],
  departments: Department[],
  selectedEntityId: string,
): Department[] {
  if (!selectedEntityId || selectedEntityId === 'all') return departments;
  const tree = entitySubtreeIds(entities, selectedEntityId);
  return departments.filter((department) => tree.has(department.entityId));
}

/** Label used in dashboard copy: “the group” when everything is in scope. */
export function entityScopeLabel(entities: Entity[], selectedEntityId: string): string {
  if (!selectedEntityId || selectedEntityId === 'all') return 'the group';
  return entities.find((entity) => entity.id === selectedEntityId)?.name ?? 'the group';
}
