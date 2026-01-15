import { Routes } from '@angular/router';
import { MergeAssignComponent } from './examples/merge-assign/merge-assign.component';
import { AliasGetterComponent } from './examples/alias-getter/alias-getter.component';
import { ServiceDiComponent } from './examples/service-di/service-di.component';
import { TodolistComponent } from './examples/todolist/todolist.component';
import { UserLoginComponent } from './examples/user-login/user-login.component';
import { DataTableComponent } from './examples/data-table/data-table.component';
import { LayoutComponent } from './layout/layout.component';
import { I18nToolComponent } from './i18n-tool/i18n-tool.component';
import { EnvironmentInitComponent } from './i18n-tool/environment-init/environment-init.component';

export const routes: Routes = [
  {
    path: '',
    redirectTo: 'env-init',
    pathMatch: 'full'
  },
  {
    path: 'env-init',
    component: EnvironmentInitComponent
  },
  {
    path: 'main',
    component: LayoutComponent,
    children: [
      { path: '', component: MergeAssignComponent },
      { path: 'alias', component: AliasGetterComponent },
      { path: 'service', component: ServiceDiComponent },
      { path: 'todo', component: TodolistComponent },
      { path: 'login', component: UserLoginComponent },
      { path: 'table', component: DataTableComponent },
      { path: 'i18n-tool', component: I18nToolComponent }
    ]
  }
];
