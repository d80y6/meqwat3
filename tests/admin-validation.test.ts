import { describe,it,expect } from 'vitest';
import { planInput } from '../src/lib/admin-validation';
describe('strict platform plan validation',()=>{
 it('normalizes exact money and positive integer limits',()=>{expect(planInput({name:' Basic ',priceMonthly:'0.30',maxUsers:3})).toMatchObject({name:'Basic',priceMonthly:'0.30',maxUsers:3});});
 it.each([-1,0,1.5,'1e999',null])('rejects invalid limits %s',value=>{expect(()=>planInput({name:'p',maxUsers:value})).toThrow();});
 it.each(['-0.01','NaN','1e2','0.001'])('rejects invalid price %s',price=>expect(()=>planInput({name:'p',priceMonthly:price})).toThrow());
 it('rejects malformed flags/features and empty edits',()=>{expect(()=>planInput({isActive:'false'},true)).toThrow();expect(()=>planInput({features:[{}]},true)).toThrow();expect(()=>planInput({},true)).toThrow();});
});
