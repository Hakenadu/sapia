/**
 * Imprint, privacy policy and terms of use. German is the binding version;
 * the English text is a convenience translation.
 *
 * Kept as data rather than in the message catalogue: the texts are long,
 * structured and legal, and they must not be overridden by plugins.
 */

export type LegalDocId = 'imprint' | 'privacy' | 'terms';

export const LEGAL_DOCS: readonly LegalDocId[] = ['imprint', 'privacy', 'terms'];

/** The provider named in the imprint (§ 5 DDG). */
export const LEGAL_PROVIDER = {
  name: 'Manuel Seiche',
  alias: 'mseiche',
  address: ['c/o Autorenglück #49094', 'Albert-Einstein-Straße 47', '02977 Hoyerswerda'],
  country: { de: 'Deutschland', en: 'Germany' },
  email: 'hakenadu91@gmail.com',
} as const;

/** Date of the current version of all three texts (ISO). */
export const LEGAL_UPDATED = '2026-11-17';

export type LegalBlock =
  | { p: string }
  | { ul: string[] }
  /** The provider's name, postal address and e-mail address. */
  | { contact: true };

export interface LegalSection {
  heading: string;
  blocks: LegalBlock[];
}

export interface LegalDoc {
  title: string;
  lead?: string;
  sections: LegalSection[];
}

type LegalTexts = Record<LegalDocId, LegalDoc>;

// -- Deutsch (maßgeblich) ---------------------------------------------------------------

const DE: LegalTexts = {
  imprint: {
    title: 'Impressum',
    sections: [
      {
        heading: 'Angaben gemäß § 5 DDG',
        blocks: [{ contact: true }],
      },
      {
        heading: 'Verantwortlich für den Inhalt',
        blocks: [{ p: 'Manuel Seiche, Anschrift wie oben.' }],
      },
      {
        heading: 'Haftung für Inhalte',
        blocks: [
          {
            p: 'Die Inhalte dieses Angebots wurden mit Sorgfalt erstellt. Für die Richtigkeit, Vollständigkeit und Aktualität der Inhalte wird jedoch keine Gewähr übernommen. Als Diensteanbieter bin ich für eigene Inhalte nach den allgemeinen Gesetzen verantwortlich. Ich bin jedoch nicht verpflichtet, übermittelte oder gespeicherte fremde Informationen zu überwachen oder nach Umständen zu forschen, die auf eine rechtswidrige Tätigkeit hinweisen. Verpflichtungen zur Entfernung oder Sperrung der Nutzung von Informationen nach den allgemeinen Gesetzen bleiben hiervon unberührt.',
          },
          {
            p: 'Diagramme, die Nutzerinnen und Nutzer in Sapia erstellen, speichern oder über Links teilen, sind deren eigene Inhalte. Sie werden vom Anbieter weder gespeichert noch zur Kenntnis genommen.',
          },
        ],
      },
      {
        heading: 'Haftung für Links',
        blocks: [
          {
            p: 'Dieses Angebot enthält Links zu externen Websites Dritter, auf deren Inhalte ich keinen Einfluss habe. Für diese fremden Inhalte ist stets der jeweilige Anbieter oder Betreiber der Seiten verantwortlich. Bei Bekanntwerden von Rechtsverletzungen werden derartige Links umgehend entfernt.',
          },
        ],
      },
      {
        heading: 'Urheberrecht und Lizenz',
        blocks: [
          {
            p: 'Sapia ist freie Software und steht unter der MIT-Lizenz. Der Quelltext ist unter github.com/Hakenadu/sapia veröffentlicht. Die Rechte an Inhalten Dritter, etwa an eingebundenen Bibliotheken oder Schriftarten, liegen bei den jeweiligen Rechteinhabern und richten sich nach deren Lizenzen.',
          },
        ],
      },
      {
        heading: 'Verbraucherstreitbeilegung',
        blocks: [{ p: 'Ich bin nicht bereit und nicht verpflichtet, an Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle teilzunehmen.' }],
      },
    ],
  },

  privacy: {
    title: 'Datenschutzerklärung',
    lead: 'Sapia ist so gebaut, dass der Anbieter keine Daten seiner Nutzerinnen und Nutzer erhält. Es gibt keine Benutzerkonten, keine Cookies, keine Analyse- oder Tracking-Werkzeuge und keine Werbung. Im Folgenden ist beschrieben, welche Daten dennoch verarbeitet werden, wo dies geschieht und wer jeweils dafür verantwortlich ist.',
    sections: [
      {
        heading: '1. Verantwortlicher',
        blocks: [
          { p: 'Verantwortlicher im Sinne der Datenschutz-Grundverordnung (DSGVO) ist:' },
          { contact: true },
          { p: 'Ein Datenschutzbeauftragter ist nicht bestellt, da hierzu keine gesetzliche Pflicht besteht.' },
        ],
      },
      {
        heading: '2. Aufruf der Web-App (Hosting)',
        blocks: [
          {
            p: 'Sapia ist eine statische Web-Anwendung. Beim Aufruf überträgt Ihr Browser technisch notwendige Daten an den Webserver, auf dem die Anwendung bereitgestellt wird: IP-Adresse, Datum und Uhrzeit des Abrufs, angeforderte Datei, übertragene Datenmenge, Statuscode, Referrer-URL sowie Browser und Betriebssystem. Diese Daten können vom Hosting-Dienstleister in Server-Logdateien gespeichert werden, um die Auslieferung und die Sicherheit des Angebots zu gewährleisten.',
          },
          {
            p: 'Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO. Das berechtigte Interesse liegt in der fehlerfreien und sicheren Bereitstellung der Anwendung. Soweit ein Hosting-Dienstleister eingesetzt wird, verarbeitet dieser die Daten als Auftragsverarbeiter (Art. 28 DSGVO). Die Logdateien werden nicht mit anderen Daten zusammengeführt und nicht ausgewertet; sie werden nach den Vorgaben des Hosting-Dienstleisters, in der Regel innerhalb weniger Wochen, gelöscht.',
          },
          {
            p: 'Die Anwendung lädt Schriftarten und Programmbestandteile ausschließlich vom eigenen Server. Es werden keine Inhalte von externen Diensten wie Content-Delivery-Networks oder Schriftarten-Diensten nachgeladen. Diagramme werden vollständig in Ihrem Browser dargestellt; der Quelltext Ihrer Diagramme wird dabei an keinen Server übertragen.',
          },
          {
            p: 'Sapia kann von jeder Person selbst betrieben werden. Rufen Sie Sapia unter einer Adresse auf, die nicht vom oben genannten Anbieter betrieben wird, ist deren Betreiber für die Datenverarbeitung verantwortlich. Dieser Betreiber kann über eine Konfigurationsdatei auch Erweiterungen (Plugins) von anderen Servern einbinden; in diesem Fall wird beim Laden Ihre IP-Adresse an diese Server übermittelt.',
          },
        ],
      },
      {
        heading: '3. Speicherung in Ihrem Browser',
        blocks: [
          {
            p: 'Die Web-App speichert Ihre Diagramme, Projekte und Einstellungen (Sprache, Farbschema, Aufteilung von Editor und Vorschau, zuletzt geöffnetes Diagramm) im lokalen Speicher Ihres Browsers (localStorage). Diese Daten verlassen Ihr Gerät nicht und sind für den Anbieter nicht einsehbar.',
          },
          {
            p: 'Die Speicherung ist für die von Ihnen ausdrücklich gewünschte Funktion der Anwendung unbedingt erforderlich (§ 25 Abs. 2 Nr. 2 TDDDG). Sie können die Daten jederzeit löschen, indem Sie Diagramme und Projekte in der Anwendung entfernen oder die Website-Daten in Ihrem Browser löschen. Beachten Sie, dass der Browser diese Daten auch selbst entfernen kann, etwa beim Löschen des Verlaufs oder im privaten Modus.',
          },
        ],
      },
      {
        heading: '4. Teilen von Diagrammen',
        blocks: [
          {
            p: 'Beim Teilen wird ein Diagramm komprimiert in einen Link oder einen Code geschrieben. Der Inhalt steht im Teil des Links hinter dem Zeichen „#“. Dieser Teil wird von Browsern nicht an Webserver übertragen; der Anbieter erhält den Inhalt geteilter Diagramme daher weder beim Erstellen noch beim Öffnen eines Links. Nach dem Öffnen entfernt Sapia den Inhalt aus der Adresszeile.',
          },
          {
            p: 'Wer einen Link oder Code besitzt, kann das Diagramm lesen. Wenn Sie einen Link über andere Dienste versenden (etwa E-Mail, Messenger oder Ticketsysteme), gelten deren Datenschutzbestimmungen. Teilen Sie keine vertraulichen oder personenbezogenen Inhalte, wenn Sie nicht sicher sind, wer den Link erhält.',
          },
        ],
      },
      {
        heading: '5. Sapia Desktop',
        blocks: [
          {
            p: 'Sapia Desktop speichert Konfiguration, Diagramme, Projekte und Fensterzustand im Ordner „.sapia“ in Ihrem Benutzerverzeichnis sowie in den Ordnern und Git-Repositories, die Sie selbst als Projektablage wählen. Die Anwendung sendet keine Nutzungs-, Diagnose- oder Absturzdaten an den Anbieter.',
          },
          {
            p: 'Netzwerkverbindungen entstehen nur in folgenden Fällen, jeweils direkt zwischen Ihrem Gerät und dem genannten Dienst:',
          },
          {
            ul: [
              'Installation über npm: Abruf der Pakete aus der npm-Registry (npm, Inc. / GitHub, Inc.).',
              'Erster Start: einmaliger Download der Laufzeitumgebung Electron von GitHub (GitHub, Inc., USA) oder von einem von Ihnen konfigurierten Spiegelserver.',
              'Git-Projekte: Abgleich mit dem von Ihnen angegebenen Remote-Repository (z. B. GitHub, GitLab oder ein eigener Server) mit Ihren lokalen Zugangsdaten.',
              'KI-Assistent: Anfragen an den von Ihnen konfigurierten KI-Anbieter (siehe Abschnitt 6).',
              'Plugins, die Sie selbst von fremden Adressen einbinden.',
              'Links, die Sie anklicken, werden in Ihrem Standardbrowser geöffnet.',
            ],
          },
          {
            p: 'Für die Verarbeitung durch diese Dienste sind deren Betreiber verantwortlich; es gelten deren Datenschutzbestimmungen. Bei Diensten mit Sitz außerhalb der EU, etwa in den USA, kann es zu einer Übermittlung in ein Drittland kommen.',
          },
        ],
      },
      {
        heading: '6. KI-Assistent (nur Sapia Desktop)',
        blocks: [
          {
            p: 'Der KI-Assistent ist standardmäßig ausgeschaltet. Wenn Sie ihn einrichten, wählen Sie selbst einen KI-Anbieter (etwa OpenAI oder einen kompatiblen, auch lokal betriebenen Dienst) und hinterlegen Ihre eigenen Zugangsdaten. Diese werden ausschließlich lokal in Ihrer Konfigurationsdatei gespeichert.',
          },
          {
            p: 'Sobald Sie den Assistenten nutzen, sendet Sapia Ihre Eingaben, den Inhalt des geöffneten Diagramms sowie die zur Bearbeitung nötigen Zwischenergebnisse direkt von Ihrem Gerät an diesen Anbieter. Der Anbieter von Sapia ist an dieser Übermittlung nicht beteiligt und erhält keine dieser Daten. Für die Verarbeitung ist der von Ihnen gewählte KI-Anbieter verantwortlich, mit dem Sie ein eigenes Vertragsverhältnis eingehen. Prüfen Sie dessen Bedingungen, insbesondere zur Speicherung und zur Verwendung Ihrer Daten für Trainingszwecke, bevor Sie personenbezogene oder vertrauliche Inhalte verarbeiten lassen.',
          },
        ],
      },
      {
        heading: '7. Kontakt per E-Mail',
        blocks: [
          {
            p: 'Wenn Sie mir eine E-Mail schreiben, verarbeite ich Ihre E-Mail-Adresse und den Inhalt Ihrer Nachricht, um Ihr Anliegen zu bearbeiten. Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO, bei vertragsbezogenen Anfragen Art. 6 Abs. 1 lit. b DSGVO. Die Daten werden gelöscht, sobald sie für die Bearbeitung nicht mehr erforderlich sind und keine gesetzlichen Aufbewahrungspflichten entgegenstehen. Der verwendete E-Mail-Dienst (Google) verarbeitet die Nachrichten dabei als Dienstleister.',
          },
          {
            p: 'Fehlermeldungen und Beiträge auf GitHub unterliegen den Bedingungen von GitHub, Inc. und sind in der Regel öffentlich sichtbar.',
          },
        ],
      },
      {
        heading: '8. Ihre Rechte',
        blocks: [
          { p: 'Soweit personenbezogene Daten über Sie verarbeitet werden, haben Sie folgende Rechte:' },
          {
            ul: [
              'Auskunft über die verarbeiteten Daten (Art. 15 DSGVO)',
              'Berichtigung unrichtiger Daten (Art. 16 DSGVO)',
              'Löschung (Art. 17 DSGVO)',
              'Einschränkung der Verarbeitung (Art. 18 DSGVO)',
              'Datenübertragbarkeit (Art. 20 DSGVO)',
              'Widerspruch gegen eine Verarbeitung auf Grundlage von Art. 6 Abs. 1 lit. f DSGVO aus Gründen, die sich aus Ihrer besonderen Situation ergeben (Art. 21 DSGVO)',
              'Beschwerde bei einer Datenschutz-Aufsichtsbehörde (Art. 77 DSGVO), insbesondere in dem Mitgliedstaat Ihres Aufenthaltsorts, Ihres Arbeitsplatzes oder des Orts des mutmaßlichen Verstoßes. Für den Anbieter zuständig ist die Sächsische Datenschutz- und Transparenzbeauftragte.',
            ],
          },
          { p: 'Daten, die nur auf Ihrem Gerät gespeichert sind, liegen ausschließlich in Ihrer Verfügungsgewalt; der Anbieter kann darüber weder Auskunft geben noch sie löschen.' },
        ],
      },
      {
        heading: '9. Keine automatisierte Entscheidungsfindung',
        blocks: [{ p: 'Eine automatisierte Entscheidungsfindung einschließlich Profiling im Sinne von Art. 22 DSGVO findet nicht statt.' }],
      },
      {
        heading: '10. Änderungen',
        blocks: [{ p: 'Diese Datenschutzerklärung wird angepasst, wenn sich die Anwendung oder die Rechtslage ändert. Es gilt die jeweils in der Anwendung angezeigte Fassung.' }],
      },
    ],
  },

  terms: {
    title: 'Nutzungsbedingungen',
    lead: 'Diese Bedingungen regeln die Nutzung der Web-App Sapia und der Anwendung Sapia Desktop („Sapia“). Mit der Nutzung erklären Sie sich mit ihnen einverstanden. Die Nutzungsrechte am Quelltext ergeben sich zusätzlich aus der MIT-Lizenz.',
    sections: [
      {
        heading: '1. Anbieter und Leistung',
        blocks: [
          { p: 'Anbieter ist Manuel Seiche (Kontakt siehe Impressum). Sapia ist ein Editor für textbasierte Diagramme und wird unentgeltlich und ohne Gewinnerzielungsabsicht als freie Software bereitgestellt.' },
          {
            p: 'Ein Anspruch auf eine bestimmte Verfügbarkeit, Funktion, Fehlerfreiheit, Unterstützung oder Weiterentwicklung besteht nicht. Der Anbieter kann den Betrieb oder einzelne Funktionen jederzeit ändern, einschränken oder einstellen.',
          },
        ],
      },
      {
        heading: '2. Datenablage in eigener Verantwortung',
        blocks: [
          {
            p: 'Sapia stellt keinen Speicherdienst bereit. Sie wählen selbst, wo Ihre Diagramme und Projekte liegen (Browser-Speicher, Ordner, Git-Repository), und sind allein für deren Speicherung, Sicherung, Synchronisation und Vertraulichkeit verantwortlich. Der Anbieter hat keinen Zugriff auf Ihre Daten und kann sie weder wiederherstellen noch herausgeben.',
          },
          {
            p: 'Insbesondere kann der Browser-Speicher durch den Browser, durch Einstellungen oder durch das Löschen von Website-Daten jederzeit verloren gehen. Bei Git-Projekten führt Sapia Commits, Pushes und Zusammenführungen in Ihrem Namen aus; prüfen Sie Konfliktlösungen sorgfältig. Legen Sie regelmäßig eigene Sicherungskopien an.',
          },
        ],
      },
      {
        heading: '3. KI-Assistent und Kosten Dritter',
        blocks: [
          {
            p: 'Der KI-Assistent in Sapia Desktop nutzt ausschließlich den KI-Anbieter, den Sie selbst konfigurieren, mit Ihren eigenen Zugangsdaten und auf Ihre eigenen Kosten. Das Vertragsverhältnis besteht allein zwischen Ihnen und diesem Anbieter. Gebühren, Kontingente und Abrechnung richten sich nach dessen Bedingungen.',
          },
          {
            p: 'Ergebnisse von KI-Modellen können unvollständig, falsch oder unerwartet sein. Der Assistent arbeitet in mehreren Schritten und kann dabei wiederholte oder sich wiederholende Anfragen auslösen, auch infolge von Fehlern der Anwendung, des Modells oder des Anbieters. Die Begrenzung der Schritte je Anfrage (Einstellung „maxSteps“) ist keine Kostenbegrenzung. Sapia überwacht weder Ihre Nutzung noch die entstehenden Kosten.',
          },
          {
            p: 'Sie sind selbst dafür verantwortlich, Ihre Nutzung und Ihre Kosten zu überwachen und beim KI-Anbieter geeignete Ausgaben- und Nutzungslimits einzurichten. Prüfen Sie Ergebnisse des Assistenten vor der Verwendung. Kosten, die beim KI-Anbieter entstehen, trägt im Verhältnis zum Anbieter von Sapia allein der Nutzer; das gilt auch für Kosten aus fehlerhaften, unerwarteten oder sich wiederholenden Anfragen. Die Haftung nach Abschnitt 6 bleibt unberührt.',
          },
        ],
      },
      {
        heading: '4. Ihre Inhalte und geteilte Links',
        blocks: [
          {
            p: 'Sie sind für die Inhalte verantwortlich, die Sie mit Sapia erstellen, speichern, an KI-Anbieter übermitteln oder über Links und Codes teilen. Sie dürfen Sapia nicht für rechtswidrige Inhalte nutzen und keine Rechte Dritter verletzen. Geteilte Links enthalten das Diagramm selbst; jede Person mit dem Link kann es lesen.',
          },
        ],
      },
      {
        heading: '5. Erweiterungen und Dienste Dritter',
        blocks: [
          {
            p: 'Plugins, KI-Anbieter, Git-Hosting-Dienste und andere Angebote Dritter, die Sie mit Sapia verwenden, liegen außerhalb des Einflussbereichs des Anbieters. Für sie gelten die Bedingungen ihrer jeweiligen Anbieter. Binden Sie nur Plugins aus Quellen ein, denen Sie vertrauen.',
          },
        ],
      },
      {
        heading: '6. Haftung',
        blocks: [
          {
            p: 'Sapia wird unentgeltlich überlassen. Der Anbieter haftet daher nur für Vorsatz und grobe Fahrlässigkeit. Für Sach- und Rechtsmängel haftet er nur, wenn er sie arglistig verschwiegen hat.',
          },
          {
            p: 'Die Haftung ist im gesetzlich zulässigen Umfang ausgeschlossen, insbesondere für Datenverlust, Fehlfunktionen der Anwendung oder des KI-Assistenten, Kosten bei Dritten (etwa KI-Anbietern), entgangenen Gewinn und mittelbare Schäden.',
          },
          {
            p: 'Unberührt bleiben die Haftung für Vorsatz und grobe Fahrlässigkeit, für Schäden aus der Verletzung des Lebens, des Körpers oder der Gesundheit, für arglistig verschwiegene Mängel sowie die Haftung nach dem Produkthaftungsgesetz. Ein vollständiger Haftungsausschluss ist in diesen Fällen nach deutschem Recht nicht zulässig.',
          },
          {
            p: 'Bei Datenverlust haftet der Anbieter, soweit eine Haftung danach besteht, nur für den Aufwand, der bei regelmäßiger, dem Risiko angemessener Datensicherung durch den Nutzer zur Wiederherstellung erforderlich gewesen wäre.',
          },
        ],
      },
      {
        heading: '7. Schlussbestimmungen',
        blocks: [
          {
            p: 'Es gilt das Recht der Bundesrepublik Deutschland unter Ausschluss des UN-Kaufrechts. Gegenüber Verbrauchern gilt diese Rechtswahl nur, soweit dadurch nicht der Schutz durch zwingende Vorschriften des Staates ihres gewöhnlichen Aufenthalts entzogen wird.',
          },
          {
            p: 'Der Anbieter kann diese Bedingungen mit Wirkung für die Zukunft ändern. Es gilt die jeweils in der Anwendung angezeigte Fassung. Sollte eine Bestimmung unwirksam sein, bleibt die Wirksamkeit der übrigen Bestimmungen unberührt; an ihre Stelle tritt die gesetzliche Regelung.',
          },
        ],
      },
    ],
  },
};

// -- English (convenience translation) ----------------------------------------------------

const EN: LegalTexts = {
  imprint: {
    title: 'Legal notice',
    sections: [
      {
        heading: 'Information according to § 5 DDG (German Digital Services Act)',
        blocks: [{ contact: true }],
      },
      {
        heading: 'Responsible for content',
        blocks: [{ p: 'Manuel Seiche, address as above.' }],
      },
      {
        heading: 'Liability for content',
        blocks: [
          {
            p: 'The content of this service has been created with care. However, no guarantee is given for its accuracy, completeness or timeliness. As a service provider I am responsible for my own content under the general laws. I am not obliged to monitor third-party information transmitted or stored, or to investigate circumstances that indicate illegal activity. Obligations to remove or block the use of information under the general laws remain unaffected.',
          },
          {
            p: 'Diagrams that users create, store or share via links in Sapia are their own content. The provider neither stores them nor takes note of them.',
          },
        ],
      },
      {
        heading: 'Liability for links',
        blocks: [
          {
            p: 'This service contains links to external third-party websites whose content I have no influence on. The respective provider or operator is always responsible for that content. Such links will be removed promptly once an infringement becomes known.',
          },
        ],
      },
      {
        heading: 'Copyright and licence',
        blocks: [
          {
            p: 'Sapia is free software released under the MIT licence. The source code is published at github.com/Hakenadu/sapia. Rights in third-party content, such as bundled libraries or fonts, remain with their respective owners and are governed by their licences.',
          },
        ],
      },
      {
        heading: 'Consumer dispute resolution',
        blocks: [{ p: 'I am neither willing nor obliged to take part in dispute resolution proceedings before a consumer arbitration board.' }],
      },
    ],
  },

  privacy: {
    title: 'Privacy policy',
    lead: 'Sapia is built so that its provider receives no data from its users. There are no accounts, no cookies, no analytics or tracking tools and no advertising. The following describes which data is nevertheless processed, where this happens and who is responsible for it.',
    sections: [
      {
        heading: '1. Controller',
        blocks: [
          { p: 'The controller within the meaning of the General Data Protection Regulation (GDPR) is:' },
          { contact: true },
          { p: 'No data protection officer has been appointed, as there is no legal obligation to do so.' },
        ],
      },
      {
        heading: '2. Visiting the web app (hosting)',
        blocks: [
          {
            p: 'Sapia is a static web application. When you open it, your browser transmits technically necessary data to the web server that delivers the application: IP address, date and time of the request, requested file, amount of data transferred, status code, referrer URL, browser and operating system. The hosting provider may store this data in server log files to ensure delivery and security.',
          },
          {
            p: 'The legal basis is Art. 6(1)(f) GDPR. The legitimate interest is the error-free and secure provision of the application. Where a hosting provider is used, it processes the data as a processor (Art. 28 GDPR). The log files are not combined with other data and not analysed; they are deleted according to the hosting provider’s rules, usually within a few weeks.',
          },
          {
            p: 'The application loads fonts and program files only from its own server. No content is loaded from external services such as content delivery networks or font services. Diagrams are rendered entirely in your browser; their source is not sent to any server.',
          },
          {
            p: 'Anyone can run their own copy of Sapia. If you use Sapia at an address that is not operated by the provider named above, its operator is responsible for the processing. That operator can also load extensions (plugins) from other servers through a configuration file; in that case your IP address is sent to those servers when they are loaded.',
          },
        ],
      },
      {
        heading: '3. Storage in your browser',
        blocks: [
          {
            p: 'The web app stores your diagrams, projects and settings (language, colour scheme, editor/preview split, last opened diagram) in your browser’s local storage. This data does not leave your device and cannot be seen by the provider.',
          },
          {
            p: 'This storage is strictly necessary for the function you explicitly request (§ 25(2) no. 2 TDDDG). You can delete the data at any time by removing diagrams and projects in the application or by clearing the site data in your browser. Note that the browser may also remove this data itself, for example when you clear your history or use private browsing.',
          },
        ],
      },
      {
        heading: '4. Sharing diagrams',
        blocks: [
          {
            p: 'When you share a diagram, it is compressed into a link or a code. The content is placed in the part of the link after the “#” character. Browsers do not send this part to web servers, so the provider does not receive shared diagrams, neither when a link is created nor when it is opened. After opening, Sapia removes the content from the address bar.',
          },
          {
            p: 'Anyone who has a link or code can read the diagram. If you send a link through other services (such as e-mail, messengers or ticket systems), their privacy policies apply. Do not share confidential or personal content unless you know who will receive the link.',
          },
        ],
      },
      {
        heading: '5. Sapia Desktop',
        blocks: [
          {
            p: 'Sapia Desktop stores its configuration, diagrams, projects and window state in the “.sapia” folder in your home directory and in the folders and Git repositories you choose as project storage. The application sends no usage, diagnostic or crash data to the provider.',
          },
          { p: 'Network connections are only made in the following cases, each directly between your device and the service named:' },
          {
            ul: [
              'Installation via npm: packages are downloaded from the npm registry (npm, Inc. / GitHub, Inc.).',
              'First start: a one-time download of the Electron runtime from GitHub (GitHub, Inc., USA) or from a mirror you have configured.',
              'Git projects: synchronisation with the remote repository you specify (e.g. GitHub, GitLab or your own server) using your local credentials.',
              'AI assistant: requests to the AI provider you configure (see section 6).',
              'Plugins that you load from other addresses yourself.',
              'Links you click are opened in your default browser.',
            ],
          },
          {
            p: 'The operators of these services are responsible for their processing, and their privacy policies apply. Services based outside the EU, for example in the USA, may involve a transfer to a third country.',
          },
        ],
      },
      {
        heading: '6. AI assistant (Sapia Desktop only)',
        blocks: [
          {
            p: 'The AI assistant is switched off by default. If you set it up, you choose an AI provider yourself (such as OpenAI or a compatible service, including one running locally) and enter your own credentials. These are stored only locally in your configuration file.',
          },
          {
            p: 'When you use the assistant, Sapia sends your input, the content of the open diagram and the intermediate results needed for the task directly from your device to that provider. The provider of Sapia is not involved in this transfer and receives none of this data. The AI provider you chose, with whom you have your own contract, is responsible for the processing. Check its terms, in particular on retention and on the use of your data for training, before you let it process personal or confidential content.',
          },
        ],
      },
      {
        heading: '7. Contact by e-mail',
        blocks: [
          {
            p: 'If you send me an e-mail, I process your e-mail address and the content of your message to handle your request. The legal basis is Art. 6(1)(f) GDPR, or Art. 6(1)(b) GDPR for contract-related requests. The data is deleted as soon as it is no longer needed and no statutory retention obligations apply. The e-mail service used (Google) processes the messages as a service provider.',
          },
          { p: 'Bug reports and contributions on GitHub are subject to the terms of GitHub, Inc. and are generally publicly visible.' },
        ],
      },
      {
        heading: '8. Your rights',
        blocks: [
          { p: 'Where personal data about you is processed, you have the following rights:' },
          {
            ul: [
              'Access to the data processed (Art. 15 GDPR)',
              'Rectification of inaccurate data (Art. 16 GDPR)',
              'Erasure (Art. 17 GDPR)',
              'Restriction of processing (Art. 18 GDPR)',
              'Data portability (Art. 20 GDPR)',
              'Objection to processing based on Art. 6(1)(f) GDPR on grounds relating to your particular situation (Art. 21 GDPR)',
              'Complaint to a data protection supervisory authority (Art. 77 GDPR), in particular in the member state of your habitual residence, place of work or place of the alleged infringement. The authority responsible for the provider is the Saxon Data Protection and Transparency Commissioner (Sächsische Datenschutz- und Transparenzbeauftragte).',
            ],
          },
          { p: 'Data stored only on your device is solely under your control; the provider can neither provide information about it nor delete it.' },
        ],
      },
      {
        heading: '9. No automated decision-making',
        blocks: [{ p: 'No automated decision-making, including profiling, within the meaning of Art. 22 GDPR takes place.' }],
      },
      {
        heading: '10. Changes',
        blocks: [{ p: 'This privacy policy is updated when the application or the law changes. The version shown in the application applies.' }],
      },
    ],
  },

  terms: {
    title: 'Terms of use',
    lead: 'These terms govern the use of the Sapia web app and the Sapia Desktop application (“Sapia”). By using Sapia you agree to them. Your rights to the source code are additionally set out in the MIT licence.',
    sections: [
      {
        heading: '1. Provider and service',
        blocks: [
          { p: 'The provider is Manuel Seiche (contact details in the legal notice). Sapia is an editor for text-based diagrams and is provided free of charge and without commercial intent as free software.' },
          {
            p: 'There is no entitlement to any particular availability, functionality, freedom from errors, support or further development. The provider may change, restrict or discontinue the service or individual features at any time.',
          },
        ],
      },
      {
        heading: '2. Your data, your responsibility',
        blocks: [
          {
            p: 'Sapia does not provide a storage service. You choose where your diagrams and projects are kept (browser storage, folders, Git repositories) and you alone are responsible for storing, backing up, synchronising and protecting them. The provider has no access to your data and can neither restore nor hand it over.',
          },
          {
            p: 'In particular, browser storage can be lost at any time through the browser, its settings or the deletion of site data. In Git projects Sapia creates commits, pushes and merges on your behalf; review conflict resolutions carefully. Make regular backups of your own.',
          },
        ],
      },
      {
        heading: '3. AI assistant and third-party costs',
        blocks: [
          {
            p: 'The AI assistant in Sapia Desktop uses only the AI provider that you configure yourself, with your own credentials and at your own expense. The contractual relationship exists solely between you and that provider. Fees, quotas and billing are governed by its terms.',
          },
          {
            p: 'Results from AI models may be incomplete, wrong or unexpected. The assistant works in several steps and may trigger repeated or looping requests, including as a result of errors in the application, the model or the provider. The limit on steps per request (the “maxSteps” setting) is not a cost limit. Sapia does not monitor your usage or the costs incurred.',
          },
          {
            p: 'You are responsible for monitoring your usage and costs and for setting suitable spending and usage limits with your AI provider. Review the assistant’s results before using them. As between you and the provider of Sapia, costs incurred with the AI provider are borne solely by you; this includes costs from faulty, unexpected or repeated requests. Liability under section 6 remains unaffected.',
          },
        ],
      },
      {
        heading: '4. Your content and shared links',
        blocks: [
          {
            p: 'You are responsible for the content you create, store, send to AI providers or share via links and codes with Sapia. You must not use Sapia for unlawful content or infringe the rights of others. Shared links contain the diagram itself; anyone with the link can read it.',
          },
        ],
      },
      {
        heading: '5. Extensions and third-party services',
        blocks: [
          {
            p: 'Plugins, AI providers, Git hosting services and other third-party offerings you use with Sapia are outside the provider’s control. Their providers’ terms apply. Only load plugins from sources you trust.',
          },
        ],
      },
      {
        heading: '6. Liability',
        blocks: [
          { p: 'Sapia is provided free of charge. The provider is therefore liable only for intent and gross negligence. For defects in quality or title the provider is liable only if it fraudulently concealed them.' },
          {
            p: 'To the extent permitted by law, liability is excluded, in particular for loss of data, malfunctions of the application or the AI assistant, costs incurred with third parties (such as AI providers), loss of profit and indirect damage.',
          },
          {
            p: 'This does not affect liability for intent and gross negligence, for injury to life, body or health, for fraudulently concealed defects, or under the German Product Liability Act. German law does not permit a complete exclusion of liability in these cases.',
          },
          {
            p: 'Where the provider is liable for loss of data, liability is limited to the effort that would have been required to restore the data had the user made regular backups appropriate to the risk.',
          },
        ],
      },
      {
        heading: '7. Final provisions',
        blocks: [
          {
            p: 'The law of the Federal Republic of Germany applies, excluding the UN Convention on Contracts for the International Sale of Goods. For consumers, this choice of law applies only insofar as it does not deprive them of the protection of mandatory provisions of the country of their habitual residence.',
          },
          {
            p: 'The provider may amend these terms with effect for the future. The version shown in the application applies. If any provision is invalid, the remaining provisions remain valid; the statutory provision takes the place of the invalid one.',
          },
        ],
      },
    ],
  },
};

/** The texts for a locale; anything but German gets the English translation. */
export function legalTexts(locale: string): LegalTexts {
  return locale.toLowerCase().startsWith('de') ? DE : EN;
}
