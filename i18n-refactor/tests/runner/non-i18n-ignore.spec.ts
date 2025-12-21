import { processComponent } from '../../src/runner/component'

test('do not replace non-i18n array methods', () => {
  const ts = `class C { 
  items = [1,2,3]; 
  i18n: any;
   constructor(private locale: I18nLocaleService){
    this.i18n = this.locale.getLocale() } 
    ngOnInit(){ 
    const sum = this.items.reduce((m, it) => m + it, 0);
     console.log(this.i18n.app.title) 
     } }`
  const out = processComponent(ts, '')
  expect(out.tsOut).toContain('const sum = this.items.reduce((m, it) => m + it, 0);')
  expect(out.tsOut).toContain(`this.locale.get('app.title')`)
})

