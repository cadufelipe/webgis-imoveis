import { Pipe, PipeTransform } from '@angular/core';

/** Booleano como o usuário lê. */
@Pipe({ name: 'simNao' })
export class SimNaoPipe implements PipeTransform {

  transform(valor: boolean): string {
    return valor ? 'Sim' : 'Não';
  }
}
