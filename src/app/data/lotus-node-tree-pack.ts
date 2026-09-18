import type { NodeTree, NodeTreeNode } from "../components/node-trees";

// Transcribed from the four Lotus path diagrams. The small companion spheres are
// click-to-view hints, not prerequisites; progression follows the drawn arrows.
type NodeSpec = {
  key: string;
  label: string;
  x: number;
  rank: number;
  hint?: string;
  color?: string;
  shrouded?: boolean;
};

type TreeSpec = {
  id: string;
  name: string;
  nodes: NodeSpec[];
  arrows: [string, string][];
};

const blue = "#8FB9F0";
const red = "#E99894";
const violet = "#B8A0D8";
const green = "#A5CD9B";
const gold = "#E7CC86";

const lotusTreeSpecs: TreeSpec[] = [
  {
    id: "lotus-water-genasi",
    name: "Water Genasi Path — Lotus",
    nodes: [
      { key: "water-genasi", label: "Water Genasi", x: 63, rank: 0, color: blue },
      { key: "one-with-the-sea", label: "One with the Sea", x: 41, rank: 1, hint: "Transformation & Combat", color: red },
      { key: "sea-blood", label: "Sea Blood", x: 63, rank: 1, hint: "Internal Buff", color: blue },
      { key: "watercall", label: "Watercall", x: 86, rank: 1, hint: "Magic/Support", color: blue },
      { key: "trident-of-the-reef", label: "Trident of the Reef", x: 14, rank: 2, hint: "Transformation & Weapon Combat", color: violet },
      { key: "oceanic-predator", label: "Oceanic Predator", x: 25, rank: 2, hint: "Transformation & Combat", color: red },
      { key: "current-walker", label: "Current Walker", x: 34, rank: 2, hint: "Transformation & Movement", color: blue },
      { key: "brineclad", label: "Brineclad", x: 44, rank: 2, hint: "Transformation & Defense", color: green },
      { key: "kraken-blood", label: "Kraken Blood", x: 56, rank: 2, hint: "Creature Abilities", color: violet },
      { key: "siren-blood", label: "Siren Blood", x: 63, rank: 2, hint: "Creature Abilities", color: violet },
      { key: "silver-blood", label: "Silver Blood", x: 70, rank: 2, hint: "Internal Buff", color: blue },
      { key: "sea-druid-initiation", label: "Sea Druid Initiation", x: 86, rank: 2, hint: "Magic/Support", color: blue },
      { key: "erlang-weapon-arts", label: "Erlang Weapon Arts", x: 5, rank: 3, hint: "Astrablade · Transformation & Weapon Combat", color: violet },
      { key: "storm-piercer", label: "Storm-piercer", x: 14, rank: 3, hint: "Transformation & Weapon Combat", color: violet },
      { key: "abyss-hunter", label: "Abyss Hunter", x: 25, rank: 3, hint: "Transformation & Combat", color: red },
      { key: "riptide-hunting", label: "Riptide Hunting", x: 34, rank: 3, hint: "Transformation & Movement", color: blue },
      { key: "salt-guard", label: "Salt Guard", x: 44, rank: 3, hint: "Transformation & Defense", color: green },
      { key: "dark-depths", label: "Dark Depths", x: 56, rank: 3, hint: "Creature Abilities", color: violet },
      { key: "naiads-grace", label: "Naiad's Grace", x: 63, rank: 3, hint: "Creature Abilities", color: violet },
      { key: "cursed-heart", label: "Cursed Heart", x: 70, rank: 3, hint: "Internal Buff", color: blue },
      { key: "call-upon-silver", label: "Call Upon Silver", x: 77, rank: 3, hint: "Summon", color: gold },
      { key: "sea-druid", label: "Sea Druid", x: 86, rank: 3, hint: "Magic/Support", color: blue },
      { key: "crush-depth", label: "Crush Depth", x: 96, rank: 3, hint: "Magic Combat", color: red },
      { key: "abysscaller", label: "Abysscaller", x: 96, rank: 4, hint: "Magic Combat", color: red },
    ],
    arrows: [
      ["water-genasi", "one-with-the-sea"], ["water-genasi", "sea-blood"], ["water-genasi", "watercall"],
      ["one-with-the-sea", "trident-of-the-reef"], ["one-with-the-sea", "oceanic-predator"],
      ["one-with-the-sea", "current-walker"], ["one-with-the-sea", "brineclad"],
      ["sea-blood", "brineclad"], ["sea-blood", "kraken-blood"], ["sea-blood", "siren-blood"], ["sea-blood", "silver-blood"],
      ["watercall", "sea-druid-initiation"],
      ["trident-of-the-reef", "erlang-weapon-arts"], ["trident-of-the-reef", "storm-piercer"],
      ["oceanic-predator", "abyss-hunter"], ["current-walker", "riptide-hunting"], ["brineclad", "salt-guard"],
      ["kraken-blood", "dark-depths"], ["siren-blood", "naiads-grace"],
      ["silver-blood", "cursed-heart"], ["silver-blood", "call-upon-silver"],
      ["sea-druid-initiation", "sea-druid"], ["sea-druid-initiation", "crush-depth"],
      ["crush-depth", "abysscaller"],
    ],
  },
  {
    id: "lotus-combination",
    name: "Combination Paths — Lotus",
    nodes: [
      { key: "combination", label: "Combination", x: 50, rank: 0, color: red },
      { key: "starlit-judgement", label: "Starlit Judgement", x: 16, rank: 1, hint: "Offense · ES · EJ", color: red },
      { key: "forgotten-star", label: "Forgotten Star", x: 50, rank: 1, hint: "Form · WS · DE · FC", color: red },
      { key: "horizons-edge", label: "Horizon's Edge", x: 84, rank: 1, hint: "AoE/Buff · EJ", color: red },
      { key: "starlit-unknown", label: "?", x: 16, rank: 2, color: red, shrouded: true },
      { key: "horizons-unknown", label: "?", x: 84, rank: 2, color: red, shrouded: true },
    ],
    arrows: [
      ["combination", "starlit-judgement"], ["combination", "forgotten-star"], ["combination", "horizons-edge"],
      ["starlit-judgement", "starlit-unknown"], ["horizons-edge", "horizons-unknown"],
    ],
  },
  {
    id: "lotus-nythariel",
    name: "Nythariel Path — Lotus",
    nodes: [
      { key: "nythariel", label: "Nythariel", x: 40, rank: 0, color: violet },
      { key: "eventides-judgement", label: "Eventide's Judgement", x: 10, rank: 1, hint: "Offense", color: violet },
      { key: "passive-unknown", label: "?", x: 40, rank: 1, hint: "Passive", color: violet, shrouded: true },
      { key: "forests-call", label: "The Forest's Call", x: 70, rank: 1, hint: "Support", color: violet },
      { key: "faeruns-veil", label: "Faerun's Veil", x: 94, rank: 1, hint: "Support", color: violet },
      { key: "horizons-edge", label: "Horizon's Edge", x: 10, rank: 2, hint: "Offense", color: violet },
      { key: "passive-unknown-advanced", label: "?", x: 40, rank: 2, color: violet, shrouded: true },
      { key: "the-forests", label: "The Forests", x: 70, rank: 2, hint: "All", color: violet },
    ],
    arrows: [
      ["nythariel", "eventides-judgement"], ["nythariel", "passive-unknown"], ["nythariel", "forests-call"],
      ["eventides-judgement", "horizons-edge"], ["passive-unknown", "passive-unknown-advanced"],
      ["forests-call", "the-forests"], ["forests-call", "faeruns-veil"],
    ],
  },
  {
    id: "lotus-astrablade",
    name: "Astrablade Path — Lotus",
    nodes: [
      { key: "astrablade", label: "Astrablade", x: 50, rank: 0, color: blue },
      { key: "western-stars", label: "The Western Stars", x: 14, rank: 1, hint: "Form", color: blue },
      { key: "central-star", label: "The Central Star", x: 50, rank: 1, hint: "Form", color: blue },
      { key: "eastern-stars", label: "The Eastern Stars", x: 86, rank: 1, hint: "Form", color: blue },
    ],
    arrows: [
      ["astrablade", "western-stars"], ["astrablade", "central-star"], ["astrablade", "eastern-stars"],
    ],
  },
];

export function createLotusNodeTreePack(lotusPlayerId?: string): NodeTree[] {
  return lotusTreeSpecs.map((spec) => {
    const nodeId = (key: string) => `${spec.id}-${key}`;
    const nodes: NodeTreeNode[] = spec.nodes.map((node) => ({
      id: nodeId(node.key),
      label: node.label,
      x: node.x,
      y: 100 - node.rank * 20,
      rank: node.rank,
      hint: node.hint,
      color: node.color,
      shrouded: node.shrouded,
      cardIds: [],
      prerequisites: spec.arrows.filter(([, to]) => to === node.key).map(([from]) => nodeId(from)),
    }));
    const connections = spec.arrows.map(([from, to]) => ({ from: nodeId(from), to: nodeId(to) }));
    return {
      id: spec.id,
      name: spec.name,
      assignedTo: lotusPlayerId ? [lotusPlayerId] : [],
      nodes,
      connections,
    };
  });
}
