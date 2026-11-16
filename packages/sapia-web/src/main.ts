import { bootstrapApplication } from '@angular/platform-browser';
import { App } from './app/app';
import { appConfig } from './app/app.config';

bootstrapApplication(App, appConfig).catch((error) => {
  console.error(error);
  const root = document.querySelector('sapia-root');
  if (root) root.textContent = `Sapia could not start: ${error instanceof Error ? error.message : String(error)}`;
});
