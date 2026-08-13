import {notFound,redirect} from 'next/navigation';

const ROUTES=new Set([
 '/markets','/world','/news','/watchlist','/playground','/methodology','/sources','/profile',
 '/legal/privacy','/legal/terms','/legal/beta'
]);

export default async function CaseSafeRoute({params}){
 const {slug=[]}=await params;
 const requested=`/${slug.join('/')}`;
 const normalized=requested.toLowerCase().replace(/\/+$/,'')||'/';
 if(requested!==normalized&&ROUTES.has(normalized))redirect(normalized);
 notFound();
}
