export const WIKI_HIERARCHY_RELATIONSHIP_TYPES = [
  "parent of",
  "child of",
  "sibling of",
] as const;

export const WIKI_RELATIONSHIP_TYPES = [
  ...WIKI_HIERARCHY_RELATIONSHIP_TYPES,
  "belongs to",
  "contains",
  "located in",
  "member of",
  "has member",
  "ally of",
  "enemy of",
  "teacher of",
  "student of",
  "created by",
  "created",
  "uses",
  "used by",
  "related to",
] as const;

const INVERSE_RELATIONSHIP_TYPES: Record<string, string> = {
  "parent of": "child of",
  "child of": "parent of",
  "sibling of": "sibling of",
  "belongs to": "contains",
  contains: "belongs to",
  "located in": "contains",
  "member of": "has member",
  "has member": "member of",
  "ally of": "ally of",
  "enemy of": "enemy of",
  "teacher of": "student of",
  "student of": "teacher of",
  "created by": "created",
  created: "created by",
  uses: "used by",
  "used by": "uses",
  "related to": "related to",
};

export function getInverseWikiRelationshipType(type: string): string | null {
  return INVERSE_RELATIONSHIP_TYPES[type.trim().toLowerCase()] || null;
}
