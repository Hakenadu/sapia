import type { ClassModel } from './class';
import type { MindmapModel } from './mindmap';
import type { SequenceModel } from './sequence';
import type { StateModel } from './state';

export * from './sequence';
export * from './class';
export * from './state';
export * from './mindmap';

/** Metamodels shipped with the core, keyed by diagram type. */
export interface CoreMetamodels {
  sequence: SequenceModel;
  class: ClassModel;
  state: StateModel;
  mindmap: MindmapModel;
}

/**
 * Minimal shape every metamodel instance has. Plugins may define their own
 * metamodels for further diagram types; `kind` must equal the diagram type.
 */
export interface DiagramModel {
  kind: string;
}
