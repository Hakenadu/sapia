/** Static vocabulary used for completion. */

export const SKINPARAMS = [
  'backgroundColor', 'handwritten', 'monochrome', 'shadowing', 'roundCorner', 'linetype ortho', 'linetype polyline',
  'defaultFontName', 'defaultFontSize', 'defaultFontColor', 'defaultTextAlignment', 'dpi', 'nodesep', 'ranksep',
  'padding', 'ArrowColor', 'ArrowThickness', 'ArrowFontSize', 'ActorBorderColor', 'ActorBackgroundColor',
  'ParticipantBorderColor', 'ParticipantBackgroundColor', 'ParticipantPadding', 'SequenceLifeLineBorderColor',
  'SequenceMessageAlign', 'SequenceGroupBackgroundColor', 'BoxPadding', 'ClassBackgroundColor', 'ClassBorderColor',
  'ClassAttributeIconSize', 'ClassFontSize', 'ComponentStyle', 'ComponentBackgroundColor', 'ComponentBorderColor',
  'NoteBackgroundColor', 'NoteBorderColor', 'PackageStyle', 'PackageBackgroundColor', 'StateBackgroundColor',
  'StateBorderColor', 'ActivityBackgroundColor', 'ActivityBorderColor', 'UsecaseBackgroundColor', 'UsecaseBorderColor',
  'TitleFontSize', 'LegendBackgroundColor', 'maxMessageSize', 'responseMessageBelowArrow', 'wrapWidth',
];

export const THEMES = [
  'amiga', 'aws-orange', 'black-knight', 'bluegray', 'blueprint', 'carbon-gray', 'cerulean', 'cerulean-outline',
  'crt-amber', 'crt-green', 'cyborg', 'cyborg-outline', 'hacker', 'lightgray', 'mars', 'materia', 'materia-outline',
  'metal', 'mimeograph', 'minty', 'mono', 'plain', 'reddress-darkblue', 'reddress-lightblue', 'sandstone', 'silver',
  'sketchy', 'sketchy-outline', 'spacelab', 'superhero', 'toy', 'united', 'vibrant',
];

export const COLORS = [
  'Red', 'Green', 'Blue', 'Yellow', 'Orange', 'Purple', 'Pink', 'Brown', 'Gray', 'Black', 'White', 'Cyan',
  'Magenta', 'Lime', 'Navy', 'Teal', 'Olive', 'Maroon', 'Gold', 'Silver', 'Salmon', 'SkyBlue', 'LightBlue',
  'LightGreen', 'LightGray', 'LightYellow', 'DarkBlue', 'DarkGreen', 'DarkRed', 'DarkGray', 'Tomato', 'Violet',
  'Turquoise', 'Crimson', 'Coral', 'Indigo', 'Khaki', 'Lavender', 'Orchid', 'SteelBlue', 'transparent',
];

export interface ArrowInfo {
  arrow: string;
  /** i18n key suffix under `plantuml.arrow.` */
  key: string;
}

export const ARROWS: Record<string, ArrowInfo[]> = {
  sequence: [
    { arrow: '->', key: 'sync' },
    { arrow: '-->', key: 'reply' },
    { arrow: '->>', key: 'async' },
    { arrow: '-->>', key: 'asyncReply' },
    { arrow: '->x', key: 'lost' },
    { arrow: '<-', key: 'syncBack' },
    { arrow: '<--', key: 'replyBack' },
    { arrow: '<->', key: 'bidirectional' },
  ],
  class: [
    { arrow: '<|--', key: 'inheritance' },
    { arrow: '--|>', key: 'inheritanceRight' },
    { arrow: '<|..', key: 'realization' },
    { arrow: '..|>', key: 'realizationRight' },
    { arrow: '*--', key: 'composition' },
    { arrow: 'o--', key: 'aggregation' },
    { arrow: '-->', key: 'association' },
    { arrow: '..>', key: 'dependency' },
    { arrow: '--', key: 'link' },
    { arrow: '..', key: 'dashedLink' },
  ],
  state: [
    { arrow: '-->', key: 'transition' },
    { arrow: '->', key: 'transitionHorizontal' },
    { arrow: '-up->', key: 'transitionUp' },
    { arrow: '-left->', key: 'transitionLeft' },
    { arrow: '-right->', key: 'transitionRight' },
  ],
  er: [
    { arrow: '||--o{', key: 'oneToMany' },
    { arrow: '||--||', key: 'oneToOne' },
    { arrow: '}o--o{', key: 'manyToMany' },
    { arrow: '||--|{', key: 'oneToOneOrMany' },
    { arrow: '|o--o{', key: 'zeroOrOneToMany' },
  ],
  default: [
    { arrow: '-->', key: 'directed' },
    { arrow: '--', key: 'link' },
    { arrow: '..>', key: 'dependency' },
    { arrow: '..', key: 'dashedLink' },
    { arrow: '->', key: 'directedHorizontal' },
    { arrow: '-up->', key: 'directedUp' },
    { arrow: '-down->', key: 'directedDown' },
    { arrow: '-left->', key: 'directedLeft' },
    { arrow: '-right->', key: 'directedRight' },
    { arrow: '<--', key: 'directedBack' },
    { arrow: '--(', key: 'requires' },
    { arrow: '-(0-', key: 'lollipop' },
  ],
};

interface KeywordSet {
  declarations: string[];
  statements: string[];
  snippets: { label: string; key: string; snippet: string }[];
}

const COMMON_STATEMENTS = ['title', 'skinparam', 'hide', 'show', 'header', 'footer', 'caption', 'legend', 'scale', '!theme', '!include', '!define'];
const NOTE_SNIPPET = { label: 'note', key: 'note', snippet: 'note ${1:right} of ${2:element}\n  ${3:text}\nend note' };

export const KEYWORDS: Record<string, KeywordSet> = {
  sequence: {
    declarations: ['participant', 'actor', 'boundary', 'control', 'entity', 'database', 'collections', 'queue'],
    statements: ['activate', 'deactivate', 'destroy', 'create', 'return', 'autonumber', 'newpage', 'else', 'end', 'box', 'end box', 'hide footbox', 'note over', 'note left of', 'note right of', 'ref over', ...COMMON_STATEMENTS],
    snippets: [
      { label: 'alt', key: 'alt', snippet: 'alt ${1:condition}\n  ${2}\nelse ${3:otherwise}\n  ${4}\nend' },
      { label: 'opt', key: 'opt', snippet: 'opt ${1:condition}\n  ${2}\nend' },
      { label: 'loop', key: 'loop', snippet: 'loop ${1:condition}\n  ${2}\nend' },
      { label: 'par', key: 'par', snippet: 'par ${1:label}\n  ${2}\nelse ${3:label}\n  ${4}\nend' },
      { label: 'group', key: 'group', snippet: 'group ${1:label}\n  ${2}\nend' },
      { label: 'critical', key: 'critical', snippet: 'critical ${1:label}\n  ${2}\nend' },
      { label: 'break', key: 'break', snippet: 'break ${1:condition}\n  ${2}\nend' },
      { label: 'divider', key: 'divider', snippet: '== ${1:Section} ==' },
      { label: 'note over', key: 'noteOver', snippet: 'note over ${1:participant}: ${2:text}' },
    ],
  },
  class: {
    declarations: ['class', 'abstract class', 'interface', 'enum', 'annotation', 'struct', 'exception', 'package', 'namespace'],
    statements: ['hide empty members', 'hide circle', 'left to right direction', 'top to bottom direction', 'together', ...COMMON_STATEMENTS],
    snippets: [
      { label: 'class { }', key: 'classBody', snippet: 'class ${1:Name} {\n  ${2:+field: Type}\n  ${3:+method(): void}\n}' },
      { label: 'interface { }', key: 'interfaceBody', snippet: 'interface ${1:Name} {\n  ${2:+method(): void}\n}' },
      { label: 'enum { }', key: 'enumBody', snippet: 'enum ${1:Name} {\n  ${2:VALUE}\n}' },
      { label: 'package { }', key: 'packageBody', snippet: 'package ${1:name} {\n  ${2}\n}' },
      NOTE_SNIPPET,
    ],
  },
  state: {
    declarations: ['state'],
    statements: ['[*]', 'hide empty description', 'left to right direction', ...COMMON_STATEMENTS],
    snippets: [
      { label: 'state { }', key: 'compositeState', snippet: 'state ${1:Name} {\n  [*] --> ${2:Inner}\n}' },
      { label: 'choice', key: 'choice', snippet: 'state ${1:name} <<choice>>' },
      { label: 'fork', key: 'fork', snippet: 'state ${1:name} <<fork>>' },
      NOTE_SNIPPET,
    ],
  },
  component: {
    declarations: ['component', 'interface', 'package', 'node', 'cloud', 'database', 'folder', 'frame', 'rectangle', 'queue', 'artifact', 'storage', 'actor', 'agent', 'card', 'file', 'stack'],
    statements: ['left to right direction', 'top to bottom direction', 'together', ...COMMON_STATEMENTS],
    snippets: [
      { label: '[Component]', key: 'component', snippet: '[${1:Component}] as ${2:alias}' },
      { label: 'package { }', key: 'packageBody', snippet: 'package "${1:name}" {\n  ${2}\n}' },
      { label: '() interface', key: 'lollipop', snippet: '() "${1:Interface}" as ${2:alias}' },
      NOTE_SNIPPET,
    ],
  },
  usecase: {
    declarations: ['actor', 'usecase', 'rectangle', 'package'],
    statements: ['left to right direction', ...COMMON_STATEMENTS],
    snippets: [
      { label: '(Use case)', key: 'usecase', snippet: '(${1:Use case}) as ${2:alias}' },
      { label: ':Actor:', key: 'actor', snippet: ':${1:Actor}: as ${2:alias}' },
      { label: 'rectangle { }', key: 'system', snippet: 'rectangle "${1:System}" {\n  ${2}\n}' },
      NOTE_SNIPPET,
    ],
  },
  activity: {
    declarations: ['partition'],
    statements: ['start', 'stop', 'end', 'else', 'endif', 'endwhile', 'fork again', 'end fork', 'detach', 'kill', 'backward', 'break', ...COMMON_STATEMENTS],
    snippets: [
      { label: ':action;', key: 'action', snippet: ':${1:action};' },
      { label: 'if', key: 'if', snippet: 'if (${1:condition}) then (${2:yes})\n  ${3}\nelse (${4:no})\n  ${5}\nendif' },
      { label: 'while', key: 'while', snippet: 'while (${1:condition}) is (${2:yes})\n  ${3}\nendwhile (${4:no})' },
      { label: 'repeat', key: 'repeat', snippet: 'repeat\n  ${1}\nrepeat while (${2:condition}) is (${3:yes})' },
      { label: 'fork', key: 'forkActivity', snippet: 'fork\n  ${1}\nfork again\n  ${2}\nend fork' },
      { label: 'switch', key: 'switch', snippet: 'switch (${1:value})\ncase (${2:A})\n  ${3}\ncase (${4:B})\n  ${5}\nendswitch' },
      { label: '|Swimlane|', key: 'swimlane', snippet: '|${1:Swimlane}|' },
    ],
  },
  default: {
    declarations: ['participant', 'actor', 'class', 'interface', 'enum', 'component', 'node', 'cloud', 'database', 'package', 'rectangle', 'state', 'object', 'usecase', 'entity'],
    statements: COMMON_STATEMENTS,
    snippets: [NOTE_SNIPPET],
  },
};
KEYWORDS['deployment'] = KEYWORDS['component'];
KEYWORDS['object'] = { ...KEYWORDS['default'], declarations: ['object', 'map', 'package'] };
KEYWORDS['er'] = { ...KEYWORDS['default'], declarations: ['entity', 'package'], snippets: [{ label: 'entity { }', key: 'entityBody', snippet: 'entity ${1:Name} {\n  *${2:id} : ${3:number}\n  --\n  ${4:field} : ${5:text}\n}' }] };
