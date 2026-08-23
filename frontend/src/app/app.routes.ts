import { Routes } from '@angular/router';

/**
 * `loadComponent` carrega cada página sob demanda: abrir a listagem não baixa o
 * código do formulário de cadastro nem o do mapa, que traz o Leaflet junto.
 */
export const routes: Routes = [
  {
    path: '',
    redirectTo: 'imoveis',
    pathMatch: 'full',
  },
  {
    path: 'imoveis',
    title: 'Imóveis',
    loadComponent: () => import('./imoveis/lista/lista-imoveis').then(m => m.ListaImoveis),
  },
  {
    path: 'imoveis/novo',
    title: 'Novo imóvel',
    loadComponent: () => import('./imoveis/novo/novo-imovel').then(m => m.NovoImovel),
  },
  {
    path: 'imoveis/mapa',
    title: 'Mapa dos imóveis',
    loadComponent: () => import('./imoveis/mapa/mapa-imoveis').then(m => m.MapaImoveis),
  },
  {
    path: 'imoveis/:id/editar',
    title: 'Editar imóvel',
    loadComponent: () => import('./imoveis/editar/editar-imovel').then(m => m.EditarImovel),
  },
  {
    path: 'proprietarios',
    title: 'Proprietários',
    loadComponent: () => import('./proprietarios/lista/lista-proprietarios').then(m => m.ListaProprietarios),
  },
  {
    path: 'proprietarios/:id/imoveis',
    title: 'Imóveis do proprietário',
    loadComponent: () => import('./proprietarios/imoveis/imoveis-do-proprietario').then(m => m.ImoveisDoProprietario),
  },
  {
    path: '**',
    title: 'Página não encontrada',
    loadComponent: () => import('./nao-encontrado/nao-encontrado').then(m => m.NaoEncontrado),
  },
];
