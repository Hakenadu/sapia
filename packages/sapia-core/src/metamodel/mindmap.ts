/** Language-neutral model of a mind map. */
export interface MindmapModel {
  kind: 'mindmap';
  title?: string;
  root: MindmapNode;
}

export type MindmapShape = 'default' | 'box' | 'rounded' | 'circle' | 'cloud' | 'bang' | 'hexagon' | 'none';

export interface MindmapNode {
  text: string;
  shape?: MindmapShape;
  /** Side of the root the branch grows to, where the language supports it. */
  side?: 'left' | 'right';
  children: MindmapNode[];
}
