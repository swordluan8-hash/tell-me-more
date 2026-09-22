import type {Metadata} from 'next';
import './globals.css';
export const metadata:Metadata={title:'叙能 · Tell Me More',description:'历史是参照，选择属于你。可追溯的个人历史决策档案。'};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="zh-CN"><body>{children}</body></html>;}
