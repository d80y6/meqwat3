import { ApiError } from './api';
import { fromCents, toCents } from './money';
export function planInput(body: Record<string, unknown>, partial=false) {
  const patch: {name?:string;nameEn?:string|null;priceMonthly?:string;maxUsers?:number;maxProducts?:number;maxBranches?:number;features?:string[];isActive?:boolean}={};
  if (!partial || body.name !== undefined) {
    const name=String(body.name??'').trim();
    if(!name || name.length>80) throw new ApiError('اسم الباقة مطلوب (حتى ٨٠ حرفاً)');
    patch.name=name;
  }
  if(body.nameEn!==undefined) {if(body.nameEn!==null && (typeof body.nameEn!=='string'||body.nameEn.length>80))throw new ApiError('اسم إنجليزي غير صالح');patch.nameEn=body.nameEn as string|null;}
  if(!partial || body.priceMonthly!==undefined) {const n=toCents(body.priceMonthly as string ?? '0');if(n<0)throw new ApiError('السعر لا يمكن أن يكون سالباً');patch.priceMonthly=fromCents(n);}
  for(const [k,fallback] of [['maxUsers',3],['maxProducts',100],['maxBranches',1]] as const) {
    if(!partial||body[k]!==undefined){const raw=body[k]===undefined?fallback:body[k];if(typeof raw!=='number'&&(typeof raw!=='string'||!/^\d+$/.test(raw)))throw new ApiError('حد غير صالح');const n=Number(raw);if(!Number.isSafeInteger(n)||n<1||n>1000000)throw new ApiError('حدود الباقة يجب أن تكون أعداداً صحيحة موجبة');patch[k]=n;}
  }
  if(body.features!==undefined){if(!Array.isArray(body.features)||body.features.length>50||body.features.some(v=>typeof v!=='string'||v.length>200))throw new ApiError('مزايا الباقة غير صالحة');patch.features=body.features;}
  if(body.isActive!==undefined){if(typeof body.isActive!=='boolean')throw new ApiError('حالة الباقة غير صالحة');patch.isActive=body.isActive;}
  if(!Object.keys(patch).length)throw new ApiError('لا توجد تعديلات');
  return patch;
}
