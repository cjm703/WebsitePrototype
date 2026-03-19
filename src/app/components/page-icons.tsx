import {
  Globe, Star, Home, Zap, Shield, Skull, Flame, Heart, Music,
  BookOpen, Scroll, Map, Trophy, Crown, Gem, Eye, Compass,
  Anchor, Swords, Building2, Sparkles, Sun, Moon, Rocket,
  Terminal, Radio, Newspaper, Coffee, Brain, Atom, Lock, Key,
  Lightbulb, Target, Flag, Bookmark, Hexagon, Ghost, Bug,
  Hammer, Wrench, Diamond, Wand, Bird, Cat, Fish, Trees,
  Mountain, Waves, CircleDot, type LucideIcon,
} from "lucide-react";

export interface PageIconOption {
  name: string;
  label: string;
  Icon: LucideIcon;
}

export const PAGE_ICONS: PageIconOption[] = [
  { name: "globe", label: "Globe", Icon: Globe },
  { name: "star", label: "Star", Icon: Star },
  { name: "home", label: "Home", Icon: Home },
  { name: "zap", label: "Zap", Icon: Zap },
  { name: "shield", label: "Shield", Icon: Shield },
  { name: "skull", label: "Skull", Icon: Skull },
  { name: "flame", label: "Flame", Icon: Flame },
  { name: "heart", label: "Heart", Icon: Heart },
  { name: "music", label: "Music", Icon: Music },
  { name: "book", label: "Book", Icon: BookOpen },
  { name: "scroll", label: "Scroll", Icon: Scroll },
  { name: "map", label: "Map", Icon: Map },
  { name: "trophy", label: "Trophy", Icon: Trophy },
  { name: "crown", label: "Crown", Icon: Crown },
  { name: "gem", label: "Gem", Icon: Gem },
  { name: "eye", label: "Eye", Icon: Eye },
  { name: "compass", label: "Compass", Icon: Compass },
  { name: "anchor", label: "Anchor", Icon: Anchor },
  { name: "swords", label: "Swords", Icon: Swords },
  { name: "building", label: "Building", Icon: Building2 },
  { name: "sparkles", label: "Sparkles", Icon: Sparkles },
  { name: "sun", label: "Sun", Icon: Sun },
  { name: "moon", label: "Moon", Icon: Moon },
  { name: "rocket", label: "Rocket", Icon: Rocket },
  { name: "terminal", label: "Terminal", Icon: Terminal },
  { name: "radio", label: "Radio", Icon: Radio },
  { name: "newspaper", label: "News", Icon: Newspaper },
  { name: "coffee", label: "Coffee", Icon: Coffee },
  { name: "brain", label: "Brain", Icon: Brain },
  { name: "atom", label: "Atom", Icon: Atom },
  { name: "lock", label: "Lock", Icon: Lock },
  { name: "key", label: "Key", Icon: Key },
  { name: "lightbulb", label: "Lightbulb", Icon: Lightbulb },
  { name: "target", label: "Target", Icon: Target },
  { name: "flag", label: "Flag", Icon: Flag },
  { name: "bookmark", label: "Bookmark", Icon: Bookmark },
  { name: "hexagon", label: "Hexagon", Icon: Hexagon },
  { name: "ghost", label: "Ghost", Icon: Ghost },
  { name: "bug", label: "Bug", Icon: Bug },
  { name: "hammer", label: "Hammer", Icon: Hammer },
  { name: "wrench", label: "Wrench", Icon: Wrench },
  { name: "diamond", label: "Diamond", Icon: Diamond },
  { name: "wand", label: "Wand", Icon: Wand },
  { name: "bird", label: "Bird", Icon: Bird },
  { name: "cat", label: "Cat", Icon: Cat },
  { name: "fish", label: "Fish", Icon: Fish },
  { name: "trees", label: "Trees", Icon: Trees },
  { name: "mountain", label: "Mountain", Icon: Mountain },
  { name: "waves", label: "Waves", Icon: Waves },
  { name: "circle", label: "Circle", Icon: CircleDot },
];

export function getPageIcon(name: string | undefined): LucideIcon {
  if (!name) return Globe;
  return PAGE_ICONS.find((i) => i.name === name)?.Icon || Globe;
}
