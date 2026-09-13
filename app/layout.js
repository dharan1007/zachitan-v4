import './globals.css';
import Shell from '@/app/components/Shell';
import { RELEASE_LINE } from '@/lib/release.mjs';

export const metadata={
 title:`Zachitan ${RELEASE_LINE} — Research Market Intelligence`,
 description:'Source-first multi-asset market and world intelligence research beta.',
 icons:{icon:'/favicon.svg'}
};

export default function RootLayout({children}){
 return <html lang="en"><body><Shell>{children}</Shell></body></html>;
}
