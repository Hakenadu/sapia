import type { DiagramTypeInfo } from '@sapia/core';

const t = (strings: TemplateStringsArray) => strings[0].replace(/^\n/, '');

export const DIAGRAM_TYPES: DiagramTypeInfo[] = [
  {
    id: 'flowchart',
    template: t`
flowchart LR
  start([Order received]) --> stock{In stock?}
  stock -- yes --> reserve[Reserve items]
  stock -- no --> notify[Notify customer]
  reserve --> pay{Payment ok?}
  pay -- yes --> ship[Ship order]
  pay -- no --> cancel[Cancel reservation]
  ship --> done([Done])
  cancel --> done
  notify --> done
`,
  },
  {
    id: 'sequence',
    template: t`
sequenceDiagram
  actor User
  participant App as Web App
  participant Auth as Auth Service
  participant DB as User DB

  User->>App: Sign in
  activate App
  App->>Auth: Verify credentials
  Auth->>DB: Find user
  DB-->>Auth: User record
  alt valid credentials
    Auth-->>App: Access token
    App-->>User: Welcome
  else invalid
    Auth-->>App: 401 Unauthorized
    App-->>User: Show error
  end
  deactivate App
`,
  },
  {
    id: 'class',
    template: t`
classDiagram
  class Shape {
    <<interface>>
    +area() double
    +perimeter() double
  }
  class BaseShape {
    <<abstract>>
    #String name
    +describe() String
  }
  class Circle {
    -double radius
    +area() double
  }
  class Rectangle {
    -double width
    -double height
    +area() double
  }
  class Canvas {
    +add(Shape shape) void
    +render() void
  }
  Shape <|.. BaseShape
  BaseShape <|-- Circle
  BaseShape <|-- Rectangle
  Canvas o-- "0..*" Shape : shapes
`,
  },
  {
    id: 'state',
    template: t`
stateDiagram-v2
  [*] --> Draft
  Draft --> Review: submit
  Review --> Draft: request changes
  Review --> Approved: approve
  Approved --> Published: publish
  Published --> Archived: archive
  Archived --> [*]
`,
  },
  {
    id: 'er',
    template: t`
erDiagram
  CUSTOMER ||--o{ ORDER : places
  ORDER ||--|{ ORDER_ITEM : contains
  PRODUCT ||--o{ ORDER_ITEM : "ordered in"
  CUSTOMER {
    int id PK
    string name
    string email
  }
  ORDER {
    int id PK
    date created
    int customer_id FK
  }
`,
  },
  {
    id: 'mindmap',
    template: t`
mindmap
  root((Product launch))
    Marketing
      Landing page
      Newsletter
    Engineering
      Performance
      Monitoring
    Support
      Documentation
`,
  },
  {
    id: 'gantt',
    template: t`
gantt
  title Release plan
  dateFormat YYYY-MM-DD
  section Design
    Concept      :done, d1, 2026-01-05, 7d
    Prototype    :active, d2, after d1, 10d
  section Build
    Implementation :b1, after d2, 21d
    Testing        :b2, after b1, 10d
`,
  },
  {
    id: 'pie',
    template: t`
pie title Traffic sources
  "Search" : 45
  "Direct" : 25
  "Social" : 20
  "Referral" : 10
`,
  },
  {
    id: 'gitgraph',
    template: t`
gitGraph
  commit
  branch feature
  checkout feature
  commit
  commit
  checkout main
  merge feature
  commit
`,
  },
  {
    id: 'journey',
    template: t`
journey
  title Onboarding
  section Sign up
    Open landing page: 5: Visitor
    Create account: 3: Visitor
  section First use
    Create first diagram: 4: User
    Share with the team: 5: User
`,
  },
  {
    id: 'timeline',
    template: t`
timeline
  title Product history
  2023 : Idea
  2024 : First prototype : Private beta
  2025 : Public launch
`,
  },
  { id: 'quadrant' },
  { id: 'requirement' },
  { id: 'c4' },
  { id: 'sankey' },
  { id: 'xychart' },
  { id: 'block' },
  { id: 'architecture' },
  { id: 'kanban' },
  { id: 'packet' },
];

/** Snippets offered in an empty document. */
export const HEADER_SNIPPETS: { type: string; label: string; snippet: string }[] = [
  { type: 'flowchart', label: 'flowchart', snippet: 'flowchart ${1:LR}\n  ${2:A}[${3:Start}] --> ${4:B}[${5:End}]' },
  { type: 'sequence', label: 'sequenceDiagram', snippet: 'sequenceDiagram\n  participant ${1:Client}\n  participant ${2:Server}\n  ${1:Client}->>${2:Server}: ${3:request}\n  ${2:Server}-->>${1:Client}: ${4:response}' },
  { type: 'class', label: 'classDiagram', snippet: 'classDiagram\n  class ${1:Name} {\n    ${2:+String field}\n    ${3:+method() void}\n  }' },
  { type: 'state', label: 'stateDiagram-v2', snippet: 'stateDiagram-v2\n  [*] --> ${1:Idle}\n  ${1:Idle} --> ${2:Active}: ${3:start}\n  ${2:Active} --> [*]' },
  { type: 'er', label: 'erDiagram', snippet: 'erDiagram\n  ${1:CUSTOMER} ||--o{ ${2:ORDER} : ${3:places}' },
  { type: 'mindmap', label: 'mindmap', snippet: 'mindmap\n  root((${1:Topic}))\n    ${2:Branch}\n      ${3:Leaf}' },
  { type: 'gantt', label: 'gantt', snippet: 'gantt\n  title ${1:Plan}\n  dateFormat YYYY-MM-DD\n  section ${2:Phase}\n    ${3:Task} :${4:t1}, ${5:2026-01-01}, ${6:7d}' },
  { type: 'pie', label: 'pie', snippet: 'pie title ${1:Title}\n  "${2:A}" : ${3:60}\n  "${4:B}" : ${5:40}' },
  { type: 'gitgraph', label: 'gitGraph', snippet: 'gitGraph\n  commit\n  branch ${1:feature}\n  commit\n  checkout main\n  merge ${1:feature}' },
  { type: 'journey', label: 'journey', snippet: 'journey\n  title ${1:Journey}\n  section ${2:Stage}\n    ${3:Task}: ${4:5}: ${5:Actor}' },
  { type: 'timeline', label: 'timeline', snippet: 'timeline\n  title ${1:Timeline}\n  ${2:2025} : ${3:Event}' },
];
