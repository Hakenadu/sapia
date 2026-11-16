/** Language-neutral model of a sequence diagram. */
export interface SequenceModel {
  kind: 'sequence';
  title?: string;
  autonumber?: boolean;
  participants: SequenceParticipant[];
  elements: SequenceElement[];
}

export type SequenceParticipantType =
  | 'participant'
  | 'actor'
  | 'boundary'
  | 'control'
  | 'entity'
  | 'database'
  | 'collections'
  | 'queue';

export interface SequenceParticipant {
  id: string;
  label?: string;
  type: SequenceParticipantType;
}

export type SequenceElement =
  | SequenceMessage
  | SequenceNote
  | SequenceBlock
  | SequenceActivation
  | SequenceDivider;

export interface SequenceMessage {
  type: 'message';
  from: string;
  to: string;
  text?: string;
  line: 'solid' | 'dotted';
  /** `filled` = synchronous, `open` = thin/async arrow, `cross` = lost, `none` = plain line. */
  arrow: 'filled' | 'open' | 'cross' | 'none';
  /** Activate the receiver with this message. */
  activate?: boolean;
  /** Deactivate the sender with this message. */
  deactivate?: boolean;
}

export interface SequenceNote {
  type: 'note';
  position: 'left' | 'right' | 'over';
  participants: string[];
  text: string;
}

export type SequenceBlockKind = 'alt' | 'opt' | 'loop' | 'par' | 'critical' | 'break' | 'group';

export interface SequenceBlock {
  type: 'block';
  kind: SequenceBlockKind;
  /** First branch carries the block label; further branches are `else` / `and` sections. */
  branches: { label?: string; elements: SequenceElement[] }[];
}

export interface SequenceActivation {
  type: 'activate' | 'deactivate' | 'destroy';
  participant: string;
}

export interface SequenceDivider {
  type: 'divider';
  text: string;
}
