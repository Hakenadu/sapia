/** Language-neutral model of a state diagram. */
export interface StateModel {
  kind: 'state';
  title?: string;
  direction?: 'TB' | 'LR';
  states: StateNode[];
  transitions: StateTransition[];
}

/** Pseudo state id used for both the initial and the final state. */
export const STATE_START_END = '[*]';

export interface StateNode {
  id: string;
  label?: string;
  /** Description lines shown inside the state. */
  descriptions: string[];
  type?: 'state' | 'choice' | 'fork' | 'join';
  /** Nested region for composite states. */
  states?: StateNode[];
  transitions?: StateTransition[];
}

export interface StateTransition {
  from: string;
  to: string;
  label?: string;
}
