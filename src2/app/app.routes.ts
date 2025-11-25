import { Routes } from '@angular/router';
import { MergeAssignComponent } from './examples/merge-assign/merge-assign.component';
import { AliasGetterComponent } from './examples/alias-getter/alias-getter.component';
import { ServiceDiComponent } from './examples/service-di/service-di.component';

export const routes: Routes = [
  { path: '', component: MergeAssignComponent },
  { path: 'alias', component: AliasGetterComponent },
  { path: 'service', component: ServiceDiComponent }
];
