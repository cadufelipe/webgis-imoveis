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
    loadComponent: () => import('./pages/lista-imoveis/lista-imoveis').then(m => m.ListaImoveis),
  },
  {
    path: 'imoveis/novo',
    title: 'Novo imóvel',
    loadComponent: () => import('./pages/novo-imovel/novo-imovel').then(m => m.NovoImovel),
  },
  {
    path: 'imoveis/mapa',
    title: 'Mapa dos imóveis',
    loadComponent: () => import('./pages/mapa-imoveis/mapa-imoveis').then(m => m.MapaImoveis),
  },
  {
    path: 'imoveis/:id/editar',
    title: 'Editar imóvel',
    loadComponent: () => import('./pages/editar-imovel/editar-imovel').then(m => m.EditarImovel),
  },
  {
    path: 'proprietarios',
    title: 'Proprietários',
    loadComponent: () => import('./pages/lista-proprietarios/lista-proprietarios').then(m => m.ListaProprietarios),
  },
  {
    path: 'proprietarios/:id/imoveis',
    title: 'Imóveis do proprietário',
    loadComponent: () => import('./pages/imoveis-do-proprietario/imoveis-do-proprietario').then(m => m.ImoveisDoProprietario),
  },
  {
    path: '**',
    title: 'Página não encontrada',
    loadComponent: () => import('./pages/nao-encontrado/nao-encontrado').then(m => m.NaoEncontrado),
  },
];
