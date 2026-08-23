import { ApplicationConfig, LOCALE_ID, provideBrowserGlobalErrorListeners } from '@angular/core';
import { registerLocaleData } from '@angular/common';
import { provideHttpClient } from '@angular/common/http';
import { TitleStrategy, provideRouter } from '@angular/router';
import localePt from '@angular/common/locales/pt';

import { routes } from './app.routes';
import { TituloDaPagina } from './core/titulo-da-pagina';

// Faz o DecimalPipe formatar 1.234,56 em vez de 1,234.56.
registerLocaleData(localePt);

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideHttpClient(),
    { provide: LOCALE_ID, useValue: 'pt-BR' },
    { provide: TitleStrategy, useClass: TituloDaPagina },
  ],
};
