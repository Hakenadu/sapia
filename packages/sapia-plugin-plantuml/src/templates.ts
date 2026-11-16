import type { DiagramTypeInfo } from '@sapia/core';

export const TEMPLATES: { type: string; tag: string; snippet: string }[] = [
  { type: 'sequence', tag: 'uml', snippet: '@startuml\nparticipant ${1:Client}\nparticipant ${2:Server}\n\n${1:Client} -> ${2:Server} : ${3:request}\n${2:Server} --> ${1:Client} : ${4:response}\n@enduml' },
  { type: 'class', tag: 'uml', snippet: '@startuml\nclass ${1:Name} {\n  ${2:+field: Type}\n  ${3:+method(): void}\n}\n@enduml' },
  { type: 'component', tag: 'uml', snippet: '@startuml\n[${1:Frontend}] --> [${2:Backend}] : ${3:uses}\n@enduml' },
  { type: 'state', tag: 'uml', snippet: '@startuml\n[*] --> ${1:Idle}\n${1:Idle} --> ${2:Active} : ${3:start}\n${2:Active} --> [*]\n@enduml' },
  { type: 'activity', tag: 'uml', snippet: '@startuml\nstart\n:${1:First step};\nif (${2:condition}) then (yes)\n  :${3:Do something};\nelse (no)\n  :${4:Do something else};\nendif\nstop\n@enduml' },
  { type: 'usecase', tag: 'uml', snippet: '@startuml\nleft to right direction\nactor ${1:User}\nrectangle ${2:System} {\n  usecase "${3:Do something}" as UC1\n}\n${1:User} --> UC1\n@enduml' },
  { type: 'mindmap', tag: 'mindmap', snippet: '@startmindmap\n* ${1:Topic}\n** ${2:Branch}\n*** ${3:Leaf}\n** ${4:Branch}\n@endmindmap' },
];

const t = (strings: TemplateStringsArray) => strings[0].replace(/^\n/, '');

export const DIAGRAM_TYPES: DiagramTypeInfo[] = [
  {
    id: 'sequence',
    template: t`
@startuml
actor User
participant "Web App" as App
participant "Auth Service" as Auth
database "User DB" as DB

User -> App : Sign in
activate App
App -> Auth : Verify credentials
activate Auth
Auth -> DB : Find user
DB --> Auth : User record
alt valid credentials
  Auth --> App : Access token
  App --> User : Welcome
else invalid
  Auth --> App : 401 Unauthorized
  App --> User : Show error
end
deactivate Auth
deactivate App
@enduml
`,
  },
  {
    id: 'class',
    template: t`
@startuml
interface Shape {
  +area(): double
  +perimeter(): double
}

abstract class BaseShape {
  #name: String
  +describe(): String
}

class Circle {
  -radius: double
  +area(): double
}

class Rectangle {
  -width: double
  -height: double
  +area(): double
}

class Canvas {
  +add(shape: Shape): void
  +render(): void
}

Shape <|.. BaseShape
BaseShape <|-- Circle
BaseShape <|-- Rectangle
Canvas o-- "0..*" Shape : shapes
@enduml
`,
  },
  {
    id: 'component',
    template: t`
@startuml
package "Frontend" {
  [Web App] as web
  [Mobile App] as mobile
}

package "Backend" {
  [API Gateway] as gateway
  [Order Service] as orders
  [Billing Service] as billing
}

database "PostgreSQL" as db
queue "Event Bus" as bus

web --> gateway : HTTPS
mobile --> gateway : HTTPS
gateway --> orders
gateway --> billing
orders --> db
orders ..> bus : publishes
billing ..> bus : subscribes
@enduml
`,
  },
  {
    id: 'state',
    template: t`
@startuml
[*] --> Draft
Draft --> Review : submit
Review --> Draft : request changes
Review --> Approved : approve
Approved --> Published : publish
Published --> Archived : archive
Archived --> [*]

Review : Waiting for a reviewer
@enduml
`,
  },
  {
    id: 'activity',
    template: t`
@startuml
start
:Receive order;
if (In stock?) then (yes)
  :Reserve items;
  :Charge customer;
  if (Payment ok?) then (yes)
    :Ship order;
  else (no)
    :Cancel reservation;
  endif
else (no)
  :Notify customer;
endif
stop
@enduml
`,
  },
  {
    id: 'usecase',
    template: t`
@startuml
left to right direction
actor Customer
actor Admin

rectangle "Online Shop" {
  usecase "Browse catalog" as UC1
  usecase "Place order" as UC2
  usecase "Manage products" as UC3
}

Customer --> UC1
Customer --> UC2
Admin --> UC3
@enduml
`,
  },
  {
    id: 'mindmap',
    template: t`
@startmindmap
* Product launch
** Marketing
*** Landing page
*** Newsletter
** Engineering
*** Performance
*** Monitoring
** Support
*** Documentation
@endmindmap
`,
  },
  { id: 'deployment' },
  { id: 'object' },
  { id: 'er' },
  { id: 'timing' },
  { id: 'gantt' },
  { id: 'wbs' },
  { id: 'json' },
  { id: 'yaml' },
  { id: 'salt' },
];
