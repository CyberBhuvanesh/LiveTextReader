import { enableProdMode } from '@angular/core';
import { platformBrowserDynamic } from '@angular/platform-browser-dynamic';

import { AppModule } from './app/app.module';
import { environment } from './environments/environment';

if (environment.production) {
  enableProdMode();
}

platformBrowserDynamic().bootstrapModule(AppModule)
  .catch(err => console.error(err));

fetch('/assets/config.json')
  .then(res => res.json())
  .then((config: EnvConfig) => {
    window.env = config;
    platformBrowserDynamic().bootstrapModule(AppModule)
      .catch(err => console.error(err));
  });


interface EnvConfig {
  azureApiKey: string;
  azureEndpoint: string;
}

interface Window {
  env: EnvConfig;
}
