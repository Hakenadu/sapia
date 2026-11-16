/** Language-neutral model of a class diagram. */
export interface ClassModel {
  kind: 'class';
  title?: string;
  classes: ClassNode[];
  relations: ClassRelation[];
  notes: ClassNote[];
}

export type ClassNodeKind = 'class' | 'interface' | 'abstract' | 'enum';

export interface ClassNode {
  id: string;
  label?: string;
  kind: ClassNodeKind;
  stereotype?: string;
  /** Generic parameter text, e.g. `T` for `List<T>`. */
  generic?: string;
  namespace?: string;
  members: ClassMember[];
}

export type Visibility = 'public' | 'private' | 'protected' | 'package';

export interface ClassMember {
  /** Member text without visibility and modifiers, e.g. `name: String` or `save(user): void`. */
  text: string;
  isMethod: boolean;
  visibility?: Visibility;
  static?: boolean;
  abstract?: boolean;
}

export type ClassRelationType =
  | 'inheritance'
  | 'realization'
  | 'composition'
  | 'aggregation'
  | 'association'
  | 'dependency'
  | 'link'
  | 'dashedLink';

/**
 * A relation, normalised so that `from` is the "owning" end:
 * the child for inheritance/realization, the whole for composition/aggregation,
 * the navigating/dependent side for association/dependency.
 */
export interface ClassRelation {
  from: string;
  to: string;
  type: ClassRelationType;
  label?: string;
  fromCardinality?: string;
  toCardinality?: string;
}

export interface ClassNote {
  text: string;
  /** Class the note is attached to, if any. */
  target?: string;
}
