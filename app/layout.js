import './globals.css';
import Shell from '@/app/components/Shell';

export const metadata={
 title:'Zachitan v4 — Research Market Intelligence',
 description:'Source-first multi-asset market and world intelligence research beta.',
 icons:{icon:'/favicon.svg'}
};

export default function RootLayout({children}){
 return <html lang="en"><body><Shell>{children}</Shell></body></html>;
}
