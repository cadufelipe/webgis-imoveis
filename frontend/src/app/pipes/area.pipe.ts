import { formatNumber } from '@angular/common';
import { LOCALE_ID, Pipe, PipeTransform, inject } from '@angular/core';

/**
 * Área em m² com duas casas, ou travessão quando não informada.
 *
 * Deixar o `number` cuidar do nulo mostraria célula vazia, e trocar por zero
 * mentiria: terreno sem medida não é terreno de 0 m².
 */
@Pipe({ name: 'area' })
export class AreaPipe implements PipeTransform {

  private readonly locale = inject(LOCALE_ID);

  transform(valor: number | null): string {
    return valor === null ? '—' : formatNumber(valor, this.locale, '1.2-2');
  }
}
